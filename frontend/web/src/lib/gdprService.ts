/**
 * GDPRService - Handle GDPR compliance operations
 * - Data Export (Right to Access / Portability)
 * - Data Deletion (Right to Erasure)
 * - Consent Management
 */

import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    updateDoc,
    query,
    where,
    Timestamp,
    writeBatch
} from 'firebase/firestore';
import { db } from '../firebase';
import {
    Customer,
    Job,
    Invoice,
    Communication,
    Attachment,
    ConsentRecord,
    AuditLog,
    DataExportRequest
} from '../types';

// =============================================================================
// DATA EXPORT (Right to Access / Portability)
// =============================================================================

export interface CustomerDataExport {
    exportedAt: Date;
    customer: Customer;
    addresses: Customer['addresses'];
    jobs: Job[];
    invoices: Invoice[];
    communications: Communication[];
    attachments: { name: string; url: string; size: number }[];
    consents: ConsentRecord[];
}

/**
 * Request a data export for a customer
 */
export async function requestDataExport(
    customerId: string,
    orgId: string,
    requestedBy: string,
    method: DataExportRequest['requestMethod'] = 'portal'
): Promise<DataExportRequest> {
    const request: Omit<DataExportRequest, 'id'> = {
        org_id: orgId,
        customer_id: customerId,
        requestedAt: Timestamp.now(),
        requestedBy,
        requestMethod: method,
        status: 'pending',
        format: 'both',
        includedData: {
            profile: true,
            addresses: true,
            jobs: true,
            invoices: true,
            communications: true,
            attachments: true,
            consents: true
        }
    };

    const docRef = await addDoc(collection(db, 'data_export_requests'), request);

    console.log(`📦 GDPR: Data export requested for customer ${customerId}`);

    return { id: docRef.id, ...request };
}

/**
 * Generate data export for a customer
 * Note: In production, this would be a Cloud Function
 */
export async function generateDataExport(customerId: string): Promise<CustomerDataExport> {
    // Get customer profile
    const customerDoc = await getDoc(doc(db, 'customers', customerId));
    if (!customerDoc.exists()) {
        throw new Error('Customer not found');
    }
    const customer = { id: customerDoc.id, ...customerDoc.data() } as Customer;

    // Get all jobs
    const jobsQuery = query(collection(db, 'jobs'), where('customer_id', '==', customerId));
    const jobsSnapshot = await getDocs(jobsQuery);
    const jobs = jobsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Job));

    // Get all invoices
    const invoicesQuery = query(collection(db, 'invoices'), where('customer_id', '==', customerId));
    const invoicesSnapshot = await getDocs(invoicesQuery);
    const invoices = invoicesSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Invoice));

    // Get all communications
    const commsQuery = query(collection(db, 'communications'), where('customer_id', '==', customerId));
    const commsSnapshot = await getDocs(commsQuery);
    const communications = commsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Communication));

    // Get all attachments
    const attachQuery = query(collection(db, 'attachments'), where('customer_id', '==', customerId));
    const attachSnapshot = await getDocs(attachQuery);
    const attachments = attachSnapshot.docs.map(d => {
        const data = d.data() as Attachment;
        return { name: data.name, url: data.downloadUrl || '', size: data.size };
    });

    // Get consent records
    const consentQuery = query(collection(db, 'consent_records'), where('customer_id', '==', customerId));
    const consentSnapshot = await getDocs(consentQuery);
    const consents = consentSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as ConsentRecord));

    console.log(`📦 GDPR: Generated export for customer ${customerId}:`, {
        jobs: jobs.length,
        invoices: invoices.length,
        communications: communications.length,
        attachments: attachments.length
    });

    return {
        exportedAt: new Date(),
        customer,
        addresses: customer.addresses,
        jobs,
        invoices,
        communications,
        attachments,
        consents
    };
}

/**
 * Convert data export to downloadable JSON
 */
export function exportToJSON(data: CustomerDataExport): string {
    // Remove sensitive internal fields
    const sanitized = {
        ...data,
        customer: {
            ...data.customer,
            // Remove internal fields
            portalAccess: undefined,
            internalNotes: undefined
        }
    };

    return JSON.stringify(sanitized, null, 2);
}

// =============================================================================
// DATA DELETION (Right to Erasure)
// =============================================================================

export interface DeletionRequest {
    customerId: string;
    requestedAt: Date;
    scheduledDeletionDate: Date;
    gracePeriodDays: number;
    affectedRecords: {
        jobs: number;
        invoices: number;
        communications: number;
        attachments: number;
    };
}

/**
 * Request customer data deletion (starts 30-day grace period)
 */
export async function requestDeletion(
    customerId: string,
    requestedBy: string,
    reason?: string
): Promise<DeletionRequest> {
    const customerDoc = await getDoc(doc(db, 'customers', customerId));
    if (!customerDoc.exists()) {
        throw new Error('Customer not found');
    }

    // Count affected records
    const [jobsSnap, invoicesSnap, commsSnap, attachSnap] = await Promise.all([
        getDocs(query(collection(db, 'jobs'), where('customer_id', '==', customerId))),
        getDocs(query(collection(db, 'invoices'), where('customer_id', '==', customerId))),
        getDocs(query(collection(db, 'communications'), where('customer_id', '==', customerId))),
        getDocs(query(collection(db, 'attachments'), where('customer_id', '==', customerId)))
    ]);

    const now = new Date();
    const scheduledDeletionDate = new Date(now);
    scheduledDeletionDate.setDate(scheduledDeletionDate.getDate() + 30);

    // Update customer status
    await updateDoc(doc(db, 'customers', customerId), {
        status: 'pending_deletion',
        deletionRequest: {
            requestedAt: Timestamp.now(),
            requestedBy,
            scheduledDeletionDate: Timestamp.fromDate(scheduledDeletionDate),
            reason
        },
        updatedAt: Timestamp.now()
    });

    // Log the action
    await logAuditEvent({
        org_id: customerDoc.data().org_id,
        userId: requestedBy,
        userEmail: requestedBy === 'customer' ? 'customer@self' : requestedBy,
        userRole: requestedBy === 'customer' ? 'customer' : 'staff',
        userType: requestedBy === 'customer' ? 'customer' : 'staff',
        action: 'deletion_requested',
        resource: 'customers',
        resourceId: customerId,
        resourceName: customerDoc.data().name,
        isGDPRRelated: true,
        gdprRightExercised: 'erasure'
    });

    console.log(`🗑️ GDPR: Deletion requested for customer ${customerId}, scheduled for ${scheduledDeletionDate.toISOString()}`);

    return {
        customerId,
        requestedAt: now,
        scheduledDeletionDate,
        gracePeriodDays: 30,
        affectedRecords: {
            jobs: jobsSnap.size,
            invoices: invoicesSnap.size,
            communications: commsSnap.size,
            attachments: attachSnap.size
        }
    };
}

/**
 * Cancel a pending deletion request
 */
export async function cancelDeletion(
    customerId: string,
    cancelledBy: string
): Promise<void> {
    const customerDoc = await getDoc(doc(db, 'customers', customerId));
    if (!customerDoc.exists()) {
        throw new Error('Customer not found');
    }

    await updateDoc(doc(db, 'customers', customerId), {
        status: 'active',
        deletionRequest: null,
        updatedAt: Timestamp.now()
    });

    await logAuditEvent({
        org_id: customerDoc.data().org_id,
        userId: cancelledBy,
        userEmail: cancelledBy,
        userRole: 'staff',
        userType: 'staff',
        action: 'deletion_cancelled',
        resource: 'customers',
        resourceId: customerId,
        resourceName: customerDoc.data().name,
        isGDPRRelated: true
    });

    console.log(`✅ GDPR: Deletion cancelled for customer ${customerId}`);
}

/**
 * Execute full data deletion (called by Cloud Function after grace period)
 */
export async function executeFullDeletion(
    customerId: string,
    orgId: string
): Promise<{ deletedCounts: { [key: string]: number } }> {
    const batch = writeBatch(db);
    const deletedCounts: { [key: string]: number } = {
        jobs: 0,
        invoices: 0,
        communications: 0,
        attachments: 0,
        consent_records: 0
    };

    // Delete all related documents
    const collections = ['jobs', 'invoices', 'communications', 'attachments', 'consent_records'];

    for (const collName of collections) {
        const q = query(collection(db, collName), where('customer_id', '==', customerId));
        const snapshot = await getDocs(q);

        snapshot.docs.forEach(docSnap => {
            batch.delete(docSnap.ref);
            deletedCounts[collName]++;
        });
    }

    // Delete the customer document
    batch.delete(doc(db, 'customers', customerId));

    // Commit all deletions
    await batch.commit();

    // Log the deletion (this log is retained for audit purposes)
    await logAuditEvent({
        org_id: orgId,
        userId: 'system',
        userEmail: 'system@gdpr',
        userRole: 'system',
        userType: 'system',
        action: 'deletion_executed',
        resource: 'customers',
        resourceId: customerId,
        description: `Permanently deleted customer and ${JSON.stringify(deletedCounts)} related records`,
        isGDPRRelated: true,
        gdprRightExercised: 'erasure'
    });

    console.log(`🗑️ GDPR: Full deletion executed for customer ${customerId}:`, deletedCounts);

    return { deletedCounts };
}

// =============================================================================
// CONSENT MANAGEMENT
// =============================================================================

/**
 * Record consent given by customer
 */
export async function recordConsent(params: {
    org_id: string;
    customer_id: string;
    type: ConsentRecord['type'];
    version: string;
    documentUrl: string;
    method: ConsentRecord['method'];
    ipAddress?: string;
    userAgent?: string;
}): Promise<ConsentRecord> {
    const record: Omit<ConsentRecord, 'id'> = {
        org_id: params.org_id,
        customer_id: params.customer_id,
        type: params.type,
        version: params.version,
        given: true,
        givenAt: Timestamp.now(),
        method: params.method,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        documentUrl: params.documentUrl
    };

    const docRef = await addDoc(collection(db, 'consent_records'), record);

    console.log(`✅ GDPR: Consent recorded - ${params.type} v${params.version} for customer ${params.customer_id}`);

    return { id: docRef.id, ...record };
}

/**
 * Withdraw consent
 */
export async function withdrawConsent(
    consentId: string,
    withdrawnBy: string
): Promise<void> {
    await updateDoc(doc(db, 'consent_records', consentId), {
        given: false,
        withdrawnAt: Timestamp.now()
    });

    const consentDoc = await getDoc(doc(db, 'consent_records', consentId));
    if (consentDoc.exists()) {
        await logAuditEvent({
            org_id: consentDoc.data().org_id,
            userId: withdrawnBy,
            userEmail: withdrawnBy,
            userRole: 'customer',
            userType: 'customer',
            action: 'consent_withdrawn',
            resource: 'consent_records',
            resourceId: consentId,
            isGDPRRelated: true,
            gdprRightExercised: 'objection'
        });
    }

    console.log(`❌ GDPR: Consent withdrawn - ${consentId}`);
}

/**
 * Get all consents for a customer
 */
export async function getCustomerConsents(customerId: string): Promise<ConsentRecord[]> {
    const q = query(collection(db, 'consent_records'), where('customer_id', '==', customerId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ConsentRecord));
}

/**
 * Check if customer has given a specific consent
 */
export async function hasConsent(
    customerId: string,
    type: ConsentRecord['type'],
    minVersion?: string
): Promise<boolean> {
    const consents = await getCustomerConsents(customerId);

    return consents.some(c =>
        c.type === type &&
        c.given &&
        !c.withdrawnAt &&
        (!minVersion || c.version >= minVersion)
    );
}

// =============================================================================
// AUDIT LOGGING
// =============================================================================

interface LogAuditParams {
    org_id: string;
    userId: string;
    userEmail: string;
    userRole: string;
    userType: AuditLog['userType'];
    action: AuditLog['action'];
    resource: string;
    resourceId: string;
    resourceName?: string;
    description?: string;
    changes?: AuditLog['changes'];
    isGDPRRelated: boolean;
    gdprRightExercised?: AuditLog['gdprRightExercised'];
    ipAddress?: string;
    userAgent?: string;
}

/**
 * Log an audit event
 */
export async function logAuditEvent(params: LogAuditParams): Promise<void> {
    const log: Omit<AuditLog, 'id'> = {
        org_id: params.org_id,
        userId: params.userId,
        userEmail: params.userEmail,
        userRole: params.userRole,
        userType: params.userType,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId,
        resourceName: params.resourceName,
        description: params.description,
        changes: params.changes,
        timestamp: Timestamp.now(),
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        isGDPRRelated: params.isGDPRRelated,
        gdprRightExercised: params.gdprRightExercised
    };

    await addDoc(collection(db, 'audit_logs'), log);
}

/**
 * Get audit logs for a resource
 */
export async function getAuditLogs(
    orgId: string,
    resourceType?: string,
    resourceId?: string
): Promise<AuditLog[]> {
    let q = query(
        collection(db, 'audit_logs'),
        where('org_id', '==', orgId)
    );

    if (resourceType) {
        q = query(q, where('resource', '==', resourceType));
    }

    if (resourceId) {
        q = query(q, where('resourceId', '==', resourceId));
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog));
}
