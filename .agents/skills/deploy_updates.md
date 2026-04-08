---
name: deploy_updates
description: How to correctly deploy web and backend code to production and test environments in this repository.
---

# Deploy Updates

This skill provides the standard operating procedure for deploying code in this repository to prevent the common issue of mismatched builds or outdated directories.

## Web Frontend Deployment

The Vite/React web code must be built and then manually copied into the Firebase static directory before deploying. 

1. **Build the production bundle**:
   ```bash
   cd x:\Antigravity\Projects\field-service-mgmt\frontend\web
   npm run build
   ```
2. **Synchronize the build directory**:
   The `npm run build` command outputs to `frontend/web/dist`, but `firebase.json` serves from `firebase/public`. You **must** copy the files over to avoid deploying old code:
   ```powershell
   Copy-Item -Path "x:\Antigravity\Projects\field-service-mgmt\frontend\web\dist\*" -Destination "x:\Antigravity\Projects\field-service-mgmt\firebase\public" -Recurse -Force
   ```
3. **Deploy to Hosting**:
   ```bash
   cd x:\Antigravity\Projects\field-service-mgmt\firebase
   npx firebase-tools deploy --only hosting
   ```

## Cloud Functions (Backend) Deployment

If you modify files inside `firebase/functions`, you must deploy the backend code.

1. **Deploy Functions**:
   ```bash
   cd x:\Antigravity\Projects\field-service-mgmt\firebase
   npx firebase-tools deploy --only functions
   ```

## Test vs Production Environments

The user requires that changes are deployed to both production and test unless specified otherwise.

- **Production**: By default, `npx firebase-tools deploy` deploys to the live production site (`maintenancemanager-c5533.web.app`).
- **Test Channel**: To deploy a test build, use Firebase Preview Channels representing your test environment:
  ```bash
  cd x:\Antigravity\Projects\field-service-mgmt\firebase
  npx firebase-tools hosting:channel:deploy test
  ```
- Make sure to provide both the live production URL and the test channel URL to the user when deployments finish.
