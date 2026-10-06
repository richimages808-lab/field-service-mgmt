import { Job } from '../types';
import { User } from '../auth/AuthProvider';

/**
 * Checks if the current user has permission to open and edit a job.
 * - Admins and Dispatchers always have full permission to edit jobs.
 * - Technicians can edit jobs if:
 *   1) Their permissions allow it (permissions?.canEditJobs !== false), and
 *   2) The job is either assigned to them, unassigned, or belongs to their organization.
 */
export function canUserEditJob(
    user: User | null | { role?: string; uid?: string; email?: string; permissions?: any; site_admin?: boolean },
    job?: Job | null
): boolean {
    if (!user) return false;

    const role = user.role || 'technician';

    // Admins and Dispatchers always have edit permission
    if (role === 'admin' || role === 'dispatcher' || user.site_admin) {
        return true;
    }

    // Technicians
    if (role === 'technician') {
        // Check explicit permission toggle (defaults to true if not explicitly restricted)
        const canEdit = user.permissions?.canEditJobs ?? true;
        if (!canEdit) return false;

        // If job is provided, verify it belongs to this tech or is open
        if (job) {
            const isAssignedToUser = (user.uid && job.assigned_tech_id === user.uid) ||
                                     (user.email && job.assigned_tech_email === user.email);
            // Technicians can edit their own assigned jobs, or open unassigned jobs in their org
            return Boolean(isAssignedToUser || !job.assigned_tech_id);
        }

        return true;
    }

    return false;
}
