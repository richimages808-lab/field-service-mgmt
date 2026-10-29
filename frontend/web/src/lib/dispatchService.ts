/**
 * dispatchService.ts — The "Dispatched" step.
 *
 * Scheduled  = on the calendar.
 * Dispatched = the office has released the job to the tech for today
 *              (tech can see it and, if required, taps Accept).
 * Solo businesses skip this step entirely.
 *
 * If the business uses Job Prep, a job whose prep package exists but isn't
 * packed yet can't be dispatched unless the dispatcher overrides.
 */
import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import type { Job } from '../types';

/** Statuses that mean "this job is on the calendar / in the field today". */
export const ON_CALENDAR_STATUSES = ['scheduled', 'dispatched', 'en_route', 'in_progress'] as const;
export const isOnCalendar = (status?: string) => !!status && (ON_CALENDAR_STATUSES as readonly string[]).includes(status);

const PREP_DONE = ['ready', 'loaded', 'dispatched'];

/** Returns job ids whose prep package exists but isn't packed yet. */
export async function findPrepNotDone(orgId: string, jobIds: string[]): Promise<Set<string>> {
    const notDone = new Set<string>();
    // Firestore 'in' supports up to 30 values per query
    for (let i = 0; i < jobIds.length; i += 30) {
        const chunk = jobIds.slice(i, i + 30);
        if (chunk.length === 0) continue;
        const snap = await getDocs(query(
            collection(db, 'jobPrepPackages'),
            where('org_id', '==', orgId),
            where('job_id', 'in', chunk)
        ));
        snap.forEach(d => {
            const p = d.data() as any;
            const hasItems = (p.materials?.length || 0) + (p.tools?.length || 0) > 0;
            if (hasItems && !PREP_DONE.includes(p.status)) notDone.add(p.job_id);
        });
    }
    return notDone;
}

export async function dispatchJobs(jobs: Pick<Job, 'id'>[], dispatcherUid: string, opts: { prepOverride?: boolean } = {}): Promise<number> {
    if (jobs.length === 0) return 0;
    const batch = writeBatch(db);
    for (const j of jobs) {
        batch.update(doc(db, 'jobs', j.id), {
            status: 'dispatched',
            dispatched_at: serverTimestamp(),
            dispatched_by: dispatcherUid,
            dispatch_acknowledged_at: null,
            ...(opts.prepOverride ? { prep_override: true } : {}),
        });
    }
    await batch.commit();
    return jobs.length;
}

/** Undo a dispatch (back to scheduled). */
export async function undispatchJob(jobId: string): Promise<void> {
    await updateDoc(doc(db, 'jobs', jobId), {
        status: 'scheduled',
        dispatched_at: null,
        dispatched_by: null,
        dispatch_acknowledged_at: null,
    });
}

/** Tech taps "Accept". */
export async function acknowledgeDispatch(jobId: string): Promise<void> {
    await updateDoc(doc(db, 'jobs', jobId), {
        dispatch_acknowledged_at: serverTimestamp(),
        'tech_alert_status.acknowledged': true,
        'tech_alert_status.acknowledged_at': serverTimestamp(),
    });
}
