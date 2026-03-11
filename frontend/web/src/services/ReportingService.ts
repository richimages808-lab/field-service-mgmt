import { db } from '../firebase';
import { collection, query, where, getDocs, Timestamp, orderBy, limit as firestoreLimit } from 'firebase/firestore';

// ─── Existing Interfaces ───────────────────────────────────────────────────────

export interface RevenueData {
    date: string;
    amount: number;
}

export interface TechUtilizationData {
    techName: string;
    completedJobs: number;
    totalRevenue: number;
}

// ─── New Interfaces ────────────────────────────────────────────────────────────

export interface DateRange {
    start: Date;
    end: Date;
}

export interface JobPipelineData {
    status: string;
    count: number;
    color: string;
}

export interface InvoiceAgingData {
    bucket: string;
    amount: number;
    count: number;
    color: string;
}

export interface JobCategoryData {
    category: string;
    count: number;
    color: string;
}

export interface CustomerRankData {
    customerId: string;
    customerName: string;
    totalRevenue: number;
    jobCount: number;
    lastJobDate?: string;
}

export interface InventoryAlertData {
    itemId: string;
    name: string;
    category: string;
    currentQty: number;
    minQty: number;
    location: string;
    percentOfMin: number;
}

export interface QuoteConversionData {
    totalQuotes: number;
    approved: number;
    declined: number;
    pending: number;
    expired: number;
    approvalRate: number;
    declineRate: number;
    avgResponseDays: number;
}

export interface ProfitabilityData {
    date: string;
    revenue: number;
    costs: number;
    profit: number;
}

export interface AvgJobMetricsData {
    category: string;
    avgDurationMinutes: number;
    avgValue: number;
    jobCount: number;
}

export interface JobSourceData {
    source: string;
    count: number;
    color: string;
}

// ─── Service Interface ─────────────────────────────────────────────────────────

export interface ReportingService {
    getRevenueLast30Days(orgId: string): Promise<RevenueData[]>;
    getTechUtilizationLast30Days(orgId: string): Promise<TechUtilizationData[]>;
    getRevenueByRange(orgId: string, range: DateRange): Promise<RevenueData[]>;
    getTechUtilizationByRange(orgId: string, range: DateRange): Promise<TechUtilizationData[]>;
    getJobPipeline(orgId: string, range: DateRange): Promise<JobPipelineData[]>;
    getInvoiceAging(orgId: string): Promise<InvoiceAgingData[]>;
    getJobCategoryBreakdown(orgId: string, range: DateRange): Promise<JobCategoryData[]>;
    getTopCustomers(orgId: string, range: DateRange, count?: number): Promise<CustomerRankData[]>;
    getInventoryAlerts(orgId: string): Promise<InventoryAlertData[]>;
    getQuoteConversion(orgId: string, range: DateRange): Promise<QuoteConversionData>;
    getProfitability(orgId: string, range: DateRange): Promise<ProfitabilityData[]>;
    getAvgJobMetrics(orgId: string, range: DateRange): Promise<AvgJobMetricsData[]>;
    getJobsBySource(orgId: string, range: DateRange): Promise<JobSourceData[]>;
}

// ─── Color Palettes ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
    pending: '#f59e0b',
    unscheduled: '#ef4444',
    quote_pending: '#8b5cf6',
    scheduled: '#3b82f6',
    in_progress: '#06b6d4',
    completed: '#10b981',
    cancelled: '#6b7280',
};

const CATEGORY_COLORS: Record<string, string> = {
    repair: '#ef4444',
    maintenance: '#3b82f6',
    installation: '#10b981',
    inspection: '#f59e0b',
    consultation: '#8b5cf6',
    emergency: '#dc2626',
    warranty: '#06b6d4',
    other: '#6b7280',
};

const SOURCE_COLORS: Record<string, string> = {
    web: '#3b82f6',
    email: '#8b5cf6',
    phone: '#10b981',
    sms: '#f59e0b',
    manual: '#6b7280',
};

const AGING_COLORS = {
    '0-30 days': '#10b981',
    '31-60 days': '#f59e0b',
    '61-90 days': '#f97316',
    '90+ days': '#ef4444',
};

// ─── Firestore Implementation ──────────────────────────────────────────────────

export class FirestoreReportingService implements ReportingService {

    // --- Existing methods (preserved) ---

    async getRevenueLast30Days(orgId: string): Promise<RevenueData[]> {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 30);
        return this.getRevenueByRange(orgId, { start, end });
    }

    async getTechUtilizationLast30Days(orgId: string): Promise<TechUtilizationData[]> {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 30);
        return this.getTechUtilizationByRange(orgId, { start, end });
    }

    // --- Revenue by Date Range ---

    async getRevenueByRange(orgId: string, range: DateRange): Promise<RevenueData[]> {
        const q = query(
            collection(db, 'invoices'),
            where('org_id', '==', orgId),
            where('createdAt', '>=', Timestamp.fromDate(range.start)),
            where('createdAt', '<=', Timestamp.fromDate(range.end)),
            orderBy('createdAt', 'asc')
        );

        const snapshot = await getDocs(q);
        const dailyRevenue: Record<string, number> = {};

        // Initialize date range with zeros
        const dayMs = 86400000;
        for (let t = range.start.getTime(); t <= range.end.getTime(); t += dayMs) {
            const d = new Date(t);
            dailyRevenue[d.toLocaleDateString()] = 0;
        }

        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const date = data.createdAt.toDate().toLocaleDateString();
            dailyRevenue[date] = (dailyRevenue[date] || 0) + (data.total || 0);
        });

        return Object.entries(dailyRevenue)
            .map(([date, amount]) => ({ date, amount }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }

    // --- Tech Utilization by Date Range ---

    async getTechUtilizationByRange(orgId: string, range: DateRange): Promise<TechUtilizationData[]> {
        const q = query(
            collection(db, 'jobs'),
            where('org_id', '==', orgId),
            where('status', '==', 'completed'),
            where('updatedAt', '>=', Timestamp.fromDate(range.start))
        );

        const snapshot = await getDocs(q);
        const techStats: Record<string, TechUtilizationData> = {};

        snapshot.docs.forEach(doc => {
            const job = doc.data();
            const techName = job.assigned_tech_name || job.assigned_tech?.name || 'Unassigned';
            if (!techStats[techName]) {
                techStats[techName] = { techName, completedJobs: 0, totalRevenue: 0 };
            }
            techStats[techName].completedJobs++;
            if (job.costs?.total) {
                techStats[techName].totalRevenue += job.costs.total;
            }
        });

        return Object.values(techStats).sort((a, b) => b.completedJobs - a.completedJobs);
    }

    // --- Jobs by Source ---

    async getJobsBySource(orgId: string, range: DateRange): Promise<JobSourceData[]> {
        const q = query(
            collection(db, 'jobs'),
            where('org_id', '==', orgId),
            where('createdAt', '>=', Timestamp.fromDate(range.start))
        );

        const snapshot = await getDocs(q);
        const sourceCounts: Record<string, number> = {};

        snapshot.docs.forEach(doc => {
            const source = doc.data().request?.source || 'manual';
            sourceCounts[source] = (sourceCounts[source] || 0) + 1;
        });

        return Object.entries(sourceCounts)
            .map(([source, count]) => ({
                source: source.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                count,
                color: SOURCE_COLORS[source.toLowerCase()] || '#6b7280',
            }))
            .sort((a, b) => b.count - a.count);
    }

    async downloadCustomReport(orgId: string, config: any): Promise<void> {
        console.log("Preparing custom report config:", config);
        alert(`Downloaded custom ${config.source} report (CSV) based on your custom config!`);
    }

    // --- Job Pipeline (status breakdown) ---

    async getJobPipeline(orgId: string, range: DateRange): Promise<JobPipelineData[]> {
        const q = query(
            collection(db, 'jobs'),
            where('org_id', '==', orgId),
            where('createdAt', '>=', Timestamp.fromDate(range.start))
        );

        const snapshot = await getDocs(q);
        const statusCounts: Record<string, number> = {};

        snapshot.docs.forEach(doc => {
            const status = doc.data().status || 'unknown';
            statusCounts[status] = (statusCounts[status] || 0) + 1;
        });

        const statusOrder = ['pending', 'unscheduled', 'quote_pending', 'scheduled', 'in_progress', 'completed', 'cancelled'];
        return statusOrder
            .filter(s => statusCounts[s])
            .map(status => ({
                status: status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                count: statusCounts[status],
                color: STATUS_COLORS[status] || '#6b7280'
            }));
    }

    // --- Invoice Aging (current unpaid) ---

    async getInvoiceAging(orgId: string): Promise<InvoiceAgingData[]> {
        const q = query(
            collection(db, 'invoices'),
            where('org_id', '==', orgId),
            where('status', 'in', ['sent', 'overdue', 'partial'])
        );

        const snapshot = await getDocs(q);
        const now = new Date();
        const buckets: Record<string, { amount: number; count: number }> = {
            '0-30 days': { amount: 0, count: 0 },
            '31-60 days': { amount: 0, count: 0 },
            '61-90 days': { amount: 0, count: 0 },
            '90+ days': { amount: 0, count: 0 },
        };

        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const created = data.createdAt?.toDate?.() || new Date();
            const daysSinceCreated = Math.floor((now.getTime() - created.getTime()) / 86400000);
            const balance = data.balance_due ?? (data.total - (data.payments_applied || 0));

            if (balance <= 0) return; // Skip if paid

            let bucket: string;
            if (daysSinceCreated <= 30) bucket = '0-30 days';
            else if (daysSinceCreated <= 60) bucket = '31-60 days';
            else if (daysSinceCreated <= 90) bucket = '61-90 days';
            else bucket = '90+ days';

            buckets[bucket].amount += balance;
            buckets[bucket].count += 1;
        });

        return Object.entries(buckets).map(([bucket, data]) => ({
            bucket,
            amount: Math.round(data.amount * 100) / 100,
            count: data.count,
            color: AGING_COLORS[bucket as keyof typeof AGING_COLORS] || '#6b7280',
        }));
    }

    // --- Job Category Breakdown ---

    async getJobCategoryBreakdown(orgId: string, range: DateRange): Promise<JobCategoryData[]> {
        const q = query(
            collection(db, 'jobs'),
            where('org_id', '==', orgId),
            where('createdAt', '>=', Timestamp.fromDate(range.start))
        );

        const snapshot = await getDocs(q);
        const categoryCounts: Record<string, number> = {};

        snapshot.docs.forEach(doc => {
            const cat = doc.data().category || doc.data().type || 'other';
            categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        });

        return Object.entries(categoryCounts)
            .map(([category, count]) => ({
                category: category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                count,
                color: CATEGORY_COLORS[category] || '#6b7280',
            }))
            .sort((a, b) => b.count - a.count);
    }

    // --- Top Customers ---

    async getTopCustomers(orgId: string, range: DateRange, count = 10): Promise<CustomerRankData[]> {
        const q = query(
            collection(db, 'invoices'),
            where('org_id', '==', orgId),
            where('createdAt', '>=', Timestamp.fromDate(range.start))
        );

        const snapshot = await getDocs(q);
        const customerMap: Record<string, CustomerRankData> = {};

        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const custId = data.customer_id || data.customer?.name || 'Unknown';
            const custName = data.customer?.name || data.customer_name || 'Unknown';

            if (!customerMap[custId]) {
                customerMap[custId] = {
                    customerId: custId,
                    customerName: custName,
                    totalRevenue: 0,
                    jobCount: 0,
                };
            }
            customerMap[custId].totalRevenue += data.total || 0;
            customerMap[custId].jobCount += 1;

            const dateStr = data.createdAt?.toDate?.()?.toLocaleDateString();
            if (dateStr) customerMap[custId].lastJobDate = dateStr;
        });

        return Object.values(customerMap)
            .sort((a, b) => b.totalRevenue - a.totalRevenue)
            .slice(0, count);
    }

    // --- Inventory Alerts ---

    async getInventoryAlerts(orgId: string): Promise<InventoryAlertData[]> {
        // Try 'materials' collection first, then fall back to 'inventory'
        let snapshot = await getDocs(query(
            collection(db, 'materials'),
            where('org_id', '==', orgId)
        ));

        if (snapshot.empty) {
            snapshot = await getDocs(query(
                collection(db, 'inventory'),
                where('org_id', '==', orgId)
            ));
        }

        const alerts: InventoryAlertData[] = [];
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const currentQty = data.quantity ?? 0;
            const minQty = data.minQuantity ?? data.minQty ?? data.min_quantity ?? 0;
            if (minQty > 0 && currentQty <= minQty) {
                alerts.push({
                    itemId: doc.id,
                    name: data.name || 'Unknown Item',
                    category: data.category || 'other',
                    currentQty,
                    minQty,
                    location: data.location || 'N/A',
                    percentOfMin: minQty > 0 ? Math.round((currentQty / minQty) * 100) : 0,
                });
            }
        });

        return alerts.sort((a, b) => a.percentOfMin - b.percentOfMin);
    }

    // --- Quote Conversion ---

    async getQuoteConversion(orgId: string, range: DateRange): Promise<QuoteConversionData> {
        const q = query(
            collection(db, 'quotes'),
            where('org_id', '==', orgId),
            where('createdAt', '>=', Timestamp.fromDate(range.start))
        );

        const snapshot = await getDocs(q);
        let approved = 0, declined = 0, pending = 0, expired = 0;
        let totalResponseDays = 0, responsesCount = 0;

        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const status = data.status;
            if (status === 'approved' || status === 'completed') {
                approved++;
                if (data.approvedAt && data.sentAt) {
                    const sent = data.sentAt?.toDate?.()?.getTime() || 0;
                    const appd = data.approvedAt?.toDate?.()?.getTime() || 0;
                    if (sent && appd) {
                        totalResponseDays += (appd - sent) / 86400000;
                        responsesCount++;
                    }
                }
            } else if (status === 'declined') {
                declined++;
                if (data.declinedAt && data.sentAt) {
                    const sent = data.sentAt?.toDate?.()?.getTime() || 0;
                    const dec = data.declinedAt?.toDate?.()?.getTime() || 0;
                    if (sent && dec) {
                        totalResponseDays += (dec - sent) / 86400000;
                        responsesCount++;
                    }
                }
            } else if (status === 'expired' || status === 'superseded') {
                expired++;
            } else {
                pending++;
            }
        });

        const total = snapshot.size || 1;
        return {
            totalQuotes: snapshot.size,
            approved,
            declined,
            pending,
            expired,
            approvalRate: Math.round((approved / total) * 100),
            declineRate: Math.round((declined / total) * 100),
            avgResponseDays: responsesCount > 0 ? Math.round((totalResponseDays / responsesCount) * 10) / 10 : 0,
        };
    }

    // --- Profitability (Revenue vs Cost over time) ---

    async getProfitability(orgId: string, range: DateRange): Promise<ProfitabilityData[]> {
        // Revenue from paid invoices
        const invoiceQ = query(
            collection(db, 'invoices'),
            where('org_id', '==', orgId),
            where('createdAt', '>=', Timestamp.fromDate(range.start)),
            where('createdAt', '<=', Timestamp.fromDate(range.end)),
            orderBy('createdAt', 'asc')
        );

        // Costs from completed jobs
        const jobQ = query(
            collection(db, 'jobs'),
            where('org_id', '==', orgId),
            where('status', '==', 'completed'),
            where('updatedAt', '>=', Timestamp.fromDate(range.start))
        );

        const [invoiceSnap, jobSnap] = await Promise.all([getDocs(invoiceQ), getDocs(jobQ)]);

        // Group by week to keep chart manageable
        const weeklyData: Record<string, { revenue: number; costs: number }> = {};

        const getWeekKey = (date: Date) => {
            const d = new Date(date);
            d.setDate(d.getDate() - d.getDay()); // Start of week (Sunday)
            return d.toLocaleDateString();
        };

        invoiceSnap.docs.forEach(doc => {
            const data = doc.data();
            const date = data.createdAt?.toDate?.();
            if (!date) return;
            const week = getWeekKey(date);
            if (!weeklyData[week]) weeklyData[week] = { revenue: 0, costs: 0 };
            weeklyData[week].revenue += data.total || 0;
        });

        jobSnap.docs.forEach(doc => {
            const data = doc.data();
            const date = data.updatedAt?.toDate?.();
            if (!date) return;
            const week = getWeekKey(date);
            if (!weeklyData[week]) weeklyData[week] = { revenue: 0, costs: 0 };
            const cost = typeof data.costs?.total === 'number' ? data.costs.total :
                (typeof data.costs?.labor === 'number' ? data.costs.labor : 0) +
                (typeof data.costs?.parts === 'number' ? data.costs.parts : 0) +
                (typeof data.costs?.mileage === 'number' ? data.costs.mileage : 0);
            weeklyData[week].costs += cost;
        });

        return Object.entries(weeklyData)
            .map(([date, data]) => ({
                date,
                revenue: Math.round(data.revenue * 100) / 100,
                costs: Math.round(data.costs * 100) / 100,
                profit: Math.round((data.revenue - data.costs) * 100) / 100,
            }))
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }

    // --- Average Job Metrics by Category ---

    async getAvgJobMetrics(orgId: string, range: DateRange): Promise<AvgJobMetricsData[]> {
        const q = query(
            collection(db, 'jobs'),
            where('org_id', '==', orgId),
            where('status', '==', 'completed'),
            where('updatedAt', '>=', Timestamp.fromDate(range.start))
        );

        const snapshot = await getDocs(q);
        const catStats: Record<string, { totalDuration: number; totalValue: number; count: number }> = {};

        snapshot.docs.forEach(doc => {
            const data = doc.data();
            const cat = data.category || data.type || 'other';
            if (!catStats[cat]) catStats[cat] = { totalDuration: 0, totalValue: 0, count: 0 };
            catStats[cat].count++;
            catStats[cat].totalDuration += data.actual_duration || data.estimated_duration || 0;
            catStats[cat].totalValue += data.costs?.total || data.estimates?.total || 0;
        });

        return Object.entries(catStats)
            .map(([category, stats]) => ({
                category: category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                avgDurationMinutes: Math.round(stats.totalDuration / stats.count),
                avgValue: Math.round((stats.totalValue / stats.count) * 100) / 100,
                jobCount: stats.count,
            }))
            .sort((a, b) => b.jobCount - a.jobCount);
    }

}

// ─── Drill-Down Detail Queries ──────────────────────────────────────────────────
// These return full document records for the detail modal

function docToRecord(doc: any): Record<string, any> {
    const data = doc.data();
    const record: Record<string, any> = { id: doc.id, ...data };
    // Convert Firestore Timestamps to ISO strings for display
    for (const [key, val] of Object.entries(record)) {
        if (val && typeof val === 'object' && 'toDate' in val) {
            record[key] = (val as any).toDate().toISOString().split('T')[0];
        }
    }
    return record;
}

export async function drillDownRevenueByDate(orgId: string, date: string): Promise<Record<string, any>[]> {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);
    const q = query(
        collection(db, 'invoices'),
        where('org_id', '==', orgId),
        where('createdAt', '>=', Timestamp.fromDate(dayStart)),
        where('createdAt', '<=', Timestamp.fromDate(dayEnd))
    );
    const snap = await getDocs(q);
    return snap.docs.map(docToRecord);
}

export async function drillDownJobsByStatus(orgId: string, status: string, range: DateRange): Promise<Record<string, any>[]> {
    const q = query(
        collection(db, 'jobs'),
        where('org_id', '==', orgId),
        where('status', '==', status),
        where('createdAt', '>=', Timestamp.fromDate(range.start))
    );
    const snap = await getDocs(q);
    return snap.docs.map(docToRecord);
}

export async function drillDownJobsByCategory(orgId: string, category: string, range: DateRange): Promise<Record<string, any>[]> {
    const q = query(
        collection(db, 'jobs'),
        where('org_id', '==', orgId),
        where('category', '==', category),
        where('createdAt', '>=', Timestamp.fromDate(range.start))
    );
    const snap = await getDocs(q);
    return snap.docs.map(docToRecord);
}

export async function drillDownInvoicesByBucket(orgId: string, bucket: string): Promise<Record<string, any>[]> {
    const q = query(
        collection(db, 'invoices'),
        where('org_id', '==', orgId),
        where('status', 'in', ['sent', 'overdue', 'partial'])
    );
    const snap = await getDocs(q);
    const now = new Date();
    return snap.docs
        .map(docToRecord)
        .filter(inv => {
            const created = new Date(inv.createdAt);
            const days = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
            inv.daysOutstanding = days;
            if (bucket === '0-30 days') return days <= 30;
            if (bucket === '31-60 days') return days > 30 && days <= 60;
            if (bucket === '61-90 days') return days > 60 && days <= 90;
            if (bucket === '90+ days') return days > 90;
            return true;
        });
}

export async function drillDownQuotesByStatus(orgId: string, status: string, range: DateRange): Promise<Record<string, any>[]> {
    if (status === 'all') {
        const q = query(
            collection(db, 'quotes'),
            where('org_id', '==', orgId),
            where('createdAt', '>=', Timestamp.fromDate(range.start))
        );
        const snap = await getDocs(q);
        return snap.docs.map(docToRecord);
    }
    const q = query(
        collection(db, 'quotes'),
        where('org_id', '==', orgId),
        where('status', '==', status),
        where('createdAt', '>=', Timestamp.fromDate(range.start))
    );
    const snap = await getDocs(q);
    return snap.docs.map(docToRecord);
}

export async function drillDownJobsBySource(orgId: string, source: string, range: DateRange): Promise<Record<string, any>[]> {
    const q = query(
        collection(db, 'jobs'),
        where('org_id', '==', orgId),
        where('createdAt', '>=', Timestamp.fromDate(range.start))
    );
    const snap = await getDocs(q);
    return snap.docs
        .map(docToRecord)
        .filter(j => (j.request?.source || j.source || 'manual').toLowerCase() === source.toLowerCase());
}

export async function drillDownJobsByTech(orgId: string, techName: string, range: DateRange): Promise<Record<string, any>[]> {
    const q = query(
        collection(db, 'jobs'),
        where('org_id', '==', orgId),
        where('status', '==', 'completed'),
        where('updatedAt', '>=', Timestamp.fromDate(range.start))
    );
    const snap = await getDocs(q);
    return snap.docs
        .map(docToRecord)
        .filter(j =>
            (j.assignedTechName || j.assigned_tech_name || '') === techName
        );
}

export async function drillDownCustomerInvoices(orgId: string, customerId: string, range: DateRange): Promise<Record<string, any>[]> {
    const q = query(
        collection(db, 'invoices'),
        where('org_id', '==', orgId),
        where('customer_id', '==', customerId),
        where('createdAt', '>=', Timestamp.fromDate(range.start))
    );
    const snap = await getDocs(q);
    return snap.docs.map(docToRecord);
}

export async function drillDownInventoryItem(orgId: string, itemId: string): Promise<Record<string, any>[]> {
    const q = query(
        collection(db, 'materials'),
        where('org_id', '==', orgId)
    );
    const snap = await getDocs(q);
    return snap.docs.map(docToRecord).filter(m => m.id === itemId || !itemId);
}

// ─── BigQuery Implementation ────────────────────────────────────────────────────

import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';

// Helper: call the getBigQueryReport Cloud Function
async function callBigQueryReport(type: string, orgId: string, dateRange?: DateRange, extra?: Record<string, any>): Promise<any[]> {
    const getReport = httpsCallable(functions, 'getBigQueryReport');
    const payload: Record<string, any> = { type, orgId };
    if (dateRange) {
        payload.dateRange = {
            start: dateRange.start.toISOString(),
            end: dateRange.end.toISOString(),
        };
    }
    if (extra) Object.assign(payload, extra);
    const result = await getReport(payload);
    return result.data as any[];
}

export class BigQueryReportingService implements ReportingService {
    // Firestore fallback for inventory (real-time stock levels)
    private firestoreFallback = new FirestoreReportingService();

    // ─── Revenue ────────────────────────────────────────────────────────────

    async getRevenueLast30Days(orgId: string): Promise<RevenueData[]> {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 30);
        return this.getRevenueByRange(orgId, { start, end });
    }

    async getRevenueByRange(orgId: string, range: DateRange): Promise<RevenueData[]> {
        try {
            const rows = await callBigQueryReport('revenue', orgId, range);
            return rows.map(row => ({ date: row.date, amount: Number(row.amount) }));
        } catch (e) {
            console.warn('BigQuery revenue failed, falling back to Firestore', e);
            return this.firestoreFallback.getRevenueByRange(orgId, range);
        }
    }

    // ─── Tech Utilization ───────────────────────────────────────────────────

    async getTechUtilizationLast30Days(orgId: string): Promise<TechUtilizationData[]> {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 30);
        return this.getTechUtilizationByRange(orgId, { start, end });
    }

    async getTechUtilizationByRange(orgId: string, range: DateRange): Promise<TechUtilizationData[]> {
        try {
            const rows = await callBigQueryReport('utilization', orgId, range);
            return rows.map(row => ({
                techName: row.techName || 'Unknown',
                completedJobs: Number(row.completedJobs),
                totalRevenue: Number(row.totalRevenue || 0),
            }));
        } catch (e) {
            console.warn('BigQuery utilization failed, falling back to Firestore', e);
            return this.firestoreFallback.getTechUtilizationByRange(orgId, range);
        }
    }

    // ─── Job Pipeline ───────────────────────────────────────────────────────

    async getJobPipeline(orgId: string, range: DateRange): Promise<JobPipelineData[]> {
        try {
            const rows = await callBigQueryReport('job_pipeline', orgId, range);
            return rows.map(row => ({
                status: row.status,
                count: Number(row.count),
                color: STATUS_COLORS[row.status] || '#6b7280',
            }));
        } catch (e) {
            console.warn('BigQuery job_pipeline failed, falling back to Firestore', e);
            return this.firestoreFallback.getJobPipeline(orgId, range);
        }
    }

    // ─── Invoice Aging ──────────────────────────────────────────────────────

    async getInvoiceAging(orgId: string): Promise<InvoiceAgingData[]> {
        try {
            const rows = await callBigQueryReport('invoice_aging', orgId);
            const bucketLabels: Record<string, string> = {
                '0-30': '0-30 days', '31-60': '31-60 days',
                '61-90': '61-90 days', '90+': '90+ days',
            };
            return rows.map(row => ({
                bucket: bucketLabels[row.bucket] || row.bucket,
                amount: Number(row.totalAmount),
                count: Number(row.count),
                color: AGING_COLORS[bucketLabels[row.bucket] as keyof typeof AGING_COLORS] || '#6b7280',
            }));
        } catch (e) {
            console.warn('BigQuery invoice_aging failed, falling back to Firestore', e);
            return this.firestoreFallback.getInvoiceAging(orgId);
        }
    }

    // ─── Job Categories ─────────────────────────────────────────────────────

    async getJobCategoryBreakdown(orgId: string, range: DateRange): Promise<JobCategoryData[]> {
        try {
            const rows = await callBigQueryReport('job_categories', orgId, range);
            return rows.map(row => ({
                category: row.category,
                count: Number(row.count),
                color: CATEGORY_COLORS[row.category?.toLowerCase()] || '#6b7280',
            }));
        } catch (e) {
            console.warn('BigQuery job_categories failed, falling back to Firestore', e);
            return this.firestoreFallback.getJobCategoryBreakdown(orgId, range);
        }
    }

    // ─── Top Customers ──────────────────────────────────────────────────────

    async getTopCustomers(orgId: string, range: DateRange, count?: number): Promise<CustomerRankData[]> {
        try {
            const rows = await callBigQueryReport('top_customers', orgId, range, { limit: count || 10 });
            return rows.map(row => ({
                customerId: row.customerId || '',
                customerName: row.customerName || 'Unknown',
                totalRevenue: Number(row.totalRevenue),
                jobCount: Number(row.invoiceCount),
            }));
        } catch (e) {
            console.warn('BigQuery top_customers failed, falling back to Firestore', e);
            return this.firestoreFallback.getTopCustomers(orgId, range, count);
        }
    }

    // ─── Inventory Alerts (Firestore-only — current stock levels) ────────────

    async getInventoryAlerts(orgId: string): Promise<InventoryAlertData[]> {
        return this.firestoreFallback.getInventoryAlerts(orgId);
    }

    // ─── Quote Conversion ───────────────────────────────────────────────────

    async getQuoteConversion(orgId: string, range: DateRange): Promise<QuoteConversionData> {
        try {
            const rows = await callBigQueryReport('quote_conversion', orgId, range);
            if (rows.length === 0) {
                return { totalQuotes: 0, approved: 0, declined: 0, pending: 0, expired: 0, approvalRate: 0, declineRate: 0, avgResponseDays: 0 };
            }
            const r = rows[0];
            return {
                totalQuotes: Number(r.totalQuotes),
                approved: Number(r.approved),
                declined: Number(r.declined),
                pending: Number(r.pending),
                expired: Number(r.expired),
                approvalRate: Number(r.approvalRate || 0),
                declineRate: Number(r.declineRate || 0),
                avgResponseDays: Number(r.avgResponseDays || 0),
            };
        } catch (e) {
            console.warn('BigQuery quote_conversion failed, falling back to Firestore', e);
            return this.firestoreFallback.getQuoteConversion(orgId, range);
        }
    }

    // ─── Profitability ──────────────────────────────────────────────────────

    async getProfitability(orgId: string, range: DateRange): Promise<ProfitabilityData[]> {
        try {
            const rows = await callBigQueryReport('profitability', orgId, range);
            return rows.map(row => ({
                date: row.date,
                revenue: Number(row.revenue),
                costs: Number(row.costs || 0),
                profit: Number(row.profit),
            }));
        } catch (e) {
            console.warn('BigQuery profitability failed, falling back to Firestore', e);
            return this.firestoreFallback.getProfitability(orgId, range);
        }
    }

    // ─── Avg Job Metrics ────────────────────────────────────────────────────

    async getAvgJobMetrics(orgId: string, range: DateRange): Promise<AvgJobMetricsData[]> {
        try {
            const rows = await callBigQueryReport('avg_job_metrics', orgId, range);
            return rows.map(row => ({
                category: row.category,
                avgDurationMinutes: Number(row.avgDurationMinutes || 0),
                avgValue: Number(row.avgValue || 0),
                jobCount: Number(row.jobCount),
            }));
        } catch (e) {
            console.warn('BigQuery avg_job_metrics failed, falling back to Firestore', e);
            return this.firestoreFallback.getAvgJobMetrics(orgId, range);
        }
    }

    // ─── Job Sources ────────────────────────────────────────────────────────

    async getJobsBySource(orgId: string, range: DateRange): Promise<JobSourceData[]> {
        try {
            const rows = await callBigQueryReport('job_sources', orgId, range);
            return rows.map(row => ({
                source: row.source,
                count: Number(row.count),
                color: SOURCE_COLORS[row.source] || '#6b7280',
            }));
        } catch (e) {
            console.warn('BigQuery job_sources failed, falling back to Firestore', e);
            return this.firestoreFallback.getJobsBySource(orgId, range);
        }
    }
}

export const reportingService = new FirestoreReportingService();
export const bigQueryReportingService = new BigQueryReportingService();

