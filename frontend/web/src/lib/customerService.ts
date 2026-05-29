/**
 * CustomerService - CRUD operations for customers with GDPR support
 */

import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    Timestamp,
    writeBatch,
    serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import {
    Customer,
    CustomerAddress,
    CustomerPreferences,
    CustomerBilling,
    GDPRConsent,
    Communication,
    Job,
    Invoice
} from '../types';

const CUSTOMERS_COLLECTION = 'customers';

// =============================================================================
// CREATE
// =============================================================================

export interface CreateCustomerInput {
    org_id: string;
    name: string;
    companyName?: string;
    email?: string;
    phone?: string;
    address?: {
        street: string;
        city: string;
        state: string;
        zip: string;
        country?: string;
    };
    tags?: string[];
    source?: Customer['source'];
    createdBy: string;
}

/**
 * Create a new customer with default preferences and GDPR consent tracking
 */
export async function createCustomer(input: CreateCustomerInput): Promise<Customer> {
    const now = Timestamp.now();

    // Build primary address if provided
    const addresses: CustomerAddress[] = input.address ? [{
        id: generateId(),
        type: 'primary',
        street: input.address.street,
        city: input.address.city,
        state: input.address.state,
        zip: input.address.zip,
        country: input.address.country || 'US',
        isDefault: true
    }] : [];

    const customer: Omit<Customer, 'id'> = {
        org_id: input.org_id,
        name: input.name,
        companyName: input.companyName,
        email: input.email,
        phone: input.phone,

        addresses,
        primaryAddressId: addresses[0]?.id,

        preferences: {
            contactMethod: input.email ? 'email' : 'phone',
            language: 'en',
            doNotContact: false
        },

        billing: {
            terms: 'net30',
            discountPercent: 0,
            invoiceMethod: 'email',
            taxExempt: false
        },

        tags: input.tags || [],
        source: input.source,

        gdpr: {
            consentGiven: false,
            consentVersion: '1.0',
            marketingOptIn: false,
            dataProcessingAgreed: false
        },

        stats: {
            totalJobs: 0,
            completedJobs: 0,
            cancelledJobs: 0,
            totalSpent: 0,
            outstandingBalance: 0,
            lifetimeValue: 0
        },

        status: 'active',
        createdAt: now,
        updatedAt: now,
        createdBy: input.createdBy
    };

    const docRef = await addDoc(collection(db, CUSTOMERS_COLLECTION), customer);

    return { id: docRef.id, ...customer };
}

// =============================================================================
// READ
// =============================================================================

/**
 * Get a single customer by ID
 */
export async function getCustomer(customerId: string): Promise<Customer | null> {
    const docRef = doc(db, CUSTOMERS_COLLECTION, customerId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) return null;

    return { id: docSnap.id, ...docSnap.data() } as Customer;
}

/**
 * Get all customers for an organization
 */
export async function getCustomersByOrg(
    orgId: string,
    options?: {
        status?: Customer['status'];
        limit?: number;
        searchTerm?: string;
    }
): Promise<Customer[]> {
    let q = query(
        collection(db, CUSTOMERS_COLLECTION),
        where('org_id', '==', orgId),
        orderBy('name')
    );

    if (options?.status) {
        q = query(q, where('status', '==', options.status));
    }

    if (options?.limit) {
        q = query(q, limit(options.limit));
    }

    const snapshot = await getDocs(q);
    let customers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));

    // Client-side search (Firestore doesn't support full-text search)
    if (options?.searchTerm) {
        const term = options.searchTerm.toLowerCase();
        customers = customers.filter(c =>
            c.name.toLowerCase().includes(term) ||
            c.email?.toLowerCase().includes(term) ||
            c.phone?.includes(term) ||
            c.companyName?.toLowerCase().includes(term)
        );
    }

    return customers;
}

/**
 * Find customer by email or phone
 */
export async function findCustomerByContact(
    orgId: string,
    contact: { email?: string; phone?: string }
): Promise<Customer | null> {
    if (contact.email) {
        const q = query(
            collection(db, CUSTOMERS_COLLECTION),
            where('org_id', '==', orgId),
            where('email', '==', contact.email),
            limit(1)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Customer;
        }
    }

    if (contact.phone) {
        const q = query(
            collection(db, CUSTOMERS_COLLECTION),
            where('org_id', '==', orgId),
            where('phone', '==', contact.phone),
            limit(1)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Customer;
        }
    }

    return null;
}

// =============================================================================
// UPDATE
// =============================================================================

/**
 * Update customer fields
 */
export async function updateCustomer(
    customerId: string,
    updates: Partial<Customer>,
    modifiedBy: string
): Promise<void> {
    const docRef = doc(db, CUSTOMERS_COLLECTION, customerId);

    await updateDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp(),
        lastModifiedBy: modifiedBy
    });
}

/**
 * Add or update a customer address
 */
export async function upsertCustomerAddress(
    customerId: string,
    address: CustomerAddress,
    modifiedBy: string
): Promise<void> {
    const customer = await getCustomer(customerId);
    if (!customer) throw new Error('Customer not found');

    const existingIndex = customer.addresses.findIndex(a => a.id === address.id);

    let updatedAddresses: CustomerAddress[];
    if (existingIndex >= 0) {
        updatedAddresses = [...customer.addresses];
        updatedAddresses[existingIndex] = address;
    } else {
        updatedAddresses = [...customer.addresses, address];
    }

    // If this is marked as default, unset others
    if (address.isDefault) {
        updatedAddresses = updatedAddresses.map(a => ({
            ...a,
            isDefault: a.id === address.id
        }));
    }

    await updateCustomer(customerId, {
        addresses: updatedAddresses,
        primaryAddressId: address.isDefault ? address.id : customer.primaryAddressId
    }, modifiedBy);
}

/**
 * Update customer preferences
 */
export async function updateCustomerPreferences(
    customerId: string,
    preferences: Partial<CustomerPreferences>,
    modifiedBy: string
): Promise<void> {
    const customer = await getCustomer(customerId);
    if (!customer) throw new Error('Customer not found');

    await updateCustomer(customerId, {
        preferences: { ...customer.preferences, ...preferences }
    }, modifiedBy);
}

/**
 * Update GDPR consent
 */
export async function updateGDPRConsent(
    customerId: string,
    consent: Partial<GDPRConsent>,
    metadata?: { ipAddress?: string; userAgent?: string }
): Promise<void> {
    const customer = await getCustomer(customerId);
    if (!customer) throw new Error('Customer not found');

    const now = Timestamp.now();

    await updateCustomer(customerId, {
        gdpr: {
            ...customer.gdpr,
            ...consent,
            consentDate: consent.consentGiven ? now : customer.gdpr.consentDate,
            ipAddress: metadata?.ipAddress,
            userAgent: metadata?.userAgent
        }
    }, 'system');
}

/**
 * Update customer statistics (called after job/invoice changes)
 */
export async function recalculateCustomerStats(customerId: string): Promise<void> {
    const customer = await getCustomer(customerId);
    if (!customer) return;

    // Get all jobs for this customer
    const jobsQuery = query(
        collection(db, 'jobs'),
        where('customer_id', '==', customerId)
    );
    const jobsSnapshot = await getDocs(jobsQuery);
    const jobs = jobsSnapshot.docs.map(d => d.data() as Job);

    // Get all invoices for this customer
    const invoicesQuery = query(
        collection(db, 'invoices'),
        where('customer_id', '==', customerId)
    );
    const invoicesSnapshot = await getDocs(invoicesQuery);
    const invoices = invoicesSnapshot.docs.map(d => d.data() as Invoice);

    // Calculate stats
    const completedJobs = jobs.filter(j => j.status === 'completed');
    const cancelledJobs = jobs.filter(j => j.status === 'cancelled');
    const paidInvoices = invoices.filter(i => i.status === 'paid');
    const unpaidInvoices = invoices.filter(i => i.status !== 'paid');

    const totalSpent = paidInvoices.reduce((sum, i) => sum + (i.total || 0), 0);
    const outstandingBalance = unpaidInvoices.reduce((sum, i) => sum + (i.total || 0), 0);

    // Find first and last job dates
    const sortedJobs = [...jobs].sort((a, b) =>
        (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0)
    );

    // Get average rating from completed jobs
    const ratings = completedJobs
        .filter(j => j.customer_rating)
        .map(j => j.customer_rating!);
    const avgRating = ratings.length > 0
        ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
        : undefined;

    await updateCustomer(customerId, {
        stats: {
            totalJobs: jobs.length,
            completedJobs: completedJobs.length,
            cancelledJobs: cancelledJobs.length,
            totalSpent,
            outstandingBalance,
            firstJobDate: sortedJobs[0]?.createdAt,
            lastJobDate: sortedJobs[sortedJobs.length - 1]?.createdAt,
            avgRating,
            lifetimeValue: totalSpent + outstandingBalance
        }
    }, 'system');
}

// =============================================================================
// DELETE (GDPR Compliant)
// =============================================================================

/**
 * Request customer data deletion (30-day grace period)
 */
export async function requestCustomerDeletion(
    customerId: string,
    requestedBy: string,
    reason?: string
): Promise<{ scheduledDeletionDate: Date }> {
    const customer = await getCustomer(customerId);
    if (!customer) throw new Error('Customer not found');

    const now = new Date();
    const scheduledDeletionDate = new Date(now);
    scheduledDeletionDate.setDate(scheduledDeletionDate.getDate() + 30); // 30-day grace

    await updateCustomer(customerId, {
        status: 'pending_deletion',
        deletionRequest: {
            requestedAt: Timestamp.now(),
            requestedBy,
            scheduledDeletionDate: Timestamp.fromDate(scheduledDeletionDate),
            reason
        }
    }, requestedBy);

    return { scheduledDeletionDate };
}

/**
 * Cancel a pending deletion request
 */
export async function cancelDeletionRequest(
    customerId: string,
    cancelledBy: string
): Promise<void> {
    await updateCustomer(customerId, {
        status: 'active',
        deletionRequest: undefined
    }, cancelledBy);
}

/**
 * Execute customer data deletion (called after grace period)
 * This should be called by a Cloud Function, not directly
 */
export async function executeCustomerDeletion(
    customerId: string,
    orgId: string
): Promise<{ deletedRecords: { jobs: number; invoices: number; communications: number } }> {
    const batch = writeBatch(db);
    let counts = { jobs: 0, invoices: 0, communications: 0 };

    // Delete all jobs for this customer
    const jobsQuery = query(collection(db, 'jobs'), where('customer_id', '==', customerId));
    const jobsSnapshot = await getDocs(jobsQuery);
    jobsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
        counts.jobs++;
    });

    // Delete all invoices for this customer
    const invoicesQuery = query(collection(db, 'invoices'), where('customer_id', '==', customerId));
    const invoicesSnapshot = await getDocs(invoicesQuery);
    invoicesSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
        counts.invoices++;
    });

    // Delete all communications for this customer
    const commsQuery = query(collection(db, 'communications'), where('customer_id', '==', customerId));
    const commsSnapshot = await getDocs(commsQuery);
    commsSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
        counts.communications++;
    });

    // Delete the customer record
    batch.delete(doc(db, CUSTOMERS_COLLECTION, customerId));

    await batch.commit();

    return { deletedRecords: counts };
}

// =============================================================================
// MIGRATION UTILITIES
// =============================================================================

/**
 * Find or create customer from job data (for migration)
 */
export async function findOrCreateCustomerFromJob(
    job: Job,
    createdBy: string
): Promise<Customer> {
    // Try to find existing customer
    const existing = await findCustomerByContact(job.org_id, {
        email: job.customer.email,
        phone: job.customer.phone
    });

    if (existing) return existing;

    // Create new customer from job data
    return createCustomer({
        org_id: job.org_id,
        name: job.customer.name,
        email: job.customer.email,
        phone: job.customer.phone,
        address: job.customer.address ? parseAddressString(job.customer.address) : undefined,
        source: job.request?.source === 'email' ? 'email' :
            job.request?.source === 'phone' ? 'phone' : 'other',
        createdBy
    });
}

/**
 * Parse a single-line address string into components
 */
function parseAddressString(address: string): {
    street: string;
    city: string;
    state: string;
    zip: string;
} {
    // Simple parsing - in production, use a proper address parser or geocoding API
    const parts = address.split(',').map(p => p.trim());

    if (parts.length >= 3) {
        const lastPart = parts[parts.length - 1];
        const stateZip = lastPart.split(' ');

        return {
            street: parts.slice(0, -2).join(', '),
            city: parts[parts.length - 2],
            state: stateZip[0] || '',
            zip: stateZip[1] || ''
        };
    }

    return {
        street: address,
        city: '',
        state: '',
        zip: ''
    };
}

// =============================================================================
// HELPERS
// =============================================================================

function generateId(): string {
    return Math.random().toString(36).substring(2, 15);
}
