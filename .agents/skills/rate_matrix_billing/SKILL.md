---
name: rate_matrix_billing
description: Implementation specifics for customer-specific rate matrices, tier discounts, and job module billing overrides.
---

# Customer Rate Matrix

This skill provides guidelines for implementing customer-specific pricing and rate cards, ensuring consistency across Quote and Invoice generation.

## Background
Different customers have different rate tiers depending on their service agreements. These custom overrides must be applied to labor and materials instead of just relying on the base default pricing model.

## Implementation Flow
1. **Customer Profile Source of Truth**:
   - Look up the customer's `rateTier`, `discountPercentage`, or custom flat rates located in their CRM profile inside the Firestore `customers` collection.

2. **Line Item Calculations**:
   - When generating Quote or Invoice line items, calculate the base cost, then reference the customer's rate profile.
   - Apply any necessary mathematical discounts or matrix multipliers *before* saving the final line items to the database.

3. **Invoicing Validation**:
   - Ensure the UI allows project managers/technicians to "Unlock & Edit" generated invoices to account for disputes, while still defaulting to the matrix calculation.
   - Verify that any bulk invoice processing (Batch Invoicing view) properly executes the rate matrix functions for each distinct customer grouping.
