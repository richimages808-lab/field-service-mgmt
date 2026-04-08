import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import { Job, JobCategory, JOB_CATEGORIES } from '../types';
import {
    BarChart3, TrendingUp, TrendingDown, DollarSign, Clock, Users,
    CheckCircle, XCircle, Calendar, MapPin, Star, Activity, RefreshCw
} from 'lucide-react';

interface AnalyticsDashboardProps {
    dateRange?: 'week' | 'month' | 'quarter' | 'year';
    techId?: string;
    compact?: boolean;
}

interface AnalyticsData {
    totalJobs: number;
    completedJobs: number;
    cancelledJobs: number;
    totalRevenue: number;
    totalCosts: number;
    profit: number;
    avgJobDuration: number;
    avgJobValue: number;
    jobsByCategory: Record<JobCategory, number>;
    jobsByStatus: Record<string, number>;
    jobsByDay: { date: string; count: number }[];
    avgRating: number;
    totalRatings: number;
    topCustomers: { name: string; count: number; revenue: number }[];
    onTimeRate: number;
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({
    dateRange = 'month',
    techId,
    compact = false
}) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
    const [selectedRange, setSelectedRange] = useState(dateRange);

    const orgId = (user as any)?.org_id || 'demo-org';

    const getDateRange = useMemo(() => {
        const now = new Date();
        const start = new Date();

        switch (selectedRange) {
            case 'week':
                start.setDate(now.getDate() - 7);
                break;
            case 'month':
                start.setMonth(now.getMonth() - 1);
                break;
            case 'quarter':
                start.setMonth(now.getMonth() - 3);
                break;
            case 'year':
                start.setFullYear(now.getFullYear() - 1);
                break;
        }

        return { start, end: now };
    }, [selectedRange]);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);

            try {
                const { start, end } = getDateRange;

                // Build query
                let jobsQuery = query(
                    collection(db, 'jobs'),
                    where('org_id', '==', orgId),
                    where('createdAt', '>=', Timestamp.fromDate(start)),
                    where('createdAt', '<=', Timestamp.fromDate(end))
                );

                if (techId) {
                    jobsQuery = query(
                        collection(db, 'jobs'),
                        where('org_id', '==', orgId),
                        where('assigned_tech_id', '==', techId),
                        where('createdAt', '>=', Timestamp.fromDate(start))
                    );
                }

                const snapshot = await getDocs(jobsQuery);
                const jobs = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                } as Job));

                // Calculate analytics
                const completed = jobs.filter(j => j.status === 'completed');
                const cancelled = jobs.filter(j => j.status === 'cancelled');

                const totalRevenue = completed.reduce((sum, j) => sum + (j.costs?.total || j.estimates?.total || 0), 0);
                const totalCosts = completed.reduce((sum, j) => {
                    const costs = j.costs;
                    if (costs) {
                        const laborCost = typeof costs.labor === 'object' && costs.labor ? (costs.labor as any).total || 0 : (costs.labor || 0);
                        const partsCost = typeof costs.parts === 'object' && costs.parts ? (costs.parts as any).actual || 0 : (costs.parts || 0);
                        const mileageCost = typeof costs.mileage === 'object' && costs.mileage ? (costs.mileage as any).total || 0 : (costs.mileage || 0);
                        return sum + laborCost + partsCost + mileageCost;
                    }
                    return sum;
                }, 0);

                const avgDuration = completed.length > 0
                    ? completed.reduce((sum, j) => sum + (j.actual_duration || j.estimated_duration || 60), 0) / completed.length
                    : 0;

                const avgValue = completed.length > 0 ? totalRevenue / completed.length : 0;

                // Jobs by category
                const byCategory: Record<JobCategory, number> = {} as Record<JobCategory, number>;
                JOB_CATEGORIES.forEach(cat => { byCategory[cat.value] = 0; });
                jobs.forEach(j => {
                    if (j.category) byCategory[j.category]++;
                });

                // Jobs by status
                const byStatus: Record<string, number> = {
                    pending: 0, unscheduled: 0, scheduled: 0, in_progress: 0, completed: 0, cancelled: 0
                };
                jobs.forEach(j => {
                    if (byStatus[j.status] !== undefined) byStatus[j.status]++;
                });

                // Jobs by day
                const byDay: { date: string; count: number }[] = [];
                const dayMap = new Map<string, number>();
                jobs.forEach(j => {
                    const date = j.createdAt?.toDate?.() || new Date();
                    const dateStr = date.toISOString().split('T')[0];
                    dayMap.set(dateStr, (dayMap.get(dateStr) || 0) + 1);
                });
                dayMap.forEach((count, date) => byDay.push({ date, count }));
                byDay.sort((a, b) => a.date.localeCompare(b.date));

                // Ratings
                const withRatings = completed.filter(j => j.customer_rating);
                const avgRating = withRatings.length > 0
                    ? withRatings.reduce((sum, j) => sum + (j.customer_rating || 0), 0) / withRatings.length
                    : 0;

                // Top customers
                const customerMap = new Map<string, { count: number; revenue: number }>();
                completed.forEach(j => {
                    const name = j.customer.name;
                    const existing = customerMap.get(name) || { count: 0, revenue: 0 };
                    customerMap.set(name, {
                        count: existing.count + 1,
                        revenue: existing.revenue + (j.costs?.total || j.estimates?.total || 0)
                    });
                });
                const topCustomers = Array.from(customerMap.entries())
                    .map(([name, data]) => ({ name, ...data }))
                    .sort((a, b) => b.revenue - a.revenue)
                    .slice(0, 5);

                // On-time rate (within 15 min of scheduled time)
                const scheduledCompleted = completed.filter(j => j.scheduled_at && j.actual_start);
                const onTime = scheduledCompleted.filter(j => {
                    const scheduled = j.scheduled_at?.toDate?.() || new Date(j.scheduled_at);
                    const actual = j.actual_start?.toDate?.() || new Date(j.actual_start);
                    const diff = Math.abs(actual.getTime() - scheduled.getTime()) / (1000 * 60);
                    return diff <= 15;
                });
                const onTimeRate = scheduledCompleted.length > 0 ? (onTime.length / scheduledCompleted.length) * 100 : 100;

                setAnalytics({
                    totalJobs: jobs.length,
                    completedJobs: completed.length,
                    cancelledJobs: cancelled.length,
                    totalRevenue,
                    totalCosts,
                    profit: totalRevenue - totalCosts,
                    avgJobDuration: avgDuration,
                    avgJobValue: avgValue,
                    jobsByCategory: byCategory,
                    jobsByStatus: byStatus,
                    jobsByDay: byDay,
                    avgRating,
                    totalRatings: withRatings.length,
                    topCustomers,
                    onTimeRate
                });
            } catch (error) {
                console.error('Error fetching analytics:', error);
            }

            setLoading(false);
        };

        fetchData();
    }, [orgId, selectedRange, techId, getDateRange]);

    const fetchAnalytics = async () => {
        setLoading(true);


        try {
            const { start, end } = getDateRange;

            // Build query
            let jobsQuery = query(
                collection(db, 'jobs'),
                where('org_id', '==', orgId),
                where('createdAt', '>=', Timestamp.fromDate(start)),
                where('createdAt', '<=', Timestamp.fromDate(end))
            );

            if (techId) {
                jobsQuery = query(
                    collection(db, 'jobs'),
                    where('org_id', '==', orgId),
                    where('assigned_tech_id', '==', techId),
                    where('createdAt', '>=', Timestamp.fromDate(start))
                );
            }

            const snapshot = await getDocs(jobsQuery);
            const jobs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Job));

            // Calculate analytics
            const completed = jobs.filter(j => j.status === 'completed');
            const cancelled = jobs.filter(j => j.status === 'cancelled');

            const totalRevenue = completed.reduce((sum, j) => sum + (j.costs?.total || j.estimates?.total || 0), 0);
            const totalCosts = completed.reduce((sum, j) => {
                const costs = j.costs;
                if (costs) {
                    const laborCost = typeof costs.labor === 'object' && costs.labor ? (costs.labor as any).total || 0 : (costs.labor || 0);
                    const partsCost = typeof costs.parts === 'object' && costs.parts ? (costs.parts as any).actual || 0 : (costs.parts || 0);
                    const mileageCost = typeof costs.mileage === 'object' && costs.mileage ? (costs.mileage as any).total || 0 : (costs.mileage || 0);
                    return sum + laborCost + partsCost + mileageCost;
                }
                return sum;
            }, 0);

            const avgDuration = completed.length > 0
                ? completed.reduce((sum, j) => sum + (j.actual_duration || j.estimated_duration || 60), 0) / completed.length
                : 0;

            const avgValue = completed.length > 0 ? totalRevenue / completed.length : 0;

            // Jobs by category
            const byCategory: Record<JobCategory, number> = {} as Record<JobCategory, number>;
            JOB_CATEGORIES.forEach(cat => { byCategory[cat.value] = 0; });
            jobs.forEach(j => {
                if (j.category) byCategory[j.category]++;
            });

            // Jobs by status
            const byStatus: Record<string, number> = {
                pending: 0, unscheduled: 0, scheduled: 0, in_progress: 0, completed: 0, cancelled: 0
            };
            jobs.forEach(j => {
                if (byStatus[j.status] !== undefined) byStatus[j.status]++;
            });

            // Jobs by day
            const byDay: { date: string; count: number }[] = [];
            const dayMap = new Map<string, number>();
            jobs.forEach(j => {
                const date = j.createdAt?.toDate?.() || new Date();
                const dateStr = date.toISOString().split('T')[0];
                dayMap.set(dateStr, (dayMap.get(dateStr) || 0) + 1);
            });
            dayMap.forEach((count, date) => byDay.push({ date, count }));
            byDay.sort((a, b) => a.date.localeCompare(b.date));

            // Ratings
            const withRatings = completed.filter(j => j.customer_rating);
            const avgRating = withRatings.length > 0
                ? withRatings.reduce((sum, j) => sum + (j.customer_rating || 0), 0) / withRatings.length
                : 0;

            // Top customers
            const customerMap = new Map<string, { count: number; revenue: number }>();
            completed.forEach(j => {
                const name = j.customer.name;
                const existing = customerMap.get(name) || { count: 0, revenue: 0 };
                customerMap.set(name, {
                    count: existing.count + 1,
                    revenue: existing.revenue + (j.costs?.total || j.estimates?.total || 0)
                });
            });
            const topCustomers = Array.from(customerMap.entries())
                .map(([name, data]) => ({ name, ...data }))
                .sort((a, b) => b.revenue - a.revenue)
                .slice(0, 5);

            // On-time rate (within 15 min of scheduled time)
            const scheduledCompleted = completed.filter(j => j.scheduled_at && j.actual_start);
            const onTime = scheduledCompleted.filter(j => {
                const scheduled = j.scheduled_at?.toDate?.() || new Date(j.scheduled_at);
                const actual = j.actual_start?.toDate?.() || new Date(j.actual_start);
                const diff = Math.abs(actual.getTime() - scheduled.getTime()) / (1000 * 60);
                return diff <= 15;
            });
            const onTimeRate = scheduledCompleted.length > 0 ? (onTime.length / scheduledCompleted.length) * 100 : 100;

            setAnalytics({
                totalJobs: jobs.length,
                completedJobs: completed.length,
                cancelledJobs: cancelled.length,
                totalRevenue,
                totalCosts,
                profit: totalRevenue - totalCosts,
                avgJobDuration: avgDuration,
                avgJobValue: avgValue,
                jobsByCategory: byCategory,
                jobsByStatus: byStatus,
                jobsByDay: byDay,
                avgRating,
                totalRatings: withRatings.length,
                topCustomers,
                onTimeRate
            });
        } catch (error) {
            console.error('Error fetching analytics:', error);
        }

        setLoading(false);
    };

    const formatCurrency = (value: number) => `$${value.toFixed(2)}`;
    const formatMinutes = (mins: number) => `${Math.round(mins)} min`;

    if (compact) {
        return (
            <div className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-blue-600" />
                        <h3 className="font-semibold">Quick Stats</h3>
                    </div>
                    <select
                        value={selectedRange}
                        onChange={(e) => setSelectedRange(e.target.value as typeof selectedRange)}
                        className="text-sm p-1 border rounded"
                    >
                        <option value="week">This Week</option>
                        <option value="month">This Month</option>
                        <option value="quarter">Quarter</option>
                    </select>
                </div>

                {loading ? (
                    <p className="text-sm text-gray-500">Loading...</p>
                ) : analytics && (
                    <div className="grid grid-cols-2 gap-3">
                        <div className="text-center">
                            <p className="text-2xl font-bold text-green-600">{formatCurrency(analytics.totalRevenue)}</p>
                            <p className="text-xs text-gray-500">Revenue</p>
                        </div>
                        <div className="text-center">
                            <p className="text-2xl font-bold text-blue-600">{analytics.completedJobs}</p>
                            <p className="text-xs text-gray-500">Jobs Completed</p>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <BarChart3 className="w-6 h-6 text-blue-600" />
                    <h2 className="text-xl font-bold text-gray-900">Analytics Dashboard</h2>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={selectedRange}
                        onChange={(e) => setSelectedRange(e.target.value as typeof selectedRange)}
                        className="p-2 border rounded"
                    >
                        <option value="week">Last 7 Days</option>
                        <option value="month">Last 30 Days</option>
                        <option value="quarter">Last 90 Days</option>
                        <option value="year">Last Year</option>
                    </select>
                    <button
                        onClick={fetchAnalytics}
                        disabled={loading}
                        className="p-2 text-gray-500 hover:text-gray-700 disabled:opacity-50"
                    >
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-8 text-gray-500">Loading analytics...</div>
            ) : analytics && (
                <>
                    {/* Key Metrics */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-green-50 rounded-lg p-4">
                            <div className="flex items-center gap-2 text-green-600 mb-1">
                                <DollarSign className="w-4 h-4" />
                                <span className="text-sm">Revenue</span>
                            </div>
                            <p className="text-2xl font-bold text-green-900">{formatCurrency(analytics.totalRevenue)}</p>
                            <p className="text-xs text-green-600">
                                Profit: {formatCurrency(analytics.profit)}
                            </p>
                        </div>

                        <div className="bg-blue-50 rounded-lg p-4">
                            <div className="flex items-center gap-2 text-blue-600 mb-1">
                                <CheckCircle className="w-4 h-4" />
                                <span className="text-sm">Jobs Completed</span>
                            </div>
                            <p className="text-2xl font-bold text-blue-900">{analytics.completedJobs}</p>
                            <p className="text-xs text-blue-600">
                                of {analytics.totalJobs} total
                            </p>
                        </div>

                        <div className="bg-amber-50 rounded-lg p-4">
                            <div className="flex items-center gap-2 text-amber-600 mb-1">
                                <Clock className="w-4 h-4" />
                                <span className="text-sm">Avg Duration</span>
                            </div>
                            <p className="text-2xl font-bold text-amber-900">{formatMinutes(analytics.avgJobDuration)}</p>
                            <p className="text-xs text-amber-600">
                                Avg value: {formatCurrency(analytics.avgJobValue)}
                            </p>
                        </div>

                        <div className="bg-yellow-50 rounded-lg p-4">
                            <div className="flex items-center gap-2 text-yellow-600 mb-1">
                                <Star className="w-4 h-4" />
                                <span className="text-sm">Avg Rating</span>
                            </div>
                            <p className="text-2xl font-bold text-yellow-900">
                                {analytics.avgRating > 0 ? analytics.avgRating.toFixed(1) : 'N/A'}
                            </p>
                            <p className="text-xs text-yellow-600">
                                {analytics.totalRatings} reviews
                            </p>
                        </div>
                    </div>

                    {/* Charts Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        {/* Jobs by Status */}
                        <div className="border rounded-lg p-4">
                            <h4 className="font-medium text-gray-700 mb-3">Jobs by Status</h4>
                            <div className="space-y-2">
                                {Object.entries(analytics.jobsByStatus).map(([status, count]) => {
                                    const percent = analytics.totalJobs > 0 ? (count / analytics.totalJobs) * 100 : 0;
                                    const colors: Record<string, string> = {
                                        pending: 'bg-yellow-500',
                                        unscheduled: 'bg-gray-500',
                                        scheduled: 'bg-blue-500',
                                        in_progress: 'bg-amber-500',
                                        completed: 'bg-green-500',
                                        cancelled: 'bg-red-500'
                                    };
                                    return (
                                        <div key={status} className="flex items-center gap-2">
                                            <span className="w-24 text-sm text-gray-600 capitalize">{status.replace('_', ' ')}</span>
                                            <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                                                <div
                                                    className={`h-full ${colors[status] || 'bg-gray-500'} transition-all`}
                                                    style={{ width: `${percent}%` }}
                                                />
                                            </div>
                                            <span className="w-12 text-sm text-gray-500 text-right">{count}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Jobs by Category */}
                        <div className="border rounded-lg p-4">
                            <h4 className="font-medium text-gray-700 mb-3">Jobs by Category</h4>
                            <div className="space-y-2">
                                {JOB_CATEGORIES.filter(cat => analytics.jobsByCategory[cat.value] > 0).map(cat => {
                                    const count = analytics.jobsByCategory[cat.value];
                                    const percent = analytics.totalJobs > 0 ? (count / analytics.totalJobs) * 100 : 0;
                                    return (
                                        <div key={cat.value} className="flex items-center gap-2">
                                            <span className="w-24 text-sm text-gray-600">{cat.label}</span>
                                            <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                                                <div
                                                    className="h-full bg-blue-500 transition-all"
                                                    style={{ width: `${percent}%` }}
                                                />
                                            </div>
                                            <span className="w-12 text-sm text-gray-500 text-right">{count}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Bottom Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Top Customers */}
                        <div className="border rounded-lg p-4">
                            <h4 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                                <Users className="w-4 h-4" /> Top Customers
                            </h4>
                            {analytics.topCustomers.length === 0 ? (
                                <p className="text-sm text-gray-500">No customer data yet</p>
                            ) : (
                                <div className="space-y-2">
                                    {analytics.topCustomers.map((customer, i) => (
                                        <div key={i} className="flex items-center justify-between text-sm">
                                            <div className="flex items-center gap-2">
                                                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium">
                                                    {i + 1}
                                                </span>
                                                <span className="text-gray-700">{customer.name}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-green-600 font-medium">{formatCurrency(customer.revenue)}</span>
                                                <span className="text-gray-400 ml-2">({customer.count} jobs)</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Performance Metrics */}
                        <div className="border rounded-lg p-4">
                            <h4 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                                <Activity className="w-4 h-4" /> Performance
                            </h4>
                            <div className="space-y-3">
                                <div>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-gray-600">Completion Rate</span>
                                        <span className="font-medium">
                                            {analytics.totalJobs > 0
                                                ? ((analytics.completedJobs / analytics.totalJobs) * 100).toFixed(1)
                                                : 0}%
                                        </span>
                                    </div>
                                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-green-500"
                                            style={{
                                                width: `${analytics.totalJobs > 0
                                                    ? (analytics.completedJobs / analytics.totalJobs) * 100
                                                    : 0}%`
                                            }}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-gray-600">On-Time Rate</span>
                                        <span className="font-medium">{analytics.onTimeRate.toFixed(1)}%</span>
                                    </div>
                                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-blue-500"
                                            style={{ width: `${analytics.onTimeRate}%` }}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-gray-600">Cancellation Rate</span>
                                        <span className="font-medium text-red-600">
                                            {analytics.totalJobs > 0
                                                ? ((analytics.cancelledJobs / analytics.totalJobs) * 100).toFixed(1)
                                                : 0}%
                                        </span>
                                    </div>
                                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-red-500"
                                            style={{
                                                width: `${analytics.totalJobs > 0
                                                    ? (analytics.cancelledJobs / analytics.totalJobs) * 100
                                                    : 0}%`
                                            }}
                                        />
                                    </div>
                                </div>

                                <div className="pt-2 border-t">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-600">Profit Margin</span>
                                        <span className={`font-medium ${analytics.profit >= 0 ? 'text-green-600' : 'text-red-600'
                                            }`}>
                                            {analytics.totalRevenue > 0
                                                ? ((analytics.profit / analytics.totalRevenue) * 100).toFixed(1)
                                                : 0}%
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
