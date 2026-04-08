---
name: date_handling
description: Best practices for parsing, validating, and displaying dates/timestamps between JS and Firebase.
---

# Date/Time Standardization

Due to historical crashes (`RangeError: Invalid time value` and `TypeError charAt on undefined`) in dispatching and job views, strict date handling is mandated.

## Firebase Timestamps vs Javascript Dates
- Data fetched from Firestore typically arrives as a Firebase `Timestamp` object (with `seconds` and `nanoseconds`).
- Calling standard JS `Date` functions (e.g. `charAt`, `toISOString`, `getTime`) on raw response payloads where a `Timestamp` is expected, or vice versa, WILL crash the UI.

## Mitigation Standard
1. **Strict Type Conversion**:
   - Use `dateObj = timestamp.toDate()` to convert Firebase date formats to native JS dates immediately.
   - Check if an assigned date variable is literally `undefined` or `null` before executing any display utility functions.

2. **Dispatcher & UI Views**:
   - Guard rendering blocks rendering start/end times with existential checks. 
   - E.g. `job.startTime ? formatDate(job.startTime) : 'Unassigned'`
   
3. **Robust Date Libraries**:
   - Standardize localized formatting and time differential math. 
   - Rely on resilient timestamp parsers that return `<Invalid date>` strings rather than propagating exceptions to the top of the component tree, ensuring the app doesn't crash on an empty value.
