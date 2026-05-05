---
name: gdpr_compliance
description: Implementation standards for GDPR data operations — server-side exports, chunked deletions, and immutable audit logging.
---

# GDPR Compliance Standards

GDPR operations (data export, data deletion, consent management) are legally and technically critical. They must be implemented with the highest reliability guarantees.

## Rule 1: Data Operations Run Server-Side ONLY

```typescript
// ❌ BAD — client-side GDPR export (current state of gdprService.ts)
async function generateDataExport(customerId: string) {
    const jobs = await getDocs(query(collection(db, 'jobs'), where('customer_id', '==', customerId)));
    // Client fetches everything... no audit trail, no rate limiting
}

// ✅ GOOD — server-side via Cloud Function
const exportCustomerData = httpsCallable(functions, 'exportCustomerData');
const result = await exportCustomerData({ customerId });
// Cloud Function handles: auth check, rate limiting, audit logging, data assembly
```

GDPR operations that MUST be server-side:
- **Data export** (`generateDataExport`) — must create a downloadable package server-side
- **Data deletion** (`executeFullDeletion`) — must delete across all collections with retry logic
- **Right to be forgotten** — must cascade through all related documents

## Rule 2: Batch Deletions Must Be Chunked

Firestore `writeBatch()` has a 500 operation limit. GDPR deletions can span thousands of documents.

```typescript
// ❌ BAD — single batch, will fail for active customers
const batch = writeBatch(db);
allDocs.forEach(doc => batch.delete(doc.ref));
await batch.commit();  // 💥 Fails if > 500 docs

// ✅ GOOD — chunked batches with retry
const BATCH_SIZE = 450;
for (let i = 0; i < allDocs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = allDocs.slice(i, i + BATCH_SIZE);
    chunk.forEach(doc => batch.delete(doc.ref));
    
    try {
        await batch.commit();
        logger.info(`Deleted batch ${i / BATCH_SIZE + 1}`, { count: chunk.length });
    } catch (error) {
        logger.error(`Batch deletion failed at chunk ${i / BATCH_SIZE + 1}`, { error });
        throw error;  // Retry logic in the calling function
    }
}
```

## Rule 3: Audit Logs Are Immutable and Server-Authored

```typescript
// ❌ BAD — client-side audit log creation
await addDoc(collection(db, 'audit_logs'), {
    action: 'data_export',
    userId: currentUser.uid,
    timestamp: new Date(),
});
// Malicious user can create fake entries or modify fields

// ✅ GOOD — audit logs written in Cloud Functions only
// In the Cloud Function:
await db.collection('audit_logs').add({
    action: 'data_export',
    performed_by: request.auth.uid,
    org_id: request.auth.token.org_id,
    target_customer_id: customerId,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    ip_address: request.rawRequest.ip,
});

// Firestore rules: audit_logs is read-only from client
// allow write: if false;
```

## Rule 4: Consent Version Comparison

Use proper semantic version comparison, not string comparison:

```typescript
// ❌ BAD — string comparison fails for "1.10" >= "1.9"
const isValid = consent.version >= minimumVersion;

// ✅ GOOD — numeric comparison or semver library
function isVersionAtLeast(version: string, minimum: string): boolean {
    const [vMajor, vMinor = 0] = version.split('.').map(Number);
    const [mMajor, mMinor = 0] = minimum.split('.').map(Number);
    return vMajor > mMajor || (vMajor === mMajor && vMinor >= mMinor);
}
```

## Rule 5: Deletion Grace Period

Data deletion requests have a mandatory grace period before execution:
- **Default:** 30 days (configurable per org)
- During the grace period, data is marked for deletion but not removed
- The customer can cancel the request during this period
- After the grace period, a scheduled Cloud Function executes the deletion

The grace period constant must be a named constant, not a magic number:
```typescript
const GDPR_DELETION_GRACE_PERIOD_DAYS = 30;
```
