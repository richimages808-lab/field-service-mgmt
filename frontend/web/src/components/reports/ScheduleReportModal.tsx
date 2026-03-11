import React, { useState } from 'react';
import { collection, addDoc, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../auth/AuthProvider';
import { ScheduledReport, ReportFormat, DeliveryMethod, ReportFrequency, ReportType } from '../../types/ScheduledReport';
import { X, Calendar, Clock, Mail, MessageSquare, FileText, FileSpreadsheet, FileVolume, Loader2 } from 'lucide-react';

interface Props {
    reportToEdit?: ScheduledReport | null;
    defaultReportType?: ReportType;
    onClose: () => void;
}

const REPORT_TYPES: { id: ReportType, label: string }[] = [
    { id: 'revenue_trend', label: 'Revenue Trend' },
    { id: 'tech_utilization', label: 'Tech Utilization' },
    { id: 'job_pipeline', label: 'Job Pipeline' },
    { id: 'jobs_by_category', label: 'Jobs by Category' },
    { id: 'jobs_by_source', label: 'Jobs by Source' },
    { id: 'invoice_aging', label: 'Invoice Aging' },
    { id: 'customer_leaderboard', label: 'Customer Leaderboard' },
    { id: 'quote_conversion', label: 'Quote Conversion' },
    { id: 'profitability', label: 'Profitability' },
    { id: 'avg_job_metrics', label: 'Avg Job Metrics' },
    { id: 'inventory_alerts', label: 'Inventory Alerts' }
];

export const ScheduleReportModal: React.FC<Props> = ({ reportToEdit, defaultReportType, onClose }) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);

    const [name, setName] = useState(reportToEdit?.name || '');
    const [reportType, setReportType] = useState<ReportType>(reportToEdit?.reportType || defaultReportType || 'job_pipeline');
    const [format, setFormat] = useState<ReportFormat>(reportToEdit?.format || 'csv');
    const isEditingSms = reportToEdit?.deliveryMethod === 'sms';

    const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>(reportToEdit?.deliveryMethod || 'email');
    const [deliveryDestination, setDeliveryDestination] = useState(
        isEditingSms
            ? (reportToEdit?.deliveryDestination.split('@')[0].replace('+1', '') || '')
            : (reportToEdit?.deliveryDestination || user?.email || '')
    );
    const [carrierGateway, setCarrierGateway] = useState(
        isEditingSms
            ? (reportToEdit?.deliveryDestination.includes('@') ? '@' + reportToEdit?.deliveryDestination.split('@')[1] : '')
            : '' // Default Direct SMS
    );

    const [frequency, setFrequency] = useState<ReportFrequency>(reportToEdit?.frequency || 'weekly');
    const [timeOfDay, setTimeOfDay] = useState<string>(reportToEdit?.timeOfDay || '08:00');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.org_id) return;

        setLoading(true);
        try {
            // Calculate nextRunAt
            const nextRunAtDate = new Date();
            if (frequency === 'daily') nextRunAtDate.setDate(nextRunAtDate.getDate() + 1);
            else if (frequency === 'weekly') nextRunAtDate.setDate(nextRunAtDate.getDate() + 7);
            else if (frequency === 'monthly') nextRunAtDate.setMonth(nextRunAtDate.getMonth() + 1);

            // Apply specific time of day
            const [hours, minutes] = timeOfDay.split(':').map(Number);
            nextRunAtDate.setHours(hours || 8, minutes || 0, 0, 0);

            const rawPhone = deliveryDestination.replace(/\D/g, '');
            const finalDestination = deliveryMethod === 'sms'
                ? (carrierGateway ? `${rawPhone}${carrierGateway}` : (deliveryDestination.startsWith('+') ? deliveryDestination.replace(/[^\d+]/g, '') : `+1${rawPhone}`))
                : deliveryDestination;

            const payload: Partial<ScheduledReport> = {
                organizationId: user.org_id,
                name,
                reportType,
                format,
                deliveryMethod,
                deliveryDestination: finalDestination,
                frequency,
                timeOfDay,
                nextRunAt: Timestamp.fromDate(nextRunAtDate),
                active: true
            };

            if (reportToEdit?.id) {
                await updateDoc(doc(db, 'scheduled_reports', reportToEdit.id), payload);
            } else {
                payload.createdAt = Timestamp.now();
                payload.createdBy = user.uid;
                payload.lastRunAt = null;
                await addDoc(collection(db, 'scheduled_reports'), payload);
            }
            onClose();
        } catch (error) {
            console.error("Error saving scheduled report:", error);
            alert("Failed to save scheduled report. Please try again.");
            setLoading(false);
        }
    };

    return (
        <div className="fixed flex items-center justify-center p-4 z-50 overflow-y-auto" style={{ inset: 0, backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div
                role="dialog"
                aria-modal="true"
                className="bg-white rounded-xl shadow-xl w-full max-w-lg mb-[10vh]"
                style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
            >
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                            <Calendar className="w-5 h-5" />
                        </div>
                        <h2 className="text-xl font-semibold text-gray-900">
                            {reportToEdit ? 'Edit Scheduled Report' : 'Schedule Report'}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 flex-1 overflow-y-auto">
                    <div className="space-y-6">

                        {/* Name */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Schedule Name</label>
                            <input
                                type="text"
                                required
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="e.g. Weekly Executive Summary"
                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        {/* Report Type */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Data Source</label>
                            <select
                                value={reportType}
                                onChange={e => setReportType(e.target.value as ReportType)}
                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                {REPORT_TYPES.map(type => (
                                    <option key={type.id} value={type.id}>{type.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Format Selection */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Export Format</label>
                            <div className="grid grid-cols-3 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setFormat('csv')}
                                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${format === 'csv' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                >
                                    <FileText className="w-4 h-4" /> CSV
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFormat('excel')}
                                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${format === 'excel' ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                >
                                    <FileSpreadsheet className="w-4 h-4" /> Excel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFormat('pdf')}
                                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${format === 'pdf' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                >
                                    {/* Reuse icon conceptually */}
                                    <FileText className="w-4 h-4" /> PDF
                                </button>
                            </div>
                        </div>

                        {/* Delivery Method & Destination */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Method</label>
                            <div className="grid grid-cols-2 gap-3 mb-3">
                                <button
                                    type="button"
                                    onClick={() => setDeliveryMethod('email')}
                                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${deliveryMethod === 'email' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                >
                                    <Mail className="w-4 h-4" /> Email
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDeliveryMethod('sms')}
                                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${deliveryMethod === 'sms' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                >
                                    <MessageSquare className="w-4 h-4" /> SMS Link
                                </button>
                            </div>

                            <div className="flex gap-2">
                                <input
                                    type={deliveryMethod === 'email' ? 'email' : 'tel'}
                                    required
                                    value={deliveryDestination}
                                    onChange={e => setDeliveryDestination(e.target.value)}
                                    placeholder={deliveryMethod === 'email' ? 'Enter email address' : 'Phone (e.g. +1234567890)'}
                                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                {deliveryMethod === 'sms' && (
                                    <select
                                        value={carrierGateway}
                                        onChange={e => setCarrierGateway(e.target.value)}
                                        className="w-full max-w-[150px] px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                    >
                                        <option value="">Direct SMS (Twilio)</option>
                                        <option value="@vtext.com">Verizon</option>
                                        <option value="@txt.att.net">AT&T</option>
                                        <option value="@tmomail.net">T-Mobile</option>
                                        <option value="@messaging.sprintpcs.com">Sprint</option>
                                        <option value="@email.uscc.net">US Cellular</option>
                                        <option value="@sms.myboostmobile.com">Boost Mobile</option>
                                        <option value="@sms.cricketwireless.net">Cricket</option>
                                        <option value="@vmobl.com">Virgin Mobile</option>
                                    </select>
                                )}
                            </div>
                        </div>

                        {/* Frequency & Time */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Schedule Time & Frequency</label>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <input
                                    type="time"
                                    required
                                    value={timeOfDay}
                                    onChange={e => setTimeOfDay(e.target.value)}
                                    className="px-3 py-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <div className="grid grid-cols-3 gap-3 w-full">
                                    {(['daily', 'weekly', 'monthly'] as ReportFrequency[]).map(freq => (
                                        <button
                                            key={freq}
                                            type="button"
                                            onClick={() => setFrequency(freq)}
                                            className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium capitalize transition-colors ${frequency === freq ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                        >
                                            <Clock className="w-4 h-4" /> {freq}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                    </div>
                </form>

                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {reportToEdit ? 'Update Schedule' : 'Create Schedule'}
                    </button>
                </div>
            </div>
        </div>
    );
};
