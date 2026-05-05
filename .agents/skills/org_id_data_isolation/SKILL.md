---
name: org_id_data_isolation
description: Application-code standards for multi-tenant data isolation — every document and query must be scoped to the user's organization.
---

# Organization Data Isolation Standard

This is a multi-tenant SaaS application. Every piece of customer/business data MUST be scoped to an organization. This skill covers the application code side (queries, document creation). For the security rules side, see the `firestore_security_rules` skill.

## Rule 1: Every Document Must Have `org_id`

When creating a Firestore document (in any collection that stores business data), always include `org_id`:

```typescript
// ✅ REQUIRED on every document creation
await addDoc(collection(db, 'jobs'), {
    ...jobData,
    org_id: currentUser.claims.org_id,  // From auth claims, NOT client input
    created_by: currentUser.uid,
    createdAt: serverTimestamp(),
});
```

**Source of truth for `org_id`:** Always read from the user's Firebase Auth custom claims (`auth.token.org_id`), never from:
- URL parameters
- Form inputs
- localStorage
- Component state

## Rule 2: Every Query Must Filter by `org_id`

```typescript
// ❌ DANGEROUS — reads ALL orgs' data
const q = query(collection(db, 'customers'));

// ❌ STILL DANGEROUS — ordering without org filter
const q = query(collection(db, 'customers'), orderBy('name'));

// ✅ CORRECT — scoped to user's org
const q = query(
    collection(db, 'customers'),
    where('org_id', '==', currentOrgId),
    orderBy('name')
);
```

## Rule 3: New Collections Require Complete Setup

When adding a new Firestore collection:

1. **Define the TypeScript interface** with a mandatory `org_id` field:
   ```typescript
   interface NewEntity {
       id?: string;
       org_id: string;  // REQUIRED
       // ... other fields
   }
   ```

2. **Add security rules** in `firebase/firestore.rules` (see `firestore_security_rules` skill)

3. **Create service functions** with org-scoped queries (see `firestore_data_access` skill)

4. **Add composite indexes** if using multi-field queries

## Rule 4: Cross-Org Access is Backend-Only

If a feature requires reading data across organizations (e.g., platform admin dashboard, usage analytics):
- It MUST go through a Cloud Function with admin SDK access
- The Cloud Function must verify the caller has a platform-level admin claim
- Client-side code must NEVER bypass org_id filtering

## Collections Reference

| Collection | Has `org_id`? | Notes |
|---|---|---|
| `organizations` | N/A (IS the org) | Doc ID = org_id |
| `users` | ✅ | Scoped to org |
| `technicians` | ✅ | Scoped to org |
| `customers` | ✅ | Scoped to org |
| `jobs` | ✅ | Scoped to org |
| `invoices` | ✅ | Scoped to org |
| `quotes` | ✅ | Scoped to org |
| `materials` | ✅ | Scoped to org |
| `tools` | ✅ | Scoped to org |
| `communications` | ✅ | Scoped to org |
| `audit_logs` | ✅ | Server-write only |
