---
name: firestore_data_access
description: Patterns for querying Firestore — mandatory pagination, org_id scoping, service layer usage, and index management.
---

# Firestore Data Access Standard

All Firestore reads and writes from the frontend must follow these patterns to ensure performance, security, and maintainability.

## Rule 1: Never Query Firestore Directly from Components

All Firestore operations go through service functions or custom hooks — never inline in JSX or event handlers.

```typescript
// ❌ BAD — direct Firestore call in component
useEffect(() => {
    const q = query(collection(db, 'jobs'), where('org_id', '==', orgId));
    getDocs(q).then(snap => setJobs(snap.docs.map(d => d.data())));
}, []);

// ✅ GOOD — abstracted through a service
// services/jobService.ts
export async function getJobs(orgId: string, options?: { cursor?: DocumentSnapshot, limit?: number }) {
    let q = query(
        collection(db, 'jobs'),
        where('org_id', '==', orgId),
        orderBy('createdAt', 'desc'),
        limit(options?.limit ?? 25)
    );
    if (options?.cursor) q = query(q, startAfter(options.cursor));
    const snap = await getDocs(q);
    return { docs: snap.docs.map(d => ({ id: d.id, ...d.data() })), lastDoc: snap.docs[snap.docs.length - 1] };
}

// Component uses the service via a hook
const { jobs, loading, loadMore } = useJobs(orgId);
```

## Rule 2: Every List Query MUST Have Pagination

Firestore charges per document read. Fetching entire collections is never acceptable.

```typescript
// ❌ BAD — fetches ALL documents, no limit
const q = query(collection(db, 'materials'), where('org_id', '==', orgId));

// ✅ GOOD — paginated with cursor
const q = query(
    collection(db, 'materials'),
    where('org_id', '==', orgId),
    orderBy('name'),
    limit(25),
    ...(cursor ? [startAfter(cursor)] : [])
);
```

Default page size: **25 documents**. Max page size: **100 documents**.

## Rule 3: Always Include `org_id` in Queries

Every query from the frontend MUST filter by the current user's `org_id`:

```typescript
// ❌ BAD — no org scoping
const q = query(collection(db, 'customers'));

// ✅ GOOD — org-scoped
const q = query(collection(db, 'customers'), where('org_id', '==', currentOrgId));
```

When creating documents, set `org_id` from the auth context, never from client input:
```typescript
await addDoc(collection(db, 'jobs'), {
    ...jobData,
    org_id: currentUser.claims.org_id,  // ✅ From auth claims
    created_by: currentUser.uid,
    createdAt: serverTimestamp(),
});
```

## Rule 4: Maintain Composite Indexes

When your query uses multiple `where()` clauses plus `orderBy()`, a composite index is required.

After adding a new query pattern:
1. Run the app and trigger the query
2. If Firestore throws `FAILED_PRECONDITION`, the console will include a "Create Index" link
3. Add the index definition to `firebase/firestore.indexes.json`
4. Deploy indexes: `npx firebase-tools deploy --only firestore:indexes`

## Rule 5: Batch Writes Have a 500 Operation Limit

Firestore `writeBatch()` supports a maximum of 500 operations per batch. When deleting or updating collections that could exceed this:

```typescript
// ✅ Chunked batch processing
const BATCH_SIZE = 450; // Leave margin
for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = docs.slice(i, i + BATCH_SIZE);
    chunk.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
}
```

## Service File Location

Place service files in `frontend/web/src/services/`:
```
services/
├── jobService.ts
├── customerService.ts
├── invoiceService.ts
├── materialService.ts
└── technicianService.ts
```
