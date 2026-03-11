# DispatchBox Plan Features - Testing Guide

**Date:** December 6, 2025
**Dev Server:** http://localhost:5173
**Features:** Plan-based feature gating + Trial expiry handling

---

## 🧪 Test Accounts

### Existing Accounts (Demo Login - Password: any)

These accounts use **demo authentication** - any password will work since they end with `@example.com`:

#### Dispatcher/Admin Account
- **Email:** `admin@example.com`
- **Password:** any (demo mode)
- **Role:** Dispatcher
- **Access:** Full access (depends on organization plan)

#### Technician Accounts (Corporate)
- **Email:** `leilani.corp@example.com` - Leilani Kai
- **Email:** `kimo.corp@example.com` - Kimo Akana
- **Email:** `stitch.corp@example.com` - Stitch Experiment
- **Password:** any (demo mode)
- **Role:** Technician (Corporate)
- **Access:** Team member view

#### Technician Accounts (Solopreneur)
- **Email:** `nani.solo@example.com` - Nani Pelekai
- **Email:** `keanu.solo@example.com` - Keanu Reeves
- **Password:** any (demo mode)
- **Role:** Technician (Solopreneur)
- **Access:** Full solo business features

---

## 🎯 Testing Scenarios

### Scenario 1: Individual Plan User

**Setup:**
1. Go to http://localhost:5173/signup
2. Select **"Individual"** plan
3. Create a new account with your email
4. Complete signup process

**Expected Behavior:**
- ✅ Can see: Dashboard, New Job, Invoices, Customers, Data Manager
- ❌ Cannot see: Schedule (Dispatcher Console), Techs (Team Management)
- ❌ Navigating to `/dispatcher` shows upgrade prompt
- ❌ Navigating to `/techs` shows upgrade prompt

**Navigation Links to Verify:**
- Dashboard ✅
- New Job ✅
- Invoices ✅
- Customers ✅
- Data Manager ✅
- Schedule ❌ (hidden)
- Techs ❌ (hidden)

---

### Scenario 2: Small Business Plan User

**Setup:**
1. Go to http://localhost:5173/signup
2. Select **"Small Business"** plan
3. Create a new account with your email
4. Complete signup process

**Expected Behavior:**
- ✅ Can see: Dashboard, Schedule, New Job, Invoices, Customers, Data Manager, Techs
- ✅ Can access `/dispatcher` (Dispatcher Console)
- ✅ Can access `/techs` (Team Management)
- ✅ Limited to 5 technicians (max)

**Navigation Links to Verify:**
- Dashboard ✅
- Schedule ✅ (shows dispatcher console)
- New Job ✅
- Invoices ✅
- Customers ✅
- Data Manager ✅
- Techs ✅ (shows team management)

---

### Scenario 3: Enterprise Plan User

**Setup:**
1. Go to http://localhost:5173/signup
2. Select **"Enterprise"** plan
3. Create a new account with your email
4. Complete signup process

**Expected Behavior:**
- ✅ All features unlocked
- ✅ Unlimited technicians
- ✅ Advanced analytics (when implemented)
- ✅ Custom integrations (when implemented)

**Navigation Links to Verify:**
- Dashboard ✅
- Schedule ✅
- New Job ✅
- Invoices ✅
- Customers ✅
- Data Manager ✅
- Techs ✅

---

### Scenario 4: Trial Plan - Active (30 days)

**Setup:**
1. Go to http://localhost:5173/signup
2. Select **"Free Trial"** plan
3. Create a new account with your email
4. Complete signup process

**Expected Behavior:**
- ✅ All features unlocked (full access for 30 days)
- ⚠️ No trial banner (if more than 7 days remain)
- ✅ Can access all dispatcher and team features

**To Simulate Near-Expiry:**
You'll need to manually update the `trialEndsAt` field in Firestore to test warning banners.

---

### Scenario 5: Trial Plan - Expiring Soon (< 7 days)

**Setup:**
1. Use Firebase Console to update organization `trialEndsAt` to 5 days from now
2. Login with trial account
3. Refresh the page

**Expected Behavior:**
- ⚠️ Yellow warning banner appears at top
- Banner shows: "**5 days left** in your trial. Upgrade to unlock full access."
- ✅ "View Plans" button visible
- ✅ Can dismiss banner (X button)
- ✅ All features still work

**Banner Color Codes:**
- 7+ days: No banner
- 4-7 days: Yellow banner
- 1-3 days: Orange banner
- 0 days: Orange banner ("Last day!")
- Expired: Red banner (cannot dismiss)

---

### Scenario 6: Trial Plan - Expired

**Setup:**
1. Use Firebase Console to update organization `trialEndsAt` to yesterday
2. Login with trial account
3. Refresh the page

**Expected Behavior:**
- 🔴 Red banner appears: "**Your trial has expired.** Upgrade now to continue using all features."
- ❌ Cannot dismiss banner
- ❌ "Upgrade Now" button (primary action)
- ❌ All premium features blocked:
  - Schedule (Dispatcher Console) - hidden in nav
  - Techs (Team Management) - hidden in nav
  - Accessing `/dispatcher` or `/techs` shows upgrade prompt

**Features After Expiry:**
- ✅ Dashboard
- ✅ New Job
- ✅ Invoices
- ✅ Customers
- ✅ Data Manager
- ❌ Schedule (blocked)
- ❌ Techs (blocked)

---

## 🔧 Manual Testing Checklist

### Plan Feature Gating
- [ ] Individual plan hides dispatcher/team features
- [ ] Small Business shows dispatcher/team features
- [ ] Enterprise shows all features
- [ ] Trial shows all features (when active)
- [ ] Trial blocks premium features when expired

### Navigation Menu
- [ ] Individual: 5 menu items (no Schedule, no Techs)
- [ ] Small Business: 7 menu items (includes Schedule + Techs)
- [ ] Links dynamically update based on plan
- [ ] Mobile menu also respects plan features

### Route Protection
- [ ] Individual user accessing `/dispatcher` → sees upgrade prompt
- [ ] Individual user accessing `/techs` → sees upgrade prompt
- [ ] Small Business user can access both routes
- [ ] Upgrade prompt has "Go Back" and "Return to Dashboard" buttons

### Trial Banner
- [ ] No banner when trial has 8+ days
- [ ] Yellow banner when 7-4 days remain
- [ ] Orange banner when 3-1 days remain
- [ ] Orange banner on last day ("Last day!")
- [ ] Red banner when expired
- [ ] Dismissible when active (X button works)
- [ ] Not dismissible when expired
- [ ] Banner persists across page navigation

### Organization Data Loading
- [ ] Organization loads on login
- [ ] Plan is correctly displayed in auth context
- [ ] Trial end date is properly parsed
- [ ] Console shows "Loaded organization" log

---

## 🐛 Troubleshooting

### Banner Not Showing
1. Check organization exists in Firestore `organizations` collection
2. Verify `plan: 'trial'` is set
3. Ensure `trialEndsAt` is a Firestore Timestamp
4. Check browser console for errors

### Features Not Gating Properly
1. Verify organization is loaded (check console logs)
2. Check `org_id` matches between user and organization
3. Ensure plan name matches exactly: 'individual', 'small_business', 'enterprise', 'trial'
4. Check `usePlanFeatures` hook is working (add console.log)

### Navigation Not Updating
1. Clear browser cache
2. Hard refresh (Ctrl+Shift+R)
3. Check that Navigation component imports `usePlanFeatures`
4. Verify `hasFeature()` is being called correctly

---

## 📊 Firebase Console Quick Links

### View Organizations
```
https://console.firebase.google.com/project/maintenancemanager-c5533/firestore/data/~2Forganizations
```

### View Users
```
https://console.firebase.google.com/project/maintenancemanager-c5533/firestore/data/~2Fusers
```

### Update Trial End Date (Firestore Console)
1. Navigate to organizations collection
2. Find the test organization
3. Edit `trialEndsAt` field
4. Set to Timestamp value (e.g., 5 days from now)

---

## 🔍 Testing with Browser DevTools

### Check Organization in Console
```javascript
// In browser console while logged in
console.log('Organization:', window.localStorage);
```

### Monitor Auth State
Open Network tab and filter by:
- `firestore` - See organization fetch
- `auth` - See authentication flow

### Check Feature Access
```javascript
// In React DevTools
// Find AuthProvider component
// Check organization.plan value
```

---

## ✅ Success Criteria

All tests pass when:
1. ✅ Individual plan users cannot access team features
2. ✅ Navigation menu updates correctly per plan
3. ✅ Route protection blocks unauthorized access
4. ✅ Trial banner appears at correct times
5. ✅ Expired trial blocks premium features
6. ✅ Banner is dismissible (except when expired)
7. ✅ Upgrade prompts display correctly
8. ✅ All plans can access basic features

---

## 🎬 Quick Start Testing

**Fastest way to test:**

1. **Start dev server** (already running at http://localhost:5173)

2. **Test Individual Plan:**
   ```
   1. Go to /signup
   2. Choose "Individual" plan
   3. Sign up with test email
   4. Verify navigation shows 5 items (no Schedule/Techs)
   5. Try accessing /dispatcher → should show upgrade prompt
   ```

3. **Test Small Business Plan:**
   ```
   1. Sign out
   2. Go to /signup
   3. Choose "Small Business" plan
   4. Sign up with different email
   5. Verify navigation shows 7 items (includes Schedule/Techs)
   6. Access /dispatcher → should work
   ```

4. **Test Trial Banner:**
   ```
   1. Sign up with "Free Trial" plan
   2. Use Firebase Console to modify trialEndsAt
   3. Set to 3 days from now
   4. Refresh page
   5. Orange banner should appear
   ```

---

**Questions?** Check the implementation files:
- [usePlanFeatures.ts](frontend/web/src/hooks/usePlanFeatures.ts)
- [Navigation.tsx](frontend/web/src/components/Navigation.tsx)
- [TrialBanner.tsx](frontend/web/src/components/TrialBanner.tsx)
- [PlanProtectedRoute.tsx](frontend/web/src/components/PlanProtectedRoute.tsx)
