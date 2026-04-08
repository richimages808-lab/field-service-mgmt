---
name: vendor_procurement
description: Workflow for updating vendor pricing, managing background searches, and updating the MaterialsInventory.
---

# Vendor Price Procurement

This skill guides the implementation of the AI-driven automated vendor evaluation system for materials and inventory management.

## Context
The system has migrated away from a manual trigger (the "Sparkles" button) to automated background processes to retrieve, sort, and save live vendor pricing to the material record.

## Architecture Guidelines
- **Automatic Lookups**: Trigger pricing evaluations in the background whenever a vendor is newly selected or a material's price becomes flagged as stale.
- **Sorting Logic**: Ensure the system mathematically evaluates and sorts vendors based on predefined logic (e.g. lowest price or best availability) to select the "Recommended Vendor."
- **Data Persistence**: 
  - Immediately save the winning vendor's details, the cost, and update the "Last Price Update" timestamp in the main `MaterialsInventory` record.
  - Do not block the main React UI thread; run intensive fetches asynchronously using server-side endpoints or background workers.
- **Error Handling**: Gracefully handle scraping or API failures when retrieving a vendor's catalog, preventing the inventory UI from hanging.
