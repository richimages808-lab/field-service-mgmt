## 🚀 Deployment Checklist - New Features Integration

Complete these steps to deploy all new features to test and production environments.

---

## Pre-Deployment (Development)

### 1. Update App Routes

**File**: `frontend/web/src/App.tsx`

Add these new routes:

```typescript
import { JobDetail } from './pages/JobDetail';
import { Settings } from './pages/Settings';

// In your Routes component:
<Route path="/jobs/:jobId" element={<JobDetail />} />
<Route path="/settings" element={<Settings />} />
```

### 2. Update Navigation Links

**File**: `frontend/web/src/components/Navigation.tsx`

Add links to new pages:

```typescript
// For all roles:
<Link to="/settings" className="nav-link">
  Settings
</Link>

// Jobs should now be clickable:
<Link to={`/jobs/${job.id}`} className="job-card">
  {/* Job card content */}
</Link>
```

### 3. Install Dependencies (if needed)

```bash
cd frontend/web
npm install
```

### 4. Type Check

```bash
npm run type-check  # or tsc --noEmit
```

### 5. Lint Check

```bash
npm run lint
```

---

## Firebase Configuration

### 1. Update Firestore Rules

**File**: `firebase/firestore.rules`

Copy the rules from [INTEGRATION-GUIDE.md](INTEGRATION-GUIDE.md) section "Firebase Security Rules Update"

```bash
cd firebase
firebase deploy --only firestore:rules
```

### 2. Create Firestore Indexes

**File**: `firebase/firestore.indexes.json`

Copy the indexes from [INTEGRATION-GUIDE.md](INTEGRATION-GUIDE.md) section "Firebase Indexes"

```bash
firebase deploy --only firestore:indexes
```

### 3. Configure Storage Rules (for photos)

**File**: `firebase/storage.rules`

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /job_photos/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null
                   && request.resource.size < 10 * 1024 * 1024  // 10MB max
                   && request.resource.contentType.matches('image/.*');
    }
  }
}
```

```bash
firebase deploy --only storage
```

---

## Build & Test

### 1. Development Build Test

```bash
cd frontend/web
npm run dev
```

Visit each new page:
- http://localhost:5173/settings
- http://localhost:5173/jobs/[any-job-id]

### 2. Production Build Test

```bash
npm run build
npm run preview
```

Test all features in production mode.

### 3. Checklist of Features to Test

**Settings Page** (`/settings`):
- [ ] Service Zones: Create, Edit, Delete zones
- [ ] Quote Templates: Create template with line items
- [ ] Parts Inventory: Add items, adjust quantities
- [ ] Analytics: View metrics, change date range

**Job Detail Page** (`/jobs/:id`):
- [ ] View job details
- [ ] Upload photos (Before/After)
- [ ] Track costs (Labor, Parts, Mileage)
- [ ] Complete checklist
- [ ] Capture signature
- [ ] Send reminders
- [ ] View customer notes

**Solo Dashboard**:
- [ ] Existing functionality still works
- [ ] All jobs display correctly

**Calendar**:
- [ ] Drag-and-drop scheduling works
- [ ] Jobs display correctly

---

## Deploy to Firebase Hosting

### 1. Deploy to Preview (Testing)

```bash
# Build frontend
cd frontend/web
npm run build

# Deploy to preview channel
cd ../../firebase
firebase hosting:channel:deploy preview

# Test URL will be provided, e.g.:
# https://field-service-mgmt--preview-abc123.web.app
```

Test all features on the preview URL.

### 2. Deploy to Production

After testing preview:

```bash
firebase deploy --only hosting
```

### 3. Verify Production

Visit your production URL and test critical paths:
- [ ] Login works
- [ ] Dashboard loads
- [ ] Can create jobs
- [ ] Can view job details
- [ ] Settings page accessible
- [ ] All new components render

---

## Post-Deployment

### 1. Monitor Errors

Check Firebase Console:
- **Hosting**: Check for 404s
- **Firestore**: Monitor security rule denials
- **Storage**: Check upload errors
- **Functions**: If using functions, check logs

### 2. User Training

Document the new features for users:
- [ ] How to use Service Zones
- [ ] How to create Quote Templates
- [ ] How to track Parts Inventory
- [ ] How to capture signatures
- [ ] How to upload photos

### 3. Create Admin Account

Make sure you have an admin/owner account to configure:
- Service zones for your area
- Quote templates for common jobs
- Parts inventory items

---

## Rollback Plan

If issues arise:

### Quick Rollback (Hosting Only)

```bash
firebase hosting:clone SOURCE_SITE_ID:SOURCE_CHANNEL_ID TARGET_SITE_ID:live
```

### Full Rollback

```bash
# Revert firestore rules
firebase deploy --only firestore:rules

# Redeploy previous hosting version
firebase hosting:rollback
```

---

## Performance Optimization

### 1. Enable Firestore Indexes

Monitor the Firebase Console for "Index required" errors and create them:

```bash
firebase firestore:indexes
```

### 2. Check Bundle Size

```bash
cd frontend/web
npm run build

# Check dist/ folder size
ls -lh dist/assets/
```

If bundle is too large (>1MB per JS file), consider code splitting.

### 3. Image Optimization

For photos, consider:
- Client-side resizing before upload
- Firebase Extensions: Resize Images

---

## Security Checklist

- [ ] Firestore rules deployed and tested
- [ ] Storage rules deployed and tested
- [ ] All sensitive data has org_id checks
- [ ] Custom claims properly set (role, org_id)
- [ ] No console.logs with sensitive data in production
- [ ] API keys properly configured

---

## Monitoring & Alerts

### Set up alerts in Firebase:

1. **Performance Monitoring**
   - Enable in Firebase Console
   - Monitor page load times

2. **Error Reporting**
   - Check for JavaScript errors
   - Monitor failed Firestore operations

3. **Usage Quotas**
   - Monitor Firestore reads/writes
   - Check Storage usage
   - Track Hosting bandwidth

---

## Documentation Updates

- [ ] Update README with new features
- [ ] Document new Firebase collections
- [ ] Add screenshots to docs
- [ ] Update API documentation (if applicable)

---

## Support Preparation

### Common Issues & Solutions

**Issue**: "Permission denied" when accessing new collections
- **Solution**: Redeploy Firestore rules

**Issue**: Photos not uploading
- **Solution**: Check Storage rules and bucket configuration

**Issue**: Components not rendering
- **Solution**: Clear browser cache, check imports

**Issue**: Real-time updates not working
- **Solution**: Check Firestore indexes

### Support Contact Info

Provide users with:
- Bug reporting process
- Feature request process
- Emergency contact for critical issues

---

## Success Metrics

Track these metrics post-deployment:

- [ ] User adoption rate of new features
- [ ] Error rate (should be <1%)
- [ ] Page load times (<2s)
- [ ] User feedback/satisfaction
- [ ] Bug reports (aim for <5 in first week)

---

## Completion Sign-off

### Development Team
- [ ] All features tested locally
- [ ] Code reviewed
- [ ] Documentation complete

### QA Team
- [ ] Preview environment tested
- [ ] All test cases passed
- [ ] Performance acceptable

### Product Owner
- [ ] Features meet requirements
- [ ] Ready for production

### DevOps
- [ ] Firestore rules deployed
- [ ] Indexes created
- [ ] Storage configured
- [ ] Monitoring enabled

---

## Quick Command Reference

```bash
# Development
npm run dev

# Build
npm run build

# Preview build locally
npm run preview

# Deploy everything
firebase deploy

# Deploy specific services
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only storage
firebase deploy --only hosting

# Preview channel
firebase hosting:channel:deploy preview

# Check what's deployed
firebase hosting:channel:list
firebase hosting:releases

# View logs
firebase functions:log    # if using functions
```

---

## Emergency Contacts

- **Firebase Support**: Firebase Console → Support
- **Development Team**: [Add contact info]
- **On-Call Engineer**: [Add contact info]

---

## Next Release Planning

After successful deployment, plan for:
- [ ] User feedback collection
- [ ] Performance optimizations
- [ ] Additional features from backlog
- [ ] Bug fixes based on production usage

---

**Last Updated**: 2026-01-20
**Version**: 2.0.0 - Major Feature Release
