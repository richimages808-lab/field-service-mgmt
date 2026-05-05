---
name: firestore_security_rules
description: Mandatory security patterns for all Firestore rules — org isolation, role checks, and forbidden patterns.
---

# Firestore Security Rules Standard

Every time Firestore security rules are created or modified, these patterns MUST be followed. Violations of these rules can expose customer data across organizations.

## Critical: Demo Mode is FORBIDDEN

The `firestore.rules` file contains commented-out "DEMO MODE" bypass functions. These must NEVER be re-enabled:

```javascript
// ❌ NEVER DO THIS — any signed-in user becomes "staff"
function isStaff() {
  return isSignedIn();
}

// ✅ CORRECT — checks the user's custom claims
function isStaff() {
  return getRole() in ['owner', 'admin', 'dispatcher', 'technician'];
}
```

## Rule 1: Every Collection Must Enforce `org_id`

When adding a new collection match block, ALL four operations must include org-level isolation:

```javascript
match /newCollection/{docId} {
  // Read: staff in same org
  allow read: if isSignedIn() && isStaff() && docBelongsToUserOrg();
  
  // Create: staff in same org, document must carry org_id
  allow create: if isSignedIn() && isStaff() && newDocHasUserOrg();
  
  // Update: staff in same org
  allow update: if isSignedIn() && isStaff() && docBelongsToUserOrg();
  
  // Delete: admin only, in same org
  allow delete: if isSignedIn() && isAdmin() && docBelongsToUserOrg();
}
```

**Never use `isSignedIn()` alone** as a complete rule. It must always be combined with `isStaff()`, `isAdmin()`, or a role-specific check AND `docBelongsToUserOrg()`.

## Rule 2: Never Hardcode UIDs

Do not add user UIDs to security rules for any reason (test accounts, admin overrides, etc.). Manage special accounts through:
- Firebase Auth's `disabled` flag
- Custom claims (`admin: true`)
- The Admin SDK in Cloud Functions

## Rule 3: Audit Logs Are Server-Write-Only

```javascript
match /audit_logs/{logId} {
  allow read: if isSignedIn() && isAdmin() && docBelongsToUserOrg();
  allow write: if false;  // Only Cloud Functions can write
}
```

## Rule 4: Helper Function Reference

These are the correct production helper functions (in `firestore.rules`):

| Function | Purpose | ⚠️ Warning |
|---|---|---|
| `isSignedIn()` | Checks `request.auth != null` | Never use alone |
| `getOrgId()` | Gets org_id from custom claims | Returns null if claims not set |
| `getRole()` | Gets role from custom claims | Returns null if claims not set |
| `isStaff()` | Role is owner/admin/dispatcher/tech | Must check claims, NOT just `isSignedIn()` |
| `isAdmin()` | Role is owner or admin | — |
| `docBelongsToUserOrg()` | Compares doc's `org_id` to user's claim | Use on read/update/delete |
| `newDocHasUserOrg()` | Verifies incoming doc has user's `org_id` | Use on create |

## Checklist When Modifying Rules

- [ ] No `isSignedIn()` used as a standalone rule
- [ ] Every collection has `docBelongsToUserOrg()` on read/update/delete
- [ ] Every collection has `newDocHasUserOrg()` on create
- [ ] No hardcoded UIDs anywhere
- [ ] Demo mode functions are NOT active (commented-out production code is the real code)
- [ ] `audit_logs` remains `allow write: if false`
