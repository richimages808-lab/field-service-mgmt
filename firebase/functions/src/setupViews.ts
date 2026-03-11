// Temporary admin function to create BigQuery views
// Deploy, invoke once, then delete this file

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { BigQuery } from "@google-cloud/bigquery";

const bigquery = new BigQuery();
const PROJECT = process.env.GCLOUD_PROJECT || 'maintenancemanager-c5533';
const DATASET = 'firestore_export';

export const setupBigQueryViews = onCall({ cors: true, invoker: "public" }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Must be authenticated.');
    }

    const views = [
        {
            name: 'revenue_by_date',
            sql: `CREATE OR REPLACE VIEW \`${PROJECT}.${DATASET}.revenue_by_date\` AS
SELECT
    document_name AS invoice_id,
    JSON_VALUE(data, '$.org_id') AS org_id,
    JSON_VALUE(data, '$.status') AS status,
    CAST(JSON_VALUE(data, '$.total') AS FLOAT64) AS total,
    TIMESTAMP_SECONDS(CAST(JSON_VALUE(data, '$.createdAt._seconds') AS INT64)) AS created_at,
    TIMESTAMP_SECONDS(CAST(JSON_VALUE(data, '$.paidAt._seconds') AS INT64)) AS paid_at,
    JSON_VALUE(data, '$.customer_name') AS customer_name,
    JSON_VALUE(data, '$.customer_id') AS customer_id
FROM \`${PROJECT}.${DATASET}.invoices_raw_latest\`
WHERE document_name IS NOT NULL AND JSON_VALUE(data, '$.org_id') IS NOT NULL`
        },
        {
            name: 'job_pipeline',
            sql: `CREATE OR REPLACE VIEW \`${PROJECT}.${DATASET}.job_pipeline\` AS
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
FROM \`${PROJECT}.${DATASET}.jobs_raw_latest\`
WHERE document_name IS NOT NULL AND JSON_VALUE(data, '$.org_id') IS NOT NULL`
        },
        {
            name: 'invoice_aging',
            sql: `CREATE OR REPLACE VIEW \`${PROJECT}.${DATASET}.invoice_aging\` AS
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
FROM \`${PROJECT}.${DATASET}.invoices_raw_latest\`
WHERE document_name IS NOT NULL
  AND JSON_VALUE(data, '$.org_id') IS NOT NULL
  AND JSON_VALUE(data, '$.status') IN ('sent', 'overdue', 'partial')`
        },
        {
            name: 'quote_conversion',
            sql: `CREATE OR REPLACE VIEW \`${PROJECT}.${DATASET}.quote_conversion\` AS
SELECT
    document_name AS quote_id,
    JSON_VALUE(data, '$.org_id') AS org_id,
    JSON_VALUE(data, '$.status') AS status,
    CAST(JSON_VALUE(data, '$.total') AS FLOAT64) AS total,
    JSON_VALUE(data, '$.customerName') AS customer_name,
    TIMESTAMP_SECONDS(CAST(JSON_VALUE(data, '$.createdAt._seconds') AS INT64)) AS created_at,
    TIMESTAMP_SECONDS(CAST(JSON_VALUE(data, '$.approvedAt._seconds') AS INT64)) AS approved_at,
    TIMESTAMP_SECONDS(CAST(JSON_VALUE(data, '$.declinedAt._seconds') AS INT64)) AS declined_at
FROM \`${PROJECT}.${DATASET}.quotes_raw_latest\`
WHERE document_name IS NOT NULL AND JSON_VALUE(data, '$.org_id') IS NOT NULL`
        }
    ];

    const results: { name: string; status: string; error?: string }[] = [];

    for (const view of views) {
        try {
            await bigquery.query({ query: view.sql });
            results.push({ name: view.name, status: 'created' });
        } catch (err: any) {
            results.push({ name: view.name, status: 'failed', error: err.message });
        }
    }

    return results;
});
