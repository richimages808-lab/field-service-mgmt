/**
 * autoSchedule.ts — The ONE auto-scheduler (server-side).
 *
 * Replaces both the browser auto-scheduler (quoteService.autoScheduleApprovedJob)
 * and the naive server version (quoteNotifications.autoScheduleApprovedJobServer).
 *
 * Ranking is ported from frontend/web/src/lib/techMatchingEngine.ts:
 *   skill match 30% · workload 25% · availability 20% · proximity 15% · certifications 10%
 * Improvements over the old versions:
 *   - Timezone aware (job.timezone → org timezone → Pacific/Honolulu)
 *   - Uses the job's real duration and the customer's availability windows
 *   - Never books overlapping jobs for a tech
 */

import * as admin from "firebase-admin";

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const SEARCH_DAYS = 14;

// ─────────────────────────────── timezone helpers ───────────────────────────────

function tzParts(ms: number, tz: string) {
    const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: tz, hourCycle: "h23",
        year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const p: Record<string, number> = {};
    for (const part of fmt.formatToParts(new Date(ms))) {
        if (part.type !== "literal") p[part.type] = parseInt(part.value, 10);
    }
    return { y: p.year, m: p.month - 1, d: p.day, h: p.hour % 24, mi: p.minute, s: p.second };
}

function tzOffsetMs(ms: number, tz: string): number {
    const p = tzParts(ms, tz);
    return Date.UTC(p.y, p.m, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

/** UTC epoch ms for a local wall-clock time in `tz`. */
export function zonedTimeToUtc(y: number, m: number, d: number, minutesOfDay: number, tz: string): number {
    const guess = Date.UTC(y, m, d, 0, 0, 0) + minutesOfDay * 60000;
    let result = guess - tzOffsetMs(guess, tz);
    const check = guess - tzOffsetMs(result, tz);
    if (check !== result) result = check; // DST edge
    return result;
}

export function localDateKey(ms: number, tz: string): string {
    const p = tzParts(ms, tz);
    return `${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

function toMs(v: any): number | null {
    if (!v) return null;
    if (typeof v.toMillis === "function") return v.toMillis();
    if (typeof v.toDate === "function") return v.toDate().getTime();
    const t = new Date(v).getTime();
    return isNaN(t) ? null : t;
}

function hhmmToMinutes(s?: string, fallback?: number): number | undefined {
    if (!s || typeof s !== "string" || !s.includes(":")) return fallback;
    const [h, m] = s.split(":").map(n => parseInt(n, 10));
    return (h || 0) * 60 + (m || 0);
}

// ─────────────────────────────── scoring (ported) ───────────────────────────────

function levenshteinSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (!a.length || !b.length) return 0;
    const mtx: number[][] = [];
    for (let i = 0; i <= a.length; i++) mtx[i] = [i];
    for (let j = 0; j <= b.length; j++) mtx[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            mtx[i][j] = Math.min(mtx[i - 1][j] + 1, mtx[i][j - 1] + 1, mtx[i - 1][j - 1] + cost);
        }
    }
    return 1 - mtx[a.length][b.length] / Math.max(a.length, b.length);
}

function requiredSkills(job: any): string[] {
    const skills: string[] = [];
    const ai = job?.intakeReview?.aiRecommendation?.skillsRequired || job?.aiRecommendation?.skillsRequired;
    if (Array.isArray(ai)) skills.push(...ai);
    if (job?.request?.type) skills.push(String(job.request.type));
    if (job?.category) skills.push(String(job.category));
    return [...new Set(skills.map(s => s.toLowerCase().trim()).filter(Boolean))];
}

function skillScore(tech: any, skills: string[]): number {
    if (skills.length === 0) return 75;
    const techSkills: string[] = (tech.specialties || []).map((s: string) => String(s).toLowerCase().trim());
    const matched = skills.filter(skill =>
        techSkills.some(ts => ts.includes(skill) || skill.includes(ts) || levenshteinSimilarity(ts, skill) > 0.7));
    return (matched.length / skills.length) * 100;
}

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (d: number) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 3959 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function proximityScore(tech: any, job: any): number {
    const address: string = job?.customer?.address || "";
    if (Array.isArray(tech.serviceAreas) && tech.serviceAreas.length > 0) {
        const hit = (p: string) => tech.serviceAreas.some((a: any) => a.priority === p && a.zipCode && address.includes(a.zipCode));
        if (hit("primary")) return 100;
        if (hit("secondary")) return 70;
        if (hit("emergency_only")) return 40;
    }
    if (tech.homeLocation?.lat && tech.homeLocation?.lng && job?.location?.lat) {
        const dist = haversineMiles(tech.homeLocation.lat, tech.homeLocation.lng, job.location.lat, job.location.lng);
        const max = tech.maxTravelDistance || 30;
        if (dist <= max * 0.5) return 100;
        if (dist <= max) return 70;
        if (dist <= max * 1.5) return 40;
        return 10;
    }
    return 50;
}

function certificationScore(tech: any, jobType: string): number {
    if (!jobType || !Array.isArray(tech.certifications) || tech.certifications.length === 0) return 50;
    const jt = jobType.toLowerCase();
    const relevant = tech.certifications.filter((c: any) => {
        const n = String(c.name || "").toLowerCase();
        const iss = String(c.issuer || "").toLowerCase();
        return (n && (n.includes(jt) || jt.includes(n))) || (iss && iss.includes(jt));
    });
    if (relevant.length === 0) return 30;
    const valid = relevant.filter((c: any) => { const e = toMs(c.expiryDate); return !e || e > Date.now(); });
    if (valid.some((c: any) => c.verified)) return 100;
    return valid.length > 0 ? 80 : 40;
}

// ─────────────────────────────── slot finding ───────────────────────────────

interface Window { start: number; end: number } // minutes of day

function customerWindowsForDay(job: any, dateKey: string, weekday: string): Window[] | null {
    const raw = job?.request?.availabilityWindows;
    if (!Array.isArray(raw) || raw.length === 0) return null; // no constraint
    const preferredRanges: Record<string, Window> = {
        morning: { start: 8 * 60, end: 12 * 60 },
        afternoon: { start: 12 * 60, end: 17 * 60 },
        evening: { start: 17 * 60, end: 20 * 60 },
    };
    const out: Window[] = [];
    for (const w of raw) {
        const day = String(w?.day || "").toLowerCase();
        if (day && day !== dateKey && day !== weekday && day !== "any") continue;
        const pref = preferredRanges[String(w?.preferredTime || "").toLowerCase()];
        const start = hhmmToMinutes(w?.startTime, pref?.start ?? 8 * 60)!;
        const end = hhmmToMinutes(w?.endTime, pref?.end ?? 18 * 60)!;
        if (end > start) out.push({ start, end });
    }
    return out; // may be empty → customer not available this day
}

function techWorkingWindow(tech: any, weekday: string): Window | null {
    const day = tech?.weeklyAvailability?.[weekday];
    if (day && day.available === false) return null;
    const start = hhmmToMinutes(day?.startTime) ?? hhmmToMinutes(tech?.preferences?.working_hours?.start) ?? 8 * 60;
    const end = hhmmToMinutes(day?.endTime) ?? hhmmToMinutes(tech?.preferences?.working_hours?.end) ?? 17 * 60;
    return end > start ? { start, end } : null;
}

function onVacation(tech: any, dayStartMs: number): boolean {
    if (!Array.isArray(tech?.vacationDates)) return false;
    return tech.vacationDates.some((v: any) => {
        const s = toMs(v.start); const e = toMs(v.end);
        return s !== null && e !== null && dayStartMs >= s && dayStartMs <= e;
    });
}

export interface AutoAssignment {
    techId: string; techName: string; techEmail: string;
    startMs: number; score: number; reason: string;
}

/** Pure ranking + slot search (exported for tests). */
export function findBestAssignment(
    job: any, techs: any[], orgJobs: any[], tz: string, nowMs: number = Date.now()
): AutoAssignment | null {
    const duration = Math.max(15, Number(job?.estimated_duration) || 60);
    const skills = requiredSkills(job);
    const jobType = job?.request?.type || job?.category || "";
    const nowKey = localDateKey(nowMs, tz);

    for (let offset = 0; offset <= SEARCH_DAYS; offset++) {
        const probe = nowMs + offset * 86400000;
        const p = tzParts(probe, tz);
        const dateKey = localDateKey(probe, tz);
        const weekday = DAY_NAMES[new Date(Date.UTC(p.y, p.m, p.d)).getUTCDay()];
        const dayStartUtc = zonedTimeToUtc(p.y, p.m, p.d, 0, tz);

        const custWindows = customerWindowsForDay(job, dateKey, weekday);
        if (custWindows && custWindows.length === 0) continue;

        const candidates: AutoAssignment[] = [];
        for (const tech of techs) {
            if (tech.status === "inactive") continue;
            if (onVacation(tech, dayStartUtc)) continue;
            const work = techWorkingWindow(tech, weekday);
            if (!work) continue;

            const techDayJobs = orgJobs.filter(j =>
                j.id !== job.id && j.assigned_tech_id === tech.id &&
                !["cancelled", "completed"].includes(j.status) &&
                toMs(j.scheduled_at) !== null && localDateKey(toMs(j.scheduled_at)!, tz) === dateKey);

            const maxJobs = tech.schedulingPreferences?.jobPreferences?.maxJobsPerDay || 6;
            if (techDayJobs.length >= maxJobs) continue;

            const busy = techDayJobs.map(j => {
                const s = toMs(j.scheduled_at)!;
                return { s, e: s + (Number(j.estimated_duration) || 60) * 60000 };
            }).sort((a, b) => a.s - b.s);

            const windows = (custWindows || [{ start: work.start, end: work.end }])
                .map(w => ({ start: Math.max(w.start, work.start), end: Math.min(w.end, work.end) }))
                .filter(w => w.end - w.start >= duration);

            let slotStart: number | null = null;
            for (const w of windows) {
                let cursor = zonedTimeToUtc(p.y, p.m, p.d, w.start, tz);
                const windowEnd = zonedTimeToUtc(p.y, p.m, p.d, w.end, tz);
                if (dateKey === nowKey) {
                    // Same day: not before now + 2h, rounded up to the next 30 min
                    const earliest = Math.ceil((nowMs + 2 * 3600000) / 1800000) * 1800000;
                    cursor = Math.max(cursor, earliest);
                }
                for (const b of busy) {
                    if (b.e <= cursor) continue;
                    if (b.s - cursor >= duration * 60000) break;
                    cursor = Math.max(cursor, b.e);
                }
                if (cursor + duration * 60000 <= windowEnd) { slotStart = cursor; break; }
            }
            if (slotStart === null) continue;

            const workload = Math.round(((maxJobs - techDayJobs.length) / maxJobs) * 100);
            const score = Math.round(
                skillScore(tech, skills) * 0.30 + workload * 0.25 + 100 * 0.20 +
                proximityScore(tech, job) * 0.15 + certificationScore(tech, jobType) * 0.10);
            if (score < 20) continue;

            candidates.push({
                techId: tech.id,
                techName: tech.name || tech.displayName || tech.email || "Technician",
                techEmail: tech.email || "",
                startMs: slotStart,
                score,
                reason: `Best match (score ${score}) — skills, workload, location and availability`,
            });
        }

        if (candidates.length > 0) {
            candidates.sort((a, b) => b.score - a.score || a.startMs - b.startMs);
            return candidates[0];
        }
    }
    return null;
}

/** Loads data, picks the best tech/slot and writes it to the job. */
export async function runAutoSchedule(jobId: string): Promise<{ scheduled: boolean; reason: string }> {
    const db = admin.firestore();
    const jobRef = db.collection("jobs").doc(jobId);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists) return { scheduled: false, reason: "Job not found" };
    const job: any = { id: jobSnap.id, ...jobSnap.data() };
    if (job.assigned_tech_id && job.scheduled_at) return { scheduled: false, reason: "Already scheduled" };

    const orgId = job.org_id;
    const [orgSnap, techSnap, jobsSnap] = await Promise.all([
        db.collection("organizations").doc(orgId).get(),
        db.collection("users").where("org_id", "==", orgId).where("role", "==", "technician").get(),
        db.collection("jobs").where("org_id", "==", orgId)
            .where("status", "in", ["scheduled", "dispatched", "en_route", "in_progress"]).get(),
    ]);
    const org = orgSnap.data() || {};
    const tz = job.timezone || org.timezone || org.settings?.timezone || "Pacific/Honolulu";
    const techs = techSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (techs.filter((t: any) => t.status !== "inactive").length === 0) {
        const reason = "No active technicians in your organization";
        await jobRef.update({ autoScheduleFailed: true, autoScheduleReason: reason, autoScheduledAt: admin.firestore.FieldValue.serverTimestamp(), autoScheduledBy: "workflow_auto_schedule" });
        return { scheduled: false, reason };
    }

    const pick = findBestAssignment(job, techs, jobsSnap.docs.map(d => ({ id: d.id, ...d.data() })), tz);
    if (!pick) {
        const reason = `No technician has an open slot matching the job and customer availability in the next ${SEARCH_DAYS} days. Please schedule manually.`;
        await jobRef.update({ autoScheduleFailed: true, autoScheduleReason: reason, autoScheduledAt: admin.firestore.FieldValue.serverTimestamp(), autoScheduledBy: "workflow_auto_schedule" });
        return { scheduled: false, reason };
    }

    await jobRef.update({
        assigned_tech_id: pick.techId,
        assigned_tech_name: pick.techName,
        assigned_tech_email: pick.techEmail,
        scheduled_at: admin.firestore.Timestamp.fromMillis(pick.startMs),
        status: "scheduled",
        timezone: tz,
        autoScheduleFailed: false,
        autoScheduleReason: `Auto-assigned to ${pick.techName}. ${pick.reason}`,
        autoScheduledAt: admin.firestore.FieldValue.serverTimestamp(),
        autoScheduledBy: "workflow_auto_schedule",
        // Proposal only — a dispatcher or tech confirms before the customer is told
        schedule_confirmation: { status: "pending", proposedBy: "auto_schedule" },
    });
    return { scheduled: true, reason: pick.reason };
}
