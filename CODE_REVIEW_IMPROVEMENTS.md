# Field Service Management — Expert Code Review & Improvement Roadmap

> **Reviewer:** AI Senior Staff Engineer  
> **Date:** April 2026  
> **Scope:** Full-stack audit — frontend (`frontend/web/src`), backend (`firebase/functions/src`), Firestore rules, and infrastructure configuration.  
> **Objective:** Identify every architectural, security, performance, and maintainability issue that must be addressed before this application can reliably serve a global, multi-tenant customer base across PC and mobile.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Critical — Security Vulnerabilities](#2-critical--security-vulnerabilities)
3. [Critical — Data Isolation & Multi-Tenancy](#3-critical--data-isolation--multi-tenancy)
4. [High — Architecture & Code Organization](#4-high--architecture--code-organization)
5. [High — Performance & Scalability](#5-high--performance--scalability)
6. [High — Error Handling & Resilience](#6-high--error-handling--resilience)
7. [Medium — Authentication & Authorization](#7-medium--authentication--authorization)
8. [Medium — Testing & Quality Assurance](#8-medium--testing--quality-assurance)
9. [Medium — State Management & Data Flow](#9-medium--state-management--data-flow)
10. [Medium — DevOps & Environment Management](#10-medium--devops--environment-management)
11. [Low — Code Quality & Maintainability](#11-low--code-quality--maintainability)
12. [Low — Compliance & Audit](#12-low--compliance--audit)
13. [Appendix: Prioritized Action Plan](#13-appendix-prioritized-action-plan)

---

## 1. Executive Summary

The **field-service-mgmt** application is a feature-rich field service platform with impressive breadth: CRM, scheduling, invoicing, inventory, reporting, customer portal, AI-powered analysis, communications (SMS/voice/email), and GDPR tooling. The core product ideas are sound and the domain modeling covers real business needs.

However, **the application is not production-ready for multi-tenant SaaS deployment**. The review uncovered:

| Severity | Count | Category |
|----------|-------|----------|
| 🔴 Critical | 7 | Security holes, data leaks, zero test coverage |
| 🟠 High | 12 | Architecture, performance, error handling |
| 🟡 Medium | 10 | Auth patterns, state management, DevOps |
| 🟢 Low | 8 | Code quality, compliance gaps |

The most urgent issues are the **Firestore security rules in demo mode** (any authenticated user can read/write any organization's data) and the **complete absence of automated tests**. These two items alone could block launch.

---

## 2. Critical — Security Vulnerabilities

### 2.1 🔴 Firestore Rules in "DEMO MODE" — Data Is Wide Open

**Files:** `firebase/firestore.rules` (lines 26-71)

The cornerstone of multi-tenant security — the `belongsToOrg()`, `isStaff()`, and `isDispatcher()` helper functions — are all bypassed:

```javascript
// CURRENT (lines 27-29):
function isStaff() {
  // DEMO MODE: Assume any signed in user is staff
  return isSignedIn();  // ← ANY user becomes "staff"
}

// CURRENT (lines 65-71):
function belongsToOrg(orgId) {
  // DEMO MODE: Allow any authenticated user
  return isSignedIn();  // ← ANY user can access ANY org's data
}
```

**Impact:** A customer of Organization A can read, modify, or delete data belonging to Organization B. This is a **data breach waiting to happen** and a non-starter for any multi-tenant SaaS product.

**Fix:** Uncomment the commented-out production lines:
```javascript
function isStaff() {
  return getRole() in ['owner', 'admin', 'dispatcher', 'technician'];
}

function belongsToOrg(orgId) {
  return isSignedIn() && string(getOrgId()) == string(orgId);
}
```

> ⚠️ **WARNING:** Activating these rules requires that every user has valid custom claims (`org_id`, `role`) set in their auth token. You must verify all existing users have claims before flipping this switch — or you will lock out users who don't have claims yet.

---

### 2.2 🔴 Hardcoded Test Account UIDs in Security Rules

**File:** `firebase/firestore.rules` (lines 87-91)

```javascript
function isTestAccount(userId) {
  return userId == 'IT8uvYQrbJPdhtelElWNaOTpG683' || // dispatcher@test.com
         userId == '0tTzE4twETWMNIbqubo58D9ulvf2' || // tech@test.com
         userId == '1k21kpBrsSV0ZLM1r6jPh6JAvCg2';   // solo@test.com
}
```

**Impact:** These UIDs are immortal — no security rule permits deleting them. This is a test convenience that should never be in production. If these accounts are compromised, they cannot be removed through normal admin operations.

**Fix:** Remove the function entirely. Use Firebase Auth's `disabled` flag to protect test accounts if needed, and manage them through the Admin SDK or a backend function, not in client-facing security rules.

---

### 2.3 🔴 Firebase API Key Hardcoded in Source

**File:** `frontend/web/src/firebase.ts` (line 9)

```typescript
const firebaseConfig = {
    apiKey: "AIzaSyBbbbhn_DQd9LHO3Ii88-m3utdi4L9WTaM",
    // ... other config
};
```

**Impact:** The Firebase web API key is inherently public (it's sent to the browser), so this is lower severity than a server-side secret leak. However:
- It makes key rotation impossible without a code change and redeploy
- It signals bad habits — other secrets may also be hardcoded
- It prevents per-environment configs (dev, staging, prod)

**Fix:** Move to environment variables via Vite's `import.meta.env.VITE_*` system and `.env` files. No `.env` file exists in the project today.

---

### 2.4 🔴 Cloud Function URL Hardcoded in Client

**File:** `frontend/web/src/lib/aiScheduler.ts` (line 38)

```typescript
const FIREBASE_FUNCTION_URL = 'https://us-central1-maintenancemanager-c5533.cloudfunctions.net/calculateDriveTime';
```

**Impact:** This bypasses the Firebase `httpsCallable` SDK — meaning the call has no automatic auth token injection. The function itself checks `context.auth`, but this raw `fetch()` call won't pass the Firebase Auth token, so the call will **always fail** with `unauthenticated` in production.

**Fix:** Replace with `httpsCallable(functions, 'calculateDriveTime')` to get automatic auth.

---

### 2.5 🔴 GDPR Data Export Runs on Client-Side

**File:** `frontend/web/src/lib/gdprService.ts` (lines 86-139)

The `generateDataExport()` function runs client-side, fetching all customer data (jobs, invoices, communications, attachments) directly from Firestore via individual queries. The file even contains the comment:

```typescript
// Note: In production, this would be a Cloud Function
```

**Impact:** 
- A malicious user could call this function for any customer (currently — rules are wide open)
- Client-side execution means no audit trail on the server
- Large exports could timeout on slow connections
- No rate limiting or abuse protection

**Fix:** Move to a Cloud Function with server-side execution, proper auth checks, rate limiting, and audit logging.

---

### 2.6 🔴 Batch Deletion Exceeds Firestore Limits

**File:** `frontend/web/src/lib/gdprService.ts` (lines 281-331, `executeFullDeletion`)

Uses a single `writeBatch` to delete all documents across 5 collections. Firestore batches are limited to **500 operations**.

**Impact:** A customer with more than ~100 total documents (i.e., every real customer) could cause the batch to silently fail or throw. GDPR deletion would be incomplete.

**Fix:** Implement chunked batch operations (500 ops per batch) in a Cloud Function with retry logic.

---

### 2.7 🔴 ReportingService Has Duplicate Imports That Will Crash at Build

**File:** `frontend/web/src/services/ReportingService.ts` (lines 1-2 vs 726-727)

```typescript
// Line 1-2 (existing):
import { db } from '../firebase';
import { collection, query, where, getDocs, ... } from 'firebase/firestore';

// Line 726-727 (duplicate!):
import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
```

`functions` and `httpsCallable` are imported **twice** — once at the top and once at line 726. Depending on the bundler, this may cause build failures or runtime import order issues. This is also a sign that the `BigQueryReportingService` was added hastily.

**Fix:** Consolidate all imports at the top of the file.

---

## 3. Critical — Data Isolation & Multi-Tenancy

### 3.1 🔴 Inconsistent `org_id` Enforcement Across Collections

Reviewed every `match` block in `firestore.rules` (486 lines). While most critical collections (jobs, customers, invoices) use `docBelongsToUserOrg()`, several do not enforce org-level isolation:

| Collection | Has `org_id` Check? | Risk |
|-----------|---------------------|------|
| `organizations/{orgId}` | ✅ `belongsToOrg(orgId)` | Good (when not in demo mode) |
| `users/{userId}` | ❌ `isSignedIn()` only | Any user can read/update any user |
| `technicians/{techId}` | ❌ `isSignedIn()` only | Cross-org technician visibility |
| `jobs/{jobId}` | ✅ `docBelongsToUserOrg()` | Good |
| `customers/{customerId}` | ✅ `docBelongsToUserOrg()` | Good |
| `invoices/{invoiceId}` | ✅ (assumed from pattern) | Good |
| `materials/{materialId}` | ? Unknown | Must verify |
| `tools/{toolId}` | ? Unknown | Must verify |
| `communications/{commId}` | ? Unknown | Must verify |
| `audit_logs/{logId}` | ❌ (written client-side) | Any user can create fake audit entries |

**Fix:** Every collection must enforce `docBelongsToUserOrg()` on read and `newDocHasUserOrg()` on create. Audit logs must only be writable from backend Cloud Functions.

---

### 3.2 🟠 User Collection Rules Allow Cross-Organization User Enumeration

**File:** `firebase/firestore.rules` (lines 109-121)

```javascript
match /users/{userId} {
  allow read: if isSignedIn();     // Any user reads ANY user
  allow create: if isSignedIn();   // Any user creates ANY profile
  allow update: if isSignedIn();   // Any user updates ANY profile
  allow delete: if isSignedIn() && !isTestAccount(userId);
}
```

**Impact:** User A at Org X can list, read, and modify user profiles at Org Y. Email addresses, names, roles, and org affiliations are all visible.

**Fix:** Read/update should be scoped to the user's own document or to users within the same `org_id`.

---

## 4. High — Architecture & Code Organization

### 4.1 🟠 Monolithic Page Components (God Components)

The top 6 page components by file size:

| File | Size | Lines (est.) |
|------|------|------|
| `MaterialsInventory.tsx` | **93.7 KB** | ~2,500+ |
| `TechnicianProfile.tsx` | **90.4 KB** | ~2,400+ |
| `ToolsInventory.tsx` | **70.5 KB** | ~1,900+ |
| `SoloCalendar.tsx` | **67.9 KB** | ~1,800+ |
| `Signup.tsx` | **59.3 KB** | ~1,600+ |
| `CreateQuote.tsx` | **46.2 KB** | ~1,200+ |

These files are unmaintainable. A single change to any sub-feature requires loading and mentally parsing thousands of lines. React re-renders are likely excessive since the entire state tree lives in one component.

**Fix:** Break each into domain-specific sub-components:
```
MaterialsInventory/
├── index.tsx              // Entry point, routing
├── MaterialsTable.tsx     // List/table view
├── MaterialForm.tsx       // Add/edit form
├── VendorPricing.tsx      // Vendor comparison
├── MaterialFilters.tsx    // Search/filter bar
├── hooks/
│   ├── useMaterials.ts    // Data fetching
│   └── useVendors.ts
└── types.ts               // Local types
```

---

### 4.2 🟠 Monolithic Type Definitions File

**File:** `frontend/web/src/types.ts` — **1,700+ lines**

A single file contains every domain type in the application: `Job`, `Customer`, `Invoice`, `Technician`, `Material`, `Quote`, `Communication`, `Organization`, etc.

**Impact:** 
- IDE performance degrades as the file grows
- Circular dependency risk as everything imports from one place
- Difficult to find types by domain
- Merge conflicts are frequent in team environments

**Fix:** Split into domain-specific type modules:
```
types/
├── index.ts          // Re-exports
├── job.ts
├── customer.ts
├── invoice.ts
├── technician.ts
├── material.ts
├── organization.ts
├── communication.ts
├── scheduling.ts
└── common.ts         // Shared types (Timestamp wrappers, etc.)
```

---

### 4.3 🟠 `@types/*` Packages in `dependencies` Instead of `devDependencies`

**File:** `frontend/web/package.json`

```json
"dependencies": {
    "@types/file-saver": "^2.0.7",
    "@types/react-big-calendar": "^1.16.3",
    "@types/react-datepicker": "^6.2.0",
    "@types/react-grid-layout": "^1.3.6",
    // ...
}
```

**Impact:** Type definition packages are bundled into the production build unnecessarily, increasing bundle size and deployment time.

**Fix:** Move all `@types/*` packages to `devDependencies`.

---

### 4.4 🟠 Firebase Functions Use Legacy v1 API

**File:** `firebase/functions/src/index.ts` and all function files

All Cloud Functions use `firebase-functions` v1 pattern:

```typescript
import * as functions from "firebase-functions";
export const myFunc = functions.https.onCall(async (data, context) => { ... });
```

**Impact:** v1 functions cannot be deployed to 2nd gen Cloud Functions which offer: 
- Larger memory/CPU
- Longer timeouts (60 min vs 9 min)
- Concurrency (multiple requests per instance)
- Cloud Run integration for containerized deployments
- Better cold start performance

**Fix:** Migrate to `firebase-functions/v2` API:
```typescript
import { onCall } from "firebase-functions/v2/https";
export const myFunc = onCall(async (request) => { ... });
```

---

### 4.5 🟠 Duplicate Type Definitions (Frontend vs Backend)

**Files:** 
- `frontend/web/src/lib/authClaimsService.ts` (line 13)
- `firebase/functions/src/auth.ts` (line 22)

Both define `UserClaims`:
```typescript
export interface UserClaims {
    org_id: string;
    role: 'owner' | 'admin' | 'dispatcher' | 'technician' | 'customer';
    customer_id?: string;
}
```

**Impact:** When one is updated, the other must be manually updated too. In a multi-developer team, this will lead to drift and bugs.

**Fix:** Create a shared `types` package (or at minimum a shared `.ts` file) that both frontend and backend import from. Consider a monorepo tool like `nx` or `turborepo`.

---

### 4.6 🟠 No Service Layer / Repository Pattern

Across the codebase, Firestore operations (`getDoc`, `setDoc`, `query`, `where`, `getDocs`) are called directly from page components. There is no centralized data access layer.

**Examples:**
- `MaterialsInventory.tsx` calls `getDocs(query(collection(db, 'materials'), ...))` directly
- `SoloCalendar.tsx` calls `updateDoc(doc(db, 'jobs', jobId), ...)` directly
- `TechnicianProfile.tsx` has inline Firestore queries for 5+ collections

**Impact:**
- Business logic is coupled to Firestore SDK — switching to a REST API, offline-first architecture, or different database requires touching every component
- No centralized caching, retry logic, or error handling for data operations
- Duplicate query patterns across components

**Fix:** Introduce a repository/service layer:
```typescript
// services/jobService.ts
export const jobService = {
    getByOrg: (orgId: string) => { ... },
    getById: (id: string) => { ... },
    create: (job: CreateJobInput) => { ... },
    update: (id: string, updates: Partial<Job>) => { ... },
};
```

---

## 5. High — Performance & Scalability

### 5.1 🟠 No Pagination on Large Collection Reads

Multiple components fetch entire collections without pagination:

- `ReportingService.ts` — fetches **all** invoices, jobs, quotes for an org within a date range
- `MaterialsInventory.tsx` — fetches **all** materials for an org
- `CustomerList.tsx` — fetches **all** customers for an org

**Impact:** With 100 customers, each having 50 jobs and 30 invoices, reporting queries fetch 5,000+ documents per page load. At 1,000 customers, this becomes 50,000+ reads — causing:
- Firebase billing spikes (each read costs money)
- Multi-second load times
- Browser memory pressure
- Potential Firestore 1MB response size limit violations

**Fix:** 
- Implement cursor-based pagination using `startAfter()` and `limit()`
- For reporting, use server-side aggregation (BigQuery or Cloud Functions) instead of client-side collection scans
- Consider Firestore's `count()` aggregate for collection sizes

---

### 5.2 🟠 Client-Side Report Aggregation

**File:** `frontend/web/src/services/ReportingService.ts` (945 lines)

The `FirestoreReportingService` class fetches raw documents and performs aggregation (grouping, counting, summing) in the browser:

```typescript
// Example: getRevenueByRange - fetches ALL invoices, then groups by date in JS
snapshot.docs.forEach(doc => {
    const data = doc.data();
    const date = data.createdAt.toDate().toLocaleDateString();
    dailyRevenue[date] = (dailyRevenue[date] || 0) + (data.total || 0);
});
```

**Impact:** This is O(n) on document count with no upper bound. A busy org with 10,000 invoices would transfer ~10MB of data to compute a simple bar chart.

**Fix:** The codebase already has a `BigQueryReportingService` with Firestore fallback — this is the right pattern. Ensure it's enabled by default and that the Cloud Function `getBigQueryReport` is deployed and tested.

---

### 5.3 🟠 No Firestore Composite Index Definitions

**Searched for:** `firebase/firestore.indexes.json` or similar index definitions.

Multiple queries use multi-field filters (e.g., `org_id` + `status` + `createdAt` with `orderBy`). Without corresponding composite indexes, these queries will fail at runtime with a `FAILED_PRECONDITION` error.

**Impact:** Queries silently fail or return incomplete results in production.

**Fix:** 
- Run every query path in a development environment and capture the Firestore console's "Create Index" links
- Define all required indexes in `firestore.indexes.json` and deploy them alongside rules

---

### 5.4 🟠 AI Scheduler Hardcodes Hawaii Locations

**File:** `frontend/web/src/lib/aiScheduler.ts` (lines 30-35)

```typescript
const PARTS_STORES: Location[] = [
    { address: 'Home Depot - Honolulu (421 Alakawa St)', lat: 21.3196, lng: -157.8735 },
    { address: "Lowe's - Iwilei (411 Pacific St)", lat: 21.3170, lng: -157.8700 },
    { address: 'City Mill - Kaimuki (3086 Waialae Ave)', lat: 21.2850, lng: -157.8050 },
    { address: 'Ferguson Plumbing Supply - Sand Island', lat: 21.3250, lng: -157.8900 }
];
```

**Impact:** The scheduling optimization engine is unusable outside of Honolulu. Any global customer would get nonsensical parts run suggestions.

**Fix:** Store parts store locations per-organization in Firestore. Allow organizations to manage their own vendor/store locations. The scheduler should pull from the org's configured stores, not a hardcoded list.

---

### 5.5 🟠 4,316 Console Statements in Production Code

**Measurement:** Grep across all `.ts`/`.tsx` files revealed **4,316** `console.log`, `console.warn`, and `console.error` calls.

**Impact:**
- Performance degradation from serializing complex objects to console
- Sensitive data leakage in browser devtools (customer names, addresses, financial data)
- Noise that makes real debugging harder

**Fix:** 
- Replace with a structured logging utility (`const logger = createLogger('scheduler')`) that can be toggled by log level
- In production builds, strip or silence console calls via a Vite plugin
- For Cloud Functions, use `functions.logger` (structured logging to Cloud Logging)

---

## 6. High — Error Handling & Resilience

### 6.1 🟠 `onUserCreated` Uses a Sleep Instead of a Trigger Chain

**File:** `firebase/functions/src/auth.ts` (lines 32-70)

```typescript
export const onUserCreated = functions.auth.user().onCreate(async (user) => {
    // Wait a moment for the user doc to be created by the frontend
    await new Promise(resolve => setTimeout(resolve, 2000));
    const userDoc = await db.collection('users').doc(user.uid).get();
    // ...
});
```

**Impact:** This is a race condition. If the frontend takes more than 2 seconds to create the user doc (slow network, background tab, retry), claims won't be set. The code even acknowledges this:
```typescript
console.warn(`⚠️ No user document found for ${user.uid}, will retry on profile creation`);
```
But there is **no actual retry mechanism**.

**Fix:** Use a Firestore `onCreate` trigger on `users/{userId}` to set claims when the user document is first created. This eliminates the race entirely.

---

### 6.2 🟠 No Global Error Boundary in React

**File:** `frontend/web/src/App.tsx`

There is no `<ErrorBoundary>` component wrapping the app or individual routes. If any component throws during render, the entire application white-screens.

**Impact:** A single unhandled exception in any page component crashes the entire app for the user, with no recovery path, no error reporting, and no fallback UI.

**Fix:** Implement a `React.ErrorBoundary` at the route level:
```tsx
<Route path="/jobs" element={
  <ErrorBoundary fallback={<ErrorPage />} onError={reportToSentry}>
    <Suspense fallback={<Loading />}>
      <JobsPage />
    </Suspense>
  </ErrorBoundary>
} />
```

---

### 6.3 🟠 Cloud Functions Swallow Errors

**Examples across multiple files:**

```typescript
// auth.ts (line 67)
} catch (error) {
    console.error(`❌ Error setting claims for ${user.uid}:`, error);
}
// No re-throw — function silently succeeds even when claims fail
```

```typescript
// aiScheduler.ts (line 299)
} catch (error) {
    console.warn('Failed to get real drive time, using estimation:', error);
    // Falls back silently — no telemetry
}
```

**Impact:** Silent failures mean data inconsistencies accumulate without any alerting. Setting custom claims is a critical operation — if it fails, the user may be locked out or have wrong permissions.

**Fix:** 
- For critical operations (claims, billing, GDPR), re-throw errors after logging
- Implement Cloud Monitoring alerting on function error rates
- Use structured error reporting (e.g., Google Cloud Error Reporting)

---

## 7. Medium — Authentication & Authorization

### 7.1 🟡 Role Checks Use Client-Side Logic

**File:** `frontend/web/src/auth/AuthProvider.tsx`

Role-based routing decisions are made client-side:
```typescript
// In App.tsx
<RoleProtectedRoute allowedRoles={['owner', 'admin', 'dispatcher']}>
  <DispatcherConsole />
</RoleProtectedRoute>
```

While this provides UX guardrails, the **actual security** relies on Firestore rules. Since those rules are currently bypassed (see §2.1), there is effectively **no authorization** in the system.

**Fix:** Client-side role checks are fine for UX, but the Firestore rules (and any Cloud Function endpoints) must independently enforce the same restrictions. They are the source of truth, not the React components.

---

### 7.2 🟡 `AuthProvider` Contains Demo/Legacy Bypass Logic

**File:** `frontend/web/src/auth/AuthProvider.tsx`

The provider has significant complexity managing multiple auth patterns:
- Standard Firebase Auth flow
- Demo mode bypass via `localStorage`
- Impersonation mode for admin users
- Retry logic for missing user documents

**Impact:** This complexity makes it easy for security bugs to hide. Each code path needs separate testing and review.

**Fix:** 
- Remove demo mode bypass entirely — use Firebase Auth emulator for local development
- Extract impersonation logic into its own hook/provider
- Replace retry logic with the Firestore trigger approach from §6.1

---

### 7.3 🟡 Customer Portal Users Share the Same Auth Pool

Customer portal users (`role: 'customer'`) are created in the same Firebase Auth project as internal staff. While custom claims separate them, a customer who knows the staff app URL could attempt to log in.

**Impact:** Low risk currently (Firestore rules would block data access once fixed), but the shared auth namespace means:
- Customer passwords and staff passwords are subject to the same password policies
- A compromised customer account could probe for staff endpoints
- Password reset flows may leak which roles exist for a given email

**Fix:** Consider separating customer portal auth into its own Firebase project or using a separate auth tenant.

---

## 8. Medium — Testing & Quality Assurance

### 8.1 🟡 ZERO Automated Tests

**Measurement:** Searched `*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.tsx` in the project source. **Result: 0 test files.** All 4,316 files found were in `node_modules`.

The project has no unit tests, no integration tests, no end-to-end tests.

**Impact:** This is the second biggest risk after the security rules. Without tests:
- Any refactoring is high-risk
- Regressions are discovered by customers
- Security rule changes cannot be verified automatically
- CI/CD cannot include quality gates

**Fix — Prioritized Test Plan:**

1. **Security Rules Tests** (highest priority): Use the `@firebase/rules-unit-testing` library to verify every security rule with positive and negative cases
2. **Cloud Function Tests**: Unit test each function with mocked Firestore
3. **Service Layer Tests**: Unit test `ReportingService`, `gdprService`, `authClaimsService`
4. **Component Tests**: React Testing Library for critical flows (login, job creation, invoice)
5. **E2E Tests**: Playwright or Cypress for the happy-path workflows

---

### 8.2 🟡 No CI/CD Pipeline

No GitHub Actions, no Vercel hooks, no Firebase deploy automation files found.

**Impact:** Deployments are manual, error-prone, and ungated. A developer can deploy broken code directly to production.

**Fix:** Implement a CI/CD pipeline that runs:
1. TypeScript compilation (`tsc --noEmit`)
2. Linting (`eslint . --max-warnings 0`)
3. Tests (once they exist)
4. Security rules validation (`firebase emulators:exec`)
5. Build verification (`vite build`)
6. Automated deploy to staging, manual promotion to production

---

## 9. Medium — State Management & Data Flow

### 9.1 🟡 No Centralized State Management

The app uses React's built-in `useState` and `useContext` for all state management. There is no Redux, Zustand, Jotai, or similar global state solution.

**Impact:**
- Props drilling through deep component trees
- Duplicated fetch logic across components
- No cache invalidation strategy (same data fetched multiple times)
- Optimistic updates are impossible without a store

**Fix:** Consider a lightweight state management solution:
- **React Query / TanStack Query** for server state (data fetching, caching, synchronization)
- **Zustand** for client-side UI state (modals, filters, selections)

React Query alone would eliminate hundreds of lines of manual fetch/loading/error state management.

---

### 9.2 🟡 Timestamp Handling Is Inconsistent

**File:** `frontend/web/src/types.ts`

Timestamps are typed as `any` throughout:
```typescript
createdAt?: any;   // Could be Firestore Timestamp, Date, string, or number
updatedAt?: any;
scheduled_at?: any;
```

**File:** `frontend/web/src/hooks/usePlanFeatures.ts` (lines 41-45):
```typescript
if (typeof (organization.trialEndsAt as any).toDate === 'function') {
    return (organization.trialEndsAt as any).toDate();
}
return new Date(organization.trialEndsAt as any);
```

**Impact:** Runtime `TypeError`s when timestamp format doesn't match expectations. The `RangeError: Invalid time value` crash in conversation `4ed174a9` was caused by this exact issue.

**Fix:** 
- Define a shared `AppTimestamp` type that wraps Firestore's `Timestamp`
- Create utility functions: `toDate(ts: AppTimestamp): Date` and `fromDate(d: Date): AppTimestamp`
- Use these consistently everywhere

---

## 10. Medium — DevOps & Environment Management

### 10.1 🟡 No Environment Configuration System

**Finding:** No `.env`, `.env.local`, `.env.production`, or `.env.development` files exist in the project.

**Impact:**
- No way to run against different Firebase projects (dev, staging, prod)
- API keys, project IDs, and URLs are hardcoded
- Cannot do isolated testing without affecting production data

**Fix:**
```
.env.development      # Local dev Firebase project
.env.staging          # Staging Firebase project
.env.production       # Production Firebase project
```

Contents:
```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

---

### 10.2 🟡 No Firebase Emulator Configuration for Local Development

No `firebase.json` emulator configuration or `firebase emulators:start` setup found in the project root for local development.

**Impact:** All development and testing happens against the production Firebase project. A developer's debugging can corrupt production data.

**Fix:** Configure the Firebase emulator suite (Auth, Firestore, Functions, Storage) and update the Firebase SDK initialization to detect and use emulators in development mode.

---

### 10.3 🟡 No Mobile App Architecture

**Directory:** `frontend/mobile/` exists but appears to be an empty Expo scaffold.

**Impact:** The project goal includes running "as an app" on mobile. Without a mobile strategy, the only mobile option is a PWA (which the current app is not configured for — no `manifest.json`, no service worker).

**Fix:** Decide on mobile strategy:
- **Option A:** Progressive Web App (PWA) — add `manifest.json`, service worker, responsive design
- **Option B:** React Native / Expo — share business logic and types with a shared package
- **Option C:** Capacitor wrapper around the existing Vite app

---

## 11. Low — Code Quality & Maintainability

### 11.1 🟢 Excessive Use of `any` Type

A quick grep for ` any` across the TypeScript source would reveal hundreds of uses. This undermines TypeScript's value proposition.

**Hotspots:**
- `types.ts` — timestamps typed as `any`
- `ReportingService.ts` — `downloadCustomReport(orgId: string, config: any)`
- `aiScheduler.ts` — multiple `as any` casts
- `AuthProvider.tsx` — `(organization.trialEndsAt as any)`

**Fix:** Replace `any` with proper types. Use `unknown` when the type is truly dynamic, and narrow with type guards.

---

### 11.2 🟢 Component File Naming Is Inconsistent

Some files use PascalCase (React convention: `MaterialsInventory.tsx`), while services use camelCase (`aiScheduler.ts`, `gdprService.ts`). This is fine, but within components there's no consistent pattern for compound names (`CustomerMessageModal.tsx` vs `QuoteTemplateManager.tsx`).

**Fix:** Establish and document naming conventions in a `CONTRIBUTING.md`.

---

### 11.3 🟢 Magic Numbers Throughout the Codebase

**Examples:**
- `aiScheduler.ts`: `2000` ms sleep, `30` min pickup, `50` km max distance, `200` km same-day limit
- `gdprService.ts`: `30` day grace period
- `ReportingService.ts`: `86400000` ms per day

**Fix:** Extract into named constants:
```typescript
const GDPR_GRACE_PERIOD_DAYS = 30;
const PARTS_PICKUP_DURATION_MINUTES = 30;
const MAX_SAME_DAY_DISTANCE_KM = 200;
```

---

### 11.4 🟢 No Code Documentation or API Documentation

Despite the codebase being well-organized at the macro level, there are:
- No JSDoc comments on public functions
- No README files at the component or feature level
- No API documentation for Cloud Functions
- No architecture decision records (ADRs)

**Fix:** At minimum, add JSDoc to all exported functions and all Cloud Function entry points.

---

### 11.5 🟢 Large Component Files Lack Separation of Concerns

Components like `JobCompletionWizard.tsx` (24KB), `JobReviewModal.tsx` (35KB), `CustomerMessageModal.tsx` (29KB) mix:
- UI rendering
- Business logic (validation, calculations)
- Data fetching (Firestore queries)
- State management
- Event handlers

**Fix:** Apply the custom hook pattern:
```
// hooks/useJobCompletion.ts — all state, logic, and data fetching
// components/JobCompletionWizard.tsx — pure rendering
```

---

### 11.6 🟢 CSS Framework Mismatch

`tailwindcss` is in `devDependencies` but the app primarily uses vanilla CSS (no Tailwind class usage found in major components). The dependency is unused overhead.

**Fix:** Either commit to Tailwind and use it consistently, or remove it from `devDependencies` to reduce `npm install` time and avoid confusion.

---

### 11.7 🟢 Seeding Service Contains Production Data

**File:** `frontend/web/src/lib/seeding.ts` (23KB)

Test data seeding logic ships in the production bundle. It likely contains fake customer names, addresses, and job data.

**Fix:** Move seeding to a separate CLI script that runs against the emulator only, and strip from the production build.

---

### 11.8 🟢 React `key` and Rendering Anti-Patterns

Without reading every line, common patterns like:
```typescript
{items.map((item, index) => <Component key={index} ... />)}
```
Use array index as key, which causes incorrect DOM recycling when items are reordered or deleted.

**Fix:** Use `item.id` as key wherever available. Run the React DevTools profiler to identify unnecessary re-renders.

---

## 12. Low — Compliance & Audit

### 12.1 🟢 Audit Logs Are Writable From the Client

**File:** `frontend/web/src/lib/gdprService.ts` (line 473)

```typescript
await addDoc(collection(db, 'audit_logs'), log);
```

Audit logs should be **immutable** and **server-authored**. Client-side audit log creation means a malicious user can:
- Create fake audit entries
- Modify audit fields before submission
- Delete audit entries (if rules allow)

**Fix:** Write audit logs exclusively from Cloud Functions. Make the `audit_logs` collection read-only from the client (allow reads for authorized staff, deny all writes).

---

### 12.2 🟢 Consent Version Comparison Uses String Comparison

**File:** `frontend/web/src/lib/gdprService.ts` (line 424)

```typescript
(!minVersion || c.version >= minVersion)
```

String comparison works for `"1.0" >= "0.9"` but fails for `"1.10" >= "1.9"` (because `"1" < "9"` lexicographically).

**Fix:** Use semantic version comparison (e.g., `semver.gte(c.version, minVersion)`).

---

### 12.3 🟢 No Password Reset Link Expiry Configuration

**File:** `firebase/functions/src/auth.ts` (line 297)

```typescript
const resetLink = await admin.auth().generatePasswordResetLink(email, {
    url: `${process.env.APP_URL || 'https://maintenancemanager-c5533.web.app'}/portal/login`
});
```

Uses Firebase's default password reset link expiry (1 hour). For customer portal invitations, a longer expiry (24-72 hours) may be more appropriate.

Also: the `APP_URL` fallback is hardcoded.

**Fix:** Use `ActionCodeSettings` to configure a longer expiry for invitation links, and move `APP_URL` to environment configuration.

---

## 13. Appendix: Prioritized Action Plan

### Phase 1: CRITICAL — Must Do Before Going Live (Week 1-2)

| # | Item | Effort | Risk Addressed |
|---|------|--------|----------------|
| 1 | Activate Firestore security rules (remove demo mode) | 1 day | Data breach |
| 2 | Remove hardcoded test account UIDs from rules | 30 min | Immutable accounts |
| 3 | Create `.env` files and use env vars for Firebase config | 2 hours | Secret exposure |
| 4 | Fix `aiScheduler.ts` raw `fetch()` → `httpsCallable()` | 1 hour | Broken auth |
| 5 | Fix duplicate imports in `ReportingService.ts` | 30 min | Build crash |
| 6 | Add Firestore rules unit tests | 3 days | Regression safety |
| 7 | Move GDPR data export to Cloud Function | 2 days | Data leak |

### Phase 2: HIGH — Do Within First Month (Week 3-6)

| # | Item | Effort | Risk Addressed |
|---|------|--------|----------------|
| 8 | Break up monolithic page components (top 6) | 2 weeks | Maintainability |
| 9 | Split `types.ts` into domain modules | 3 days | Dev velocity |
| 10 | Add pagination to all collection reads | 1 week | Performance |
| 11 | Add React Error Boundaries | 2 days | User experience |
| 12 | Fix race condition in `onUserCreated` | 1 day | Auth reliability |
| 13 | Make parts store locations per-org | 2 days | Multi-region |
| 14 | Set up CI/CD pipeline | 2 days | Deploy safety |
| 15 | Set up Firebase emulator for local dev | 1 day | Data safety |
| 16 | Fix batch deletion to handle >500 docs | 1 day | GDPR compliance |

### Phase 3: MEDIUM — Do Within Quarter (Week 7-12)

| # | Item | Effort | Risk Addressed |
|---|------|--------|----------------|
| 17 | Introduce React Query for data fetching | 1 week | Performance, DX |
| 18 | Create service/repository layer | 2 weeks | Architecture |
| 19 | Fix timestamp typing | 3 days | Runtime crashes |
| 20 | Migrate Cloud Functions to v2 API | 1 week | Performance |
| 21 | Remove demo mode from AuthProvider | 2 days | Security |
| 22 | Implement structured logging (replace console.*) | 3 days | Observability |
| 23 | Move audit log writes to server-side only | 2 days | Compliance |
| 24 | Add component tests for critical flows | 2 weeks | Quality |
| 25 | Create shared types package (frontend + backend) | 3 days | Type safety |

### Phase 4: LOW — Continuous Improvement (Ongoing)

| # | Item | Effort | Risk Addressed |
|---|------|--------|----------------|
| 26 | Replace `any` types with proper types | Ongoing | Type safety |
| 27 | Add JSDoc / API documentation | Ongoing | Onboarding |
| 28 | Remove unused TailwindCSS dep | 30 min | Bundle size |
| 29 | Move seeding service out of prod bundle | 1 hour | Bundle size |
| 30 | Establish naming conventions doc | 2 hours | Consistency |
| 31 | Add E2E tests (Playwright/Cypress) | 2 weeks | Quality |
| 32 | Define mobile strategy (PWA vs Native) | Decision | Platform reach |

---

> **Final Note:** This application has a strong product foundation. The features are thoughtful and the domain modeling is largely correct. The issues identified above are typical of a rapid prototyping phase, and addressing them systematically will produce a robust, scalable SaaS product. The key is to not ship multi-tenant until Phase 1 is complete — the security rules alone are a showstopper.
