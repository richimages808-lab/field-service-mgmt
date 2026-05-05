---
name: new_cloud_function
description: Template and standards for creating new Firebase Cloud Functions using v2 API with proper auth, logging, and error handling.
---

# Cloud Function Standards

All new Cloud Functions MUST follow this template. Existing v1 functions should be migrated to v2 when modified.

## Required: Use v2 API

```typescript
// ❌ LEGACY v1 — do NOT use for new functions
import * as functions from "firebase-functions";
export const myFunc = functions.https.onCall(async (data, context) => { ... });

// ✅ v2 — use this for all new functions
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";

export const myFunc = onCall(async (request) => {
    // Auth check
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Must be signed in");
    }
    
    // Org isolation
    const orgId = request.auth.token.org_id;
    if (!orgId) {
        throw new HttpsError("permission-denied", "No organization assigned");
    }
    
    // Structured logging (NOT console.log)
    logger.info("Processing request", { 
        orgId, 
        uid: request.auth.uid,
        action: "myFunc" 
    });
    
    try {
        // ... business logic ...
        return { success: true };
    } catch (error) {
        logger.error("myFunc failed", { orgId, error });
        throw new HttpsError("internal", "Operation failed");
    }
});
```

## Logging Rules

| ❌ Do NOT Use | ✅ Use Instead |
|---|---|
| `console.log(...)` | `logger.info(message, structuredData)` |
| `console.warn(...)` | `logger.warn(message, structuredData)` |
| `console.error(...)` | `logger.error(message, structuredData)` |

Always pass structured data objects, not string interpolation:
```typescript
// ❌ BAD
console.log(`Processing job ${jobId} for org ${orgId}`);

// ✅ GOOD
logger.info("Processing job", { jobId, orgId });
```

## Error Handling Rules

**Critical operations** (auth claims, billing, GDPR, data writes) must ALWAYS re-throw errors:
```typescript
try {
    await admin.auth().setCustomUserClaims(uid, claims);
} catch (error) {
    logger.error("Failed to set claims", { uid, error });
    throw error;  // ← MUST re-throw for critical operations
}
```

**Non-critical operations** (analytics, notifications) may fail silently with a warning:
```typescript
try {
    await sendNotification(userId, message);
} catch (error) {
    logger.warn("Notification delivery failed", { userId, error });
    // OK to continue — notification failure shouldn't block the main operation
}
```

## Firestore Triggers: Use Instead of Sleep

```typescript
// ❌ BAD — race condition with arbitrary delay
export const onUserCreated = functions.auth.user().onCreate(async (user) => {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const userDoc = await db.collection('users').doc(user.uid).get();
});

// ✅ GOOD — trigger fires when the document actually exists
import { onDocumentCreated } from "firebase-functions/v2/firestore";

export const onUserDocCreated = onDocumentCreated("users/{userId}", async (event) => {
    const userData = event.data?.data();
    if (!userData) return;
    await admin.auth().setCustomUserClaims(event.params.userId, {
        org_id: userData.org_id,
        role: userData.role,
    });
});
```

## Registering Functions

All functions are exported from `firebase/functions/src/index.ts`. When adding a new function:
1. Create the function in its domain-specific file (e.g., `billing/charges.ts`)
2. Export it from `index.ts`:
   ```typescript
   export { myNewFunction } from "./billing/charges";
   ```
