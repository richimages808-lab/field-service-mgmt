import React, { useState, useEffect } from 'react';
import { X, Download, FileSpreadsheet, FileText, Loader2, ChevronRight, Calendar } from 'lucide-react';
import { DraggableTable } from './DraggableTable';
import { ExportColumn, exportToCSV, exportToExcel, exportToPDF } from '../../utils/exportUtils';

// ─── Drill-Down Configuration ───────────────────────────────────────────────────

export type DrillDownType =
    | 'revenue'
    | 'job_pipeline'
    | 'job_category'
    | 'invoice_aging'
    | 'quote'
    | 'job_source'
    | 'tech'
    | 'customer'
    | 'profitability'
    | 'avg_job_metrics'
    | 'inventory';

export interface DrillDownContext {
    type: DrillDownType;
    label: string; // e.g. "Completed", "$450", "2024-02-15"
    params: Record<string, any>; // e.g. { status: 'completed', date: '2024-02-15' }
}

// Column definitions per drill-down type
export const DRILL_DOWN_COLUMNS: Record<DrillDownType, ExportColumn[]> = {
    revenue: [
        { key: 'id', label: 'Invoice ID' },
        { key: 'customer_name', label: 'Customer' },
        { key: 'total', label: 'Amount', format: 'currency' },
        { key: 'status', label: 'Status' },
        { key: 'createdAt', label: 'Created', format: 'date' },
        { key: 'paidAt', label: 'Paid', format: 'date' },
        { key: 'dueDate', label: 'Due Date', format: 'date' },
    ],
    job_pipeline: [
        { key: 'id', label: 'Job ID' },
        { key: 'title', label: 'Title' },
        { key: 'status', label: 'Status' },
        { key: 'category', label: 'Category' },
        { key: 'priority', label: 'Priority' },
        { key: 'assignedTechName', label: 'Technician' },
        { key: 'customer_name', label: 'Customer' },
        { key: 'createdAt', label: 'Created', format: 'date' },
        { key: 'scheduledDate', label: 'Scheduled', format: 'date' },
    ],
    job_category: [
        { key: 'id', label: 'Job ID' },
        { key: 'title', label: 'Title' },
        { key: 'category', label: 'Category' },
        { key: 'status', label: 'Status' },
        { key: 'priority', label: 'Priority' },
        { key: 'assignedTechName', label: 'Technician' },
        { key: 'customer_name', label: 'Customer' },
        { key: 'createdAt', label: 'Created', format: 'date' },
    ],
    invoice_aging: [
        { key: 'id', label: 'Invoice ID' },
        { key: 'customer_name', label: 'Customer' },
        { key: 'total', label: 'Total', format: 'currency' },
        { key: 'amountPaid', label: 'Paid', format: 'currency' },
        { key: 'balance', label: 'Balance', format: 'currency' },
        { key: 'status', label: 'Status' },
        { key: 'createdAt', label: 'Created', format: 'date' },
        { key: 'dueDate', label: 'Due Date', format: 'date' },
        { key: 'daysOutstanding', label: 'Days Outstanding', format: 'number' },
    ],
    quote: [
        { key: 'id', label: 'Quote ID' },
        { key: 'customerName', label: 'Customer' },
        { key: 'total', label: 'Amount', format: 'currency' },
        { key: 'status', label: 'Status' },
        { key: 'createdAt', label: 'Created', format: 'date' },
        { key: 'approvedAt', label: 'Approved', format: 'date' },
        { key: 'validUntil', label: 'Expires', format: 'date' },
    ],
    job_source: [
        { key: 'id', label: 'Job ID' },
        { key: 'title', label: 'Title' },
        { key: 'source', label: 'Source' },
        { key: 'status', label: 'Status' },
        { key: 'category', label: 'Category' },
        { key: 'customer_name', label: 'Customer' },
        { key: 'createdAt', label: 'Created', format: 'date' },
    ],
    tech: [
        { key: 'id', label: 'Job ID' },
        { key: 'title', label: 'Title' },
        { key: 'assignedTechName', label: 'Technician' },
        { key: 'status', label: 'Status' },
        { key: 'category', label: 'Category' },
        { key: 'duration', label: 'Duration (min)', format: 'number' },
        { key: 'completedAt', label: 'Completed', format: 'date' },
    ],
    customer: [
        { key: 'id', label: 'Invoice ID' },
        { key: 'customer_name', label: 'Customer' },
        { key: 'total', label: 'Amount', format: 'currency' },
        { key: 'status', label: 'Status' },
        { key: 'createdAt', label: 'Created', format: 'date' },
    ],
    profitability: [
        { key: 'id', label: 'Invoice ID' },
        { key: 'customer_name', label: 'Customer' },
        { key: 'total', label: 'Revenue', format: 'currency' },
        { key: 'status', label: 'Status' },
        { key: 'createdAt', label: 'Date', format: 'date' },
    ],
    avg_job_metrics: [
        { key: 'id', label: 'Job ID' },
        { key: 'title', label: 'Title' },
        { key: 'category', label: 'Category' },
        { key: 'duration', label: 'Duration (min)', format: 'number' },
        { key: 'status', label: 'Status' },
        { key: 'assignedTechName', label: 'Technician' },
        { key: 'completedAt', label: 'Completed', format: 'date' },
    ],
    inventory: [
        { key: 'id', label: 'Item ID' },
        { key: 'name', label: 'Name' },
        { key: 'category', label: 'Category' },
        { key: 'quantity', label: 'Stock', format: 'number' },
        { key: 'minQuantity', label: 'Min Required', format: 'number' },
        { key: 'unit_cost', label: 'Unit Cost', format: 'currency' },
        { key: 'location', label: 'Location' },
    ],
};

// Widget titles for breadcrumbs
const WIDGET_TITLES: Record<DrillDownType, string> = {
    revenue: 'Revenue Trend',
    job_pipeline: 'Job Pipeline',
    job_category: 'Jobs by Category',
    invoice_aging: 'Invoice Aging',
    quote: 'Quote Conversion',
    job_source: 'Jobs by Source',
    tech: 'Technician Utilization',
    customer: 'Customer Revenue',
    profitability: 'Revenue vs Costs',
    avg_job_metrics: 'Job Performance',
    inventory: 'Inventory',
};

// ─── Modal Component ────────────────────────────────────────────────────────────

interface ReportDetailModalProps {
    context: DrillDownContext | null;
    onClose: () => void;
    fetchData: (context: DrillDownContext) => Promise<Record<string, any>[]>;
    onSchedule?: () => void;
}

export const ReportDetailModal: React.FC<ReportDetailModalProps> = ({
    context,
    onClose,
    fetchData,
    onSchedule,
}) => {
    const [data, setData] = useState<Record<string, any>[]>([]);
    const [loading, setLoading] = useState(false);
    const [columns, setColumns] = useState<ExportColumn[]>([]);
    const [exporting, setExporting] = useState<string | null>(null);

    // Load data when context changes
    useEffect(() => {
        if (!context) return;
        setColumns(DRILL_DOWN_COLUMNS[context.type] || []);
        const load = async () => {
            setLoading(true);
            try {
                const result = await fetchData(context);
                setData(result);
            } catch (err) {
                console.error('Drill-down fetch failed:', err);
                setData([]);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [context, fetchData]);

    if (!context) return null;

    const filename = `${context.type}_${context.label.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}`;
    const title = `${WIDGET_TITLES[context.type]} — ${context.label}`;

    const handleExport = async (type: 'csv' | 'excel' | 'pdf') => {
        setExporting(type);
        try {
            if (type === 'csv') exportToCSV(data, columns, filename);
            else if (type === 'excel') await exportToExcel(data, columns, filename);
            else if (type === 'pdf') await exportToPDF(data, columns, filename, title);
        } catch (err) {
            console.error(`Export to ${type} failed:`, err);
        } finally {
            setTimeout(() => setExporting(null), 500);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div
                className="bg-white w-[95vw] h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
                    <div className="flex flex-col gap-1">
                        {/* Breadcrumb */}
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                            <span>Reports</span>
                            <ChevronRight className="w-3 h-3" />
                            <span className="text-gray-600 font-medium">{WIDGET_TITLES[context.type]}</span>
                            <ChevronRight className="w-3 h-3" />
                            <span className="text-blue-600 font-medium">{context.label}</span>
                        </div>
                        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Export Buttons */}
                        <div className="flex items-center gap-1 mr-2 border-r border-gray-200 pr-3">
                            <button
                                onClick={() => handleExport('csv')}
                                disabled={loading || data.length === 0}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white hover:bg-gray-50 border border-gray-200 rounded-lg transition-all disabled:opacity-40 hover:border-gray-300 hover:shadow-sm"
                            >
                                {exporting === 'csv' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                CSV
                            </button>
                            <button
                                onClick={() => handleExport('excel')}
                                disabled={loading || data.length === 0}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-all disabled:opacity-40 hover:shadow-sm"
                            >
                                {exporting === 'excel' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
                                Excel
                            </button>
                            <button
                                onClick={() => handleExport('pdf')}
                                disabled={loading || data.length === 0}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-all disabled:opacity-40 hover:shadow-sm"
                            >
                                {exporting === 'pdf' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                                PDF
                            </button>
                        </div>

                        {onSchedule && (
                            <button
                                onClick={onSchedule}
                                className="flex items-center gap-1.5 px-3 py-1.5 mr-2 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-all hover:shadow-sm text-nowrap"
                            >
                                <Calendar className="w-3.5 h-3.5" />
                                Schedule
                            </button>
                        )}

                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 p-6 overflow-hidden">
                    {loading ? (
                        <div className="h-full flex flex-col items-center justify-center gap-3">
                            <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
                            <span className="text-sm text-gray-500">Loading detail data...</span>
                        </div>
                    ) : (
                        <DraggableTable
                            data={data}
                            columns={columns}
                            onColumnsChange={setColumns}
                            maxHeight="calc(90vh - 140px)"
                        />
                    )}
                </div>
            </div>
        </div>
    );
};
