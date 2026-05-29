/**
 * CommunicationsService - Log and manage all customer communications
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
    orderBy,
    limit,
    startAfter,
    Timestamp,
    serverTimestamp,
    QueryDocumentSnapshot
} from 'firebase/firestore';
import { db } from '../firebase';
import {
    Communication,
    CommunicationType,
    CommunicationDirection,
    CommunicationStatus
} from '../types';

const COMMUNICATIONS_COLLECTION = 'communications';

// =============================================================================
// CREATE
// =============================================================================

export interface CreateCommunicationInput {
    org_id: string;
    customer_id: string;
    job_id?: string;
    invoice_id?: string;
    quote_id?: string;

    type: CommunicationType;
    direction: CommunicationDirection;

    subject?: string;
    content: string;
    contentHtml?: string;

    from: string;
    to: string | string[];

    isAutomated?: boolean;
    templateId?: string;
    triggerEvent?: Communication['triggerEvent'];

    createdBy?: string;
}

/**
 * Create a new communication record
 */
export async function createCommunication(
    input: CreateCommunicationInput
): Promise<Communication> {
    const now = Timestamp.now();

    const communication: Omit<Communication, 'id'> = {
        org_id: input.org_id,
        customer_id: input.customer_id,
        ...(input.job_id != null && { job_id: input.job_id }),
        ...(input.invoice_id != null && { invoice_id: input.invoice_id }),
        ...(input.quote_id != null && { quote_id: input.quote_id }),

        type: input.type,
        direction: input.direction,
        status: input.direction === 'outbound' ? 'pending' : 'delivered',

        ...(input.subject != null && { subject: input.subject }),
        content: input.content,
        ...(input.contentHtml != null && { contentHtml: input.contentHtml }),

        from: input.from,
        to: input.to,

        isAutomated: input.isAutomated || false,
        ...(input.templateId != null && { templateId: input.templateId }),
        ...(input.triggerEvent != null && { triggerEvent: input.triggerEvent }),

        isArchived: false,
        containsPII: true, // Default to true for safety

        createdAt: now,
        ...(input.createdBy != null && { createdBy: input.createdBy })
    };

    const docRef = await addDoc(collection(db, COMMUNICATIONS_COLLECTION), communication);

    return { id: docRef.id, ...communication };
}

/**
 * Log an outbound email
 */
export async function logOutboundEmail(params: {
    org_id: string;
    customer_id: string;
    job_id?: string;
    invoice_id?: string;
    subject: string;
    content: string;
    contentHtml?: string;
    to: string;
    from: string;
    isAutomated?: boolean;
    triggerEvent?: Communication['triggerEvent'];
    sentBy?: string;
}): Promise<Communication> {
    return createCommunication({
        ...params,
        type: 'email',
        direction: 'outbound',
        createdBy: params.sentBy
    });
}

/**
 * Log an outbound SMS
 */
export async function logOutboundSMS(params: {
    org_id: string;
    customer_id: string;
    job_id?: string;
    content: string;
    to: string;
    from: string;
    isAutomated?: boolean;
    triggerEvent?: Communication['triggerEvent'];
    sentBy?: string;
}): Promise<Communication> {
    return createCommunication({
        ...params,
        type: 'sms',
        direction: 'outbound',
        createdBy: params.sentBy
    });
}

/**
 * Log an inbound communication (email, SMS, voicemail)
 */
export async function logInboundCommunication(params: {
    org_id: string;
    customer_id: string;
    job_id?: string;
    type: CommunicationType;
    subject?: string;
    content: string;
    from: string;
    to: string;
}): Promise<Communication> {
    return createCommunication({
        ...params,
        direction: 'inbound'
    });
}

/**
 * Log an internal note
 */
export async function logInternalNote(params: {
    org_id: string;
    customer_id: string;
    job_id?: string;
    content: string;
    createdBy: string;
}): Promise<Communication> {
    return createCommunication({
        ...params,
        type: 'note',
        direction: 'internal',
        from: params.createdBy,
        to: 'internal'
    });
}

// =============================================================================
// READ
// =============================================================================

/**
 * Get a single communication by ID
 */
export async function getCommunication(id: string): Promise<Communication | null> {
    const docRef = doc(db, COMMUNICATIONS_COLLECTION, id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) return null;

    return { id: docSnap.id, ...docSnap.data() } as Communication;
}

/**
 * Get communications for a customer with pagination
 */
export async function getCustomerCommunications(
    customerId: string,
    options?: {
        limit?: number;
        type?: CommunicationType;
        direction?: CommunicationDirection;
        includeArchived?: boolean;
        afterDoc?: QueryDocumentSnapshot;
    }
): Promise<{ communications: Communication[]; lastDoc?: QueryDocumentSnapshot }> {
    let q = query(
        collection(db, COMMUNICATIONS_COLLECTION),
        where('customer_id', '==', customerId),
        orderBy('createdAt', 'desc')
    );

    if (options?.type) {
        q = query(q, where('type', '==', options.type));
    }

    if (options?.direction) {
        q = query(q, where('direction', '==', options.direction));
    }

    if (!options?.includeArchived) {
        q = query(q, where('isArchived', '==', false));
    }

    if (options?.afterDoc) {
        q = query(q, startAfter(options.afterDoc));
    }

    q = query(q, limit(options?.limit || 50));

    const snapshot = await getDocs(q);
    const communications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Communication));
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];

    return { communications, lastDoc };
}

/**
 * Get communications for a specific job
 */
export async function getJobCommunications(jobId: string): Promise<Communication[]> {
    const q = query(
        collection(db, COMMUNICATIONS_COLLECTION),
        where('job_id', '==', jobId),
        orderBy('createdAt', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Communication));
}

/**
 * Get recent communications for an organization
 */
export async function getRecentOrgCommunications(
    orgId: string,
    options?: {
        limit?: number;
        direction?: CommunicationDirection;
        unreadOnly?: boolean;
    }
): Promise<Communication[]> {
    let q = query(
        collection(db, COMMUNICATIONS_COLLECTION),
        where('org_id', '==', orgId),
        where('isArchived', '==', false),
        orderBy('createdAt', 'desc')
    );

    if (options?.direction) {
        q = query(q, where('direction', '==', options.direction));
    }

    // Note: unreadOnly would need a composite index

    q = query(q, limit(options?.limit || 20));

    const snapshot = await getDocs(q);
    let communications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Communication));

    // Client-side filter for unread
    if (options?.unreadOnly) {
        communications = communications.filter(c =>
            c.direction === 'inbound' && !c.readAt
        );
    }

    return communications;
}

/**
 * Get communication thread
 */
export async function getCommunicationThread(threadId: string): Promise<Communication[]> {
    const q = query(
        collection(db, COMMUNICATIONS_COLLECTION),
        where('thread_id', '==', threadId),
        orderBy('createdAt', 'asc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Communication));
}

// =============================================================================
// UPDATE
// =============================================================================

/**
 * Update communication status
 */
export async function updateCommunicationStatus(
    id: string,
    status: CommunicationStatus,
    metadata?: { deliveredAt?: Timestamp; readAt?: Timestamp; failureReason?: string }
): Promise<void> {
    const docRef = doc(db, COMMUNICATIONS_COLLECTION, id);

    await updateDoc(docRef, {
        status,
        ...metadata
    });
}

/**
 * Mark communication as sent
 */
export async function markAsSent(id: string): Promise<void> {
    await updateCommunicationStatus(id, 'sent', { deliveredAt: Timestamp.now() });
}

/**
 * Mark communication as delivered
 */
export async function markAsDelivered(id: string): Promise<void> {
    await updateCommunicationStatus(id, 'delivered', { deliveredAt: Timestamp.now() });
}

/**
 * Mark communication as read
 */
export async function markAsRead(id: string): Promise<void> {
    const comm = await getCommunication(id);
    if (!comm) return;

    await updateDoc(doc(db, COMMUNICATIONS_COLLECTION, id), {
        status: 'read',
        readAt: Timestamp.now(),
        openCount: (comm.openCount || 0) + 1
    });
}

/**
 * Mark communication as failed
 */
export async function markAsFailed(id: string, reason: string): Promise<void> {
    await updateCommunicationStatus(id, 'failed', { failureReason: reason });
}

/**
 * Increment click count (for email tracking)
 */
export async function incrementClickCount(id: string): Promise<void> {
    const comm = await getCommunication(id);
    if (!comm) return;

    await updateDoc(doc(db, COMMUNICATIONS_COLLECTION, id), {
        clickCount: (comm.clickCount || 0) + 1
    });
}

/**
 * Add communication to thread
 */
export async function addToThread(id: string, threadId: string): Promise<void> {
    await updateDoc(doc(db, COMMUNICATIONS_COLLECTION, id), { thread_id: threadId });
}

/**
 * Archive old communications
 */
export async function archiveCommunication(
    id: string,
    archivePath: string
): Promise<void> {
    await updateDoc(doc(db, COMMUNICATIONS_COLLECTION, id), {
        isArchived: true,
        archivedAt: Timestamp.now(),
        archivePath,
        // Clear content to save space, it's in archive
        content: '[ARCHIVED]',
        contentHtml: undefined
    });
}

// =============================================================================
// VOICEMAIL
// =============================================================================

/**
 * Create voicemail communication
 */
export async function createVoicemailCommunication(params: {
    org_id: string;
    customer_id: string;
    job_id?: string;
    from: string;
    to: string;
    duration: number;
    audioPath: string;
}): Promise<Communication> {
    const comm = await createCommunication({
        org_id: params.org_id,
        customer_id: params.customer_id,
        job_id: params.job_id,
        type: 'voicemail',
        direction: 'inbound',
        content: '[Voicemail - Transcription pending]',
        from: params.from,
        to: params.to
    });

    // Update with voicemail metadata
    await updateDoc(doc(db, COMMUNICATIONS_COLLECTION, comm.id), {
        voicemail: {
            duration: params.duration,
            audioPath: params.audioPath,
            transcriptionStatus: 'pending'
        }
    });

    return comm;
}

/**
 * Update voicemail transcription
 */
export async function updateVoicemailTranscription(
    id: string,
    transcription: string,
    confidence?: number
): Promise<void> {
    const comm = await getCommunication(id);
    if (!comm || comm.type !== 'voicemail') return;

    await updateDoc(doc(db, COMMUNICATIONS_COLLECTION, id), {
        content: transcription,
        voicemail: {
            ...comm.voicemail,
            transcription,
            transcriptionConfidence: confidence,
            transcriptionStatus: 'completed'
        }
    });
}

// =============================================================================
// STATISTICS
// =============================================================================

/**
 * Get communication statistics for a customer
 */
export async function getCustomerCommunicationStats(customerId: string): Promise<{
    totalMessages: number;
    inbound: number;
    outbound: number;
    byType: Record<CommunicationType, number>;
    unread: number;
    lastContactDate?: Date;
}> {
    const { communications } = await getCustomerCommunications(customerId, {
        limit: 1000,
        includeArchived: true
    });

    const inbound = communications.filter(c => c.direction === 'inbound');
    const outbound = communications.filter(c => c.direction === 'outbound');
    const unread = inbound.filter(c => !c.readAt);

    const byType: Record<CommunicationType, number> = {
        email: 0,
        sms: 0,
        voicemail: 0,
        call: 0,
        note: 0,
        system: 0
    };

    communications.forEach(c => {
        byType[c.type]++;
    });

    const lastContact = communications
        .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())[0];

    return {
        totalMessages: communications.length,
        inbound: inbound.length,
        outbound: outbound.length,
        byType,
        unread: unread.length,
        lastContactDate: lastContact?.createdAt?.toDate()
    };
}
