# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a field service management application (DispatchBox) designed for maintenance and service businesses. It's a multi-tenant SaaS platform supporting three user roles: owners, dispatchers, and technicians.

**Stack:**
- **Backend**: Django 5.2 + Django REST Framework with SQLite (for auth/user management)
- **Frontend Web**: React 18 + TypeScript + Vite + TailwindCSS
- **Frontend Mobile**: React Native + Expo + TypeScript
- **Database**: Firebase Firestore (primary data store for jobs, invoices, organizations)
- **Cloud Functions**: Firebase Functions (Node.js/TypeScript)
- **Authentication**: Dual-token system (Django Token + Firebase Custom Token)

## Architecture

### Authentication Flow
The app uses a hybrid authentication system:
1. Users log in via Django backend (`/api/login/`)
2. Django returns both a DRF token AND a Firebase custom token with claims (`role`, `org_id`, `is_staff`)
3. Frontend uses Firebase custom token to authenticate with Firestore
4. Custom claims in Firebase tokens enable role-based security rules

Custom claims are set in [backend/core/views.py:32-36](backend/core/views.py#L32-L36) and enforced in [firebase/firestore.rules](firebase/firestore.rules).

### Multi-Tenancy
Organizations are isolated via `org_id` fields on all major collections (jobs, users, invoices). The custom `org_id` claim in Firebase tokens enables Firestore security rules to enforce data isolation, though currently relaxed for development ([firestore.rules:35-36](firebase/firestore.rules#L35-L36)).

### Data Model
- **User roles**: `owner`, `dispatcher`, `technician` (defined in [backend/core/models.py:15-19](backend/core/models.py#L15-L19))
- **Technician types**: `corporate` (works for a company) vs `solopreneur` (self-employed)
- **Job statuses**: `pending` → `scheduled` → `in_progress` → `completed` | `cancelled`
- **Job priorities**: `low`, `medium`, `high`, `critical` (auto-escalate based on age)

TypeScript types are centralized in [frontend/web/src/types.ts](frontend/web/src/types.ts).

### Scheduling System
The dispatcher console includes intelligent job scheduling with:
- **Route optimization**: Greedy TSP algorithm to minimize drive time ([lib/scheduler.ts:62-176](frontend/web/src/lib/scheduler.ts#L62-L176))
- **Parts run insertion**: Automatically schedules stops at nearby parts stores when jobs require parts
- **Real-time drive time**: Firebase function calls Google Maps Distance Matrix API ([firebase/functions/src/index.ts:6-72](firebase/functions/src/index.ts#L6-L72))

Parts stores are hardcoded in [lib/scheduler.ts:12-17](frontend/web/src/lib/scheduler.ts#L12-L17).

### Firebase Functions
Located in `firebase/functions/src/`, functions include:
- **calculateDriveTime**: Google Maps API integration for route planning
- **Email handling**: Inbound/outbound email processing (SendGrid)
- **Organization management**: Tenant provisioning
- **SMS/Voice**: Twilio integration for notifications

## Development Commands

### Backend (Django)
```bash
cd field-service-mgmt/backend

# Activate virtual environment
source venv/bin/activate  # or venv\Scripts\activate on Windows

# Run development server
python manage.py runserver

# Create migrations
python manage.py makemigrations

# Apply migrations
python manage.py migrate

# Create superuser
python manage.py createsuperuser

# Run tests
python manage.py test
```

### Frontend Web
```bash
cd field-service-mgmt/frontend/web

# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Lint code (exits with error if warnings found)
npm run lint

# Preview production build
npm run preview
```

### Frontend Mobile
```bash
cd field-service-mgmt/frontend/mobile

# Install dependencies
npm install

# Start Expo development server
npm start

# Run on specific platform
npm run android
npm run ios
npm run web
```

### Firebase
```bash
cd field-service-mgmt/firebase

# Deploy all Firebase services
firebase deploy

# Deploy specific services
firebase deploy --only firestore:rules
firebase deploy --only functions
firebase deploy --only hosting
firebase deploy --only storage

# Run emulators (local testing)
firebase emulators:start

# View function logs
firebase functions:log
```

### Firebase Functions
```bash
cd field-service-mgmt/firebase/functions

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run functions in emulator
npm run serve

# Deploy functions only
npm run deploy

# View logs
npm run logs
```

## Key Pages and Routes

The web app uses React Router with role-based dashboards:
- `/login`, `/signup`: Authentication
- `/`: Role-based redirect (dispatcher → AdminDashboard, technician → TechDashboard/SoloDashboard)
- `/dispatcher`: Advanced timeline-based dispatch console with drag-and-drop
- `/schedule`: Calendar view with react-big-calendar
- `/kanban`: Kanban board for job status management
- `/jobs/new`: Create new job with customer info and location
- `/techs`: Technician management (add/edit/view)
- `/contacts`: Customer list
- `/invoices`: Invoice management
- `/data-manager`: Bulk data operations and seeding

Role-based routing logic is in [App.tsx:28-48](frontend/web/src/App.tsx#L28-L48).

## Important Files

### Configuration
- [backend/config/settings.py](backend/config/settings.py): Django settings, custom user model set to `core.User`
- [frontend/web/src/firebase.ts](frontend/web/src/firebase.ts): Firebase client initialization
- [firebase/firestore.rules](firebase/firestore.rules): Security rules with role-based access
- [firebase/firebase.json](firebase/firebase.json): Firebase project configuration

### Core Logic
- [frontend/web/src/auth/AuthProvider.tsx](frontend/web/src/auth/AuthProvider.tsx): Authentication context with dual-token management
- [frontend/web/src/lib/scheduler.ts](frontend/web/src/lib/scheduler.ts): Route optimization and scheduling algorithms
- [backend/core/views.py](backend/core/views.py): Login endpoint with Firebase custom token generation

### Data Utilities
- [frontend/web/src/lib/seeding.ts](frontend/web/src/lib/seeding.ts): Demo data generation
- [frontend/web/src/lib/notifications.ts](frontend/web/src/lib/notifications.ts): Cross-tab notification system
- [frontend/web/src/lib/mapUtils.ts](frontend/web/src/lib/mapUtils.ts): Geocoding and map helpers

## Environment Variables

### Firebase Functions
Create `firebase/functions/.env`:
```
GOOGLE_MAPS_KEY=your_api_key
SENDGRID_API_KEY=your_api_key
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
```

### Django Backend
Django secret key is currently hardcoded in settings.py (line 23) - should be moved to environment variable for production.

## Testing

Currently no automated test suites are configured. The Django backend has a test file at [backend/core/tests.py](backend/core/tests.py) but it's empty.

## Common Patterns

### Firestore Queries
Always filter by `org_id` to maintain multi-tenant isolation:
```typescript
const q = query(
    collection(db, 'jobs'),
    where('org_id', '==', user.org_id),
    where('status', '==', 'pending')
);
```

### Date Handling
Use Firestore Timestamps for dates:
```typescript
import { Timestamp } from 'firebase/firestore';
scheduled_at: Timestamp.fromDate(new Date())
```

### Role Checks
Check user role in components:
```typescript
const { user } = useAuth();
if (user?.role === 'dispatcher') {
    // Show dispatcher features
}
```

## Known Limitations

- Firebase Admin SDK initialization in Django backend ([backend/core/views.py:10-18](backend/core/views.py#L10-L18)) falls back to mock tokens when service account credentials are missing
- Firestore security rules currently allow any authenticated user full access (development mode) - see comments in [firestore.rules](firebase/firestore.rules)
- Distance calculations use simplified Haversine formula without real-time traffic (except in Firebase function)
- Parts store locations are hardcoded for Honolulu area only
