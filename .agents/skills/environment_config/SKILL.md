---
name: environment_config
description: Standards for managing environment variables and Firebase configuration — never hardcode API keys, project IDs, or URLs.
---

# Environment Configuration Standard

The application currently has hardcoded Firebase config and no `.env` files. All new configuration values must follow these rules.

## Rule 1: Never Hardcode Sensitive Config

```typescript
// ❌ BAD — hardcoded in source
const firebaseConfig = {
    apiKey: "AIzaSyBbbbhn_DQd9LHO3Ii88-m3utdi4L9WTaM",
    projectId: "maintenancemanager-c5533",
};

// ✅ GOOD — from environment variables
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};
```

## Rule 2: Frontend Environment Variables (Vite)

Vite exposes environment variables via `import.meta.env.VITE_*`. Variables MUST be prefixed with `VITE_` to be accessible in the browser.

File locations:
```
frontend/web/
├── .env                  # Shared defaults
├── .env.development      # Local dev overrides
├── .env.production       # Production config
└── .env.local            # Personal overrides (gitignored)
```

## Rule 3: Cloud Functions Environment Variables

For Cloud Functions, use `process.env` with values set via:
```powershell
firebase functions:config:set twilio.sid="AC..." twilio.token="..."
```

Or in v2 functions, use Secret Manager or `.env` files in `firebase/functions/`.

## Rule 4: No Raw URL Construction for Firebase Endpoints

```typescript
// ❌ BAD — hardcoded function URL
const url = 'https://us-central1-maintenancemanager-c5533.cloudfunctions.net/calculateDriveTime';
const response = await fetch(url, { ... });

// ✅ GOOD — use Firebase callable SDK (auto-injects auth token)
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

const calculateDriveTime = httpsCallable(functions, 'calculateDriveTime');
const result = await calculateDriveTime({ origin, destination });
```

## Rule 5: When Adding a New External Service

1. Define the config key in `.env.example` (for documentation)
2. Add the actual value to `.env.local` (never committed) or `.env.production`
3. Access via `import.meta.env.VITE_*` (frontend) or `process.env.*` (backend)
4. Add a default/fallback for development mode if possible
