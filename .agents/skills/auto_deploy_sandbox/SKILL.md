---
name: auto-deploy-sandbox
description: Automatically deploy to the staging/sandbox environment after completing any new development or feature work. Reports the staging URL and reminds that production was NOT updated.
---

# Auto-Deploy to Sandbox After Development

## When This Skill Triggers

This skill activates **after completing any new development work**, including but not limited to:
- New features or UI components
- Bug fixes
- Layout or styling changes
- Cloud Functions updates
- Firestore rules changes
- Any code modification that affects the deployed application

## Workflow

### Step 1: Build for Staging
After all code changes are complete and TypeScript compiles clean (`npx tsc --noEmit`), build the frontend for the staging environment:

```powershell
# From frontend/web/
npx vite build --mode staging
```

This loads `.env.staging` which points to the `dispatch-box-sb` Firebase project.

### Step 2: Sync Build Output
Copy the build output to the Firebase public directory:

```powershell
$DistDir = "x:\Antigravity\Projects\field-service-mgmt\frontend\web\dist"
$PublicDir = "x:\Antigravity\Projects\field-service-mgmt\firebase\public"
if (Test-Path $PublicDir) { Remove-Item -Path "$PublicDir\*" -Recurse -Force }
Copy-Item -Path "$DistDir\*" -Destination $PublicDir -Recurse -Force
```

### Step 3: Deploy to Staging
Switch to the staging project and deploy. Determine what to deploy based on what changed:

- **Frontend-only changes**: Deploy hosting only
- **Cloud Functions changes**: Add `functions` to the deploy targets
- **Firestore/Storage rules changes**: Add `firestore,storage` to the deploy targets

```powershell
# From firebase/ directory
npx firebase use staging
npx firebase deploy --only hosting --project dispatch-box-sb
npx firebase use default   # ALWAYS switch back to production after
```

### Step 4: Report to the User
After a successful staging deploy, you MUST include ALL of the following in your response:

1. ✅ Confirm the sandbox was updated
2. 🔗 Provide the live URL: **https://dispatch-box-sb.web.app**
3. ⚠️ Remind that **production was NOT updated** — the production site at `https://maintenancemanager-c5533.web.app` still has the previous version
4. 📋 Briefly list what changed in this deploy

Use this exact format:

```
---
### 🚀 Sandbox Updated
- **URL**: https://dispatch-box-sb.web.app
- **What changed**: [brief description of changes]
- ⚠️ **Production was NOT updated.** The live site at https://maintenancemanager-c5533.web.app still has the previous version. Let me know when you're ready to push to production.
---
```

### Step 5: Switch Back to Production
ALWAYS ensure the Firebase CLI is pointed back at the production project after a staging deploy:

```powershell
npx firebase use default
```

This prevents accidental production deploys from affecting the wrong project.

## Important Notes

- **Never skip the staging deploy** — every development change should be deployed to staging automatically.
- **Never deploy to production** without explicit user approval. Only staging is automatic.
- **If the staging deploy fails**, report the error to the user and troubleshoot before continuing.
- **If Cloud Functions were modified**, include `--only hosting,functions` in the deploy command.
- **Test account credentials** for the sandbox:
  - Admin: `test@example.com` / `test123456`
  - Dispatcher: `dispatcher@test.com` / `Test123!`
  - Corp Tech: `tech@test.com` / `Test123!`
  - Solo Tech: `solo@test.com` / `Test123!`
