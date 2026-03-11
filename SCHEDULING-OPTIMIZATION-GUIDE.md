# Smart Scheduling with Availability Matching

## Overview

The new smart scheduler integrates customer availability (3 time slots) with technician schedules to automatically find the best match.

## How It Works

### 1. Customer Provides 3 Available Time Slots

When creating a job, customers provide 3 preferred times:
```typescript
job.request.availability = [
  "2024-12-10T09:00:00",  // Slot 1: Most preferred
  "2024-12-11T14:00:00",  // Slot 2
  "2024-12-12T10:00:00"   // Slot 3
]
```

### 2. Technician Schedule Constraints

Each technician has:
- **Working hours**: e.g., 8am-5pm
- **Preferred days**: e.g., Monday-Friday
- **Existing schedule**: Already booked jobs

```typescript
tech.preferences = {
  working_hours: { start: "08:00", end: "17:00" },
  preferred_days: [1, 2, 3, 4, 5] // Mon-Fri
}
```

### 3. Smart Matching Algorithm

The system finds the best match by:

✅ **Checking availability** - Tech must be working during customer's slots
✅ **Avoiding conflicts** - No overlapping jobs
✅ **Matching specialties** - Prefers techs with relevant skills
✅ **Optimizing travel** - Minimizes drive time between jobs
✅ **Respecting preferences** - Customer's first choice gets priority

### 4. Confidence Scoring

Each match gets a confidence score (0-100%):

- **40%** - Tech available during slot
- **40%** - No schedule conflicts
- **10%** - Customer preference rank (1st choice = 10%, 2nd = 5%, 3rd = 0%)
- **10%** - Morning slot bonus (jobs before noon)
- **20%** - Specialty match bonus

**Example**: 85% match = Excellent fit, 60% = Good fit, <50% = Risky

---

## Usage

### Auto-Assign Jobs

```typescript
import { autoAssignJobs } from '../lib/smartScheduler';

const result = await autoAssignJobs(
  unscheduledJobs,  // Jobs needing assignment
  availableTechs,   // Active technicians
  existingJobs      // Already scheduled jobs
);

// Result includes:
result.scheduledJobs;    // Jobs successfully scheduled
result.unscheduledJobs;  // Jobs that couldn't be matched
result.matches;          // Detailed match information
result.summary;          // Human-readable summary
```

### Check Single Job Availability

```typescript
import { findBestTimeSlot } from '../lib/availabilityMatcher';

const match = findBestTimeSlot(job, tech, existingJobs);

if (match) {
  console.log(`Best time: ${match.slot}`);
  console.log(`Confidence: ${match.confidence * 100}%`);
  console.log(`Reason: ${match.reason}`);
}
```

### Suggest Alternative Times

If no customer slots match:

```typescript
import { suggestAlternativeTimes } from '../lib/smartScheduler';

const alternatives = suggestAlternativeTimes(job, tech, existingJobs);
// Returns: Up to 5 alternative time slots in next 7 days
```

---

## Integration Points

### 1. Dispatcher Console

**File**: `frontend/web/src/pages/DispatcherConsole.tsx`

Add "Auto-Assign" button:
```typescript
const handleAutoAssign = async () => {
  const unscheduled = jobs.filter(j => j.status === 'pending');
  const result = await autoAssignJobs(unscheduled, technicians, jobs);

  // Save scheduled jobs to Firestore
  for (const job of result.scheduledJobs) {
    await updateDoc(doc(db, 'jobs', job.id), {
      assigned_tech_id: job.assigned_tech_id,
      assigned_tech_name: job.assigned_tech_name,
      scheduled_at: job.scheduled_at,
      status: 'scheduled'
    });
  }

  // Show summary
  alert(result.summary.join('\n'));
};
```

### 2. Job Creation

**File**: `frontend/web/src/pages/CreateJob.tsx`

When customer selects availability, show matching techs:

```typescript
const [availabilitySlots, setAvailabilitySlots] = useState<Date[]>([]);

// After customer adds 3 slots, find matches
useEffect(() => {
  if (availabilitySlots.length === 3) {
    const matches = matchJobsWithTechs(
      [currentJob],
      allTechnicians,
      scheduledJobs
    );

    if (matches.length > 0) {
      const best = matches[0];
      setRecommendation(
        `Best match: ${best.tech.name} on ${format(best.matchedSlot, 'MMM d @ h:mm a')} (${best.confidence * 100}% match)`
      );
    }
  }
}, [availabilitySlots]);
```

### 3. Email to Ticket

**File**: `firebase/functions/src/inbound.ts`

Auto-match when ticket created from email:

```typescript
// After creating job from email
const matches = await matchJobsWithTechs([newJob], technicians, existingJobs);

if (matches.length > 0) {
  // Auto-assign best match
  await updateJob(newJob.id, {
    assigned_tech_id: matches[0].tech.id,
    scheduled_at: matches[0].matchedSlot,
    status: 'scheduled'
  });

  // Send confirmation email to customer
  await sendConfirmation(customer, matches[0]);
}
```

---

## Example Scenarios

### Scenario 1: Perfect Match
```
Customer slots:
  - Dec 10 @ 9am
  - Dec 11 @ 2pm
  - Dec 12 @ 10am

Tech "John" available:
  - Mon-Fri 8am-5pm
  - No conflicts on Dec 10

Result: ✅ Scheduled Dec 10 @ 9am (95% confidence)
```

### Scenario 2: Conflict Resolution
```
Customer slots:
  - Dec 10 @ 9am (CONFLICT - Tech has another job)
  - Dec 10 @ 2pm (AVAILABLE)
  - Dec 11 @ 9am (AVAILABLE)

Result: ✅ Scheduled Dec 10 @ 2pm (85% confidence)
```

### Scenario 3: No Match Found
```
Customer slots:
  - Dec 10 @ 9am (Tech not working)
  - Dec 10 @ 7pm (Outside working hours)
  - Dec 11 @ 9am (Already booked)

Result: ❌ No match found
Suggestions: Dec 12 @ 10am, Dec 13 @ 9am, Dec 13 @ 2pm
```

---

## Benefits

### For Customers
✅ Gets scheduled at their preferred time
✅ Faster response (auto-assignment)
✅ Fewer back-and-forth calls

### For Dispatchers
✅ Saves time on manual scheduling
✅ Reduces conflicts and double-bookings
✅ Optimizes technician routes

### For Technicians
✅ Better work-life balance (respects hours)
✅ Matched to their specialties
✅ Optimized travel routes

---

## Configuration

### Default Settings

**File**: `frontend/web/src/types.ts`

```typescript
// Default tech working hours if not set
DEFAULT_HOURS = {
  start: "08:00",
  end: "17:00"
}

// Default preferred days (Monday-Friday)
DEFAULT_DAYS = [1, 2, 3, 4, 5]
```

### Customization

Adjust scoring weights in `availabilityMatcher.ts`:

```typescript
// Line 90-100: Confidence scoring
confidence += 0.4;  // Tech available (adjust weight)
confidence += 0.4;  // No conflicts
confidence += 0.1;  // Customer preference
confidence += 0.1;  // Morning bonus
```

---

## Testing

### Test with Demo Data

```typescript
// Create test job
const testJob: Job = {
  id: 'test-123',
  org_id: 'demo-org',
  customer: { name: 'Test Customer', ... },
  request: {
    description: 'HVAC repair',
    availability: [
      '2024-12-10T09:00:00',
      '2024-12-10T14:00:00',
      '2024-12-11T10:00:00'
    ],
    photos: []
  },
  estimated_duration: 90,
  priority: 'high',
  status: 'pending'
};

// Find matches
const matches = matchJobsWithTechs([testJob], technicians, []);
console.log('Matches:', matches.map(m => getMatchSummary(m)));
```

---

## Troubleshooting

### "No matches found"

**Causes**:
1. Customer availability outside tech working hours
2. All techs fully booked
3. No active technicians

**Solutions**:
- Use `suggestAlternativeTimes()` to find openings
- Add more technicians
- Extend tech working hours
- Suggest customer picks different times

### Low confidence matches (<50%)

**Causes**:
- Customer's preferred slots conflict with schedule
- No specialty match
- Job scheduled far in future

**Solutions**:
- Review match manually before confirming
- Ask customer for more availability options
- Assign to tech with closest specialty

---

## Future Enhancements

- [ ] Multi-day job scheduling
- [ ] Recurring job patterns
- [ ] Travel time zones (rush hour adjustments)
- [ ] Customer priority levels (VIP gets first pick)
- [ ] Team assignments (2+ techs per job)
- [ ] Emergency override (bump lower priority)

---

**Created**: December 6, 2025
**Files**:
- `availabilityMatcher.ts` - Core matching logic
- `smartScheduler.ts` - High-level scheduling functions
- `scheduler.ts` - Travel optimization helpers
