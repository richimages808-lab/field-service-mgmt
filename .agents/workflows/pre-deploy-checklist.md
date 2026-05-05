---
description: Pre-deployment verification checklist — validates code, security rules, and build integrity before deploying to Firebase.
---

# Pre-Deploy Checklist Workflow

Run this workflow before every deployment to catch errors that would otherwise reach production. This serves as a manual CI/CD gate until GitHub Actions is configured.

## Step 1: TypeScript Compilation Check

```powershell
cd x:\Antigravity\Projects\field-service-mgmt\frontend\web
npx tsc --noEmit
```

If there are type errors, fix them before proceeding. Do NOT deploy with type errors.

## Step 2: Lint Check

```powershell
cd x:\Antigravity\Projects\field-service-mgmt\frontend\web
npm run lint
```

Fix any lint errors. Warnings are acceptable but errors are not.

## Step 3: Production Build

```powershell
cd x:\Antigravity\Projects\field-service-mgmt\frontend\web
npm run build
```

If the build fails, do NOT proceed with deployment. Fix all build errors first.

## Step 4: Security Rules Verification

Before deploying, verify the Firestore security rules are not in demo mode:

```powershell
cd x:\Antigravity\Projects\field-service-mgmt\firebase
Select-String -Path "firestore.rules" -Pattern "DEMO MODE" -CaseSensitive:$false
```

If "DEMO MODE" appears in any **uncommented** lines, STOP deployment. The production rules must use the real helper functions, not the demo bypass.

## Step 5: Copy Build to Firebase Public

```powershell
Copy-Item -Path "x:\Antigravity\Projects\field-service-mgmt\frontend\web\dist\*" -Destination "x:\Antigravity\Projects\field-service-mgmt\firebase\public" -Recurse -Force
```

## Step 6: Deploy

### Hosting Only (frontend changes)
```powershell
cd x:\Antigravity\Projects\field-service-mgmt\firebase
npx firebase-tools deploy --only hosting
```

### Functions Only (backend changes)
```powershell
cd x:\Antigravity\Projects\field-service-mgmt\firebase
npx firebase-tools deploy --only functions
```

### Both (full deploy)
```powershell
cd x:\Antigravity\Projects\field-service-mgmt\firebase
npx firebase-tools deploy --only hosting,functions
```

### Test Channel (preview/staging)
```powershell
cd x:\Antigravity\Projects\field-service-mgmt\firebase
npx firebase-tools hosting:channel:deploy test
```

## Step 7: Post-Deploy Verification

After deployment:
1. Open the production URL: `https://maintenancemanager-c5533.web.app`
2. Verify the login page loads
3. Log in using a test account (see `test_user_logons` skill)
4. Verify the feature you deployed works correctly

Provide both URLs to the user:
- **Production:** `https://maintenancemanager-c5533.web.app`
- **Test Channel:** (the URL printed by the channel deploy command)

## When to Skip Steps

- **Hotfix (production is broken):** Skip steps 2 (lint) and the test channel — go straight to production after build succeeds
- **Functions-only change:** Skip steps 1-5, go straight to functions deploy
- **Rules-only change:** Deploy with `--only firestore:rules` after step 4
