# Timezone Date Selection Fix

**Date**: 2025-12-12
**Issue**: Month view was optimizing incorrect dates due to timezone conversion
**Status**: ✅ Fixed and deployed

## Problem

When selecting dates in the month view and clicking "Optimize", the AI was scheduling jobs on different days than the ones selected.

### Root Cause

The date selection system stored dates as strings in `YYYY-MM-DD` format:
```typescript
const formatDateKey = (date: Date): string => {
    return format(date, 'yyyy-MM-dd');
};
```

When converting back to Date objects for optimization, the code used:
```typescript
// INCORRECT - causes timezone issues
.map(dateStr => new Date(dateStr))
```

**Problem**: `new Date("2025-12-12")` interprets the string as **UTC midnight**, which can be a different calendar day in local timezones.

**Example**:
- User selects: December 12, 2025 (local time)
- Stored as: "2025-12-12"
- Converted to: `new Date("2025-12-12")` → December 12, 2025 00:00:00 **UTC**
- In Hawaii (UTC-10): December 11, 2025 14:00:00 local time ❌
- **Result**: AI schedules jobs on December 11 instead of December 12!

## Solution

Changed the date parsing to explicitly parse in **local timezone**:

```typescript
// CORRECT - parses in local timezone
.map(dateStr => {
    // Parse YYYY-MM-DD format in local timezone
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
})
```

This creates the Date object with the exact local calendar day:
- Input: "2025-12-12"
- Output: December 12, 2025 00:00:00 **local time** ✓

## Changes Made

### File: `frontend/web/src/pages/SoloCalendar.tsx`

**Line 382-388** - Fixed date parsing:
```typescript
// Before:
const datesToOptimize = Array.from(selectedDates)
    .map(dateStr => new Date(dateStr))
    .sort((a, b) => a.getTime() - b.getTime());

// After:
const datesToOptimize = Array.from(selectedDates)
    .map(dateStr => {
        // Parse YYYY-MM-DD format in local timezone
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day);
    })
    .sort((a, b) => a.getTime() - b.getTime());
```

**Line 393** - Added debug logging:
```typescript
// Log selected dates for debugging
console.log('📅 Selected dates for optimization:', datesToOptimize.map(d => format(d, 'MMM d, yyyy')));
```

## Testing

### Before Fix
1. Switch to Month view
2. Click December 12, 2025
3. Click "Optimize 1 Day"
4. **Bug**: Jobs scheduled on December 11 ❌

### After Fix
1. Switch to Month view
2. Click December 12, 2025
3. Click "Optimize 1 Day"
4. Console shows: `📅 Selected dates for optimization: ['Dec 12, 2025']`
5. **Fixed**: Jobs scheduled on December 12 ✓

## Impact

This fix ensures that:
- ✅ Selected dates match optimized dates across all timezones
- ✅ Month view selection works correctly
- ✅ Week view selection works correctly
- ✅ Day view selection works correctly
- ✅ "This Month" button selects correct days
- ✅ Console logs show exactly which dates are being optimized

## Deployment

**Live**: https://maintenancemanager-c5533.web.app/solo-calendar

**Test**:
1. Login as solo@test.com / Test123!
2. Switch to Month view
3. Click any specific date(s)
4. Open browser console (F12)
5. Click "Optimize N Days"
6. Verify console shows: `📅 Selected dates for optimization: ['Dec 12, 2025', ...]`
7. Verify jobs appear on the SELECTED dates (not different dates)

## Related Issues

This same timezone bug could potentially affect:
- Date comparisons in other parts of the app
- Any code using `new Date(stringDate)` pattern

**Recommendation**: Audit codebase for similar patterns and replace with explicit local timezone parsing.

## Prevention

To prevent similar issues in the future:

**Good practice**:
```typescript
// Explicit local timezone
const [year, month, day] = "2025-12-12".split('-').map(Number);
const date = new Date(year, month - 1, day);
```

**Bad practice**:
```typescript
// Implicit UTC (can cause timezone bugs)
const date = new Date("2025-12-12");
```

**Best practice**:
```typescript
// Use date-fns parseISO with timezone awareness
import { parseISO, zonedTimeToUtc } from 'date-fns';
const date = parseISO("2025-12-12"); // Still UTC
```
