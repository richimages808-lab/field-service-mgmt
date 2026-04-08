import { Timestamp } from 'firebase/firestore';

export type ReportFormat = 'csv' | 'excel' | 'pdf';
export type DeliveryMethod = 'email' | 'sms';
export type ReportFrequency = 'daily' | 'weekly' | 'monthly';
export type ReportType =
    | 'revenue_trend'
    | 'tech_utilization'
    | 'job_pipeline'
    | 'jobs_by_category'
    | 'jobs_by_source'
    | 'invoice_aging'
    | 'customer_leaderboard'
    | 'quote_conversion'
    | 'profitability'
    | 'avg_job_metrics'
    | 'inventory_alerts';

export interface ScheduledReport {
    id?: string;
    organizationId: string;
    name: string;
    reportType: ReportType;
    reportParams?: Record<string, any>;
    format: ReportFormat;
    deliveryMethod: DeliveryMethod;
    deliveryDestination: string;
    frequency: ReportFrequency;
    timeOfDay?: string; // legacy support
    timesOfDay?: string[];
    daysOfWeek?: number[];
    daysOfMonth?: number[];
    lastRunAt: Timestamp | null;
    nextRunAt: Timestamp;
    createdAt: Timestamp;
    createdBy: string;
    active: boolean;
}
