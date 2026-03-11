import React, { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Download, PlusCircle, CalendarClock, Loader2 } from 'lucide-react';

export type ReportSource = 'jobs' | 'revenue' | 'invoices' | 'quotes' | 'inventory';
export type ReportVisualization = 'table' | 'bar' | 'line' | 'pie';

export interface CustomReportConfig {
    source: ReportSource;
    metrics: string[];
    groupBy: string;
    visualization: ReportVisualization;
}

interface CustomReportWizardProps {
    onClose: () => void;
    onDownloadOneOff: (config: CustomReportConfig) => Promise<void>;
    onSchedule: (config: CustomReportConfig) => void;
    onAddToDashboard: (config: CustomReportConfig) => void;
}

export const CustomReportWizard: React.FC<CustomReportWizardProps> = ({
    onClose,
    onDownloadOneOff,
    onSchedule,
    onAddToDashboard
}) => {
    const [step, setStep] = useState(1);
    const [config, setConfig] = useState<CustomReportConfig>({
        source: 'jobs',
        metrics: [],
        groupBy: '',
        visualization: 'table'
    });
    const [isDownloading, setIsDownloading] = useState(false);

    const handleNext = () => setStep(prev => Math.min(prev + 1, 4));
    const handleBack = () => setStep(prev => Math.max(prev - 1, 1));

    const renderStepIndicators = () => (
        <div className="flex items-center justify-center space-x-2 mb-8">
            {[1, 2, 3, 4].map((num) => (
                <React.Fragment key={num}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step === num ? 'bg-blue-600 text-white' : step > num ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                        {num}
                    </div>
                    {num < 4 && <div className={`w-12 h-1 ${step > num ? 'bg-green-500' : 'bg-gray-200'}`} />}
                </React.Fragment>
            ))}
        </div>
    );

    const renderStep1 = () => (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Step 1: Select Data Source</h3>
                <p className="text-gray-500">What do you want to report on?</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
                {[
                    { id: 'jobs', label: 'Jobs', icon: '🔧', desc: 'Status, duration, technicians' },
                    { id: 'revenue', label: 'Revenue', icon: '💰', desc: 'Amounts, payments, profitability' },
                    { id: 'invoices', label: 'Invoices', icon: '📝', desc: 'Aging, paid vs unpaid' },
                    { id: 'quotes', label: 'Quotes', icon: '📋', desc: 'Conversion rates, values' },
                    { id: 'inventory', label: 'Inventory', icon: '📦', desc: 'Stock levels, usage' },
                ].map(src => (
                    <div
                        key={src.id}
                        onClick={() => setConfig({ ...config, source: src.id as ReportSource, metrics: [], groupBy: '' })}
                        className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${config.source === src.id ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}
                    >
                        <div className="text-2xl mb-2">{src.icon}</div>
                        <h4 className="font-semibold text-gray-900">{src.label}</h4>
                        <p className="text-sm text-gray-500">{src.desc}</p>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderStep2 = () => {
        // Simplified mapping for UX speed
        const optionsMap: Record<string, { metrics: string[], groupBy: string[] }> = {
            'jobs': { metrics: ['Count', 'Total Duration', 'Avg Duration'], groupBy: ['Status', 'Category', 'Technician', 'Source'] },
            'revenue': { metrics: ['Total Revenue', 'Profit Margin', 'Avg Job Value'], groupBy: ['Date', 'Category', 'Customer'] },
            'invoices': { metrics: ['Total Amount', 'Outstanding Amount'], groupBy: ['Status', 'Aging Bucket', 'Customer'] },
            'quotes': { metrics: ['Total Requested', 'Conversion Rate'], groupBy: ['Status', 'Date'] },
            'inventory': { metrics: ['Quantity in Stock', 'Total Value'], groupBy: ['Category', 'Location'] }
        };

        const opts = optionsMap[config.source];

        return (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Step 2: Metrics & Grouping</h3>
                    <p className="text-gray-500">Customize what data points to show.</p>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Metrics (Select at least 1)</label>
                        <div className="flex flex-wrap gap-2">
                            {opts.metrics.map(m => (
                                <button
                                    key={m}
                                    onClick={() => {
                                        if (config.metrics.includes(m)) {
                                            setConfig({ ...config, metrics: config.metrics.filter(x => x !== m) });
                                        } else {
                                            setConfig({ ...config, metrics: [...config.metrics, m] });
                                        }
                                    }}
                                    className={`px-4 py-2 rounded-full border text-sm transition-colors ${config.metrics.includes(m) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'}`}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Group By (Optional)</label>
                        <select
                            value={config.groupBy}
                            onChange={(e) => setConfig({ ...config, groupBy: e.target.value })}
                            className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm border"
                        >
                            <option value="">None (Raw List)</option>
                            {opts.groupBy.map(g => (
                                <option key={g} value={g}>{g}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
        );
    };

    const renderStep3 = () => (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Step 3: Choose Visualization</h3>
                <p className="text-gray-500">How should this report look on the dashboard?</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
                {[
                    { id: 'table', label: 'Data Table', icon: '📊' },
                    { id: 'bar', label: 'Bar Chart', icon: '📈' },
                    { id: 'line', label: 'Line Chart', icon: '📉' },
                    { id: 'pie', label: 'Pie Chart', icon: '🍕' },
                ].map(vis => (
                    <div
                        key={vis.id}
                        onClick={() => setConfig({ ...config, visualization: vis.id as ReportVisualization })}
                        className={`p-4 rounded-xl border-2 cursor-pointer flex items-center gap-4 transition-all ${config.visualization === vis.id ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}
                    >
                        <div className="text-2xl">{vis.icon}</div>
                        <h4 className="font-semibold text-gray-900">{vis.label}</h4>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderStep4 = () => (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Step 4: Report Actions</h3>
                <p className="text-gray-500">Your custom report is ready. What would you like to do?</p>
            </div>

            <div className="bg-gray-50 p-4 rounded-lg mb-6 border border-gray-200">
                <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-2">Report Summary</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                    <li><span className="font-semibold">Source:</span> <span className="capitalize">{config.source}</span></li>
                    <li><span className="font-semibold">Metrics:</span> {config.metrics.join(', ') || 'None selected'}</li>
                    <li><span className="font-semibold">Grouped By:</span> {config.groupBy || 'None'}</li>
                    <li><span className="font-semibold">Format:</span> <span className="capitalize">{config.visualization}</span></li>
                </ul>
            </div>

            <div className="space-y-4">
                <button
                    onClick={() => {
                        onAddToDashboard(config);
                        onClose();
                    }}
                    className="w-full flex items-center justify-between p-4 rounded-xl border border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
                >
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                            <PlusCircle className="w-5 h-5" />
                        </div>
                        <div>
                            <h4 className="font-semibold text-gray-900">Add to Dashboard</h4>
                            <p className="text-sm text-gray-500">Pin this report to your main analytics view</p>
                        </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-500" />
                </button>

                <button
                    onClick={() => {
                        onSchedule(config);
                        onClose();
                    }}
                    className="w-full flex items-center justify-between p-4 rounded-xl border border-gray-200 hover:border-purple-500 hover:bg-purple-50 transition-all text-left group"
                >
                    <div className="flex items-center gap-3">
                        <div className="bg-purple-100 p-2 rounded-lg text-purple-600">
                            <CalendarClock className="w-5 h-5" />
                        </div>
                        <div>
                            <h4 className="font-semibold text-gray-900">Schedule Delivery</h4>
                            <p className="text-sm text-gray-500">Email or SMS this report automatically</p>
                        </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-purple-500" />
                </button>

                <button
                    onClick={async () => {
                        setIsDownloading(true);
                        try {
                            await onDownloadOneOff(config);
                        } finally {
                            setIsDownloading(false);
                            onClose();
                        }
                    }}
                    disabled={isDownloading}
                    className="w-full flex items-center justify-between p-4 rounded-xl border border-gray-200 hover:border-green-500 hover:bg-green-50 transition-all text-left group disabled:opacity-50"
                >
                    <div className="flex items-center gap-3">
                        <div className="bg-green-100 p-2 rounded-lg text-green-600">
                            {isDownloading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                        </div>
                        <div>
                            <h4 className="font-semibold text-gray-900">Download One-Off</h4>
                            <p className="text-sm text-gray-500">Export this report immediately as CSV</p>
                        </div>
                    </div>
                    {!isDownloading && <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-green-500" />}
                </button>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-gray-900">Custom Report Builder</h2>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-8 overflow-y-auto flex-1">
                    {renderStepIndicators()}
                    {step === 1 && renderStep1()}
                    {step === 2 && renderStep2()}
                    {step === 3 && renderStep3()}
                    {step === 4 && renderStep4()}
                </div>

                {/* Footer Controls */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-between">
                    {step > 1 ? (
                        <button
                            onClick={handleBack}
                            className="px-4 py-2 font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" /> Back
                        </button>
                    ) : (
                        <div /> // Spacer
                    )}

                    {step < 4 ? (
                        <button
                            onClick={handleNext}
                            disabled={step === 2 && config.metrics.length === 0}
                            className="px-6 py-2 font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                        >
                            Next <ChevronRight className="w-4 h-4" />
                        </button>
                    ) : (
                        <button
                            onClick={onClose}
                            className="px-6 py-2 font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
                        >
                            Cancel
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
