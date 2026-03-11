-- BigQuery Views for DispatchBox Reporting
-- These views parse the Firestore-to-BigQuery extension changelog tables
-- Dataset: firestore_export
-- Project: maintenancemanager-c5533

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. REVENUE BY DATE (from invoices)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW `maintenancemanager-c5533.firestore_export.revenue_by_date` AS
SELECT
    document_name AS invoice_id,
    JSON_VALUE(data, '$.org_id') AS org_id,
    JSON_VALUE(data, '$.status') AS status,
    CAST(JSON_VALUE(data, '$.total') AS FLOAT64) AS total,
    TIMESTAMP_SECONDS(CAST(JSON_VALUE(data, '$.createdAt._seconds') AS INT64)) AS created_at,
    TIMESTAMP_SECONDS(CAST(JSON_VALUE(data, '$.paidAt._seconds') AS INT64)) AS paid_at,
    JSON_VALUE(data, '$.customer_name') AS customer_name,
    JSON_VALUE(data, '$.customer_id') AS customer_id
FROM `maintenancemanager-c5533.firestore_export.invoices_raw_latest`
WHERE document_name IS NOT NULL
  AND JSON_VALUE(data, '$.org_id') IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. JOB PIPELINE (jobs by status)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW `maintenancemanager-c5533.firestore_export.job_pipeline` AS
SELECT
    document_name AS job_id,
    JSON_VALUE(data, '$.org_id') AS org_id,
    JSON_VALUE(data, '$.status') AS status,
    JSON_VALUE(data, '$.category') AS category,
    JSON_VALUE(data, '$.source') AS source,
    JSON_VALUE(data, '$.priority') AS priority,
    JSON_VALUE(data, '$.assignedTo') AS assigned_to,
    JSON_VALUE(data, '$.assignedTechName') AS assigned_tech_name,
    CAST(JSON_VALUE(data, '$.costs.total') AS FLOAT64) AS total_cost,
    CAST(JSON_VALUE(data, '$.costs.labor.hours') AS FLOAT64) AS labor_hours,
    CAST(JSON_VALUE(data, '$.duration') AS FLOAT64) AS duration_minutes,
    TIMESTAMP_SECONDS(CAST(JSON_VALUE(data, '$.createdAt._seconds') AS INT64)) AS created_at,
    TIMESTAMP_SECONDS(CAST(JSON_VALUE(data, '$.completedAt._seconds') AS INT64)) AS completed_at,
    TIMESTAMP_SECONDS(CAST(JSON_VALUE(data, '$.updatedAt._seconds') AS INT64)) AS updated_at
FROM `maintenancemanager-c5533.firestore_export.jobs_raw_latest`
WHERE document_name IS NOT NULL
  AND JSON_VALUE(data, '$.org_id') IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. INVOICE AGING (outstanding invoices)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW `maintenancemanager-c5533.firestore_export.invoice_aging` AS
SELECT
    document_name AS invoice_id,
    JSON_VALUE(data, '$.org_id') AS org_id,
    JSON_VALUE(data, '$.status') AS status,
    CAST(JSON_VALUE(data, '$.total') AS FLOAT64) AS total,
    CAST(JSON_VALUE(data, '$.balance') AS FLOAT64) AS balance,
    CAST(JSON_VALUE(data, '$.amountPaid') AS FLOAT64) AS amount_paid,
    TIMESTAMP_SECONDS(CAST(JSON_VALUE(data, '$.createdAt._seconds') AS INT64)) AS created_at,
    TIMESTAMP_SECONDS(CAST(JSON_VALUE(data, '$.dueDate._seconds') AS INT64)) AS due_date,
    JSON_VALUE(data, '$.customer_name') AS customer_name,
    JSON_VALUE(data, '$.customer_id') AS customer_id,
    DATE_DIFF(CURRENT_DATE(), DATE(TIMESTAMP_SECONDS(CAST(JSON_VALUE(data, '$.createdAt._seconds') AS INT64))), DAY) AS days_outstanding
FROM `maintenancemanager-c5533.firestore_export.invoices_raw_latest`
WHERE document_name IS NOT NULL
  AND JSON_VALUE(data, '$.org_id') IS NOT NULL
  AND JSON_VALUE(data, '$.status') IN ('sent', 'overdue', 'partial');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. QUOTE CONVERSION
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW `maintenancemanager-c5533.firestore_export.quote_conversion` AS
SELECT
    document_name AS quote_id,
    JSON_VALUE(data, '$.org_id') AS org_id,
    JSON_VALUE(data, '$.status') AS status,
    CAST(JSON_VALUE(data, '$.total') AS FLOAT64) AS total,
    JSON_VALUE(data, '$.customerName') AS customer_name,
    TIMESTAMP_SECONDS(CAST(JSON_VALUE(data, '$.createdAt._seconds') AS INT64)) AS created_at,
    TIMESTAMP_SECONDS(CAST(JSON_VALUE(data, '$.approvedAt._seconds') AS INT64)) AS approved_at,
    TIMESTAMP_SECONDS(CAST(JSON_VALUE(data, '$.declinedAt._seconds') AS INT64)) AS declined_at
FROM `maintenancemanager-c5533.firestore_export.quotes_raw_latest`
WHERE document_name IS NOT NULL
  AND JSON_VALUE(data, '$.org_id') IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. TOP CUSTOMERS (revenue by customer from invoices)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Uses revenue_by_date view (no separate view needed, query in Cloud Function)

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. PROFITABILITY (revenue vs costs from jobs)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Uses job_pipeline view for costs + revenue_by_date for revenue (query in Cloud Function)

-- ═══════════════════════════════════════════════════════════════════════════════
-- Notes:
-- - job_pipeline covers: job categories, avg job metrics, job sources, tech utilization
-- - revenue_by_date covers: revenue trend, top customers, profitability (revenue side)
-- - invoice_aging covers: outstanding AR aging
-- - quote_conversion covers: quote win rates
-- - inventory_alerts stays Firestore-only (current stock levels, not historical)
-- ═══════════════════════════════════════════════════════════════════════════════
