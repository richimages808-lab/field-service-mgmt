/**
 * appLinks.ts — Customer-facing links (base URL + "manage my appointment" link).
 */

import * as admin from "firebase-admin";
import { createAccessToken } from "./accessTokens";

const PROD_BASE_URL = "https://dispatch-box.com";

/** Sandbox project → sandbox site; otherwise production (or APP_BASE_URL env). */
export function getCustomerBaseUrl(): string {
    const projectId = process.env.GCLOUD_PROJECT ||
        (process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG).projectId : "");
    if (projectId === "dispatch-box-sb" || (projectId && projectId.includes("-sb"))) {
        return "https://dispatch-box-sb.web.app";
    }
    return process.env.APP_BASE_URL || PROD_BASE_URL;
}

/**
 * Link the customer uses to see their confirmed appointment and request a
 * different date. Reuses the job's existing schedule token while it's active.
 */
export async function getJobManageLink(orgId: string, jobId: string): Promise<string | null> {
    try {
        const db = admin.firestore();
        const jobRef = db.collection("jobs").doc(jobId);
        const job = (await jobRef.get()).data() || {};

        let token: string | null = job.schedule_manage_token || null;
        if (token) {
            const t = (await db.collection("access_tokens").doc(token).get()).data();
            const expired = t?.expiresAt && t.expiresAt.toDate() < new Date();
            if (!t || t.status !== "active" || expired || !(t.permissions || []).includes("reschedule")) token = null;
        }
        if (!token) {
            token = await createAccessToken({
                resourceType: "job",
                resourceId: jobId,
                orgId,
                customerPhone: job.customer?.phone || undefined,
                customerEmail: job.customer?.email || undefined,
                customerName: job.customer?.name || undefined,
                permissions: ["view", "reschedule"],
                createdBy: "system",
                expiresInDays: 90,
                skipBackLink: true,
            });
            await jobRef.update({ schedule_manage_token: token });
        }
        return `${getCustomerBaseUrl()}/t/${token}`;
    } catch (err) {
        console.warn(`[appLinks] Could not create manage link for job ${jobId}:`, err);
        return null;
    }
}
