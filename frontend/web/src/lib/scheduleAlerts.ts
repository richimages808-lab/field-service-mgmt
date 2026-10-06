import { Job, UserProfile } from '../types';
import { format, differenceInMinutes, isSameDay, formatDistanceToNow } from 'date-fns';
import { evaluateSlotViability, SlotViabilityResult } from './travelEstimator';

export interface ScheduleAlert {
    id: string;
    type: 'overdue' | 'skills' | 'overlap' | 'hours' | 'travel' | 'capacity' | 'field_action';
    severity: 'critical' | 'warning' | 'info';
    title: string;
    message: string;
    actionAdvice: string;
}

export interface DropSlotEvaluation {
    status: 'optimal' | 'warning' | 'conflict';
    primaryTitle: string;
    primaryMessage: string;
    alerts: ScheduleAlert[];
    isConflict: boolean;
}

// ============================================================================
// Robust Timestamp Parser
// ============================================================================
export const parseFirestoreDate = (ts: any): Date | null => {
    if (!ts) return null;
    if (typeof ts.toDate === 'function') {
        try {
            return ts.toDate();
        } catch {
            // Ignore
        }
    }
    if (ts instanceof Date) {
        return isNaN(ts.getTime()) ? null : ts;
    }
    if (ts.seconds !== undefined && ts.seconds !== null) {
        const secs = Number(ts.seconds);
        if (!isNaN(secs)) return new Date(secs * 1000);
    }
    if (ts._seconds !== undefined && ts._seconds !== null) {
        const secs = Number(ts._seconds);
        if (!isNaN(secs)) return new Date(secs * 1000);
    }
    const d = new Date(ts);
    if (!isNaN(d.getTime())) {
        return d;
    }
    return null;
};

// ============================================================================
// Working Hours Helper
// ============================================================================
export function getTechWorkHours(tech?: UserProfile, targetDate: Date = new Date()): { workStart: number; workEnd: number; isDayOff: boolean } {
    if (!tech) return { workStart: 8, workEnd: 17, isDayOff: false };

    const dayOfWeek = targetDate.getDay();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayKey = dayNames[dayOfWeek] as keyof NonNullable<UserProfile['weeklyAvailability']>;

    const dayAvail = tech.weeklyAvailability?.[dayKey];
    if (dayAvail && 'available' in dayAvail) {
        if (!dayAvail.available) {
            return { workStart: 8, workEnd: 17, isDayOff: true };
        }
        const startStr = dayAvail.startTime || '08:00';
        const endStr = dayAvail.endTime || '17:00';
        return {
            workStart: parseInt(startStr.split(':')[0], 10) || 8,
            workEnd: parseInt(endStr.split(':')[0], 10) || 17,
            isDayOff: false
        };
    }

    const prefs = tech.preferences?.working_hours;
    if (prefs) {
        const startStr = prefs.start || '08:00';
        const endStr = prefs.end || '17:00';
        return {
            workStart: parseInt(startStr.split(':')[0], 10) || 8,
            workEnd: parseInt(endStr.split(':')[0], 10) || 17,
            isDayOff: false
        };
    }

    return { workStart: 8, workEnd: 17, isDayOff: false };
}

// ============================================================================
// Main Function: Compute all alerts for a scheduled or placed job
// ============================================================================
export function getJobScheduleAlerts(
    job: Job,
    tech?: UserProfile,
    allTechJobs?: Job[],
    now: Date = new Date()
): ScheduleAlert[] {
    const alerts: ScheduleAlert[] = [];
    const startTime = parseFirestoreDate(job.scheduled_at);
    const duration = job.estimated_duration || 60;

    // 1. OVERDUE / UNSTARTED CHECK
    if (startTime && job.status === 'scheduled') {
        const endTime = new Date(startTime.getTime() + duration * 60000);
        if (now > endTime) {
            const timeAgo = formatDistanceToNow(endTime, { addSuffix: true });
            alerts.push({
                id: 'overdue-expired',
                type: 'overdue',
                severity: 'critical',
                title: 'Schedule Overdue',
                message: `Scheduled window ended at ${format(endTime, 'h:mm a')} (${timeAgo}) without status update.`,
                actionAdvice: 'Check in with technician or update status to In Progress, Completed, or Reschedule.'
            });
        } else if (now > startTime) {
            alerts.push({
                id: 'overdue-unstarted',
                type: 'overdue',
                severity: 'warning',
                title: 'Past Start Time',
                message: `Job was scheduled to start at ${format(startTime, 'h:mm a')} and is not yet marked in-progress.`,
                actionAdvice: 'Verify technician arrival or update job status.'
            });
        }
    }

    // 2. SKILL / QUALIFICATION CHECK
    if (tech) {
        const requiredSkills = [
            ...(job.intakeReview?.aiRecommendation?.skillsRequired || []),
            ...(job.aiRecommendation?.skillsRequired || []),
        ].filter((s, i, arr) => Boolean(s) && arr.indexOf(s) === i);

        if (requiredSkills.length > 0) {
            const techSpecialties = (tech.specialties || []).map(s => s.toLowerCase());
            const missing = requiredSkills.filter(skill =>
                !techSpecialties.some(ts => ts.includes(skill.toLowerCase()) || skill.toLowerCase().includes(ts))
            );

            if (missing.length > 0) {
                alerts.push({
                    id: 'skills-missing',
                    type: 'skills',
                    severity: 'warning',
                    title: 'Missing Qualifications',
                    message: `${tech.name || 'Technician'} lacks required skill(s): ${missing.join(', ')}.`,
                    actionAdvice: `Reassign to a qualified technician or assign a certified co-technician.`
                });
            }
        }
    }

    // 3. SCHEDULE OVERLAP CHECK
    if (startTime && allTechJobs && allTechJobs.length > 0) {
        const endTime = new Date(startTime.getTime() + duration * 60000);

        const overlaps = allTechJobs.filter(other => {
            if (other.id === job.id) return false;
            if (other.status === 'cancelled' || other.status === 'completed') return false;
            const otherStart = parseFirestoreDate(other.scheduled_at);
            if (!otherStart || !isSameDay(otherStart, startTime)) return false;
            const otherDuration = other.estimated_duration || 60;
            const otherEnd = new Date(otherStart.getTime() + otherDuration * 60000);
            return (startTime < otherEnd && endTime > otherStart);
        });

        if (overlaps.length > 0) {
            const overlapNames = overlaps.map(o => {
                const s = parseFirestoreDate(o.scheduled_at);
                const sFormatted = s ? format(s, 'h:mm a') : 'TBD';
                return `"${o.customer?.name || 'Job'}" (${sFormatted})`;
            }).join(', ');

            alerts.push({
                id: 'schedule-overlap',
                type: 'overlap',
                severity: 'critical',
                title: 'Schedule Overlap',
                message: `Overlaps with ${overlapNames}. Double-booking on technician schedule.`,
                actionAdvice: 'Drag to an open time slot or reassign to an available technician.'
            });
        }
    }

    // 4. OUTSIDE WORKING HOURS CHECK
    if (tech && startTime) {
        const { workStart, workEnd, isDayOff } = getTechWorkHours(tech, startTime);
        if (isDayOff) {
            alerts.push({
                id: 'hours-dayoff',
                type: 'hours',
                severity: 'warning',
                title: 'Scheduled on Day Off',
                message: `${tech.name || 'Technician'} is scheduled off on ${format(startTime, 'EEEE')}.`,
                actionAdvice: 'Move to a working shift day or reassign to on-duty technician.'
            });
        } else {
            const startHour = startTime.getHours() + startTime.getMinutes() / 60;
            const endHour = startHour + duration / 60;
            if (startHour < workStart || endHour > workEnd) {
                const startStr = `${workStart % 12 || 12}:00 ${workStart >= 12 ? 'PM' : 'AM'}`;
                const endStr = `${workEnd % 12 || 12}:00 ${workEnd >= 12 ? 'PM' : 'AM'}`;
                alerts.push({
                    id: 'hours-outside',
                    type: 'hours',
                    severity: 'warning',
                    title: 'Outside Working Hours',
                    message: `Scheduled ${format(startTime, 'h:mm a')}, but ${tech.name || 'tech'}'s shift hours are ${startStr} – ${endStr}.`,
                    actionAdvice: `Adjust schedule between ${startStr} and ${endStr}.`
                });
            }
        }
    }

    // 5. TRAVEL & TRAFFIC DEFICIT CHECK
    if (tech && startTime && allTechJobs && allTechJobs.length > 0) {
        try {
            const viability = evaluateSlotViability(job, tech, allTechJobs, startTime, duration);
            if (viability.status.startsWith('conflict')) {
                const inc = viability.incomingTransit;
                alerts.push({
                    id: 'travel-conflict',
                    type: 'travel',
                    severity: 'warning',
                    title: `Travel Deficit (+${viability.deficitMinutes || 15}m needed)`,
                    message: `Estimated drive from ${inc?.originLabel || 'previous stop'} is ~${inc?.trafficDurationMinutes || 20}m (${inc?.trafficLevel || 'normal'} traffic), but buffer is insufficient.`,
                    actionAdvice: `Earliest arrival is ${viability.earliestViableStart ? format(viability.earliestViableStart, 'h:mm a') : 'later'}. Slide start time back to allow transit.`
                });
            } else if (viability.status === 'tight') {
                const inc = viability.incomingTransit;
                alerts.push({
                    id: 'travel-tight',
                    type: 'travel',
                    severity: 'info',
                    title: 'Tight Travel Buffer',
                    message: `Margin before job is tight (~${inc?.trafficDurationMinutes || 15}m drive from ${inc?.originLabel || 'previous stop'}).`,
                    actionAdvice: 'Consider adding a 15m buffer if road conditions worsen.'
                });
            }
        } catch {
            // Ignore travel eval errors
        }
    }

    // 6. DAILY CAPACITY LIMIT CHECK
    if (tech && startTime && allTechJobs) {
        const maxJobs = tech.schedulingPreferences?.jobPreferences?.maxJobsPerDay || 6;
        const sameDayJobs = allTechJobs.filter(j => {
            const s = parseFirestoreDate(j.scheduled_at);
            return s && isSameDay(s, startTime) && ['scheduled', 'in_progress', 'assigned'].includes(j.status);
        });

        if (sameDayJobs.length > maxJobs) {
            alerts.push({
                id: 'capacity-exceeded',
                type: 'capacity',
                severity: 'warning',
                title: 'Daily Capacity Exceeded',
                message: `${tech.name || 'Technician'} has ${sameDayJobs.length} jobs assigned today (recommended max is ${maxJobs}).`,
                actionAdvice: 'Rebalance workload by reassigning jobs to another available tech.'
            });
        }
    }

    // 7. FIELD ACTION ITEMS
    if (job.parts_needed) {
        alerts.push({
            id: 'field-parts',
            type: 'field_action',
            severity: 'warning',
            title: 'Parts Needed',
            message: 'Technician flagged that parts or materials must be sourced for this work order.',
            actionAdvice: 'Check parts requirements or inventory before dispatching.'
        });
    }

    if (job.field_quote_requested) {
        alerts.push({
            id: 'field-quote',
            type: 'field_action',
            severity: 'warning',
            title: 'Field Quote Requested',
            message: 'Technician submitted an estimate or requested a field quote amendment.',
            actionAdvice: 'Review and approve field quote in Field Actions.'
        });
    }

    if (job.pending_scope_approval || job.has_scope_amendment) {
        alerts.push({
            id: 'field-scope',
            type: 'field_action',
            severity: 'warning',
            title: 'Scope Approval Pending',
            message: 'A work order scope amendment requires dispatcher or customer approval.',
            actionAdvice: 'Review amendment scope and approve or decline.'
        });
    }

    return alerts;
}

// ============================================================================
// Real-time evaluation of a slot when dragging a job over it (Before Dropping)
// ============================================================================
export function evaluateDropSlotAlerts(
    job: Job,
    tech: UserProfile,
    slot: Date,
    techJobs: Job[],
    viability?: SlotViabilityResult
): DropSlotEvaluation {
    const alerts: ScheduleAlert[] = [];
    const jobDuration = job.estimated_duration || 60;
    const slotEnd = new Date(slot.getTime() + jobDuration * 60000);

    // 1. Overlap Check
    const overlapping = techJobs.find(other => {
        if (other.id === job.id) return false;
        if (other.status === 'cancelled' || other.status === 'completed') return false;
        const otherStart = parseFirestoreDate(other.scheduled_at);
        if (!otherStart || !isSameDay(otherStart, slot)) return false;
        const otherDur = other.estimated_duration || 60;
        const otherEnd = new Date(otherStart.getTime() + otherDur * 60000);
        return (slot < otherEnd && slotEnd > otherStart);
    });

    if (overlapping) {
        const s = parseFirestoreDate(overlapping.scheduled_at);
        alerts.push({
            id: 'slot-overlap',
            type: 'overlap',
            severity: 'critical',
            title: 'Schedule Overlap',
            message: `Overlaps with "${overlapping.customer?.name || 'existing job'}" (${s ? format(s, 'h:mm a') : ''}).`,
            actionAdvice: 'Pick an open slot or reschedule overlapping job.'
        });
    }

    // 2. Travel Conflict Check
    const isTravelConflict = viability && (
        viability.status === 'conflict_incoming' ||
        viability.status === 'conflict_outgoing' ||
        viability.status === 'conflict_both'
    );

    if (isTravelConflict) {
        const inc = viability.incomingTransit;
        alerts.push({
            id: 'slot-travel',
            type: 'travel',
            severity: 'warning',
            title: `Travel Deficit (+${viability.deficitMinutes || 15}m needed)`,
            message: `Estimated drive from ${inc?.originLabel || 'previous stop'} is ~${inc?.trafficDurationMinutes || 20}m, but gap is insufficient.`,
            actionAdvice: `Earliest viable start is ${viability.earliestViableStart ? format(viability.earliestViableStart, 'h:mm a') : 'later'}.`
        });
    }

    // 3. Skills Check
    const requiredSkills = [
        ...(job.intakeReview?.aiRecommendation?.skillsRequired || []),
        ...(job.aiRecommendation?.skillsRequired || [])
    ].filter((s, i, arr) => Boolean(s) && arr.indexOf(s) === i);

    if (requiredSkills.length > 0) {
        const techSkills = (tech.specialties || []).map(s => s.toLowerCase());
        const missing = requiredSkills.filter(sk =>
            !techSkills.some(ts => ts.includes(sk.toLowerCase()) || sk.toLowerCase().includes(ts))
        );
        if (missing.length > 0) {
            alerts.push({
                id: 'slot-skills',
                type: 'skills',
                severity: 'warning',
                title: 'Skill Mismatch',
                message: `${tech.name || 'Tech'} lacks required skill(s): ${missing.join(', ')}.`,
                actionAdvice: 'Choose a qualified technician.'
            });
        }
    }

    // 4. Working Hours Check
    const { workStart, workEnd, isDayOff } = getTechWorkHours(tech, slot);
    if (isDayOff) {
        alerts.push({
            id: 'slot-dayoff',
            type: 'hours',
            severity: 'warning',
            title: 'Tech Day Off',
            message: `${tech.name || 'Tech'} is not working on ${format(slot, 'EEEE')}.`,
            actionAdvice: 'Select a working day.'
        });
    } else {
        const slotHour = slot.getHours() + slot.getMinutes() / 60;
        const slotEndHour = slotHour + jobDuration / 60;
        if (slotHour < workStart || slotEndHour > workEnd) {
            const startStr = `${workStart % 12 || 12}:00 ${workStart >= 12 ? 'PM' : 'AM'}`;
            const endStr = `${workEnd % 12 || 12}:00 ${workEnd >= 12 ? 'PM' : 'AM'}`;
            alerts.push({
                id: 'slot-hours',
                type: 'hours',
                severity: 'warning',
                title: 'Outside Working Hours',
                message: `${tech.name || 'Tech'} shifts are ${startStr} – ${endStr}.`,
                actionAdvice: `Schedule within shift hours.`
            });
        }
    }

    // 5. Capacity Check
    const maxJobs = tech.schedulingPreferences?.jobPreferences?.maxJobsPerDay || 6;
    const sameDayJobsCount = techJobs.filter(j => {
        if (j.id === job.id) return false;
        const s = parseFirestoreDate(j.scheduled_at);
        return s && isSameDay(s, slot) && ['scheduled', 'in_progress', 'assigned'].includes(j.status);
    }).length;

    if (sameDayJobsCount >= maxJobs) {
        alerts.push({
            id: 'slot-capacity',
            type: 'capacity',
            severity: 'warning',
            title: 'Capacity Exceeded',
            message: `${tech.name || 'Tech'} already has ${sameDayJobsCount} jobs today (limit is ${maxJobs}).`,
            actionAdvice: 'Tech workload is full.'
        });
    }

    const hasCritical = alerts.some(a => a.severity === 'critical');
    const hasWarning = alerts.length > 0;

    let status: 'optimal' | 'warning' | 'conflict' = 'optimal';
    if (hasCritical) status = 'conflict';
    else if (hasWarning) status = 'warning';

    const topAlert = alerts[0];
    const primaryTitle = topAlert ? topAlert.title : 'Ready to Schedule';
    const primaryMessage = topAlert ? topAlert.message : `${tech.name} is available & qualified`;

    return {
        status,
        primaryTitle,
        primaryMessage,
        alerts,
        isConflict: hasCritical || isTravelConflict
    };
}
