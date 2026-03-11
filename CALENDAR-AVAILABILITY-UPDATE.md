# Calendar Availability Highlighting - Update

## ✅ Changes Deployed

### Issue Fixed
Calendar was not highlighting customer-requested time windows, and auto-scheduling was not prioritizing those times.

### What Was Changed

#### 1. Calendar Visual Highlighting (CalendarBoard.tsx)

**Added visual indicators for customer availability:**
- Time slots with customer-requested availability now show:
  - **Green background** (`bg-green-50`) instead of white
  - **Green hover state** (`hover:bg-green-100`)
  - **Green indicator dot** in top-right corner
  - **Tooltip** showing "Customer requested time window"

**How it works:**
```typescript
// Checks all unassigned jobs for availability windows matching this time slot
const hasCustomerAvailability = unassignedJobs.some(job => {
    if (!job.request?.availabilityWindows) return false;

    return job.request.availabilityWindows.some(window => {
        // Match by day name (monday, tuesday, etc.) or specific date
        const dayMatches = windowDay === currentDayName || window.day === format(date, 'yyyy-MM-dd');

        // Check if current hour falls within window's time range
        return dayMatches && hour >= startHour && hour < endHour;
    });
});
```

#### 2. Enhanced Availability Parser (availabilityMatcher.ts)

**Updated to handle new `availabilityWindows` format:**

Previously only parsed string dates:
```typescript
// OLD: Only handled legacy string format
parseAvailability(job.request.availability);
```

Now handles structured availability windows:
```typescript
// NEW: Parses availabilityWindows objects
interface AvailabilityWindow {
    day: string;              // 'monday' or '2024-12-25'
    startTime: string;        // '09:00'
    endTime: string;          // '17:00'
    preferredTime?: string;   // 'morning', 'afternoon', 'evening'
}
```

**Features:**
- Generates multiple 30-minute time slots within each window
- Prioritizes `preferredTime` if specified (added to beginning of slots)
- Supports both day names and specific dates
- Falls back to legacy string format for backward compatibility

#### 3. Auto-Scheduling Priority

**Enhanced scheduling confidence scoring:**

The auto-scheduler now:
1. **Prioritizes customer availability windows** - Creates multiple slots (every 30 min) within requested windows
2. **Respects preferred times** - Morning/afternoon/evening preferences get higher scores
3. **Maintains existing confidence scoring**:
   - Tech availability: +40%
   - No conflicts: +40%
   - Customer preference order: +10-30%
   - Morning slots: +10%
   - Specialty match: +20%

**Example flow:**
```typescript
// Customer requests: Monday 9am-5pm, preferred morning
// Scheduler creates slots:
[
    Monday 9:00am,   // Preferred time (prioritized)
    Monday 9:30am,
    Monday 10:00am,
    Monday 10:30am,
    // ... continues every 30 minutes
    Monday 4:30pm
]

// Each slot is scored based on:
// - Tech availability during that time
// - No conflicts with existing jobs
// - Customer's preference ranking
// - Specialty match bonus
```

---

## 🎨 Visual Changes

### Before
- All calendar time slots looked the same
- No indication of customer preferences
- Hard to know which times to prioritize

### After
- **Green highlighted slots** show customer availability
- **Green dot indicator** in corner of available slots
- **Tooltip on hover** explains the highlighting
- Easy visual identification of preferred times

---

## 🔧 Technical Details

### Files Modified

1. **frontend/web/src/pages/CalendarBoard.tsx**
   - Updated `TimeSlot` component to accept `unassignedJobs` prop
   - Added availability checking logic
   - Applied conditional styling based on availability
   - Added visual indicators (green background, dot, tooltip)

2. **frontend/web/src/lib/availabilityMatcher.ts**
   - Rewrote `parseAvailability()` to handle `availabilityWindows`
   - Generates 30-minute slots within windows
   - Prioritizes `preferredTime` if specified
   - Maintains backward compatibility with string format

3. **frontend/web/src/lib/scheduler.ts**
   - Already had `isWithinTimeWindow()` function
   - Updated to use `availabilityWindows` format
   - Properly parses time ranges from window objects

---

## 🧪 How to Test

### Visual Highlighting

1. **Create jobs with availability windows**:
   ```javascript
   // In CreateJob form, set availability:
   {
       day: 'monday',
       startTime: '09:00',
       endTime: '17:00',
       preferredTime: 'morning'
   }
   ```

2. **View Calendar Board**:
   - Go to `/schedule` (CalendarBoard)
   - Look for green-highlighted time slots on Monday 9am-5pm
   - Green dot indicator should appear in top-right of slots
   - Hover to see "Customer requested time window" tooltip

3. **Multiple Jobs**:
   - Create multiple unassigned jobs with different windows
   - All matching time slots should be highlighted green
   - Different days/times should show different highlighting

### Auto-Scheduling Priority

1. **Create test scenario**:
   ```
   Job A: Customer wants Monday 9am-12pm (morning preferred)
   Job B: Customer wants Monday 1pm-5pm (afternoon preferred)
   Tech: Works Monday 8am-6pm
   ```

2. **Click "Auto-Assign" button**

3. **Expected results**:
   - Job A scheduled around 9:00-10:00am (customer's preferred morning)
   - Job B scheduled around 1:00-2:00pm (customer's afternoon window)
   - Both jobs within their requested windows

4. **Check console logs**:
   ```
   ✓ John Doe: Tech Smith on Dec 4, 2024 at 9:00 AM (95% match)
   ✓ Jane Smith: Tech Smith on Dec 4, 2024 at 1:30 PM (92% match)
   ```

---

## 📋 Availability Window Format

### In Job Creation Form

When creating jobs, users can specify:

```typescript
availabilityWindows: [
    {
        day: 'monday',           // or '2024-12-25' for specific date
        startTime: '09:00',      // 24-hour format
        endTime: '17:00',        // 24-hour format
        preferredTime: 'morning' // optional: 'morning', 'afternoon', 'evening'
    },
    {
        day: 'wednesday',
        startTime: '13:00',
        endTime: '18:00',
        preferredTime: 'afternoon'
    }
]
```

### Legacy Format (Still Supported)

```typescript
availability: [
    "2024-12-04T09:00:00",
    "2024-12-04T14:00:00",
    "2024-12-05T10:00:00"
]
```

---

## 🎯 Key Benefits

1. **Visual Feedback**: Dispatchers immediately see when customers are available
2. **Better Scheduling**: Auto-scheduler prioritizes customer-requested times
3. **Reduced Conflicts**: Less likely to schedule outside customer availability
4. **Improved Communication**: Clear indication of customer preferences
5. **Backward Compatible**: Works with existing jobs using old format

---

## 🚀 Deployment Status

✅ **Deployed**: 2026-01-20
✅ **Live URL**: https://maintenancemanager-c5533.web.app
✅ **Status**: Production Ready

---

## 📝 Usage Instructions

### For Dispatchers

1. **View available times**:
   - Open Calendar Board (`/schedule`)
   - Green slots indicate customer availability
   - Hover for details

2. **Manual scheduling**:
   - Drag unassigned jobs to green-highlighted slots
   - System respects customer windows

3. **Auto-scheduling**:
   - Click "Auto-Assign" button
   - System prioritizes green highlighted times
   - Check results in console for confidence scores

### For Admins

1. **Enable availability windows** in job intake forms
2. **Train staff** to request customer availability
3. **Monitor scheduling** to ensure preference compliance

---

## 🔮 Future Enhancements

Potential improvements:
- Color-code by number of requests (darker = more requests)
- Show customer names in tooltip
- Filter by specific customer availability
- Export availability heat map
- Mobile-friendly availability indicators

---

## 💡 Tips

- **Best Practice**: Always ask for 2-3 availability windows per job
- **Preferred Times**: Use morning/afternoon/evening for flexibility
- **Specific Dates**: Use YYYY-MM-DD format for urgent jobs
- **Wide Windows**: Larger windows (4+ hours) give scheduler more options
- **Multiple Days**: Offer alternative days for better scheduling

---

**Last Updated**: 2026-01-20
**Version**: 2.1.0 - Calendar Availability Enhancement
