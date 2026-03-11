import { onCall, HttpsError } from "firebase-functions/v2/https";
import { BigQuery } from "@google-cloud/bigquery";

const bigquery = new BigQuery();

type ReportType =
    | 'revenue'
    | 'utilization'
    | 'job_pipeline'
    | 'invoice_aging'
    | 'job_categories'
    | 'top_customers'
    | 'quote_conversion'
    | 'profitability'
    | 'avg_job_metrics'
    | 'job_sources';

interface ReportRequest {
    type: ReportType;
    orgId?: string;
    dateRange?: {
        start: string; // ISO date string
        end: string;
    };
    limit?: number;
}

const PROJECT = process.env.GCLOUD_PROJECT || 'maintenancemanager-c5533';
const DATASET = 'firestore_export';

// Helper: build date filter clause for a timestamp field
function dateFilter(field: string, dateRange?: { start: string; end: string }): { clause: string; params: Record<string, string> } {
    let clause = '';
    const params: Record<string, string> = {};
    if (dateRange?.start) {
        clause += ` AND ${field} >= TIMESTAMP(@startDate)`;
        params.startDate = dateRange.start;
    }
    if (dateRange?.end) {
        clause += ` AND ${field} <= TIMESTAMP(@endDate)`;
        params.endDate = dateRange.end;
    }
    return { clause, params };
}

export const getBigQueryReport = onCall({ cors: true, invoker: "public" }, async (request) => {
    // 1. Authentication Check
    if (!request.auth) {
        throw new HttpsError(
            'unauthenticated',
            'The function must be called while authenticated.'
        );
    }

    const data = request.data as ReportRequest;
    const { type, dateRange, orgId, limit } = data;

    try {
        let query = '';
        let params: Record<string, any> = {};

        if (orgId) {
            params.orgId = orgId;
        }

        switch (type) {
            // ─── REVENUE TREND ──────────────────────────────────────────────
            case 'revenue': {
                const df = dateFilter('created_at', dateRange);
                params = { ...params, ...df.params };
                query = `
                    SELECT
                        FORMAT_DATE('%Y-%m-%d', DATE(created_at)) AS date,
                        SUM(total) AS amount,
                        COUNT(*) AS invoice_count
                    FROM \`${PROJECT}.${DATASET}.revenue_by_date\`
                    WHERE org_id = @orgId
                    ${df.clause}
                    GROUP BY date
                    ORDER BY date ASC
                `;
                break;
            }

            // ─── TECH UTILIZATION ───────────────────────────────────────────
            case 'utilization': {
                const df = dateFilter('completed_at', dateRange);
                params = { ...params, ...df.params };
                query = `
                    SELECT
                        assigned_tech_name AS techName,
                        COUNT(*) AS completedJobs,
                        SUM(COALESCE(total_cost, 0)) AS totalRevenue,
                        AVG(COALESCE(duration_minutes, 0)) AS avgDuration
                    FROM \`${PROJECT}.${DATASET}.job_pipeline\`
                    WHERE org_id = @orgId
                      AND status = 'completed'
                    ${df.clause}
                    GROUP BY techName
                    ORDER BY completedJobs DESC
                `;
                break;
            }

            // ─── JOB PIPELINE ───────────────────────────────────────────────
            case 'job_pipeline': {
                const df = dateFilter('created_at', dateRange);
                params = { ...params, ...df.params };
                query = `
                    SELECT
                        status,
                        COUNT(*) AS count
                    FROM \`${PROJECT}.${DATASET}.job_pipeline\`
                    WHERE org_id = @orgId
                    ${df.clause}
                    GROUP BY status
                    ORDER BY count DESC
                `;
                break;
            }

            // ─── INVOICE AGING ──────────────────────────────────────────────
            case 'invoice_aging': {
                params = { ...params };
                query = `
                    SELECT
                        CASE
                            WHEN days_outstanding <= 30 THEN '0-30'
                            WHEN days_outstanding <= 60 THEN '31-60'
                            WHEN days_outstanding <= 90 THEN '61-90'
                            ELSE '90+'
                        END AS bucket,
                        COUNT(*) AS count,
                        SUM(balance) AS totalAmount
                    FROM \`${PROJECT}.${DATASET}.invoice_aging\`
                    WHERE org_id = @orgId
                    GROUP BY bucket
                    ORDER BY bucket ASC
                `;
                break;
            }

            // ─── JOB CATEGORIES ─────────────────────────────────────────────
            case 'job_categories': {
                const df = dateFilter('created_at', dateRange);
                params = { ...params, ...df.params };
                query = `
                    SELECT
                        COALESCE(category, 'Uncategorized') AS category,
                        COUNT(*) AS count
                    FROM \`${PROJECT}.${DATASET}.job_pipeline\`
                    WHERE org_id = @orgId
                    ${df.clause}
                    GROUP BY category
                    ORDER BY count DESC
                `;
                break;
            }

            // ─── TOP CUSTOMERS ──────────────────────────────────────────────
            case 'top_customers': {
                const df = dateFilter('created_at', dateRange);
                params = { ...params, ...df.params };
                const topN = limit || 10;
                params.topN = topN;
                query = `
                    SELECT
                        customer_name AS customerName,
                        customer_id AS customerId,
                        SUM(total) AS totalRevenue,
                        COUNT(*) AS invoiceCount
                    FROM \`${PROJECT}.${DATASET}.revenue_by_date\`
                    WHERE org_id = @orgId
                      AND customer_name IS NOT NULL
                    ${df.clause}
                    GROUP BY customerName, customerId
                    ORDER BY totalRevenue DESC
                    LIMIT @topN
                `;
                break;
            }

            // ─── QUOTE CONVERSION ───────────────────────────────────────────
            case 'quote_conversion': {
                const df = dateFilter('created_at', dateRange);
                params = { ...params, ...df.params };
                query = `
                    SELECT
                        COUNT(*) AS totalQuotes,
                        COUNTIF(status = 'approved') AS approved,
                        COUNTIF(status = 'declined') AS declined,
                        COUNTIF(status IN ('draft', 'sent')) AS pending,
                        COUNTIF(status = 'expired') AS expired,
                        SAFE_DIVIDE(COUNTIF(status = 'approved'), COUNT(*)) * 100 AS approvalRate,
                        SAFE_DIVIDE(COUNTIF(status = 'declined'), COUNT(*)) * 100 AS declineRate,
                        AVG(
                            CASE
                                WHEN approved_at IS NOT NULL
                                THEN TIMESTAMP_DIFF(approved_at, created_at, DAY)
                                ELSE NULL
                            END
                        ) AS avgResponseDays
                    FROM \`${PROJECT}.${DATASET}.quote_conversion\`
                    WHERE org_id = @orgId
                    ${df.clause}
                `;
                break;
            }

            // ─── PROFITABILITY ──────────────────────────────────────────────
            case 'profitability': {
                const df = dateFilter('created_at', dateRange);
                params = { ...params, ...df.params };
                query = `
                    SELECT
                        FORMAT_DATE('%Y-%m', DATE(created_at)) AS date,
                        SUM(total) AS revenue,
                        0 AS costs,
                        SUM(total) AS profit
                    FROM \`${PROJECT}.${DATASET}.revenue_by_date\`
                    WHERE org_id = @orgId
                      AND status = 'paid'
                    ${df.clause}
                    GROUP BY date
                    ORDER BY date ASC
                `;
                break;
            }

            // ─── AVG JOB METRICS ────────────────────────────────────────────
            case 'avg_job_metrics': {
                const df = dateFilter('completed_at', dateRange);
                params = { ...params, ...df.params };
                query = `
                    SELECT
                        COALESCE(category, 'Uncategorized') AS category,
                        AVG(COALESCE(duration_minutes, 0)) AS avgDurationMinutes,
                        AVG(COALESCE(total_cost, 0)) AS avgValue,
                        COUNT(*) AS jobCount
                    FROM \`${PROJECT}.${DATASET}.job_pipeline\`
                    WHERE org_id = @orgId
                      AND status = 'completed'
                    ${df.clause}
                    GROUP BY category
                    ORDER BY jobCount DESC
                `;
                break;
            }

            // ─── JOB SOURCES ────────────────────────────────────────────────
            case 'job_sources': {
                const df = dateFilter('created_at', dateRange);
                params = { ...params, ...df.params };
                query = `
                    SELECT
                        COALESCE(source, 'unknown') AS source,
                        COUNT(*) AS count
                    FROM \`${PROJECT}.${DATASET}.job_pipeline\`
                    WHERE org_id = @orgId
                    ${df.clause}
                    GROUP BY source
                    ORDER BY count DESC
                `;
                break;
            }

            default:
                throw new HttpsError(
                    'invalid-argument',
                    `Invalid report type "${type}". Valid types: revenue, utilization, job_pipeline, invoice_aging, job_categories, top_customers, quote_conversion, profitability, avg_job_metrics, job_sources`
                );
        }

        // Run the query
        const [rows] = await bigquery.query({ query, params });
        return rows;

    } catch (error) {
        console.error(`BigQuery Error (${type}):`, error);
        throw new HttpsError(
            'internal',
            `Failed to fetch ${type} report from BigQuery.`,
            (error as Error).message
        );
    }
});
