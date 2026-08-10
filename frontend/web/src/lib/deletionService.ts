import { db } from '../firebase';
import { collection, addDoc, doc, deleteDoc, serverTimestamp, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { User, Organization } from '../auth/AuthProvider';

export interface DeletionAuditLog {
  id?: string;
  org_id: string;
  targetType: 'job' | 'quote';
  targetId: string;
  targetNumber?: string;
  deletedByUid: string;
  deletedByName: string;
  deletedByRole: string;
  reasonCategory: string;
  reasonDetails?: string;
  deletedAt: any;
  targetSnapshot: any;
}

export const STANDARD_JOB_DELETE_REASONS = [
  'Duplicate Job Entry',
  'Customer Cancelled / Invalid Request',
  'Pricing / Scope Disagreement',
  'Created by Mistake / Test Data',
  'Scheduling Conflict / Unavailable',
  'Other (Custom Reason)'
];

export const STANDARD_QUOTE_DELETE_REASONS = [
  'Duplicate Quote',
  'Customer Rejected / Declined',
  'Quote Superseded by New Draft',
  'Created by Mistake / Test Data',
  'Incorrect Scope or Pricing',
  'Other (Custom Reason)'
];

/**
 * Evaluates whether the current user has permission to delete jobs or quotes.
 */
export function canUserDelete(user: User | null, organization: Organization | null, itemType: 'job' | 'quote'): boolean {
  if (!user) return false;

  // Site admins and owners can always delete
  if (user.site_admin || user.role === 'owner' || user.role === 'admin') {
    return true;
  }

  const userRole = (user.role || 'technician').toLowerCase();
  const settings = organization?.settings || {};

  if (itemType === 'job') {
    const allowedRoles: string[] = settings.deleteJobRoles || ['admin', 'owner'];
    return allowedRoles.includes(userRole);
  }

  if (itemType === 'quote') {
    const allowedRoles: string[] = settings.deleteQuoteRoles || ['admin', 'owner'];
    return allowedRoles.includes(userRole);
  }

  return false;
}

/**
 * Delete a Job record, saving an audit log entry in Firestore.
 */
export async function deleteJobWithAudit(
  jobId: string,
  jobSnapshot: any,
  user: User,
  reasonCategory: string,
  reasonDetails: string
): Promise<void> {
  const orgId = user.org_id || jobSnapshot.org_id || '';
  const jobNumber = jobSnapshot.job_number || jobSnapshot.id || jobId;

  // 1. Create audit log record
  const auditLog: DeletionAuditLog = {
    org_id: orgId,
    targetType: 'job',
    targetId: jobId,
    targetNumber: String(jobNumber),
    deletedByUid: user.uid,
    deletedByName: user.displayName || user.email || 'Unknown User',
    deletedByRole: user.role || 'user',
    reasonCategory,
    reasonDetails: reasonDetails || undefined,
    deletedAt: serverTimestamp(),
    targetSnapshot: jobSnapshot || {},
  };

  await addDoc(collection(db, 'deletion_audit_logs'), auditLog);

  // 2. Delete job document from Firestore
  await deleteDoc(doc(db, 'jobs', jobId));
}

/**
 * Delete a Quote record, saving an audit log entry in Firestore.
 */
export async function deleteQuoteWithAudit(
  quoteId: string,
  quoteSnapshot: any,
  user: User,
  reasonCategory: string,
  reasonDetails: string
): Promise<void> {
  const orgId = user.org_id || quoteSnapshot.org_id || '';
  const quoteNumber = quoteSnapshot.quoteNumber || quoteSnapshot.id || quoteId;

  // 1. Create audit log record
  const auditLog: DeletionAuditLog = {
    org_id: orgId,
    targetType: 'quote',
    targetId: quoteId,
    targetNumber: String(quoteNumber),
    deletedByUid: user.uid,
    deletedByName: user.displayName || user.email || 'Unknown User',
    deletedByRole: user.role || 'user',
    reasonCategory,
    reasonDetails: reasonDetails || undefined,
    deletedAt: serverTimestamp(),
    targetSnapshot: quoteSnapshot || {},
  };

  await addDoc(collection(db, 'deletion_audit_logs'), auditLog);

  // 2. Delete quote document from Firestore
  await deleteDoc(doc(db, 'quotes', quoteId));
}

/**
 * Fetch recent deletion audit logs for an organization.
 */
export async function getDeletionAuditLogs(orgId: string, maxResults = 50): Promise<DeletionAuditLog[]> {
  if (!orgId) return [];
  const q = query(
    collection(db, 'deletion_audit_logs'),
    where('org_id', '==', orgId),
    orderBy('deletedAt', 'desc'),
    limit(maxResults)
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as DeletionAuditLog));
}
