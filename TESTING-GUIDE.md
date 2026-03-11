# Testing Guide - Field Service Management App

## 🌐 Deployment URLs

### Getting Your Deployment URLs

After deploying to Firebase, you'll get your hosting URLs:

```bash
cd firebase
firebase deploy --only hosting
```

Your URLs will be:
- **Production**: `https://[your-project-id].web.app`
- **Production (custom)**: `https://[your-project-id].firebaseapp.com`

To find your project ID:
```bash
firebase projects:list
# or check firebase/.firebaserc
```

### Preview/Test Environment

Deploy to a preview channel for testing:

```bash
firebase hosting:channel:deploy test
```

This creates: `https://[your-project-id]--test-[random-id].web.app`

---

## 👥 Test Accounts Setup

### Creating Test Accounts

Run this script to create test accounts for all roles:

**File**: `setup-test-accounts.js` (create in project root)

```javascript
const admin = require('firebase-admin');
const fetch = require('node-fetch');

// Initialize Firebase Admin
const serviceAccount = require('./firebase/serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Your Django backend URL
const BACKEND_URL = 'http://localhost:8000'; // Change for production

async function createTestAccounts() {
  const testOrg = {
    id: 'test-org-001',
    name: 'Test Service Company',
    business_hours: {
      start: '08:00',
      end: '17:00',
      days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
    },
    settings: {
      auto_schedule: true,
      require_photos: true,
      default_job_duration: 60
    }
  };

  // Create organization
  await db.collection('organizations').doc(testOrg.id).set(testOrg);
  console.log('✅ Created test organization');

  const accounts = [
    {
      email: 'owner@test.com',
      password: 'TestPass123!',
      role: 'owner',
      name: 'Test Owner',
      phone: '808-555-0001'
    },
    {
      email: 'dispatcher@test.com',
      password: 'TestPass123!',
      role: 'dispatcher',
      name: 'Test Dispatcher',
      phone: '808-555-0002'
    },
    {
      email: 'tech@test.com',
      password: 'TestPass123!',
      role: 'technician',
      name: 'Test Technician',
      phone: '808-555-0003',
      type: 'corporate',
      skills: ['hvac', 'plumbing', 'electrical']
    },
    {
      email: 'solo@test.com',
      password: 'TestPass123!',
      role: 'technician',
      name: 'Test Solopreneur',
      phone: '808-555-0004',
      type: 'solopreneur',
      skills: ['hvac', 'electrical']
    }
  ];

  for (const account of accounts) {
    // Create user in Django backend (you'll need to implement this endpoint)
    try {
      const response = await fetch(`${BACKEND_URL}/api/signup/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: account.email,
          password: account.password,
          name: account.name,
          role: account.role,
          org_id: testOrg.id,
          phone: account.phone
        })
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Created ${account.role}: ${account.email}`);

        // Add additional Firestore data
        await db.collection('users').doc(data.uid).set({
          email: account.email,
          name: account.name,
          role: account.role,
          org_id: testOrg.id,
          phone: account.phone,
          ...(account.type && { type: account.type }),
          ...(account.skills && { skills: account.skills }),
          created_at: admin.firestore.FieldValue.serverTimestamp()
        });
      } else {
        console.error(`❌ Failed to create ${account.email}:`, await response.text());
      }
    } catch (error) {
      console.error(`❌ Error creating ${account.email}:`, error);
    }
  }

  console.log('\n📋 Test Account Summary:');
  console.log('━'.repeat(60));
  accounts.forEach(acc => {
    console.log(`${acc.role.toUpperCase()}: ${acc.email} / ${acc.password}`);
  });
  console.log('━'.repeat(60));
}

createTestAccounts()
  .then(() => {
    console.log('\n✅ All test accounts created successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
```

Run it:
```bash
npm install node-fetch
node setup-test-accounts.js
```

---

## 🧪 Quick Test Credentials

Use these credentials to test immediately:

| Role | Email | Password |
|------|-------|----------|
| **Owner** | owner@test.com | TestPass123! |
| **Dispatcher** | dispatcher@test.com | TestPass123! |
| **Technician** | tech@test.com | TestPass123! |
| **Solo Tech** | solo@test.com | TestPass123! |

---

## 📝 Testing Workflows

### 1. Owner/Admin Testing

**Login**: owner@test.com

**Test Features**:
1. Navigate to [Settings](https://your-app.web.app/settings)
2. **Service Zones Tab**:
   - Create zone: "Downtown Honolulu"
   - Zip codes: 96813, 96814
   - Travel buffer: 15 minutes
   - ✅ Verify: Zone appears in list
3. **Quote Templates Tab**:
   - Create template: "Standard HVAC Maintenance"
   - Add line items (Labor, Parts, etc.)
   - ✅ Verify: Template saves with correct total
4. **Parts Inventory Tab**:
   - Add item: "HVAC Filter 20x25"
   - Set low stock alert: 10 units
   - Add 50 to Truck
   - ✅ Verify: Shows in inventory list
5. **Analytics Tab**:
   - Change date range to "Month"
   - ✅ Verify: Charts render without errors

### 2. Dispatcher Testing

**Login**: dispatcher@test.com

**Test Features**:
1. Navigate to [Create Job](https://your-app.web.app/jobs/new)
2. Fill out job form:
   - Customer: "John Doe"
   - Address: "1001 Bishop St, Honolulu, HI 96813"
   - Description: "AC unit not cooling"
   - Category: "HVAC Repair"
   - Priority: High
   - Duration: 120 minutes
3. ✅ Verify: Job created successfully
4. Navigate to [Dispatcher Console](https://your-app.web.app/dispatcher)
5. Drag job to tech's timeline
6. ✅ Verify: Route optimization runs, drive times calculated
7. Navigate to [Calendar](https://your-app.web.app/schedule)
8. ✅ Verify: Job appears on calendar

### 3. Technician Testing

**Login**: tech@test.com

**Test Features**:
1. Navigate to Dashboard (should auto-redirect to [Tech Dashboard](https://your-app.web.app/))
2. ✅ Verify: Assigned jobs appear
3. Click on a job to open [Job Detail](https://your-app.web.app/jobs/[job-id])
4. **Photos Tab**:
   - Upload "Before" photo
   - Upload "After" photo
   - ✅ Verify: Photos appear in gallery
5. **Costs Tab**:
   - Add labor: 2 hours @ $85/hr
   - Add part: HVAC Filter @ $25
   - Add mileage: 15 miles
   - ✅ Verify: Total calculates correctly
6. **Checklist Tab**:
   - Check off items
   - ✅ Verify: Progress bar updates
7. **Signature**:
   - Draw signature in pad
   - Enter customer name
   - Capture signature
   - ✅ Verify: Signature saves and displays

### 4. Solo Technician Testing

**Login**: solo@test.com

**Test Features**:
1. Navigate to [Solo Dashboard](https://your-app.web.app/)
2. ✅ Verify: Shows solo-specific interface
3. Navigate to [Solo Calendar](https://your-app.web.app/solo-calendar)
4. Create a job directly
5. Drag to schedule
6. ✅ Verify: AI scheduling works

---

## 🔍 Feature-Specific Testing

### Service Zones
**URL**: `/settings` → Service Zones tab

**Test Cases**:
- [ ] Create zone with ZIP codes
- [ ] Edit zone travel buffer
- [ ] Deactivate zone
- [ ] Delete zone
- [ ] Verify scheduler respects zones

### Quote Templates
**URL**: `/settings` → Quote Templates tab

**Test Cases**:
- [ ] Create template with 3+ line items
- [ ] Duplicate existing template
- [ ] Edit template pricing
- [ ] Delete template
- [ ] Use template in job creation

### Parts Inventory
**URL**: `/settings` → Parts Inventory tab

**Test Cases**:
- [ ] Add new inventory item
- [ ] Set low stock threshold
- [ ] Adjust quantity (add/remove)
- [ ] Move between locations
- [ ] Trigger low stock alert
- [ ] Use part on a job

### Job Photos
**URL**: `/jobs/[job-id]` → Photos tab

**Test Cases**:
- [ ] Upload photo (Before)
- [ ] Upload photo (After)
- [ ] View photo in lightbox
- [ ] Navigate with arrow keys
- [ ] Delete photo
- [ ] Verify shows in job detail

### Cost Tracking
**URL**: `/jobs/[job-id]` → Costs tab

**Test Cases**:
- [ ] Add labor cost
- [ ] Add parts cost
- [ ] Add mileage
- [ ] See budget variance
- [ ] Calculate profit margin
- [ ] Export cost report

### Digital Signature
**URL**: `/jobs/[job-id]` → Sidebar

**Test Cases**:
- [ ] Draw signature with mouse
- [ ] Draw signature on touch device
- [ ] Clear and redraw
- [ ] Enter signer name
- [ ] Save signature
- [ ] View saved signature

### Appointment Reminders
**URL**: `/jobs/[job-id]` → Sidebar

**Test Cases**:
- [ ] Schedule 24h reminder
- [ ] Schedule 2h reminder
- [ ] Send "On the way" message
- [ ] View reminder status
- [ ] Cancel pending reminder

### Analytics Dashboard
**URL**: `/settings` → Analytics tab

**Test Cases**:
- [ ] View with date range: Week
- [ ] View with date range: Month
- [ ] View with date range: Quarter
- [ ] Check revenue metrics
- [ ] Check top customers
- [ ] Check category breakdown

---

## 🐛 Common Issues & Solutions

### Issue: "Permission denied" errors
**Solution**:
```bash
cd firebase
firebase deploy --only firestore:rules
```

### Issue: Photos won't upload
**Checklist**:
- [ ] Firebase Storage enabled in console
- [ ] Storage rules deployed
- [ ] File size < 10MB
- [ ] File is an image type

### Issue: Can't see new features
**Solution**:
- Clear browser cache (Ctrl+Shift+Delete)
- Hard refresh (Ctrl+Shift+R)
- Check browser console for errors

### Issue: Jobs not appearing
**Checklist**:
- [ ] User has correct `org_id`
- [ ] Firestore rules allow access
- [ ] Check Firestore console for data
- [ ] Check browser console for errors

---

## 📊 Performance Testing

### Metrics to Check

1. **Page Load Time**:
   - Target: < 2 seconds
   - Test: Chrome DevTools → Network tab

2. **Firestore Reads**:
   - Monitor in Firebase Console
   - Optimize queries with indexes

3. **Bundle Size**:
   ```bash
   cd frontend/web
   npm run build
   ls -lh dist/assets/
   ```
   - Target: Main JS < 500KB gzipped

4. **Lighthouse Score**:
   - Run in Chrome DevTools
   - Target: Performance > 90

---

## 🔐 Security Testing

### Checklist

- [ ] Can't access other org's data
- [ ] Can't modify data without auth
- [ ] Role restrictions work (tech can't see admin features)
- [ ] Custom claims properly set
- [ ] Storage rules prevent unauthorized uploads
- [ ] No sensitive data in console logs

### Test Multi-Tenancy

1. Create two test organizations
2. Create user in each org
3. Login as user A
4. ✅ Verify: Can't see org B's jobs
5. Try to access org B's data via API
6. ✅ Verify: Request blocked

---

## 📱 Mobile Testing

### Responsive Design

Test on these breakpoints:
- [ ] Mobile (375px) - iPhone SE
- [ ] Tablet (768px) - iPad
- [ ] Desktop (1024px+) - Standard laptop

### Touch Interactions

- [ ] Drag-and-drop on touch devices
- [ ] Signature capture with finger
- [ ] Photo upload from camera
- [ ] Date pickers work on mobile

---

## 🎯 Acceptance Criteria

### Must Pass Before Production

**Functionality**:
- [ ] All 16 features accessible
- [ ] No console errors on any page
- [ ] All forms validate properly
- [ ] Real-time updates work

**Security**:
- [ ] Firestore rules deployed
- [ ] Storage rules deployed
- [ ] Multi-tenancy enforced
- [ ] Role-based access works

**Performance**:
- [ ] Page load < 3 seconds
- [ ] No memory leaks
- [ ] Bundle size reasonable
- [ ] Images optimized

**UX**:
- [ ] Mobile responsive
- [ ] Loading states present
- [ ] Error messages clear
- [ ] Success feedback shown

---

## 📧 Test Data Seeding

Use the DataManager to seed test data:

1. Login as owner@test.com
2. Navigate to [Data Manager](https://your-app.web.app/data-manager)
3. Click "Seed Sample Data"
4. Select:
   - 20 Customers
   - 50 Jobs (various statuses)
   - 5 Technicians
   - 10 Invoices
5. Click "Generate"
6. ✅ Verify: Data appears across all pages

---

## 🚀 Production Checklist

Before going live:

**Environment**:
- [ ] Production Firebase project created
- [ ] Environment variables set
- [ ] Google Maps API key added
- [ ] SendGrid API key configured
- [ ] Custom domain configured (optional)

**Data**:
- [ ] Test data removed
- [ ] Production data backed up
- [ ] Initial organizations created
- [ ] Admin accounts set up

**Monitoring**:
- [ ] Firebase Performance Monitoring enabled
- [ ] Error reporting configured
- [ ] Usage alerts set up
- [ ] Backup schedule configured

**Documentation**:
- [ ] User guide created
- [ ] Training materials ready
- [ ] Support contact info added
- [ ] Changelog maintained

---

## 👥 User Roles Quick Reference

| Feature | Owner | Dispatcher | Technician | Solo Tech |
|---------|-------|------------|------------|-----------|
| Create Jobs | ✅ | ✅ | ❌ | ✅ |
| Assign Jobs | ✅ | ✅ | ❌ | N/A |
| View All Jobs | ✅ | ✅ | Own Only | Own Only |
| Edit Settings | ✅ | Limited | ❌ | Limited |
| View Analytics | ✅ | ✅ | ❌ | ✅ |
| Manage Inventory | ✅ | ✅ | View Only | ✅ |
| Create Invoices | ✅ | ✅ | ❌ | ✅ |
| Upload Photos | ✅ | ✅ | ✅ | ✅ |
| Capture Signatures | ✅ | ✅ | ✅ | ✅ |

---

## 📞 Support & Feedback

### Reporting Issues

When reporting bugs, include:
1. User role and email
2. Page URL where error occurred
3. Steps to reproduce
4. Browser console screenshot
5. Expected vs actual behavior

### Feature Requests

Submit via:
- GitHub Issues (if using GitHub)
- Email: support@yourcompany.com
- In-app feedback form (if implemented)

---

## 🎉 Success Metrics

Track these after deployment:

**Week 1**:
- User registration count
- Feature adoption rate
- Error rate (<1%)
- User feedback sentiment

**Month 1**:
- Active users per role
- Jobs created/completed
- Average page load time
- Customer satisfaction score

---

**Last Updated**: 2026-01-20
**Version**: 2.0.0 - Feature Integration Testing Guide
