---
name: dashboard_grid
description: Implementation standards for drag-and-drop dashboard grid persistence using ResponsiveGridLayout.
---

# Dashboard Grid Layouts

Because maintaining stateful, responsive layout grids for widgets has been historically prone to issues, follow this pattern when building layout management pages (e.g. Admin Dashboard, Customer Portal Dashboard).

## Core Requirements
When using a React grid layout library (like `react-grid-layout`):

1. **Width Hook Override**:
   - Avoid generic `WidthProvider` wrappers if they cause layout rendering bugs or fail to load early enough.
   - Implement a custom React hook to measure the parent container's width bounds to feed into the `ResponsiveGridLayout`.
   
2. **Immediate Placement Yields**:
   - Ensure widgets load into their correct column/row `[x, y, w, h]` positions on the initial page load without flash-rendering stacked at `[0,0]`.

3. **Layout Serialization Engine**:
   - Utilize callbacks like `onLayoutChange` to serialize the dragged/resized dimensions and automatically push the updated state to the user's profile configuration in Firestore.
   - This ensures widgets remain exactly where they were last dragged upon a full page reload.
