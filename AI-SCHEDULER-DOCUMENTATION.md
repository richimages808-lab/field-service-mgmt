# 🤖 AI Route Optimizer - Complete Documentation

## Overview
Advanced AI-powered route optimization system for solo technicians with real-time traffic data, customer availability matching, and intelligent multi-day scheduling.

**Production URL:** https://maintenancemanager-c5533.web.app/solo-scheduler
**Test Account:** solo@test.com / Test123!

---

## ✅ Complete Feature List

### 1. **Customer Availability Matching**
- Matches jobs to customer-specified time windows
- Supports specific days (e.g., "monday") or exact dates (e.g., "2024-12-11")
- Preferred time slot bonuses (morning/afternoon/evening)
- Heavy penalty (-50 points) for scheduling outside availability
- Bonus (+20 points) for matching availability windows

**Data Model:**
```typescript
availabilityWindows: [{
    day: string,           // 'monday' or 'YYYY-MM-DD'
    startTime: string,     // '09:00'
    endTime: string,       // '17:00'
    preferredTime: string  // 'morning', 'afternoon', 'evening'
}]
```

### 2. **Google Maps API Integration**
- Real-time traffic-aware drive times via Firebase Function
- Uses Distance Matrix API for accurate travel duration
- Considers traffic based on departure time
- Automatic fallback to Haversine distance calculation if API unavailable
- Function endpoint: `https://us-central1-maintenancemanager-c5533.cloudfunctions.net/calculateDriveTime`

**Returns:**
- `distance`: meters
- `duration`: seconds (without traffic)
- `durationInTraffic`: seconds (with current traffic conditions)

### 3. **Parts/Equipment Pickup Optimization**
- Automatically inserts parts runs when `parts_needed === true`
- Finds nearest parts store from current location
- Routes to minimize total drive time
- 30-minute pickup time allocation
- 4 hardcoded parts stores in Honolulu area

**Parts Store Locations:**
```javascript
{ address: 'Home Depot - Honolulu (421 Alakawa St)', lat: 21.3196, lng: -157.8735 }
{ address: 'Lowe\'s - Iwilei (411 Pacific St)', lat: 21.3170, lng: -157.8700 }
{ address: 'City Mill - Kaimuki (3086 Waialae Ave)', lat: 21.2850, lng: -157.8050 }
{ address: 'Ferguson Plumbing Supply - Sand Island', lat: 21.3250, lng: -157.8900 }
```

### 4. **AI Scheduling Algorithm**
Intelligent multi-factor scoring system that evaluates each potential job placement:

**Scoring Factors:**
- **Distance penalty:** -0.5 points per minute of drive time (capped at -30 points)
- **Availability match:** +20 points for fitting in customer window
- **Availability violation:** -50 points for scheduling outside window
- **Priority bonuses:**
  - Critical: +30 points
  - High: +20 points
  - Medium: +10 points
  - Low: 0 points
- **Preferred time match:** +10 points for morning/afternoon/evening preference

**Algorithm Type:** Greedy scoring with iterative selection
- Evaluates all pending jobs for each time slot
- Selects highest-scoring job
- Inserts parts runs dynamically when needed
- Recalculates all times based on actual route

### 5. **Distance-Based Routing Logic**
Prevents impossible same-day schedules with intelligent constraints:

**Constraints:**
- `MAX_DAILY_DRIVE_TIME_MINUTES = 240` (4 hours max driving per day)
- `MAX_DAILY_WORK_HOURS = 10` (10 hour workday max)
- `MAX_DISTANCE_SAME_DAY_KM = 200` (Jobs >200km need separate day/island)
- `WORK_START_HOUR = 8`
- `WORK_END_HOUR = 18`

**Features:**
- Identifies inter-island jobs that require separate scheduling
- Tracks unschedulable jobs with specific reasons
- Generates warnings for jobs that can't fit in current day
- Carries over unschedulable jobs to next day in multi-day optimization

### 6. **Interactive Drag-and-Drop Editor**
Manual job reordering after AI optimization with real-time updates:

**Features:**
- Drag any job to reorder the sequence
- Automatic time recalculation on reorder
- Visual indicators for drive time and priority
- Parts runs clearly marked with purple styling
- Sequential numbering display
- Google Maps route URL updates dynamically
- Save changes to Firestore with batch updates

**Implementation:** Uses `react-dnd` library with HTML5 drag-and-drop backend

### 7. **Google Maps Route Link**
One-click navigation for entire day's schedule:

**Features:**
- Supports up to 25 waypoints (Google Maps API limit)
- Direct link format with optimized route
- Opens in new tab with turn-by-turn directions
- Optional button (user clicks when ready, not auto-opening)

**URL Format:**
```
https://www.google.com/maps/dir/?api=1&origin=LAT,LNG&destination=LAT,LNG&waypoints=LAT1,LNG1|LAT2,LNG2&travelmode=driving
```

### 8. **Multi-Day Optimization**
Schedule multiple days at once with intelligent job distribution:

**Modes:**
- **Today Only:** Optimizes just the selected date
- **Full Week:** Optimizes 7 consecutive days starting from selected date
- **Custom Days:** User specifies number of days (1-30)

**Features:**
- Loops through each day sequentially
- Unschedulable jobs from Day N become input for Day N+1
- Each day starts at 8:00 AM work start time
- Respects daily drive time and work hour limits
- Batch updates all scheduled jobs to Firestore

### 9. **Re-Optimization Support**
Re-run optimizer after manual changes:

**Features:**
- "Re-Optimize" button appears when jobs are scheduled
- Clears existing schedules for selected day range
- Includes already-scheduled jobs in optimization pool
- Useful for adjusting after customer cancellations or priority changes
- Preserves unscheduled backlog jobs

**Implementation:**
```typescript
handleOptimize(includeScheduled: boolean = false)
// When includeScheduled=true, clears old schedules first
```

### 10. **Day Statistics Dashboard**
Real-time metrics displayed in 5-panel header:

**Metrics:**
- **Total Jobs:** Count of service jobs (excludes parts runs)
- **Parts Runs:** Count of pickup stops
- **Drive Time:** Total minutes spent driving
- **Work Time:** Total minutes on job sites
- **End Time:** Estimated completion time for day

---

## User Interface

### Solo Scheduler Page (`/solo-scheduler`)

**1. Header Section:**
- Date picker for scheduling different days
- Optimization mode selector (Today/Week/Custom)
- Custom days input field (when Custom mode selected)
- "✨ Auto-Schedule" button (gradient blue-to-purple)
- "🔄 Re-Optimize" button (shows when jobs scheduled)
- "💾 Save" button to persist changes
- 5-panel statistics bar

**2. Google Maps Route Card:**
- Displays when jobs are scheduled
- "Open in Google Maps" button (user clicks when ready)
- Shows optimization method (traffic-aware)
- Lists waypoint count

**3. Scheduled Jobs Column (2/3 width):**
- Drag-and-drop enabled job cards
- Time display (arrival, drive time, duration)
- Priority badges with color coding
- Parts run indicators (purple styling)
- Sequential numbering (#1, #2, #3...)
- Customer info and job description

**4. Backlog Column (1/3 width):**
- Unscheduled pending jobs
- Priority badges
- Customer info
- Cleared after optimization runs

**5. Warnings Section:**
- Displays when jobs can't be scheduled
- Shows specific reasons (distance, time constraints)
- Suggests alternative scheduling (different day/island)

---

## Technical Implementation

### Files Created

**1. `frontend/web/src/lib/aiScheduler.ts`** (~457 lines)
- Core AI optimization logic
- Google Maps API integration
- Multi-day routing support
- Distance-based feasibility checking
- Parts store optimization
- Multi-factor scoring algorithm
- Helper functions for statistics and route generation

**2. `frontend/web/src/pages/SoloScheduler.tsx`** (~500+ lines)
- Main UI component
- Drag-and-drop implementation
- Multi-day optimization mode control
- Re-optimization handling
- Firestore batch updates
- Statistics display

**3. `add-availability-windows.js`**
- Test data setup script
- Adds customer availability to demo jobs
- 5 different availability patterns
- Run with: `node add-availability-windows.js`

**4. `assign-jobs-to-solo.js`**
- Assigns test jobs to solo@test.com
- Useful for testing scheduler
- Run with: `node assign-jobs-to-solo.js`

### Files Modified

**1. `frontend/web/src/types.ts`**
- Added `availabilityWindows` to Job.request type
- Extended request interface with structured time windows

**2. `frontend/web/src/App.tsx`**
- Added route for `/solo-scheduler`
- Lazy-loaded component for performance

**3. `frontend/web/src/pages/SoloDashboard.tsx`**
- Added "🤖 AI Route Optimizer" button
- Links to `/solo-scheduler` page

**4. `frontend/web/src/pages/SoloCalendar.tsx`**
- Added AI scheduling button to existing calendar view
- Interactive toast for Google Maps link
- Same optimization logic as SoloScheduler

### Dependencies Added

```json
{
  "react-dnd": "^16.0.1",
  "react-dnd-html5-backend": "^16.0.1",
  "date-fns": "^2.30.0",
  "react-hot-toast": "^2.4.1"
}
```

---

## How to Use

### For Solo Technicians:

**1. Access the Scheduler:**
- Click "🤖 AI Route Optimizer" button on Solo Dashboard
- Or navigate to: https://maintenancemanager-c5533.web.app/solo-scheduler

**2. Select Optimization Mode:**
- Choose "Today Only" for single-day optimization
- Choose "Full Week" to schedule next 7 days
- Choose "Custom Days" and enter number of days (1-30)

**3. Run Auto-Scheduler:**
- Click "✨ Auto-Schedule" button
- AI analyzes all unscheduled jobs
- Calls Google Maps API for real drive times with traffic
- Matches customer availability windows
- Inserts parts runs automatically when needed
- Optimizes route for minimum drive time
- Displays warnings for unschedulable jobs

**4. Review Results:**
- Check statistics panel for overview
- Review scheduled jobs in order
- Check warnings section for any issues
- Note jobs marked as too far or outside availability

**5. Manual Adjustments (Optional):**
- Drag jobs to reorder if needed
- Times automatically recalculate
- Google Maps route updates

**6. Save Schedule:**
- Click "💾 Save" to persist schedule to database
- Jobs update to "scheduled" status
- Times are stored in Firestore

**7. Navigate:**
- Click "Open in Google Maps" when ready to start
- Turn-by-turn directions open in new tab
- Follow route for optimized travel

**8. Re-Optimize (If Needed):**
- Make manual changes to jobs
- Click "🔄 Re-Optimize" button
- AI re-analyzes with new constraints
- Can re-optimize already scheduled jobs

---

## Key Benefits

### Time Savings
- Reduces route planning from 30+ minutes to ~10 seconds
- Automated parts run insertion
- No manual distance calculations needed

### Customer Satisfaction
- Respects availability windows automatically
- Matches preferred time slots
- Reduces missed appointments

### Fuel Efficiency
- Minimizes total drive time
- Optimizes route with real traffic data
- Nearest parts store selection

### Flexibility
- Manual override always available
- Drag-and-drop reordering
- Re-optimization after changes

### Real-Time Data
- Uses current traffic conditions
- Updates drive times based on departure time
- Accurate arrival predictions

### Parts Optimization
- Never forget parts runs
- Minimizes detours to stores
- Allocates proper pickup time

---

## Production Deployment

**Hosting:** Firebase Hosting
**URL:** https://maintenancemanager-c5533.web.app
**Status:** ✅ Deployed and Live

**Key Pages:**
- Solo Dashboard: https://maintenancemanager-c5533.web.app/solo-dashboard
- AI Scheduler: https://maintenancemanager-c5533.web.app/solo-scheduler
- Calendar View: https://maintenancemanager-c5533.web.app/solo-calendar

**Test Account:**
- Email: solo@test.com
- Password: Test123!
- Role: Technician (Solopreneur)
- Org: demo-org
- Test Data: 110+ jobs with availability windows configured

**Deployment Commands:**
```bash
cd frontend/web
npm run build
cd ../../firebase
firebase deploy --only hosting
```

---

## Future Enhancement Ideas

Potential improvements for future versions:

### Advanced Scheduling
- **Multi-technician optimization:** Assign jobs across team members
- **Break time integration:** Schedule lunch breaks and rest periods
- **Buffer time configuration:** Customizable padding between jobs
- **Weather-aware scheduling:** Delay outdoor jobs in bad weather
- **Customer priority tiers:** VIP customers get preferred time slots

### Analytics & Intelligence
- **Historical route performance:** Track actual vs estimated times
- **Customer satisfaction tracking:** Rate jobs and adjust scheduling
- **Fuel cost calculations:** Estimate daily fuel expenses
- **Traffic pattern learning:** ML model for better time predictions
- **Seasonal adjustments:** Different routing for peak tourist seasons

### Integration & Automation
- **Dynamic parts store inventory:** Check stock before routing
- **Real-time GPS tracking:** Update routes based on actual location
- **Voice-guided navigation:** Hands-free direction assistance
- **Calendar sync:** Export to Google/Apple Calendar
- **SMS notifications:** Auto-notify customers of arrival time

### Mobile Experience
- **Native mobile app:** Dedicated iOS/Android scheduler
- **Offline mode:** Cache routes for areas without service
- **Photo integration:** Attach job site photos to schedule
- **Voice commands:** "Schedule my jobs for tomorrow"

### Multi-Day Planning
- **Week view:** Visual calendar for entire week
- **Recurring jobs:** Auto-schedule weekly/monthly maintenance
- **Time-off management:** Block out vacation days
- **Load balancing:** Distribute work evenly across week

---

## Troubleshooting

### Common Issues

**Issue: No jobs appear in scheduler**
- **Solution:** Check that jobs are assigned to your technician ID
- Run `node assign-jobs-to-solo.js` to assign test jobs

**Issue: Google Maps route doesn't open**
- **Solution:** Check browser popup blocker settings
- Allow popups from maintenancemanager-c5533.web.app

**Issue: Drive times seem inaccurate**
- **Solution:** Verify Google Maps API is responding
- Check Firebase Function logs for errors
- System will fallback to Haversine distance calculation

**Issue: Jobs marked as "too far" incorrectly**
- **Solution:** Check job location coordinates are accurate
- 200km limit is designed for inter-island detection
- Can be adjusted in aiScheduler.ts if needed

**Issue: Parts runs not appearing**
- **Solution:** Verify job has `parts_needed: true` field
- Check that job has valid location coordinates
- Parts stores are hardcoded for Honolulu area

**Issue: Drag-and-drop not working**
- **Solution:** Ensure browser supports HTML5 drag-and-drop
- Try refreshing page
- Check browser console for errors

---

## API Reference

### `optimizeScheduleWithAI()`

**Function Signature:**
```typescript
async function optimizeScheduleWithAI(
    jobs: Job[],
    currentLocation: { lat: number; lng: number },
    startTime: Date = new Date(),
    useRealDriveTimes: boolean = true
): Promise<SchedulingResult>
```

**Parameters:**
- `jobs`: Array of unscheduled jobs to optimize
- `currentLocation`: Starting location (technician's home/base)
- `startTime`: When to start the day (default: now, normalized to 8 AM if before work hours)
- `useRealDriveTimes`: Whether to call Google Maps API (default: true)

**Returns:**
```typescript
interface SchedulingResult {
    scheduledJobs: ScheduledJob[];      // Successfully scheduled jobs
    unschedulableJobs: Job[];           // Jobs that couldn't fit
    warnings: string[];                 // Reasons for unschedulable jobs
}
```

### `generateGoogleMapsRoute()`

**Function Signature:**
```typescript
function generateGoogleMapsRoute(
    startLocation: { lat: number; lng: number },
    jobs: ScheduledJob[]
): string
```

**Parameters:**
- `startLocation`: Starting point for the route
- `jobs`: Array of scheduled jobs in order

**Returns:** Google Maps URL string with route waypoints

### `calculateDayStatistics()`

**Function Signature:**
```typescript
function calculateDayStatistics(jobs: ScheduledJob[]): {
    totalDriveTime: number;
    totalWorkTime: number;
    totalJobs: number;
    partsRuns: number;
    estimatedEndTime?: Date;
}
```

**Parameters:**
- `jobs`: Array of scheduled jobs

**Returns:** Statistics object with day totals

---

## Code Examples

### Basic Optimization
```typescript
import { optimizeScheduleWithAI } from '../lib/aiScheduler';

const homeLocation = { lat: 21.3099, lng: -157.8581 }; // Honolulu
const unscheduledJobs = [...]; // Array of Job objects

const result = await optimizeScheduleWithAI(
    unscheduledJobs,
    homeLocation,
    new Date(),
    true // Use Google Maps API
);

console.log(`Scheduled ${result.scheduledJobs.length} jobs`);
console.log(`Couldn't schedule ${result.unschedulableJobs.length} jobs`);
result.warnings.forEach(warning => console.warn(warning));
```

### Multi-Day Optimization
```typescript
const daysToOptimize = 7; // One week
let remainingJobs = [...unscheduledJobs];
const allScheduled = [];

for (let dayOffset = 0; dayOffset < daysToOptimize; dayOffset++) {
    const currentDay = new Date(selectedDate);
    currentDay.setDate(currentDay.getDate() + dayOffset);
    currentDay.setHours(8, 0, 0, 0);

    const result = await optimizeScheduleWithAI(
        remainingJobs,
        homeLocation,
        currentDay,
        true
    );

    allScheduled.push(...result.scheduledJobs);
    remainingJobs = result.unschedulableJobs; // Carry over
}

console.log(`Scheduled ${allScheduled.length} jobs across ${daysToOptimize} days`);
```

### Generate Google Maps Route
```typescript
import { generateGoogleMapsRoute } from '../lib/aiScheduler';

const mapsUrl = generateGoogleMapsRoute(homeLocation, scheduledJobs);
window.open(mapsUrl, '_blank'); // Open in new tab
```

### Manual Reordering with Time Recalculation
```typescript
import { addMinutes } from 'date-fns';
import { calculateDistance } from '../lib/scheduler';

function recalculateTimes(jobs: ScheduledJob[], homeLocation: Location) {
    let currentLoc = homeLocation;
    let currentTime = new Date();
    currentTime.setHours(8, 0, 0, 0);

    return jobs.map(job => {
        const distanceKm = calculateDistance(currentLoc, job.location!);
        const driveMinutes = Math.ceil(distanceKm * 2) + 10;
        const arrivalTime = addMinutes(currentTime, driveMinutes);
        const departureTime = addMinutes(arrivalTime, job.estimated_duration || 60);

        currentLoc = job.location!;
        currentTime = departureTime;

        return {
            ...job,
            driveTimeMinutes: driveMinutes,
            arrivalTime,
            departureTime
        };
    });
}
```

---

## Performance Considerations

### Google Maps API Calls
- Each optimization makes N API calls where N = number of jobs
- For 10 jobs: ~10 API calls (~10-20 seconds total)
- For 100 jobs: ~100 API calls (~2-3 minutes total)
- Uses `Promise.all()` where possible to parallelize
- Fallback to Haversine calculation on API failure

### Firestore Operations
- Batch writes limit: 500 operations per batch
- Large multi-day optimizations may need chunking
- Current implementation uses single batch (works for <100 jobs/day)

### UI Responsiveness
- Loading states shown during optimization
- Toast notifications for progress updates
- Drag-and-drop uses React DnD for smooth UX

### Optimization Algorithm
- Time complexity: O(n²) where n = number of jobs
- Greedy approach (not guaranteed optimal)
- Fast enough for typical daily schedules (5-20 jobs)
- May take 10-30 seconds for 50+ jobs

---

## Support & Contact

**Issues:** Report bugs or request features at project repository
**Documentation:** This file (AI-SCHEDULER-DOCUMENTATION.md)
**Test Environment:** solo@test.com account with sample data

---

**Last Updated:** December 2024
**Version:** 1.0
**Status:** Production-Ready ✅
