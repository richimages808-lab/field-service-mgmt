---
name: error_boundaries
description: Standards for error handling in React components and Cloud Functions to prevent white-screen crashes and silent failures.
---

# Error Handling & Boundaries

The application currently has NO global error boundary, meaning any unhandled exception in a React component will crash the entire application with a white screen and no recovery path.

## React Error Boundaries

### Every Route Must Have an ErrorBoundary

When adding or modifying route definitions in `App.tsx`:

```tsx
// ✅ REQUIRED pattern for route-level components
<Route path="/jobs" element={
    <ErrorBoundary fallback={<ErrorFallback />}>
        <Suspense fallback={<LoadingSpinner />}>
            <JobsPage />
        </Suspense>
    </ErrorBoundary>
} />
```

### ErrorBoundary Component Location

The ErrorBoundary component should live at: `frontend/web/src/components/ErrorBoundary.tsx`

### Feature-Level Boundaries

For complex features within a page (e.g., a map widget, chart, or third-party integration), wrap them individually so a failure doesn't take down the whole page:

```tsx
<div className="dashboard">
    <ErrorBoundary fallback={<WidgetError name="Schedule" />}>
        <ScheduleWidget />
    </ErrorBoundary>
    <ErrorBoundary fallback={<WidgetError name="Revenue Chart" />}>
        <RevenueChart />
    </ErrorBoundary>
</div>
```

## Try/Catch Rules

### Critical Operations — ALWAYS Re-throw

Operations where failure means data corruption, security issues, or compliance violations:

```typescript
// Auth claims, billing, GDPR, data mutations
try {
    await admin.auth().setCustomUserClaims(uid, claims);
} catch (error) {
    logger.error("Failed to set claims", { uid, error });
    throw error;  // ← MUST re-throw
}
```

Critical operation categories:
- Firebase Auth custom claims
- Stripe/billing operations
- GDPR data export and deletion
- Firestore document writes that affect data integrity

### Non-Critical Operations — Log and Continue

Operations where failure is disappointing but not dangerous:

```typescript
// Notifications, analytics, UI enhancements
try {
    await sendPushNotification(userId, message);
} catch (error) {
    logger.warn("Push notification failed", { userId, error });
    // Continue — don't block the user
}
```

Non-critical categories:
- Push notifications
- Analytics events
- Cached value refreshes
- Animation or visual enhancements

### Forbidden Pattern: Empty Catch

```typescript
// ❌ NEVER do this
try { ... } catch (e) { }

// ❌ NEVER do this either
try { ... } catch (e) { console.log(e); }

// ✅ MINIMUM acceptable
try { ... } catch (error) {
    logger.warn("Operation failed", { context: "featureName", error });
}
```
