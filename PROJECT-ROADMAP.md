# Field Service Management - Project Roadmap

**Last Updated**: 2025-12-12
**Current Status**: Phase 3 Complete - Full Preferences Integration (90%)

---

## ✅ COMPLETED FEATURES

### 1. Calendar View System (Complete)
- ✅ Day/Week/Month view toggle
- ✅ Compact month grid (Google Calendar style)
- ✅ Click-to-select day headers
- ✅ Quick selection buttons (This Day, This Week, This Month)
- ✅ Persistent selections (don't auto-clear after optimization)
- ✅ Visual selection states (blue background + checkmark)
- ✅ Timezone fix for date selection

### 2. Conflict Detection (Complete)
- ✅ Prevent double-booking on manual drag
- ✅ Three-case overlap detection algorithm
- ✅ User feedback with error toasts
- ✅ Shows conflicting job details
- ✅ Minute-level precision checks

### 3. Scheduling Preferences System (Complete)
- ✅ Full preferences UI with 7 categories
- ✅ Firestore persistence per-user
- ✅ Industry best-practice defaults

**Categories**:
- ✅ Work Schedule (start/end times, daily limits)
- ✅ Breaks (lunch, morning, afternoon)
- ✅ Parts Pickup (UI only - not in AI yet)
- ✅ Route Preferences (partial)
- ✅ Job Preferences (buffer, max jobs/day)
- ✅ Customer Preferences (UI only)
- ✅ Advanced (priority weighting, traffic toggle)

### 4. AI Scheduler Phase 2 Integration (Complete)
- ✅ Load user preferences from Firestore
- ✅ Apply work start/end times
- ✅ Apply max daily hours limit
- ✅ Apply max daily drive time limit
- ✅ Flexible break timing (lunch ±30 min)
- ✅ Custom break durations
- ✅ Buffer between jobs
- ✅ Max jobs per day enforcement
- ✅ Priority weighting slider (0-100)
- ✅ Traffic consideration toggle
- ✅ Console logging for transparency

### 5. Multi-Day Optimization (Complete)
- ✅ Select multiple days for batch optimization
- ✅ Jobs carry over to next day if unschedulable
- ✅ Realistic constraints (8hr day, breaks, rush hour)
- ✅ 4-6 jobs per day limit
- ✅ Real-time Google Maps drive times

### 6. AI Scheduler Phase 3 Integration (Complete)
- ✅ Parts Pickup Strategies (4 strategies: morning/enroute/asneeded/endofday)
- ✅ Max detour checking for enroute strategy
- ✅ Preferred start location (home/office/custom GPS)
- ✅ Complex jobs early scheduling (90+ min jobs prefer morning)
- ✅ Science-backed time-of-day scoring
- ✅ Strategy-specific console logging

---

## 🔄 IN PROGRESS

Nothing currently in progress.

---

## 📋 NEXT UP - Phase 4

### Priority 1: Advanced Optimization

#### 1.1 Route Clustering
**Status**: Not implemented
**Effort**: Medium-High (3-4 hours)

Group nearby jobs together to minimize backtracking:
- Cluster jobs by geographic proximity
- Prefer jobs in same neighborhood
- Avoid zig-zagging across service area

**Files to modify**:
- `frontend/web/src/lib/aiScheduler.ts` - Add clustering algorithm
- Consider k-means or DBSCAN clustering

---

#### 1.2 Customer Time Window Strictness
**Status**: Basic implementation only
**Effort**: Medium (2 hours)

Enhance customer availability window handling:
- `respectTimeWindows: true` → Hard constraint (never violate)
- `respectTimeWindows: false` → Soft constraint (prefer but allow violations)
- `allowEarlyArrivals: false` → Don't arrive before window start
- `callAheadBuffer: 15` → Schedule call 15 min before arrival

**Files to modify**:
- `frontend/web/src/lib/aiScheduler.ts` - Update `isTimeAvailable()` and scoring

---

### Priority 2: UI/UX Enhancements

#### 2.1 Drag & Drop in Month View
**Status**: Not implemented
**Effort**: Medium (2-3 hours)

Allow dragging jobs directly onto month cells:
- Currently only works in Day/Week views
- Month view is read-only for drag operations

**Files to modify**:
- `frontend/web/src/pages/SoloCalendar.tsx` - Add drop zone to month cells

---

#### 2.2 Optimization Preview
**Status**: Not implemented
**Effort**: Medium (2 hours)

Show preview before running optimization:
- Estimated jobs per day
- Estimated drive time per day
- Potential conflicts warning
- Allow user to adjust before committing

**Files to create**:
- `frontend/web/src/components/OptimizationPreview.tsx`

---

#### 2.3 Conflict Warnings During Optimization
**Status**: Not implemented
**Effort**: Low (1 hour)

Check for conflicts before AI scheduling:
- Warn if optimization might create overlaps
- Show which days have potential conflicts
- Allow user to clear existing jobs first

**Files to modify**:
- `frontend/web/src/pages/SoloCalendar.tsx` - Pre-check conflicts

---

### Priority 3: Advanced Features

#### 3.1 Weather Awareness
**Status**: Future feature
**Effort**: High (4-5 hours)

Adjust schedule based on weather forecast:
- Integrate weather API (OpenWeather, WeatherAPI)
- Move outdoor jobs away from rainy days
- Prioritize indoor jobs during bad weather

**Files to create**:
- `frontend/web/src/lib/weather.ts`
- `firebase/functions/src/weather.ts` (Cloud Function)

**API needed**: OpenWeatherMap API or similar

---

#### 3.2 Undo/Redo Optimization
**Status**: Not implemented
**Effort**: Medium (2-3 hours)

Save optimization state for undo:
- Before optimization: snapshot current schedule
- After optimization: allow rollback
- Compare results side-by-side

**Files to modify**:
- `frontend/web/src/pages/SoloCalendar.tsx` - Add state history

---

#### 3.3 Optimization Templates
**Status**: Not implemented
**Effort**: Medium (2-3 hours)

Save common date selections as templates:
- "Weekdays Only" (Mon-Fri)
- "Next 2 Weeks"
- "All Mondays This Month"
- Custom saved templates

**Files to create**:
- `frontend/web/src/components/OptimizationTemplates.tsx`

---

#### 3.4 Multi-Technician Optimization
**Status**: Not implemented
**Effort**: Very High (6-8 hours)

Optimize for multiple technicians simultaneously:
- Load all techs' jobs
- Balance workload across team
- Prevent assigning same job to multiple techs
- Consider tech skills/specializations

**Files to modify**:
- `frontend/web/src/lib/aiScheduler.ts` - Major refactor
- `frontend/web/src/pages/AdminDashboard.tsx` - Add multi-tech UI

---

### Priority 4: Performance & Polish

#### 4.1 Fix TypeScript Errors
**Status**: 6 errors remaining
**Effort**: Low (1 hour)

Fix pre-existing TypeScript compilation errors:
- `src/lib/availabilityMatcher.ts` - instanceof error
- `src/lib/smartScheduler.ts` - export error
- `src/pages/CalendarBoard.tsx` - onSave prop error
- `src/pages/CustomerHistory.tsx` - spread type error
- `src/pages/SoloCalendar.tsx` - onSave prop error

---

#### 4.2 Optimize Bundle Size
**Status**: Warning (725 KB ui chunk)
**Effort**: Medium (2-3 hours)

Reduce bundle size:
- Implement code splitting
- Lazy load heavy components
- Tree-shake unused dependencies

**Current**: 725 KB ui chunk (warning threshold: 500 KB)

---

#### 4.3 Mobile Responsiveness
**Status**: Desktop-optimized only
**Effort**: Medium (3-4 hours)

Optimize for mobile/tablet:
- Month view horizontal scroll on small screens
- Touch-friendly drag & drop
- Responsive sidebar layout

---

## 🎯 RECOMMENDED NEXT STEPS

**To continue development, just type "continue" and I will:**

1. **Implement Parts Pickup Strategies** (Priority 1.1)
   - Add strategy logic to AI scheduler
   - Respect user's selected strategy
   - Test all 4 strategies

2. **Add Preferred Start Location** (Priority 1.3)
   - Quick win, low effort
   - Use preference for route starting point
   - Test with home/office/custom locations

3. **Complex Jobs Early** (Priority 1.4)
   - Another quick win
   - Improve scheduling quality
   - Test with mixed job durations

**OR** specify which feature you want to work on next!

---

## 📊 Progress Tracking

**Overall Completion**: ~80%

**Core Features**: 100% complete ✅
- ✅ Calendar views
- ✅ Conflict detection
- ✅ Preferences UI
- ✅ AI integration (Phase 2)
- ✅ Complete preferences integration (Phase 3) - 90% done!

**Advanced Features**: 25% complete
- ❌ Weather awareness
- ❌ Undo/redo
- ❌ Templates
- ❌ Multi-tech optimization
- ❌ Route clustering

**Polish**: 60% complete
- ✅ TypeScript errors fixed
- ❌ Bundle optimization
- ❌ Mobile responsiveness

---

## 💡 Quick Wins (< 2 hours each)

1. ✅ ~~Preferred start location integration~~ **DONE**
2. ✅ ~~Complex jobs early implementation~~ **DONE**
3. ✅ ~~Fix TypeScript errors~~ **DONE**
4. ✨ Conflict warnings during optimization
5. ✨ Optimization preview modal

---

## 🚀 High-Impact Features (Worth the effort)

1. 🎯 Route clustering (dramatic drive time reduction)
2. ✅ ~~Parts pickup strategies (proper parts run handling)~~ **DONE**
3. 🎯 Multi-technician optimization (team coordination)
4. 🎯 Weather awareness (customer satisfaction)
5. 🎯 Drag & drop in month view (UX improvement)

---

## 📝 Notes

- All Phase 1 & 2 features are tested and deployed
- Test account: solo@test.com / Test123!
- Live deployment: https://maintenancemanager-c5533.web.app/solo-calendar
- Documentation: See `*-UPDATE.md` files in project root

**Type "continue" to start Phase 3!**
