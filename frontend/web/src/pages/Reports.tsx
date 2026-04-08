import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../auth/AuthProvider';
import {
    reportingService, bigQueryReportingService,
    RevenueData, TechUtilizationData, DateRange,
    JobPipelineData, InvoiceAgingData, JobCategoryData,
    CustomerRankData, InventoryAlertData, QuoteConversionData,
    ProfitabilityData, AvgJobMetricsData, JobSourceData
} from '../services/ReportingService';
import { Loader2, LayoutDashboard, Check, Clock, Wand2 } from 'lucide-react';
import { Responsive as RGL, Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

// Widgets
import { WidgetWrapper } from '../components/reports/widgets/WidgetWrapper';
import { RevenueKPIWidget, ActiveTechsKPIWidget } from '../components/reports/widgets/KPIWidgets';
import { RevenueTrendWidget } from '../components/reports/widgets/RevenueTrendWidget';
import { TechUtilizationWidget } from '../components/reports/widgets/TechUtilizationWidget';
import { JobPipelineWidget } from '../components/reports/widgets/JobPipelineWidget';
import { InvoiceAgingWidget } from '../components/reports/widgets/InvoiceAgingWidget';
import { JobCategoryWidget } from '../components/reports/widgets/JobCategoryWidget';
import { CustomerLeaderboardWidget } from '../components/reports/widgets/CustomerLeaderboardWidget';
import { InventoryAlertsWidget } from '../components/reports/widgets/InventoryAlertsWidget';
import { QuoteConversionWidget } from '../components/reports/widgets/QuoteConversionWidget';
import { ProfitabilityWidget } from '../components/reports/widgets/ProfitabilityWidget';
import { AvgJobMetricsWidget } from '../components/reports/widgets/AvgJobMetricsWidget';
import { JobSourceWidget } from '../components/reports/widgets/JobSourceWidget';
import { DateRangeSelector, PRESETS } from '../components/reports/DateRangeSelector';
import { ReportDetailModal, DrillDownContext } from '../components/reports/ReportDetailModal';
import { ScheduledReportsList } from '../components/reports/ScheduledReportsList';
import { ScheduleReportModal } from '../components/reports/ScheduleReportModal';
import { ScheduledReport } from '../types/ScheduledReport';
import { CustomReportWizard } from '../components/reports/CustomReportWizard';
import {
    drillDownRevenueByDate,
    drillDownJobsByStatus,
    drillDownJobsByCategory,
    drillDownInvoicesByBucket,
    drillDownQuotesByStatus,
    drillDownJobsBySource,
    drillDownJobsByTech,
    drillDownCustomerInvoices,
    drillDownInventoryItem
} from '../services/ReportingService';

// Bypass strictly incorrect generic types
const ResponsiveGridLayout = RGL as unknown as React.ComponentClass<any>;

// ─── Default Grid Layout ───────────────────────────────────────────────────────

const DEFAULT_LAYOUTS = {
    lg: [
        // Row 0 — KPI Cards
        { i: 'revenue-kpi', x: 0, y: 0, w: 3, h: 1, minW: 3, minH: 1 },
        { i: 'techs-kpi', x: 3, y: 0, w: 3, h: 1, minW: 3, minH: 1 },
        { i: 'quote-conversion', x: 6, y: 0, w: 3, h: 3, minW: 3, minH: 2 },
        { i: 'datasource-kpi', x: 9, y: 0, w: 3, h: 1, minW: 3, minH: 1 },
        // Row 1-3 — Revenue Trend + Tech Utilization
        { i: 'revenue-trend', x: 0, y: 1, w: 6, h: 3, minW: 5, minH: 2 },
        { i: 'tech-utilization', x: 9, y: 1, w: 3, h: 3, minW: 3, minH: 2 },
        // Row 4-6 — Job Pipeline + Category + Source
        { i: 'job-pipeline', x: 0, y: 4, w: 6, h: 3, minW: 4, minH: 2 },
        { i: 'job-category', x: 6, y: 4, w: 3, h: 3, minW: 3, minH: 2 },
        { i: 'job-source', x: 9, y: 4, w: 3, h: 3, minW: 3, minH: 2 },
        // Row 7-9 — Profitability + Invoice Aging
        { i: 'profitability', x: 0, y: 7, w: 8, h: 3, minW: 6, minH: 3 },
        { i: 'invoice-aging', x: 8, y: 7, w: 4, h: 3, minW: 3, minH: 2 },
        // Row 10-12 — Customer Leaderboard + Avg Job Metrics
        { i: 'customer-leaderboard', x: 0, y: 10, w: 6, h: 3, minW: 4, minH: 2 },
        { i: 'avg-job-metrics', x: 6, y: 10, w: 6, h: 3, minW: 4, minH: 2 },
        // Row 13-15 — Inventory Alerts
        { i: 'inventory-alerts', x: 0, y: 13, w: 12, h: 3, minW: 6, minH: 2 },
    ],
    md: [
        { i: 'revenue-kpi', x: 0, y: 0, w: 5, h: 1 },
        { i: 'techs-kpi', x: 5, y: 0, w: 5, h: 1 },
        { i: 'datasource-kpi', x: 0, y: 1, w: 5, h: 1 },
        { i: 'quote-conversion', x: 5, y: 1, w: 5, h: 3 },
        { i: 'revenue-trend', x: 0, y: 2, w: 5, h: 3 },
        { i: 'tech-utilization', x: 0, y: 5, w: 5, h: 3 },
        { i: 'job-pipeline', x: 5, y: 4, w: 5, h: 3 },
        { i: 'job-category', x: 0, y: 8, w: 5, h: 3 },
        { i: 'job-source', x: 5, y: 7, w: 5, h: 3 },
        { i: 'profitability', x: 0, y: 11, w: 10, h: 3 },
        { i: 'invoice-aging', x: 0, y: 14, w: 5, h: 3 },
        { i: 'customer-leaderboard', x: 5, y: 14, w: 5, h: 3 },
        { i: 'avg-job-metrics', x: 0, y: 17, w: 10, h: 3 },
        { i: 'inventory-alerts', x: 0, y: 20, w: 10, h: 3 },
    ],
    sm: [
        { i: 'revenue-kpi', x: 0, y: 0, w: 8, h: 1 },
        { i: 'techs-kpi', x: 0, y: 1, w: 8, h: 1 },
        { i: 'datasource-kpi', x: 0, y: 2, w: 8, h: 1 },
        { i: 'quote-conversion', x: 0, y: 3, w: 8, h: 3 },
        { i: 'revenue-trend', x: 0, y: 6, w: 8, h: 3 },
        { i: 'tech-utilization', x: 0, y: 9, w: 8, h: 3 },
        { i: 'job-pipeline', x: 0, y: 12, w: 8, h: 3 },
        { i: 'job-category', x: 0, y: 15, w: 8, h: 3 },
        { i: 'job-source', x: 0, y: 18, w: 8, h: 3 },
        { i: 'profitability', x: 0, y: 21, w: 8, h: 3 },
        { i: 'invoice-aging', x: 0, y: 24, w: 8, h: 3 },
        { i: 'customer-leaderboard', x: 0, y: 27, w: 8, h: 3 },
        { i: 'avg-job-metrics', x: 0, y: 30, w: 8, h: 3 },
        { i: 'inventory-alerts', x: 0, y: 33, w: 8, h: 3 },
    ]
};

const STORAGE_KEY = 'fsm_reports_layout_v2';

export const Reports: React.FC = () => {
    const { user } = useAuth();

    // ─── Date Range State ───────────────────────────────────────────────────────
    const [dateRangeKey, setDateRangeKey] = useState('30d');
    const [dateRange, setDateRange] = useState<DateRange>(() => PRESETS.find(p => p.key === '30d')!.getRange());

    // ─── Data Sources Toggle ────────────────────────────────────────────────────
    const [useBigQuery, setUseBigQuery] = useState(true);

    // ─── Dashboard State ────────────────────────────────────────────────────────
    const [isEditMode, setIsEditMode] = useState(false);
    const [currentBreakpoint, setCurrentBreakpoint] = useState('lg');
    const containerRef = React.useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState<number>(1200);

    const [layouts, setLayouts] = useState<any>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved ? JSON.parse(saved) : DEFAULT_LAYOUTS;
        } catch {
            return DEFAULT_LAYOUTS;
        }
    });

    // ─── Loading States ─────────────────────────────────────────────────────────
    const [loadingCore, setLoadingCore] = useState(true);
    const [loadingExtended, setLoadingExtended] = useState(true);

    // ─── Core Data (existing) ───────────────────────────────────────────────────
    const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
    const [techData, setTechData] = useState<TechUtilizationData[]>([]);

    // ─── Extended Data (new) ────────────────────────────────────────────────────
    const [jobPipelineData, setJobPipelineData] = useState<JobPipelineData[]>([]);
    const [invoiceAgingData, setInvoiceAgingData] = useState<InvoiceAgingData[]>([]);
    const [jobCategoryData, setJobCategoryData] = useState<JobCategoryData[]>([]);
    const [customerData, setCustomerData] = useState<CustomerRankData[]>([]);
    const [inventoryAlerts, setInventoryAlerts] = useState<InventoryAlertData[]>([]);
    const [quoteConversion, setQuoteConversion] = useState<QuoteConversionData | null>(null);
    const [profitabilityData, setProfitabilityData] = useState<ProfitabilityData[]>([]);
    const [avgJobMetrics, setAvgJobMetrics] = useState<AvgJobMetricsData[]>([]);
    const [jobSourceData, setJobSourceData] = useState<JobSourceData[]>([]);

    // ─── Scheduled Reports State ────────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState<'dashboard' | 'scheduled'>('dashboard');
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [showWizard, setShowWizard] = useState(false);
    const [reportToEdit, setReportToEdit] = useState<ScheduledReport | null>(null);

    // ─── Drill-Down State ───────────────────────────────────────────────────────
    const [drillDownContext, setDrillDownContext] = useState<DrillDownContext | null>(null);

    const handleDrillDown = (type: DrillDownContext['type'], label: string, params: Record<string, any>) => {
        setDrillDownContext({ type, label, params });
    };

    const fetchDrillDownData = async (context: DrillDownContext) => {
        if (!user?.org_id) return [];
        switch (context.type) {
            case 'revenue': return drillDownRevenueByDate(user.org_id, context.params.date);
            case 'job_pipeline': return drillDownJobsByStatus(user.org_id, context.params.status, dateRange);
            case 'job_category': return drillDownJobsByCategory(user.org_id, context.params.category, dateRange);
            case 'invoice_aging': return drillDownInvoicesByBucket(user.org_id, context.params.bucket);
            case 'quote': return drillDownQuotesByStatus(user.org_id, context.params.status, dateRange);
            case 'job_source': return drillDownJobsBySource(user.org_id, context.params.source, dateRange);
            case 'tech': return drillDownJobsByTech(user.org_id, context.params.techName, dateRange);
            case 'customer': return drillDownCustomerInvoices(user.org_id, context.params.customerId, dateRange);
            case 'inventory': return drillDownInventoryItem(user.org_id, context.params.itemId);
            case 'profitability': return drillDownRevenueByDate(user.org_id, context.params.date);
            case 'avg_job_metrics': return drillDownJobsByCategory(user.org_id, context.params.category, dateRange);
            default: return [];
        }
    };

    // ─── Width Observer ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!containerRef.current) return;
        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerWidth(entry.contentRect.width);
            }
        });
        resizeObserver.observe(containerRef.current);
        setContainerWidth(containerRef.current.getBoundingClientRect().width);
        return () => resizeObserver.disconnect();
    }, []);

    // ─── Load Core Data ─────────────────────────────────────────────────────────
    useEffect(() => {
        const loadCore = async () => {
            if (!user?.org_id) return;
            setLoadingCore(true);
            try {
                const service = useBigQuery ? bigQueryReportingService : reportingService;
                const [rev, tech] = await Promise.all([
                    service.getRevenueByRange(user.org_id, dateRange),
                    service.getTechUtilizationByRange(user.org_id, dateRange)
                ]);
                setRevenueData(rev);
                setTechData(tech);
            } catch (error) {
                console.error("Failed to load core reports:", error);
            } finally {
                setLoadingCore(false);
            }
        };
        loadCore();
    }, [user?.org_id, useBigQuery, dateRange]);

    // ─── Load Extended Data ─────────────────────────────────────────────────────
    useEffect(() => {
        const loadExtended = async () => {
            if (!user?.org_id) return;
            setLoadingExtended(true);
            try {
                const service = useBigQuery ? bigQueryReportingService : reportingService;
                const results = await Promise.allSettled([
                    service.getJobPipeline(user.org_id, dateRange),
                    service.getInvoiceAging(user.org_id),
                    service.getJobCategoryBreakdown(user.org_id, dateRange),
                    service.getTopCustomers(user.org_id, dateRange),
                    service.getInventoryAlerts(user.org_id),
                    service.getQuoteConversion(user.org_id, dateRange),
                    service.getProfitability(user.org_id, dateRange),
                    service.getAvgJobMetrics(user.org_id, dateRange),
                    service.getJobsBySource(user.org_id, dateRange),
                ]);

                // Extract data even if some fail
                if (results[0].status === 'fulfilled') setJobPipelineData(results[0].value);
                if (results[1].status === 'fulfilled') setInvoiceAgingData(results[1].value);
                if (results[2].status === 'fulfilled') setJobCategoryData(results[2].value);
                if (results[3].status === 'fulfilled') setCustomerData(results[3].value);
                if (results[4].status === 'fulfilled') setInventoryAlerts(results[4].value);
                if (results[5].status === 'fulfilled') setQuoteConversion(results[5].value);
                if (results[6].status === 'fulfilled') setProfitabilityData(results[6].value);
                if (results[7].status === 'fulfilled') setAvgJobMetrics(results[7].value);
                if (results[8].status === 'fulfilled') setJobSourceData(results[8].value);

                // Log any failures
                results.forEach((result, idx) => {
                    if (result.status === 'rejected') {
                        console.warn(`Report query #${idx} failed:`, result.reason);
                    }
                });
            } catch (error) {
                console.error("Failed to load extended reports:", error);
            } finally {
                setLoadingExtended(false);
            }
        };
        loadExtended();
    }, [user?.org_id, useBigQuery, dateRange]);

    // ─── Date Range Handler ─────────────────────────────────────────────────────
    const handleDateRangeChange = (key: string, range: { start: Date; end: Date }) => {
        setDateRangeKey(key);
        setDateRange(range);
    };

    // ─── Layout Handlers ────────────────────────────────────────────────────────
    const onLayoutChange = (_currentLayout: Layout[], allLayouts?: any) => {
        if (!allLayouts) return;
        setLayouts(allLayouts);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(allLayouts));
    };

    const onBreakpointChange = (newBreakpoint: string) => {
        setCurrentBreakpoint(newBreakpoint);
    };

    const resetLayout = () => {
        setLayouts(DEFAULT_LAYOUTS);
        localStorage.removeItem(STORAGE_KEY);
        setIsEditMode(false);
    };

    // ─── Computed Values ────────────────────────────────────────────────────────
    const totalRevenue = useMemo(() => revenueData.reduce((sum, item) => sum + item.amount, 0), [revenueData]);
    const isLoading = loadingCore && !revenueData.length;

    const getGridProps = (id: string, index: number) => {
        const layoutForBp = layouts[currentBreakpoint] || DEFAULT_LAYOUTS.lg;
        const item = layoutForBp.find((l: any) => l.i === id);
        return item || DEFAULT_LAYOUTS.lg[index];
    };

    // ─── Show initial loading indicator ─────────────────────────────────────────
    if (isLoading) {
        return (
            <div className="p-8 flex flex-col items-center justify-center gap-3 min-h-[50vh]">
                <Loader2 className="animate-spin w-10 h-10 text-blue-600" />
                <p className="text-sm text-gray-500">Loading reports…</p>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-[1600px] mx-auto min-h-screen bg-gray-50/50">
            {/* ─── Header Controls ─────────────────────────────────────────────── */}
            <div className="flex flex-col gap-4 mb-6 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-baseline gap-4">
                            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Reports & Analytics</h1>
                        </div>
                        <p className="text-gray-500 mt-1">Comprehensive performance insights for your business.</p>
                    </div>

                    <div className="flex items-center gap-4 flex-wrap">
                        {/* BigQuery Toggle */}
                        <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
                            <span className={`text-sm font-medium ${!useBigQuery ? 'text-blue-600' : 'text-gray-500'}`}>Live</span>
                            <button
                                onClick={() => setUseBigQuery(!useBigQuery)}
                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${useBigQuery ? 'focus:ring-blue-500 bg-blue-600' : 'focus:ring-gray-400 bg-gray-300'}`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${useBigQuery ? 'translate-x-4' : 'translate-x-1'}`} />
                            </button>
                            <span className={`text-sm font-medium ${useBigQuery ? 'text-blue-600' : 'text-gray-500'}`}>BigQuery</span>
                        </div>

                        <div className="w-px h-8 bg-gray-200 hidden md:block" />

                        {/* Edit Mode Toggle */}
                        {isEditMode ? (
                            <div className="flex items-center gap-2">
                                <button onClick={resetLayout} className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                                    Reset Layout
                                </button>
                                <button onClick={() => setIsEditMode(false)} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg shadow hover:bg-green-700 transition-colors">
                                    <Check className="w-4 h-4" /> Done Editing
                                </button>
                            </div>
                        ) : (
                            <button onClick={() => setIsEditMode(true)} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors hover:border-gray-300">
                                <LayoutDashboard className="w-4 h-4 text-gray-500" /> Customize Dashboard
                            </button>
                        )}
                    </div>
                </div>

                {/* Second Row of Controls: Build Custom Report & Schedule Report Prominent Links */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-4 border-t border-gray-100">
                    <div className="flex space-x-3">
                        <button
                            onClick={() => setShowWizard(true)}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg shadow-sm hover:bg-blue-700 transition-colors"
                        >
                            <Wand2 className="w-4 h-4" /> Build Custom Report
                        </button>
                        <button
                            onClick={() => {
                                setReportToEdit(null);
                                setShowScheduleModal(true);
                            }}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg shadow-sm hover:bg-blue-100 transition-colors"
                        >
                            <Clock className="w-4 h-4" /> Schedule a Report
                        </button>
                    </div>
                </div>

                {/* Tabs & Date Range */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-4 border-t border-gray-100 mt-4">
                    <div className="flex space-x-4">
                        <button
                            onClick={() => setActiveTab('dashboard')}
                            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'dashboard' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        >
                            Overview Dashboard
                        </button>
                        <button
                            onClick={() => setActiveTab('scheduled')}
                            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'scheduled' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                        >
                            Scheduled Reports
                        </button>
                    </div>

                    {activeTab === 'dashboard' && (
                        <div className="flex items-center gap-4">
                            <DateRangeSelector selectedKey={dateRangeKey} onSelect={handleDateRangeChange} />
                            {(loadingCore || loadingExtended) && (
                                <div className="flex items-center gap-1.5 text-xs text-blue-600">
                                    <Loader2 className="animate-spin w-3 h-3" />
                                    <span>Updating…</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ─── Content Area ────────────────────────────────────────────────── */}
            {activeTab === 'scheduled' ? (
                <ScheduledReportsList
                    onEdit={(report) => {
                        setReportToEdit(report);
                        setShowScheduleModal(true);
                    }}
                    onCreateNew={() => {
                        setReportToEdit(null);
                        setShowScheduleModal(true);
                    }}
                />
            ) : (
                /* ─── Dashboard Grid ──────────────────────────────────────────────── */
                <div ref={containerRef} className={`transition-all duration-300 w-full ${isEditMode ? 'p-4 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/30' : ''}`}>
                    <ResponsiveGridLayout
                        width={containerWidth}
                        key={JSON.stringify(layouts)}
                        className="layout"
                        layouts={layouts}
                        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                        cols={{ lg: 12, md: 10, sm: 8, xs: 4, xxs: 2 }}
                        rowHeight={120}
                        onLayoutChange={onLayoutChange}
                        onBreakpointChange={onBreakpointChange}
                        isDraggable={isEditMode}
                        isResizable={isEditMode}
                        draggableHandle=".drag-handle"
                        margin={[20, 20]}
                    >
                        {/* ROW 0 — KPI Cards */}
                        <div key="revenue-kpi" data-grid={getGridProps('revenue-kpi', 0)} className="h-full">
                            <WidgetWrapper title="Revenue" isEditMode={isEditMode} className="border-emerald-100">
                                <RevenueKPIWidget value={`$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                            </WidgetWrapper>
                        </div>

                        <div key="techs-kpi" data-grid={getGridProps('techs-kpi', 1)} className="h-full">
                            <WidgetWrapper title="Active Technicians" isEditMode={isEditMode} className="border-blue-100">
                                <ActiveTechsKPIWidget value={techData.length} />
                            </WidgetWrapper>
                        </div>

                        <div key="quote-conversion" data-grid={getGridProps('quote-conversion', 2)} className="h-full">
                            <WidgetWrapper title="Quote Conversion" isEditMode={isEditMode} className="border-green-100">
                                <QuoteConversionWidget
                                    data={quoteConversion}
                                    loading={loadingExtended}
                                    onDrillDown={(status) => handleDrillDown('quote', status.toUpperCase(), { status })}
                                />
                            </WidgetWrapper>
                        </div>

                        <div key="datasource-kpi" data-grid={getGridProps('datasource-kpi', 3)} className="h-full">
                            <WidgetWrapper title="Data Engine" isEditMode={isEditMode}>
                                <div className="flex flex-col h-[60px] justify-center items-center text-center mt-2">
                                    <div className={`text-xl font-bold ${useBigQuery ? 'text-blue-600' : 'text-gray-900'}`}>
                                        {useBigQuery ? 'BigQuery' : 'Firestore'}
                                    </div>
                                    <div className="text-sm text-gray-500 mt-1">
                                        {useBigQuery ? 'Historical & Aggregated' : 'Realtime Data'}
                                    </div>
                                </div>
                            </WidgetWrapper>
                        </div>

                        {/* ROW 1-3 — Revenue Trend + Tech Utilization */}
                        <div key="revenue-trend" data-grid={getGridProps('revenue-trend', 4)} className="h-full">
                            <WidgetWrapper title="Revenue Trend" isEditMode={isEditMode}>
                                <RevenueTrendWidget
                                    data={revenueData}
                                    loading={loadingCore}
                                    onDrillDown={(date) => handleDrillDown('revenue', date, { date })}
                                />
                            </WidgetWrapper>
                        </div>

                        <div key="tech-utilization" data-grid={getGridProps('tech-utilization', 5)} className="h-full">
                            <WidgetWrapper title="Technician Utilization" isEditMode={isEditMode}>
                                <TechUtilizationWidget
                                    data={techData}
                                    loading={loadingCore}
                                    onDrillDown={(techName) => handleDrillDown('tech', techName, { techName })}
                                />
                            </WidgetWrapper>
                        </div>

                        {/* ROW 4-6 — Job Pipeline + Category + Source */}
                        <div key="job-pipeline" data-grid={getGridProps('job-pipeline', 6)} className="h-full">
                            <WidgetWrapper title="Job Pipeline" isEditMode={isEditMode}>
                                <JobPipelineWidget
                                    data={jobPipelineData}
                                    loading={loadingExtended}
                                    onDrillDown={(status) => handleDrillDown('job_pipeline', status.toUpperCase(), { status })}
                                />
                            </WidgetWrapper>
                        </div>

                        <div key="job-category" data-grid={getGridProps('job-category', 7)} className="h-full">
                            <WidgetWrapper title="Jobs by Category" isEditMode={isEditMode}>
                                <JobCategoryWidget
                                    data={jobCategoryData}
                                    loading={loadingExtended}
                                    onDrillDown={(category) => handleDrillDown('job_category', category, { category })}
                                />
                            </WidgetWrapper>
                        </div>

                        <div key="job-source" data-grid={getGridProps('job-source', 8)} className="h-full">
                            <WidgetWrapper title="Jobs by Source" isEditMode={isEditMode}>
                                <JobSourceWidget
                                    data={jobSourceData}
                                    loading={loadingExtended}
                                    onDrillDown={(source) => handleDrillDown('job_source', source, { source })}
                                />
                            </WidgetWrapper>
                        </div>

                        {/* ROW 7-9 — Profitability + Invoice Aging */}
                        <div key="profitability" data-grid={getGridProps('profitability', 9)} className="h-full">
                            <WidgetWrapper title="Revenue vs Costs" isEditMode={isEditMode}>
                                <ProfitabilityWidget
                                    data={profitabilityData}
                                    loading={loadingExtended}
                                    onDrillDown={(date) => handleDrillDown('profitability', date, { date })}
                                />
                            </WidgetWrapper>
                        </div>

                        <div key="invoice-aging" data-grid={getGridProps('invoice-aging', 10)} className="h-full">
                            <WidgetWrapper title="Invoice Aging (AR)" isEditMode={isEditMode} className="border-amber-100">
                                <InvoiceAgingWidget
                                    data={invoiceAgingData}
                                    loading={loadingExtended}
                                    onDrillDown={(bucket) => handleDrillDown('invoice_aging', bucket, { bucket })}
                                />
                            </WidgetWrapper>
                        </div>

                        {/* ROW 10-12 — Customer Leaderboard + Avg Job Metrics */}
                        <div key="customer-leaderboard" data-grid={getGridProps('customer-leaderboard', 11)} className="h-full">
                            <WidgetWrapper title="Top Customers by Revenue" isEditMode={isEditMode}>
                                <CustomerLeaderboardWidget
                                    data={customerData}
                                    loading={loadingExtended}
                                    onDrillDown={(customerId, customerName) => handleDrillDown('customer', customerName, { customerId })}
                                />
                            </WidgetWrapper>
                        </div>

                        <div key="avg-job-metrics" data-grid={getGridProps('avg-job-metrics', 12)} className="h-full">
                            <WidgetWrapper title="Job Performance Metrics" isEditMode={isEditMode}>
                                <AvgJobMetricsWidget
                                    data={avgJobMetrics}
                                    loading={loadingExtended}
                                    onDrillDown={(category) => handleDrillDown('avg_job_metrics', category, { category })}
                                />
                            </WidgetWrapper>
                        </div>

                        {/* ROW 13-15 — Inventory Alerts */}
                        <div key="inventory-alerts" data-grid={getGridProps('inventory-alerts', 13)} className="h-full">
                            <WidgetWrapper title="Inventory Alerts" isEditMode={isEditMode} className="border-orange-100">
                                <InventoryAlertsWidget
                                    data={inventoryAlerts}
                                    loading={loadingExtended}
                                    onDrillDown={(itemId, itemName) => handleDrillDown('inventory', itemName, { itemId })}
                                />
                            </WidgetWrapper>
                        </div>

                    </ResponsiveGridLayout>
                </div>
            )}

            {/* Edit Mode Hint */}
            {
                isEditMode && (
                    <div className="text-center mt-6 text-sm text-blue-600/80 font-medium pb-8">
                        Drag widgets using their header to rearrange. Drag the bottom right corner to resize.
                    </div>
                )
            }

            {/* ─── Modals ──────────────────────────────────────────────────────── */}
            {
                drillDownContext && (
                    <ReportDetailModal
                        context={drillDownContext}
                        onClose={() => setDrillDownContext(null)}
                        fetchData={fetchDrillDownData}
                        onSchedule={() => {
                            setReportToEdit(null);
                            setShowScheduleModal(true);
                        }}
                    />
                )
            }

            {
                showScheduleModal && (
                    <ScheduleReportModal
                        reportToEdit={reportToEdit}
                        defaultReportType={drillDownContext?.type as any} // map if needed, generic for now
                        onClose={() => {
                            setShowScheduleModal(false);
                            setReportToEdit(null);
                        }}
                    />
                )
            }

            {
                showWizard && (
                    <CustomReportWizard
                        onClose={() => setShowWizard(false)}
                        onDownloadOneOff={async (config) => {
                            if (user?.org_id) {
                                await reportingService.downloadCustomReport(user.org_id, config);
                            }
                        }}
                        onSchedule={(config) => {
                            setReportToEdit({
                                name: `Custom ${config.source} Report`,
                                reportType: config.source as any,
                                format: config.visualization === 'table' ? 'csv' : 'pdf',
                            } as any);
                            setShowScheduleModal(true);
                        }}
                        onAddToDashboard={() => {
                            alert("This report widget has been configured! (Preview Phase)");
                        }}
                    />
                )
            }
        </div >
    );
};
