# Calendar Board with Integrated Map

## Overview

The new Calendar Board transforms the Kanban scheduling interface into a traditional calendar view while preserving all smart scheduling functionality and adding an integrated route map.

**Access**: Navigate to "Calendar" in the main navigation (requires `dispatcher_console` plan feature)

---

## Key Features

### 1. **Week Calendar View**
- **Time-based grid**: 7am-7pm daily schedule with hourly slots
- **Multi-technician columns**: See all technicians' schedules side-by-side
- **Unassigned column**: Backlog of jobs waiting to be scheduled
- **5-day work week**: Monday through Friday (configurable)

### 2. **Integrated Route Map**
- **Split-screen layout**: Calendar (2/3) + Map (1/3)
- **Toggle visibility**: Show/hide map with button
- **Real-time routes**: Shows technician routes with directional arrows
- **Color-coded techs**: Each technician gets a unique route color
- **Job markers**: Blue (scheduled), Green (completed), with time labels
- **Auto-fit bounds**: Map automatically zooms to show all selected routes

### 3. **Drag-and-Drop Scheduling**
- **Drag jobs between time slots**: Reschedule by dragging to new time
- **Drag to different technicians**: Reassign by dragging to another tech column
- **Visual feedback**: Slot highlights on hover, job becomes translucent while dragging
- **Precise timing**: Drop into specific hour slots, minutes preserved

### 4. **Smart Auto-Assignment**
- **One-click scheduling**: "Auto-Assign" button schedules all unassigned jobs
- **Customer availability matching**: Uses customer's 3 preferred time slots
- **Conflict avoidance**: Won't double-book technicians
- **Specialty matching**: Prefers techs with relevant skills
- **Travel optimization**: Minimizes drive time between jobs
- **Confidence scoring**: Shows match quality (85%+ = excellent)

### 5. **Filtering & Navigation**
- **Technician filters**: Show/hide individual technician schedules
- **Unassigned toggle**: Show/hide backlog column
- **Week navigation**: Previous/Next week buttons
- **Today button**: Jump back to current week
- **Date range display**: Shows current week range

### 6. **Job Details**
- **Clickable jobs**: Click any job to edit details
- **Visual indicators**:
  - **Border color**: Priority (Red=Critical, Orange=High, Yellow=Medium, Green=Low)
  - **Background color**: Status (Gray=Pending, Blue=Scheduled, Purple=In Progress, Green=Completed)
  - **Icons**: Technician, duration, parts needed
- **Auto-sizing**: Job height scales with duration (60min = 60px)

---

## How to Use

### Basic Scheduling

1. **View unassigned jobs** in the "Unassigned" column (left side)
2. **Drag a job** to a time slot in a technician's column
3. **Job is automatically saved** to Firestore with:
   - Scheduled time (hour + minutes preserved)
   - Assigned technician
   - Status changed to "scheduled"

### Auto-Assignment

1. Click **"Auto-Assign"** button (top right)
2. System analyzes:
   - Customer's 3 available time slots
   - Technician working hours
   - Existing schedule conflicts
   - Specialty matches
   - Travel distances
3. Shows summary: How many scheduled vs. unscheduled
4. Check console for detailed match information

### Week Navigation

- **Previous Week**: Go back 7 days
- **Today**: Jump to current week
- **Next Week**: Go forward 7 days
- **Date range displayed**: Shows Mon-Fri range

### Map Integration

1. **Toggle map** with "Show Map" / "Hide Map" button
2. **Filter technicians** to show specific routes
3. **View routes**:
   - Dashed colored lines connect jobs in sequence
   - Arrows show direction of travel
   - Tech marker at last job location
   - Time tooltips on job markers
4. **Click markers** for job details popup

### Filtering

- Click **technician name** to show/hide their schedule
- Click **"Unassigned"** to toggle backlog column
- Selected filters are **highlighted in purple**
- Map automatically updates to show only selected techs

---

## Technical Details

### Time Slots
- **Start time**: 7:00 AM
- **End time**: 7:00 PM
- **Slot height**: 60px per hour
- **Precision**: Minute-level accuracy preserved

### Job Rendering
- **Position**: Calculated from hour + minute offset
- **Height**: Based on job duration (30min = 30px, 90min = 90px)
- **Minimum height**: 40px for readability
- **Overlap handling**: Jobs stack vertically within time slots

### Data Flow
1. **Real-time sync**: Firestore `onSnapshot` for jobs and technicians
2. **Optimistic updates**: UI updates immediately on drag
3. **Auto-save**: Changes saved to Firestore on drop
4. **Error handling**: Alert shown if save fails

### Map Technology
- **Library**: React Leaflet (OpenStreetMap tiles)
- **Markers**: Custom icons from leaflet-color-markers
- **Routes**: Polylines with dashed style
- **Arrows**: Custom SVG icons rotated by bearing
- **Bounds**: Auto-calculated from visible job locations

---

## Smart Scheduling Integration

The calendar board uses the same smart scheduling engine as the rest of the system:

### Files
- **[CalendarBoard.tsx](frontend/web/src/pages/CalendarBoard.tsx)** - Main calendar component (400+ lines)
- **[smartScheduler.ts](frontend/web/src/lib/smartScheduler.ts)** - Auto-assignment logic
- **[availabilityMatcher.ts](frontend/web/src/lib/availabilityMatcher.ts)** - Matching algorithm
- **[scheduler.ts](frontend/web/src/lib/scheduler.ts)** - Travel optimization
- **[TechnicianMap.tsx](frontend/web/src/components/dispatcher/TechnicianMap.tsx)** - Map component

### Customer Availability
Jobs created with customer's 3 preferred time slots:
```typescript
job.request.availability = [
  "2024-12-10T09:00:00",  // Most preferred
  "2024-12-11T14:00:00",  // Second choice
  "2024-12-12T10:00:00"   // Third choice
]
```

### Auto-Assignment Algorithm
1. Parse customer availability slots
2. For each technician:
   - Check if working during customer slots
   - Check for schedule conflicts
   - Calculate specialty match
   - Score confidence (0-100%)
3. Select best match (highest confidence)
4. Assign and schedule job
5. Repeat for remaining jobs

### Confidence Scoring
- **40%**: Tech available during slot
- **40%**: No schedule conflicts
- **10%**: Customer preference rank (1st > 2nd > 3rd)
- **10%**: Morning slot bonus (before noon)
- **20%**: Specialty match bonus

**Example**: 85% match = Tech available, no conflicts, customer's 2nd choice, specialty match

---

## Comparison: Kanban vs. Calendar

### Kanban Board (Old)
- **View**: Column-based (Backlog, Today, In Progress, Done)
- **Scheduling**: Daily or weekly view
- **Map**: Not integrated
- **Best for**: Task workflow management

### Calendar Board (New)
- **View**: Time-grid calendar with hourly slots
- **Scheduling**: Precise time-based scheduling
- **Map**: Integrated split-screen
- **Best for**: Time-specific scheduling and route planning

**Both boards** share:
- Drag-and-drop functionality
- Smart auto-assignment
- Route optimization
- Job editing
- Real-time Firestore sync

---

## Use Cases

### Use Case 1: Morning Dispatcher Workflow
1. Open Calendar Board at start of day
2. Review unassigned jobs in left column
3. Click "Auto-Assign" to schedule all jobs
4. Review map to verify routes make sense
5. Manually adjust any jobs that need special handling
6. Monitor throughout day as techs complete jobs

### Use Case 2: Emergency Job Insertion
1. New urgent job comes in (phone call)
2. Create job with customer availability
3. Drag to nearest available slot
4. Check map to see if route still optimized
5. Notify technician of schedule change

### Use Case 3: Route Optimization
1. View a single technician's schedule
2. Check map for travel inefficiencies
3. Drag jobs to reorder for better route
4. Watch map update in real-time
5. Confirm optimized route

### Use Case 4: Multi-Tech Coordination
1. View all technicians side-by-side
2. Balance workload across team
3. Drag jobs from overloaded tech to available tech
4. Ensure all techs finish around same time
5. Check map for any geographic clustering

---

## Plan-Based Access

Calendar Board requires **`dispatcher_console`** feature, available in:
- ✅ Small Business plan
- ✅ Enterprise plan
- ❌ Individual plan (manual scheduling only)
- ⏰ Trial plan (14 days, then expires)

**Upgrade prompt** shown if user tries to access without permission.

---

## Keyboard & Mouse

### Drag-and-Drop
- **Click and hold** on job card
- **Drag** to desired time slot
- **Release** to drop and save

### Scrolling
- **Vertical scroll**: Navigate through hours
- **Horizontal scroll**: Navigate through technicians (if many)

### Clicking
- **Job card**: Open edit modal
- **Tech name**: Toggle filter
- **Map marker**: Show job details popup
- **Time slot**: Drop target (no direct click action)

---

## Troubleshooting

### Jobs not appearing on calendar
- **Check filter**: Ensure technician is selected
- **Check date**: Job might be scheduled for different week
- **Check status**: Only scheduled jobs show on calendar

### Map not showing routes
- **Check tech selection**: At least one tech must be selected
- **Check scheduled jobs**: Tech must have jobs for current day
- **Check locations**: Jobs must have valid lat/lng coordinates

### Auto-assign not working
- **Check availability**: Jobs must have `request.availability` array
- **Check techs**: At least one active technician required
- **Check working hours**: Tech must work during customer slots
- **Check conflicts**: Tech schedule might be fully booked

### Drag-and-drop not working
- **Check browser**: HTML5 drag-and-drop required (modern browsers)
- **Check permissions**: User must have edit access
- **Reload page**: React DnD might need refresh

### Map markers overlapping
- **Zoom in**: Use mouse wheel or +/- buttons
- **Separate jobs**: Reschedule to different times
- **Check locations**: Might be same address

---

## Future Enhancements

Potential improvements for v2:
- [ ] Month view (in addition to week view)
- [ ] Day view (zoomed into single day, 15-min slots)
- [ ] Recurring job patterns (weekly HVAC maintenance)
- [ ] Multi-day job spanning (installation jobs)
- [ ] Tech availability calendar (vacation, sick days)
- [ ] Customer-facing booking calendar (public URL)
- [ ] Email notifications on schedule changes
- [ ] Mobile-responsive calendar (swipe navigation)
- [ ] Export to iCal/Google Calendar
- [ ] Print schedule view

---

## Related Documentation

- **[SCHEDULING-OPTIMIZATION-GUIDE.md](SCHEDULING-OPTIMIZATION-GUIDE.md)** - Smart scheduling algorithm details
- **[TESTING-PLAN-FEATURES.md](TESTING-PLAN-FEATURES.md)** - Test accounts and scenarios
- **[SESSION-SUMMARY-12-6-25.md](SESSION-SUMMARY-12-6-25.md)** - Development session notes

---

**Created**: December 6, 2025
**Route**: `/calendar`
**Component**: `CalendarBoard.tsx`
**Required Feature**: `dispatcher_console`
