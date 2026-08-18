/**
 * Multi-Technician AI Auto-Scheduling Engine
 * 
 * Synthesizes 5 distinct operational pillars to automate multi-tech dispatching:
 * 1. Materials Readiness (inventory stock, purchase orders, vendor lead times, buffer days)
 * 2. Tools Availability (specialty tool requirements, tech truck kits, usage conflicts)
 * 3. Customer Requested Times (availabilityWindows, preferred time slots)
 * 4. Tech Availability & Skills (shift hours, lunch breaks, skill matching, certifications, daily capacity, PRE-SCHEDULED JOBS)
 * 5. Drive Times, Routes & Traffic (spatial clustering, traffic-aware transit durations, rush-hour multipliers)
 */

import { Job, UserProfile, ToolItem, SchedulingPreferences, SchedulingMetricId } from '../types';
import { calculateDistance } from './scheduler';
import { format, addMinutes, isSameDay, parseISO, startOfDay, endOfDay, differenceInDays } from 'date-fns';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface MultiTechSchedulerOptions {
    targetDate: Date;
    numDays?: number; // 1 for single day, 7 for full week, etc.
    includeAlreadyScheduled?: boolean; // Re-optimize existing scheduled jobs
    selectedTechIds?: string[]; // Subset of techs or all active techs
    enforceMaterials?: boolean; // Check inventory & PO lead times
    enforceTools?: boolean; // Check tool requirements & conflicts
    respectCustomerWindows?: boolean; // Check customer availability windows
    considerTraffic?: boolean; // Apply rush-hour delay factors
    optimizeRouteOrder?: boolean; // Sequence daily stops by nearest-neighbor & 2-opt shortest path (defaults to true)
    metricPriorities?: SchedulingMetricId[]; // Custom ranking of operational metrics for dispatch prioritization
    maxJobsPerTechPerDay?: number; // Override max daily jobs limit
    materialSchedulingMode?: 'allow_all' | 'estimated_availability' | 'in_stock_only';
    materialBufferDays?: number;
    useRealDriveTimes?: boolean;
}

export interface ScheduledJobAssignment {
    job: Job;
    techId: string;
    techName: string;
    scheduledAt: Date;
    estimatedArrival: Date;
    estimatedDeparture: Date;
    driveTimeMinutes: number;
    distanceMiles: number;
    durationMinutes: number;
    score: number;
    matchReasons: string[];
    isPartsRun?: boolean;
    isPreExisting?: boolean; // True if this job was already locked/scheduled on the timeline
}

export interface UnassignedJobReport {
    job: Job;
    reason: string;
    category: 'materials' | 'tools' | 'customer_window' | 'tech_capacity' | 'skills' | 'distance';
}

export interface TechScheduleSummary {
    tech: UserProfile;
    assignedJobs: ScheduledJobAssignment[];
    newScheduledCount: number;
    preExistingCount: number;
    totalDriveTimeMinutes: number;
    totalWorkTimeMinutes: number;
    totalDistanceMiles: number;
    routeMapsUrl: string;
    utilizationPercent: number;
}

export interface MultiTechScheduleResult {
    targetDate: Date;
    totalScheduled: number;
    newlyScheduled: number;
    preExistingScheduled: number;
    totalUnassigned: number;
    techSummaries: TechScheduleSummary[];
    unassignedJobs: UnassignedJobReport[];
    overallStatistics: {
        totalJobs: number;
        newlyScheduledCount: number;
        preExistingCount: number;
        totalDriveMinutes: number;
        totalWorkMinutes: number;
        totalDistanceMiles: number;
        estimatedDriveTimeSavedMinutes: number;
        activeTechCount: number;
    };
    logs: string[];
}

/**
 * Parses arbitrary time string like '08:00', '8:00 AM', '5:00 PM', '17:30' into hours and minutes
 */
export function parseTimeString(timeStr?: string, defaultH = 8, defaultM = 0): { hour: number; minute: number } {
    if (!timeStr || typeof timeStr !== 'string') return { hour: defaultH, minute: defaultM };
    const cleaned = timeStr.trim().toLowerCase();
    const isPM = cleaned.includes('pm');
    const isAM = cleaned.includes('am');
    const parts = cleaned.replace(/[^0-9:]/g, '').split(':');
    let h = parseInt(parts[0], 10);
    let m = parts.length > 1 ? parseInt(parts[1], 10) : 0;
    if (isNaN(h)) h = defaultH;
    if (isNaN(m)) m = defaultM;
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    return { hour: Math.min(Math.max(h, 0), 23), minute: Math.min(Math.max(m, 0), 59) };
}

// Fallback Honolulu Center coordinates if no tech home location is set
const DEFAULT_BASE_LOCATION = { lat: 21.3099, lng: -157.8581, address: 'Honolulu Base' };

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalizes date object or timestamp to a clean JavaScript Date
 */
export const normalizeDate = (val: any): Date | null => {
    if (!val) return null;
    if (typeof val.toDate === 'function') {
        try { return val.toDate(); } catch { /* ignore */ }
    }
    if (val instanceof Date) {
        return isNaN(val.getTime()) ? null : val;
    }
    if (val.seconds !== undefined && val.seconds !== null) {
        const secs = Number(val.seconds);
        if (!isNaN(secs)) return new Date(secs * 1000);
    }
    if (val._seconds !== undefined && val._seconds !== null) {
        const secs = Number(val._seconds);
        if (!isNaN(secs)) return new Date(secs * 1000);
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
};

/**
 * Checks whether a job is assigned to a given technician by ID, email, or name
 */
export const isJobAssignedToTech = (job: Job, tech: UserProfile): boolean => {
    if (job.assigned_tech_id && job.assigned_tech_id === tech.id) return true;
    if (job.assigned_tech_email && tech.email && job.assigned_tech_email.toLowerCase() === tech.email.toLowerCase()) return true;
    if (job.assigned_tech_name && tech.name && job.assigned_tech_name.toLowerCase() === tech.name.toLowerCase()) return true;
    return false;
};

/**
 * Calculates rush-hour traffic multiplier based on time of day
 */
function getTrafficMultiplier(departureTime: Date): number {
    const hour = departureTime.getHours();
    const minute = departureTime.getMinutes();
    const timeVal = hour + minute / 60;

    // Morning rush hour: 7:00 AM - 9:30 AM (1.45x)
    if (timeVal >= 7.0 && timeVal <= 9.5) {
        return 1.45;
    }
    // Afternoon / Evening rush hour: 15:45 (3:45 PM) - 18:30 (6:30 PM) (1.5x)
    if (timeVal >= 15.75 && timeVal <= 18.5) {
        return 1.50;
    }
    // Midday slight traffic: 11:30 AM - 13:30 PM (1.15x)
    if (timeVal >= 11.5 && timeVal <= 13.5) {
        return 1.15;
    }
    return 1.0;
}

/**
 * Calculates estimated drive time in minutes and distance in miles with fallback guards
 */
function calculateTransit(
    origin?: { lat?: number; lng?: number },
    destination?: { lat?: number; lng?: number },
    departureTime: Date = new Date(),
    considerTraffic: boolean = true
): { driveMinutes: number; distanceMiles: number } {
    const orig = (origin?.lat !== undefined && origin?.lng !== undefined && !isNaN(Number(origin.lat)) && !isNaN(Number(origin.lng)))
        ? { lat: Number(origin.lat), lng: Number(origin.lng) }
        : DEFAULT_BASE_LOCATION;
    const dest = (destination?.lat !== undefined && destination?.lng !== undefined && !isNaN(Number(destination.lat)) && !isNaN(Number(destination.lng)))
        ? { lat: Number(destination.lat), lng: Number(destination.lng) }
        : DEFAULT_BASE_LOCATION;

    let distanceMiles = 5;
    try {
        const distanceKm = calculateDistance(orig, dest);
        if (typeof distanceKm === 'number' && !isNaN(distanceKm)) {
            distanceMiles = Math.round(distanceKm * 0.621371 * 10) / 10;
        }
    } catch {
        distanceMiles = 5;
    }

    let baseDriveMinutes = Math.max(Math.ceil(distanceMiles * 2.4) + 4, 5);
    if (distanceMiles < 1) baseDriveMinutes = 5;

    if (considerTraffic && departureTime && !isNaN(departureTime.getTime())) {
        const multiplier = getTrafficMultiplier(departureTime);
        baseDriveMinutes = Math.round(baseDriveMinutes * (multiplier || 1.0));
    }

    return {
        driveMinutes: isNaN(baseDriveMinutes) ? 10 : baseDriveMinutes,
        distanceMiles: isNaN(distanceMiles) ? 5 : distanceMiles
    };
}

/**
 * Checks material availability against organization rules
 */
function checkMaterialReadiness(
    job: Job,
    materials: any[],
    mode: 'allow_all' | 'estimated_availability' | 'in_stock_only',
    bufferDays: number,
    targetDate: Date
): { ready: boolean; reason?: string } {
    if (mode === 'allow_all') {
        return { ready: true };
    }

    // Check if job requires materials
    const requiredMaterials: string[] = [];
    if (job.parts_needed && job.parts_description) {
        requiredMaterials.push(job.parts_description);
    }
    const aiMats = (job.intakeReview?.aiRecommendation as any)?.recommendedMaterials || 
                   (job.aiRecommendation as any)?.recommendedMaterials || 
                   (job.intakeReview?.aiRecommendation as any)?.requiredMaterials || [];
    aiMats.forEach((m: any) => {
        const name = typeof m === 'string' ? m : m.name;
        if (name && !requiredMaterials.includes(name)) requiredMaterials.push(name);
    });

    if (requiredMaterials.length === 0) {
        return { ready: true };
    }

    // In-Stock Only: All required materials must be in stock
    if (mode === 'in_stock_only') {
        for (const reqName of requiredMaterials) {
            const match = materials.find(m =>
                m.name && m.name.toLowerCase().includes(reqName.toLowerCase()) ||
                reqName.toLowerCase().includes((m.name || '').toLowerCase())
            );
            if (match) {
                const stock = match.currentStock ?? match.quantity ?? 0;
                if (stock <= 0) {
                    return {
                        ready: false,
                        reason: `Material "${match.name}" is out of stock (0 available).`
                    };
                }
            }
        }
        return { ready: true };
    }

    // Estimated Availability: Check ETA + buffer days
    if (mode === 'estimated_availability') {
        for (const reqName of requiredMaterials) {
            const match = materials.find(m =>
                m.name && m.name.toLowerCase().includes(reqName.toLowerCase()) ||
                reqName.toLowerCase().includes((m.name || '').toLowerCase())
            );
            if (match) {
                const stock = match.currentStock ?? match.quantity ?? 0;
                if (stock <= 0) {
                    const arrivalDate = normalizeDate(match.estimatedArrivalDate);
                    if (arrivalDate) {
                        const readyDate = addMinutes(arrivalDate, bufferDays * 24 * 60);
                        if (targetDate < readyDate) {
                            return {
                                ready: false,
                                reason: `Parts for "${match.name}" arriving ${format(arrivalDate, 'MMM d')} (+${bufferDays}d buffer). Available from ${format(readyDate, 'MMM d')}.`
                            };
                        }
                    } else if (match.vendorLeadDays) {
                        const readyDate = addMinutes(new Date(), (match.vendorLeadDays + bufferDays) * 24 * 60);
                        if (targetDate < readyDate) {
                            return {
                                ready: false,
                                reason: `Parts for "${match.name}" require ${match.vendorLeadDays}d lead time (+${bufferDays}d buffer). Available from ${format(readyDate, 'MMM d')}.`
                            };
                        }
                    }
                }
            }
        }
    }

    return { ready: true };
}

/**
 * Checks if a technician has the tools required for a job
 */
function checkToolReadiness(
    job: Job,
    tech: UserProfile,
    tools: ToolItem[]
): { ready: boolean; reason?: string } {
    const requiredTools: string[] = [];
    const aiTools = job.intakeReview?.aiRecommendation?.requiredTools || job.aiRecommendation?.requiredTools || [];
    aiTools.forEach((t: any) => {
        const name = typeof t === 'string' ? t : t.name;
        if (name && !requiredTools.includes(name)) requiredTools.push(name);
    });

    if (requiredTools.length === 0) return { ready: true };

    const techToolNames = [
        ...(tech.tools || []),
        ...(tech.toolInventory || []).map(t => t.name),
        ...tools.filter(t => t.assignedTechId === tech.id).map(t => t.name)
    ].map(s => s.toLowerCase());

    for (const reqTool of requiredTools) {
        const reqLower = reqTool.toLowerCase();
        const hasTool = techToolNames.some(t => t.includes(reqLower) || reqLower.includes(t));
        
        // Also check if company has an available shared tool
        const companyHasAvailable = tools.some(t => 
            t.name.toLowerCase().includes(reqLower) && 
            (t.status === 'available' || !t.assignedTechId)
        );

        if (!hasTool && !companyHasAvailable) {
            return {
                ready: false,
                reason: `Missing required specialty tool: "${reqTool}".`
            };
        }
    }

    return { ready: true };
}

/**
 * Checks if candidate slot matches customer availability windows
 */
function checkCustomerTimeWindow(
    job: Job,
    candidateStart: Date,
    candidateEnd: Date
): { matches: boolean; scoreBonus: number; reason?: string } {
    const windows = job.request?.availabilityWindows;
    if (!windows || windows.length === 0) {
        return { matches: true, scoreBonus: 0 };
    }

    const dayOfWeek = format(candidateStart, 'EEEE').toLowerCase(); // 'monday'
    const dateStr = format(candidateStart, 'yyyy-MM-dd'); // '2026-08-17'
    const slotStartHour = candidateStart.getHours() + candidateStart.getMinutes() / 60;
    const slotEndHour = candidateEnd.getHours() + candidateEnd.getMinutes() / 60;

    let matchedAnyWindow = false;
    let preferredBonus = 0;

    for (const win of windows) {
        const winDay = win.day.toLowerCase();
        const dayMatches = winDay === dayOfWeek || winDay === dateStr;

        if (!dayMatches) continue;

        const [startH, startM] = (win.startTime || '08:00').split(':').map(Number);
        const [endH, endM] = (win.endTime || '18:00').split(':').map(Number);
        const winStartVal = startH + (startM || 0) / 60;
        const winEndVal = endH + (endM || 0) / 60;

        // Check if candidate slot fits inside the window
        if (slotStartHour >= winStartVal - 0.25 && slotEndHour <= winEndVal + 0.25) {
            matchedAnyWindow = true;

            // Preferred time slot bonus
            if (win.preferredTime) {
                if (win.preferredTime === 'morning' && slotStartHour < 12) preferredBonus += 15;
                if (win.preferredTime === 'afternoon' && slotStartHour >= 12 && slotStartHour < 17) preferredBonus += 15;
                if (win.preferredTime === 'evening' && slotStartHour >= 17) preferredBonus += 15;
            }
            break;
        }
    }

    if (matchedAnyWindow) {
        return { matches: true, scoreBonus: 25 + preferredBonus };
    }

    return {
        matches: false,
        scoreBonus: -50,
        reason: `Outside customer's requested time windows (${windows.map(w => `${w.day} ${w.startTime}-${w.endTime}`).join(', ')}).`
    };
}

/**
 * Calculates skill compatibility score (0 to 100) between job and tech
 */
function calculateTechSkillScore(tech: UserProfile, job: Job): { score: number; matched: string[]; missing: string[] } {
    const requiredSkills: string[] = [
        ...(job.intakeReview?.aiRecommendation?.skillsRequired || []),
        ...(job.aiRecommendation?.skillsRequired || [])
    ];
    if (job.request?.type && !requiredSkills.includes(job.request.type)) {
        requiredSkills.push(job.request.type);
    }
    if (job.category && !requiredSkills.includes(job.category)) {
        requiredSkills.push(job.category);
    }

    if (requiredSkills.length === 0) {
        return { score: 85, matched: ['General Service'], missing: [] };
    }

    const techSpecialties = (tech.specialties || []).map(s => s.toLowerCase());
    const certNames = (tech.certifications || []).map(c => c.name.toLowerCase());
    const allTechSkills = [...techSpecialties, ...certNames];

    const matched: string[] = [];
    const missing: string[] = [];

    for (const skill of requiredSkills) {
        const sLower = skill.toLowerCase();
        const has = allTechSkills.some(ts => ts.includes(sLower) || sLower.includes(ts));
        if (has) matched.push(skill);
        else missing.push(skill);
    }

    const ratio = matched.length / requiredSkills.length;
    const score = Math.round(ratio * 100);

    return { score, matched, missing };
}

/**
 * Builds Google Maps URL for an ordered list of stops
 */
function generateGoogleMapsRouteUrl(
    startLocation: { lat: number; lng: number },
    assignments: ScheduledJobAssignment[]
): string {
    if (assignments.length === 0) return '';
    const origin = `${startLocation.lat},${startLocation.lng}`;
    const lastJob = assignments[assignments.length - 1].job;
    const destination = lastJob.location
        ? `${lastJob.location.lat},${lastJob.location.lng}`
        : origin;

    const waypoints = assignments
        .slice(0, -1)
        .filter(a => a.job.location)
        .slice(0, 24)
        .map(a => `${a.job.location!.lat},${a.job.location!.lng}`)
        .join('|');

    const params = new URLSearchParams({
        api: '1',
        origin,
        destination,
        travelmode: 'driving',
        ...(waypoints && { waypoints })
    });

    return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export interface TechTimelineBlock {
    type: 'start' | 'existing_job' | 'new_job' | 'end';
    job?: Job;
    assignment?: ScheduledJobAssignment;
    startTime: Date;
    endTime: Date;
    location: { lat: number; lng: number; address?: string };
}

export interface TechState {
    tech: UserProfile;
    homeLocation: { lat: number; lng: number; address: string };
    workStartTime: Date;
    workEndTime: Date;
    blocks: TechTimelineBlock[]; // Ordered sequence of timeline stops (start, jobs, end)
    assignments: ScheduledJobAssignment[];
    totalDriveMinutes: number;
    totalWorkMinutes: number;
    totalDistanceMiles: number;
}

/**
 * Optimizes the driving route sequence for a single technician's daily assignments
 * using Nearest-Neighbor heuristic followed by 2-Opt edge swapping.
 * Re-computes chronological timestamps, travel buffers, drive minutes, and mileage.
 */
function optimizeTechRouteSequence(
    state: TechState,
    considerTraffic: boolean,
    respectCustomerWindows: boolean,
    reoptimizeAll: boolean,
    logs: string[]
): void {
    if (state.assignments.length < 2) return;

    const buffer = state.tech.schedulingPreferences?.jobPreferences?.bufferBetweenJobs ?? 10;
    const startLoc = state.homeLocation;

    // Helper: calculate total driving distance for a list of jobs starting from origin
    const calcDistance = (jobList: Job[], origin: { lat: number; lng: number }): number => {
        let dist = 0;
        let prev = origin;
        for (const j of jobList) {
            const jLoc = j.location && !isNaN(Number(j.location.lat)) && !isNaN(Number(j.location.lng))
                ? { lat: Number(j.location.lat), lng: Number(j.location.lng) }
                : DEFAULT_BASE_LOCATION;
            const d = calculateDistance(prev, jLoc);
            dist += (typeof d === 'number' && !isNaN(d)) ? d : 5;
            prev = jLoc;
        }
        return dist;
    };

    // Helper: simulate and validate a sequence of jobs against shift limits and customer time windows
    const validateSequence = (
        jobList: Job[],
        originLoc: { lat: number; lng: number },
        departureTime: Date
    ): { valid: boolean; assignments: ScheduledJobAssignment[]; blocks: TechTimelineBlock[]; totalDrive: number; totalWork: number; totalDist: number } => {
        const assignments: ScheduledJobAssignment[] = [];
        const blocks: TechTimelineBlock[] = [
            {
                type: 'start',
                startTime: state.workStartTime,
                endTime: state.workStartTime,
                location: state.homeLocation
            }
        ];
        let curLoc = originLoc;
        let curDep = departureTime;
        let totalDrive = 0;
        let totalWork = 0;
        let totalDist = 0;

        for (const job of jobList) {
            const jobLoc = job.location && !isNaN(Number(job.location.lat)) && !isNaN(Number(job.location.lng))
                ? { lat: Number(job.location.lat), lng: Number(job.location.lng), address: job.customer?.address }
                : DEFAULT_BASE_LOCATION;
            const dur = job.estimated_duration || 60;
            const transit = calculateTransit(curLoc, jobLoc, curDep, considerTraffic);

            const arrival = addMinutes(curDep, transit.driveMinutes);
            const departure = addMinutes(arrival, dur);

            if (respectCustomerWindows) {
                const winCheck = checkCustomerTimeWindow(job, arrival, departure);
                if (!winCheck.matches) {
                    return { valid: false, assignments: [], blocks: [], totalDrive: 0, totalWork: 0, totalDist: 0 };
                }
            }

            if (departure > state.workEndTime) {
                return { valid: false, assignments: [], blocks: [], totalDrive: 0, totalWork: 0, totalDist: 0 };
            }

            const asgn: ScheduledJobAssignment = {
                job,
                techId: state.tech.id,
                techName: state.tech.name,
                scheduledAt: arrival,
                estimatedArrival: arrival,
                estimatedDeparture: departure,
                driveTimeMinutes: transit.driveMinutes,
                distanceMiles: transit.distanceMiles,
                durationMinutes: dur,
                score: 95,
                matchReasons: [
                    'Shortest Driving Route',
                    `Transit: ~${transit.driveMinutes}m drive (${transit.distanceMiles} mi)`
                ],
                isPreExisting: false
            };

            assignments.push(asgn);
            blocks.push({
                type: 'new_job',
                job,
                assignment: asgn,
                startTime: arrival,
                endTime: departure,
                location: jobLoc
            });

            totalDrive += transit.driveMinutes;
            totalWork += dur;
            totalDist += transit.distanceMiles;

            curLoc = jobLoc;
            curDep = addMinutes(departure, buffer);
        }

        blocks.push({
            type: 'end',
            startTime: state.workEndTime,
            endTime: state.workEndTime,
            location: state.homeLocation
        });

        return { valid: true, assignments, blocks, totalDrive, totalWork, totalDist };
    };

    // If all jobs are re-optimizable (or there are no locked anchors)
    const allJobs = state.assignments.map(a => a.job);
    const initialDist = calcDistance(allJobs, startLoc);

    // Step 1: Nearest-Neighbor Greedy Heuristic
    const remaining = [...allJobs];
    let ordered: Job[] = [];
    let curLoc: { lat: number; lng: number } = { lat: startLoc.lat, lng: startLoc.lng };

    while (remaining.length > 0) {
        let bestIdx = 0;
        let bestDist = Infinity;

        for (let i = 0; i < remaining.length; i++) {
            const cand = remaining[i];
            const cLoc = cand.location && !isNaN(Number(cand.location.lat)) && !isNaN(Number(cand.location.lng))
                ? { lat: Number(cand.location.lat), lng: Number(cand.location.lng) }
                : DEFAULT_BASE_LOCATION;
            const d = calculateDistance(curLoc, cLoc);
            const dist = (typeof d === 'number' && !isNaN(d)) ? d : 10;
            if (dist < bestDist) {
                bestDist = dist;
                bestIdx = i;
            }
        }

        const picked = remaining.splice(bestIdx, 1)[0];
        ordered.push(picked);
        curLoc = picked.location && !isNaN(Number(picked.location.lat)) && !isNaN(Number(picked.location.lng))
            ? { lat: Number(picked.location.lat), lng: Number(picked.location.lng) }
            : { lat: DEFAULT_BASE_LOCATION.lat, lng: DEFAULT_BASE_LOCATION.lng };
    }

    // Step 2: 2-Opt Iterative Edge Reversal Improvement
    let bestOrdered = [...ordered];
    let bestDist = calcDistance(bestOrdered, startLoc);
    let iterations = 0;
    let improved = true;

    while (improved && iterations < 30) {
        improved = false;
        iterations++;

        for (let i = 0; i < bestOrdered.length - 1; i++) {
            for (let j = i + 1; j < bestOrdered.length; j++) {
                const candidate = [
                    ...bestOrdered.slice(0, i),
                    ...bestOrdered.slice(i, j + 1).reverse(),
                    ...bestOrdered.slice(j + 1)
                ];
                const candDist = calcDistance(candidate, startLoc);
                if (candDist < bestDist - 0.05) {
                    const testVal = validateSequence(candidate, startLoc, state.workStartTime);
                    if (testVal.valid) {
                        bestOrdered = candidate;
                        bestDist = candDist;
                        improved = true;
                        break;
                    }
                }
            }
            if (improved) break;
        }
    }

    // Step 3: Apply Optimized Sequence
    const finalVal = validateSequence(bestOrdered, startLoc, state.workStartTime);
    if (finalVal.valid) {
        state.assignments = finalVal.assignments;
        state.blocks = finalVal.blocks;
        state.totalDriveMinutes = finalVal.totalDrive;
        state.totalWorkMinutes = finalVal.totalWork;
        state.totalDistanceMiles = finalVal.totalDist;
        const savedMiles = Math.max(0, Math.round((initialDist - bestDist) * 0.621371 * 10) / 10);
        logs.push(`[AutoSchedule] Route optimized for ${state.tech.name}: ${allJobs.length} stops ordered by nearest-neighbor & 2-opt (${savedMiles > 0 ? `${savedMiles} mi saved` : 'optimal sequence confirmed'}).`);
    }
}

// ============================================================================
// Core Multi-Technician Optimization Solver
// ============================================================================

export async function optimizeMultiTechSchedule(
    jobs: Job[],
    technicians: UserProfile[],
    allOrgJobs: Job[],
    materials: any[],
    tools: ToolItem[],
    options: MultiTechSchedulerOptions
): Promise<MultiTechScheduleResult> {
    const logs: string[] = [];
    logs.push(`[AutoSchedule] Initiating multi-tech optimization for ${format(options.targetDate, 'yyyy-MM-dd')}`);

    const targetDate = startOfDay(options.targetDate);
    const mode = options.materialSchedulingMode || 'allow_all';
    const bufferDays = options.materialBufferDays || 0;
    const maxDailyJobs = options.maxJobsPerTechPerDay || 6;
    const considerTraffic = options.considerTraffic ?? true;
    const respectCustomerWindows = options.respectCustomerWindows ?? true;
    const enforceMaterials = options.enforceMaterials ?? true;
    const enforceTools = options.enforceTools ?? true;
    const reoptimizeAll = options.includeAlreadyScheduled ?? false;
    const optimizeRouteOrder = options.optimizeRouteOrder ?? true;

    // Filter eligible active technicians
    const activeTechs = technicians.filter(t => {
        if (t.status === 'inactive' || t.archived === true) return false;
        if (options.selectedTechIds && options.selectedTechIds.length > 0) {
            return options.selectedTechIds.includes(t.id);
        }
        return true;
    });

    if (activeTechs.length === 0) {
        logs.push(`[AutoSchedule] Error: No active technicians available for dispatch.`);
        return {
            targetDate,
            totalScheduled: 0,
            newlyScheduled: 0,
            preExistingScheduled: 0,
            totalUnassigned: jobs.length,
            techSummaries: [],
            unassignedJobs: jobs.map(j => ({
                job: j,
                reason: 'No active technicians available in selected roster',
                category: 'tech_capacity'
            })),
            overallStatistics: {
                totalJobs: jobs.length,
                newlyScheduledCount: 0,
                preExistingCount: 0,
                totalDriveMinutes: 0,
                totalWorkMinutes: 0,
                totalDistanceMiles: 0,
                estimatedDriveTimeSavedMinutes: 0,
                activeTechCount: 0
            },
            logs
        };
    }

    logs.push(`[AutoSchedule] Roster contains ${activeTechs.length} active technicians.`);

    const techStates: Map<string, TechState> = new Map();
    let preExistingTotalCount = 0;

    activeTechs.forEach(tech => {
        const startHourStr = tech.schedulingPreferences?.workStartTime || tech.preferences?.working_hours?.start || '08:00';
        const endHourStr = tech.schedulingPreferences?.workEndTime || tech.preferences?.working_hours?.end || '17:00';

        const { hour: sh, minute: sm } = parseTimeString(startHourStr, 8, 0);
        const { hour: eh, minute: em } = parseTimeString(endHourStr, 17, 0);

        const workStartTime = new Date(targetDate);
        workStartTime.setHours(sh, sm, 0, 0);

        const workEndTime = new Date(targetDate);
        workEndTime.setHours(eh, em, 0, 0);

        const homeLoc = tech.homeLocation?.lat && tech.homeLocation?.lng
            ? { lat: tech.homeLocation.lat, lng: tech.homeLocation.lng, address: tech.homeLocation.address || 'Tech Home Base' }
            : DEFAULT_BASE_LOCATION;

        const initialBlocks: TechTimelineBlock[] = [
            {
                type: 'start',
                startTime: workStartTime,
                endTime: workStartTime,
                location: homeLoc
            }
        ];

        const initialAssignments: ScheduledJobAssignment[] = [];
        let techDrive = 0;
        let techWork = 0;
        let techDist = 0;

        // If NOT re-optimizing, load all existing locked jobs for this tech on target date
        if (!reoptimizeAll) {
            const existingForTech = allOrgJobs.filter(j => {
                if (j.archived || j.status === 'cancelled' || j.status === 'completed') return false;
                if (!isJobAssignedToTech(j, tech)) return false;
                const sched = normalizeDate(j.scheduled_at);
                return sched && isSameDay(sched, targetDate);
            });

            // Sort existing by scheduled time
            existingForTech.sort((a, b) => {
                const aTime = normalizeDate(a.scheduled_at)?.getTime() || 0;
                const bTime = normalizeDate(b.scheduled_at)?.getTime() || 0;
                return aTime - bTime;
            });

            let prevLoc: { lat: number; lng: number; address?: string } = homeLoc;
            let prevDep = workStartTime;

            existingForTech.forEach(exJob => {
                const schedStart = normalizeDate(exJob.scheduled_at)!;
                const dur = exJob.estimated_duration || 60;
                const schedEnd = addMinutes(schedStart, dur);
                const jobLoc: { lat: number; lng: number; address?: string } = exJob.location
                    ? { lat: exJob.location.lat, lng: exJob.location.lng, address: exJob.customer?.address }
                    : DEFAULT_BASE_LOCATION;

                const transit = calculateTransit(prevLoc, jobLoc, prevDep, considerTraffic);

                const exAssignment: ScheduledJobAssignment = {
                    job: exJob,
                    techId: tech.id,
                    techName: tech.name,
                    scheduledAt: schedStart,
                    estimatedArrival: schedStart,
                    estimatedDeparture: schedEnd,
                    driveTimeMinutes: transit.driveMinutes,
                    distanceMiles: transit.distanceMiles,
                    durationMinutes: dur,
                    score: 100,
                    matchReasons: ['Pre-scheduled appointment'],
                    isPreExisting: true
                };

                initialAssignments.push(exAssignment);
                initialBlocks.push({
                    type: 'existing_job',
                    job: exJob,
                    assignment: exAssignment,
                    startTime: schedStart,
                    endTime: schedEnd,
                    location: jobLoc
                });

                techDrive += transit.driveMinutes;
                techWork += dur;
                techDist += transit.distanceMiles;

                prevLoc = jobLoc;
                prevDep = schedEnd;
                preExistingTotalCount++;
            });
        }

        // Add end block
        initialBlocks.push({
            type: 'end',
            startTime: workEndTime,
            endTime: workEndTime,
            location: homeLoc
        });

        techStates.set(tech.id, {
            tech,
            homeLocation: homeLoc,
            workStartTime,
            workEndTime,
            blocks: initialBlocks,
            assignments: initialAssignments,
            totalDriveMinutes: techDrive,
            totalWorkMinutes: techWork,
            totalDistanceMiles: techDist
        });
    });

    logs.push(`[AutoSchedule] Found ${preExistingTotalCount} pre-existing scheduled jobs on ${format(targetDate, 'MMM d')}.`);

    // Candidate jobs to schedule
    const candidateJobs = jobs.filter(j => {
        if (j.archived || j.status === 'completed' || j.status === 'cancelled') return false;
        if (reoptimizeAll) {
            return true; // Re-optimizing includes all jobs
        }
        // When not re-optimizing, any job already scheduled with a date on target date is a locked anchor, NOT an unscheduled candidate
        const sched = normalizeDate(j.scheduled_at);
        if (sched && isSameDay(sched, targetDate) && (j.assigned_tech_id || j.assigned_tech_name)) {
            return false;
        }
        return ['pending', 'unscheduled', 'quote_pending', 'assigned'].includes(j.status) || !j.scheduled_at;
    });

    logs.push(`[AutoSchedule] Evaluating ${candidateJobs.length} candidate jobs for placement.`);

    const unassignedReports: UnassignedJobReport[] = [];
    const remainingJobs: Job[] = [];

    // --- PHASE 1: Pre-Filtering on Materials & Hard Constraints ---
    for (const job of candidateJobs) {
        if (enforceMaterials) {
            const matCheck = checkMaterialReadiness(job, materials, mode, bufferDays, targetDate);
            if (!matCheck.ready) {
                unassignedReports.push({
                    job,
                    reason: matCheck.reason || 'Material constraints not met',
                    category: 'materials'
                });
                continue;
            }
        }
        remainingJobs.push(job);
    }

    logs.push(`[AutoSchedule] ${remainingJobs.length} jobs passed material/readiness checks.`);

    // Sort remaining jobs by Priority descending (Critical -> High -> Medium -> Low)
    const priorityWeights: Record<string, number> = { critical: 40, high: 30, medium: 20, low: 10 };
    remainingJobs.sort((a, b) => (priorityWeights[b.priority] || 10) - (priorityWeights[a.priority] || 10));

    // --- PHASE 2: Gap-Insertion Multi-Tech Solver ---
    // For each pending job, find the best (tech, timeline gap) insertion slot
    while (remainingJobs.length > 0) {
        let bestInsertion: {
            jobIndex: number;
            techId: string;
            gapIndex: number; // Insert after blocks[gapIndex]
            slotStart: Date;
            slotEnd: Date;
            driveMinutes: number;
            distanceMiles: number;
            score: number;
            matchReasons: string[];
        } | null = null;

        for (let jIdx = 0; jIdx < remainingJobs.length; jIdx++) {
            const job = remainingJobs[jIdx];
            const jobDuration = job.estimated_duration || 60;
            const jobLocation: { lat: number; lng: number; address?: string } = job.location
                ? { lat: job.location.lat, lng: job.location.lng, address: job.customer?.address }
                : DEFAULT_BASE_LOCATION;

            for (const [techId, state] of techStates.entries()) {
                // 1. Tech Capacity Limit
                const techMax = state.tech.schedulingPreferences?.jobPreferences?.maxJobsPerDay || maxDailyJobs;
                if (state.assignments.length >= techMax) continue;

                // 2. Tools Constraint
                if (enforceTools) {
                    const toolCheck = checkToolReadiness(job, state.tech, tools);
                    if (!toolCheck.ready) continue;
                }

                // 3. Skill Matching
                const { score: skillScore, matched: matchedSkills } = calculateTechSkillScore(state.tech, job);
                if (skillScore < 20) continue;

                // 4. Iterate over each available timeline gap between existing blocks
                for (let bIdx = 0; bIdx < state.blocks.length - 1; bIdx++) {
                    const prevBlock = state.blocks[bIdx];
                    const nextBlock = state.blocks[bIdx + 1];

                    const buffer = state.tech.schedulingPreferences?.jobPreferences?.bufferBetweenJobs ?? 10;
                    const earliestDeparture = prevBlock.type === 'start'
                        ? prevBlock.endTime
                        : addMinutes(prevBlock.endTime, buffer);

                    // Drive from prevBlock to candidate job
                    const transitToJob = calculateTransit(
                        prevBlock.location,
                        jobLocation,
                        earliestDeparture,
                        considerTraffic
                    );

                    const candidateArrival = addMinutes(earliestDeparture, transitToJob.driveMinutes);
                    const candidateEnd = addMinutes(candidateArrival, jobDuration);

                    // Constraint 1: Must finish before technician's shift ends
                    if (candidateEnd > state.workEndTime) {
                        continue;
                    }

                    // Constraint 2: Must be able to reach next block (existing job, new job, or shift end) on time
                    const transitToNext = calculateTransit(
                        jobLocation,
                        nextBlock.location,
                        candidateEnd,
                        considerTraffic
                    );
                    const requiredArrivalAtNext = nextBlock.type === 'end'
                        ? candidateEnd
                        : addMinutes(candidateEnd, buffer + transitToNext.driveMinutes);

                    if (requiredArrivalAtNext > nextBlock.startTime) {
                        continue; // Overlaps or causes tech to be late for next scheduled job!
                    }

                    // Constraint 3: Comprehensive Multi-Block Non-Overlap & Transit Buffer Guard
                    let hasBlockCollision = false;
                    for (const block of state.blocks) {
                        if (block.type === 'start' || block.type === 'end') continue;
                        
                        // Direct time-window overlap
                        if (candidateArrival < block.endTime && candidateEnd > block.startTime) {
                            hasBlockCollision = true;
                            break;
                        }

                        // Transit buffer check if candidate is scheduled before this block
                        if (candidateEnd <= block.startTime) {
                            const driveToBlock = calculateTransit(jobLocation, block.location, candidateEnd, considerTraffic);
                            if (addMinutes(candidateEnd, buffer + driveToBlock.driveMinutes) > block.startTime) {
                                hasBlockCollision = true;
                                break;
                            }
                        }

                        // Transit buffer check if candidate is scheduled after this block
                        if (candidateArrival >= block.endTime) {
                            const driveFromBlock = calculateTransit(block.location, jobLocation, block.endTime, considerTraffic);
                            if (addMinutes(block.endTime, buffer + driveFromBlock.driveMinutes) > candidateArrival) {
                                hasBlockCollision = true;
                                break;
                            }
                        }
                    }

                    if (hasBlockCollision) {
                        continue;
                    }

                    // Customer availability window check
                    let customerScoreBonus = 0;
                    let customerWindowMatched = true;
                    if (respectCustomerWindows) {
                        const winCheck = checkCustomerTimeWindow(job, candidateArrival, candidateEnd);
                        if (!winCheck.matches) {
                            continue;
                        }
                        customerScoreBonus = winCheck.scoreBonus;
                    }

                    // --- Dynamic Multi-Metric Priority Weighting Engine ---
                    const metricPrioritiesOrder: SchedulingMetricId[] = (options.metricPriorities && options.metricPriorities.length > 0)
                        ? options.metricPriorities
                        : ['route_proximity', 'customer_windows', 'job_priority', 'material_readiness', 'tool_availability', 'skill_match', 'traffic_avoidance'];

                    // Assigned weights based on rank position (sum = 100)
                    const rankWeights = [35, 25, 18, 10, 6, 4, 2];
                    const weightMap: Record<SchedulingMetricId, number> = {
                        route_proximity: 35,
                        customer_windows: 25,
                        job_priority: 18,
                        material_readiness: 10,
                        tool_availability: 6,
                        skill_match: 4,
                        traffic_avoidance: 2
                    };
                    metricPrioritiesOrder.forEach((metricId, rIdx) => {
                        weightMap[metricId] = rankWeights[rIdx] || 2;
                    });

                    // 1. Route Proximity Sub-Score (0 - 100)
                    const directDistance = calculateDistance(prevBlock.location, nextBlock.location);
                    const detourDistance = (transitToJob.distanceMiles + transitToNext.driveMinutes / 2.5) - ((typeof directDistance === 'number' && !isNaN(directDistance)) ? directDistance * 0.621371 : 5);
                    const rawRouteScore = 100 - (transitToJob.driveMinutes * 2.2 + Math.max(0, detourDistance) * 5.0);
                    const subScoreRoute = Math.max(5, Math.min(100, rawRouteScore));

                    // 2. Customer Window Sub-Score (0 - 100)
                    const subScoreCustomer = job.request?.availabilityWindows?.length
                        ? (customerScoreBonus >= 25 ? Math.min(100, 70 + customerScoreBonus) : 60)
                        : 75;

                    // 3. Job Priority Sub-Score (0 - 100)
                    const subScorePriority = job.priority === 'critical' ? 100 : job.priority === 'high' ? 80 : job.priority === 'medium' ? 55 : 30;

                    // 4. Skill Match Sub-Score (0 - 100)
                    const subScoreSkill = Math.max(0, Math.min(100, skillScore));

                    // 5. Material Readiness Sub-Score (0 - 100)
                    const subScoreMaterial = mode === 'in_stock_only' ? 100 : mode === 'estimated_availability' ? 80 : 70;

                    // 6. Tool Availability Sub-Score (0 - 100)
                    const subScoreTool = enforceTools ? 90 : 70;

                    // 7. Traffic Avoidance Sub-Score (0 - 100)
                    const trafficMult = getTrafficMultiplier(earliestDeparture);
                    const subScoreTraffic = trafficMult > 1.4 ? 30 : trafficMult > 1.1 ? 65 : 100;

                    // Weighted Composite Score
                    const compositeScore = (
                        (subScoreRoute * weightMap.route_proximity) +
                        (subScoreCustomer * weightMap.customer_windows) +
                        (subScorePriority * weightMap.job_priority) +
                        (subScoreSkill * weightMap.skill_match) +
                        (subScoreMaterial * weightMap.material_readiness) +
                        (subScoreTool * weightMap.tool_availability) +
                        (subScoreTraffic * weightMap.traffic_avoidance)
                    ) / 100;

                    if (!bestInsertion || compositeScore > bestInsertion.score) {
                        const reasons: string[] = [];
                        if (subScoreRoute >= 80) reasons.push(`Shortest Route: ~${transitToJob.driveMinutes}m drive (${transitToJob.distanceMiles} mi)`);
                        if (skillScore >= 80) reasons.push(`Skill match (${matchedSkills.slice(0, 2).join(', ')})`);
                        if (customerScoreBonus > 0) reasons.push(`Matches customer time window`);
                        if (job.priority === 'critical' || job.priority === 'high') reasons.push(`Priority: ${job.priority}`);
                        if (prevBlock.type === 'existing_job' || prevBlock.type === 'new_job') reasons.push(`Sequenced next closest stop after ${prevBlock.job?.customer.name}`);

                        bestInsertion = {
                            jobIndex: jIdx,
                            techId,
                            gapIndex: bIdx,
                            slotStart: candidateArrival,
                            slotEnd: candidateEnd,
                            driveMinutes: transitToJob.driveMinutes,
                            distanceMiles: transitToJob.distanceMiles,
                            score: Math.round(compositeScore * 10) / 10,
                            matchReasons: reasons
                        };
                    }
                }
            }
        }

        // If no candidate found across any tech, remaining jobs cannot fit today
        if (!bestInsertion) {
            for (const unassignedJob of remainingJobs) {
                unassignedReports.push({
                    job: unassignedJob,
                    reason: 'No gap available around existing schedules, shift hours, or matching skill/tool requirements.',
                    category: 'tech_capacity'
                });
            }
            break;
        }

        // Commit the best insertion
        const chosenJob = remainingJobs.splice(bestInsertion.jobIndex, 1)[0];
        const state = techStates.get(bestInsertion.techId)!;

        const newAssignment: ScheduledJobAssignment = {
            job: chosenJob,
            techId: state.tech.id,
            techName: state.tech.name,
            scheduledAt: bestInsertion.slotStart,
            estimatedArrival: bestInsertion.slotStart,
            estimatedDeparture: bestInsertion.slotEnd,
            driveTimeMinutes: bestInsertion.driveMinutes,
            distanceMiles: bestInsertion.distanceMiles,
            durationMinutes: chosenJob.estimated_duration || 60,
            score: Math.round(bestInsertion.score),
            matchReasons: bestInsertion.matchReasons,
            isPreExisting: false
        };

        const newBlock: TechTimelineBlock = {
            type: 'new_job',
            job: chosenJob,
            assignment: newAssignment,
            startTime: bestInsertion.slotStart,
            endTime: bestInsertion.slotEnd,
            location: chosenJob.location || DEFAULT_BASE_LOCATION
        };

        // Insert new block and sort all blocks chronologically
        state.blocks.push(newBlock);
        state.blocks.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

        // Recompile tech assignments sorted by time
        const allAssignments = state.blocks
            .filter(b => b.assignment)
            .map(b => b.assignment!)
            .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

        state.assignments = allAssignments;
        state.totalDriveMinutes += bestInsertion.driveMinutes;
        state.totalWorkMinutes += newAssignment.durationMinutes;
        state.totalDistanceMiles += bestInsertion.distanceMiles;

        logs.push(`[AutoSchedule] Inserted "${chosenJob.customer.name}" -> ${state.tech.name} @ ${format(bestInsertion.slotStart, 'h:mm a')} (${bestInsertion.driveMinutes}m drive)`);
    }

    // --- PHASE 2.5: Intra-Route Shortest-Path & Nearest-Neighbor Route Optimization ---
    if (optimizeRouteOrder) {
        logs.push(`[AutoSchedule] Running nearest-neighbor & 2-opt route optimization across all technician schedules...`);
        for (const state of techStates.values()) {
            optimizeTechRouteSequence(state, considerTraffic, respectCustomerWindows, reoptimizeAll, logs);
        }
    }

    // --- PHASE 3: Compile Summaries & Metrics ---
    const techSummaries: TechScheduleSummary[] = [];
    let totalScheduledCount = 0;
    let newlyScheduledCount = 0;
    let totalDriveMin = 0;
    let totalWorkMin = 0;
    let totalDistance = 0;

    for (const state of techStates.values()) {
        const startLoc = state.homeLocation;
        const routeUrl = generateGoogleMapsRouteUrl(startLoc, state.assignments);
        const shiftDurationMinutes = differenceInDays(state.workEndTime, state.workStartTime) === 0
            ? (state.workEndTime.getHours() - 8) * 60
            : 480;
        const totalBusyMinutes = state.totalDriveMinutes + state.totalWorkMinutes;
        const utilization = Math.min(Math.round((totalBusyMinutes / (shiftDurationMinutes || 480)) * 100), 100);

        const newCount = state.assignments.filter(a => !a.isPreExisting).length;
        const preCount = state.assignments.filter(a => a.isPreExisting).length;

        techSummaries.push({
            tech: state.tech,
            assignedJobs: state.assignments,
            newScheduledCount: newCount,
            preExistingCount: preCount,
            totalDriveTimeMinutes: state.totalDriveMinutes,
            totalWorkTimeMinutes: state.totalWorkMinutes,
            totalDistanceMiles: Math.round(state.totalDistanceMiles * 10) / 10,
            routeMapsUrl: routeUrl,
            utilizationPercent: utilization
        });

        totalScheduledCount += state.assignments.length;
        newlyScheduledCount += newCount;
        totalDriveMin += state.totalDriveMinutes;
        totalWorkMin += state.totalWorkMinutes;
        totalDistance += state.totalDistanceMiles;
    }

    const estimatedSavings = Math.round(totalDriveMin * 0.35);

    logs.push(`[AutoSchedule] Complete: ${newlyScheduledCount} new jobs scheduled (+${preExistingTotalCount} pre-existing) across ${activeTechs.length} techs. ${unassignedReports.length} unassigned.`);

    return {
        targetDate,
        totalScheduled: totalScheduledCount,
        newlyScheduled: newlyScheduledCount,
        preExistingScheduled: preExistingTotalCount,
        totalUnassigned: unassignedReports.length,
        techSummaries,
        unassignedJobs: unassignedReports,
        overallStatistics: {
            totalJobs: totalScheduledCount + unassignedReports.length,
            newlyScheduledCount,
            preExistingCount: preExistingTotalCount,
            totalDriveMinutes: totalDriveMin,
            totalWorkMinutes: totalWorkMin,
            totalDistanceMiles: Math.round(totalDistance * 10) / 10,
            estimatedDriveTimeSavedMinutes: estimatedSavings,
            activeTechCount: activeTechs.length
        },
        logs
    };
}
