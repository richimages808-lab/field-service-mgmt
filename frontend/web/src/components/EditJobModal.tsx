import React, { useState } from 'react';
import { Job } from '../types';
import { db } from '../firebase';
import { doc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { X, Save, Trash2, Calendar, Clock, Wrench, Phone, Mail, MessageCircle, Gauge, Settings2, DollarSign, Package, Truck, FileText, Sparkles, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

interface EditJobModalProps {
    job: Job;
    onClose: () => void;
}

export const EditJobModal: React.FC<EditJobModalProps> = ({ job, onClose }) => {
    const [formData, setFormData] = useState({
        customerName: job.customer.name,
        customerPhone: job.customer.phone || '',
        customerEmail: job.customer.email || '',
        customerAddress: job.customer.address || '',
        description: (job.request?.description || 'No description'),
        priority: job.priority,
        status: job.status,
        estimated_duration: job.estimated_duration || 60,
        parts_needed: job.parts_needed || false,
        parts_description: job.parts_description || '',
        scheduled_at: job.scheduled_at?.toDate ? format((job.scheduled_at?.toDate?.() || new Date(job.scheduled_at)), "yyyy-MM-dd'T'HH:mm") : '',
        // New fields for solo tech editing
        communicationPreference: job.request?.communicationPreference || 'email',
        complexity: job.complexity || 'medium',
        toolsNeeded: job.intakeReview?.overrides?.additionalTools?.join(', ') || '',
        materialSchedulingOverride: job.materialSchedulingOverride || '',
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
        }));
    };

    const handleSave = async () => {
        try {
            const jobRef = doc(db, 'jobs', job.id);

            // Parse tools from comma-separated string
            const toolsList = formData.toolsNeeded
                .split(',')
                .map(t => t.trim())
                .filter(t => t.length > 0);

            const updates: Record<string, any> = {
                'customer.name': formData.customerName,
                'customer.phone': formData.customerPhone,
                'customer.email': formData.customerEmail,
                'customer.address': formData.customerAddress,
                'request.description': formData.description,
                'request.communicationPreference': formData.communicationPreference,
                priority: formData.priority,
                status: formData.status,
                estimated_duration: Number(formData.estimated_duration),
                complexity: formData.complexity,
                parts_needed: formData.parts_needed,
                parts_description: formData.parts_description,
                'intakeReview.overrides.additionalTools': toolsList
            };

            // Material scheduling override — empty string means use org default
            if (formData.materialSchedulingOverride) {
                updates.materialSchedulingOverride = formData.materialSchedulingOverride;
            } else {
                updates.materialSchedulingOverride = null;
            }

            if (formData.scheduled_at) {
                updates.scheduled_at = Timestamp.fromDate(new Date(formData.scheduled_at));
            } else {
                updates.scheduled_at = null;
            }

            await updateDoc(jobRef, updates);
            onClose();
        } catch (error) {
            console.error("Error updating job:", error);
            alert("Failed to save changes.");
        }
    };

    const handleDelete = async () => {
        if (!confirm("Are you sure you want to delete this job? This cannot be undone.")) return;
        try {
            await deleteDoc(doc(db, 'jobs', job.id));
            onClose();
        } catch (error) {
            console.error("Error deleting job:", error);
            alert("Failed to delete job.");
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center p-6 border-b sticky top-0 bg-white z-10">
                    <h2 className="text-xl font-bold text-gray-800">Edit Job Details</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Customer Info */}
                    <section>
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Customer</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Name</label>
                                <input type="text" name="customerName" value={formData.customerName} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Phone</label>
                                <input type="tel" name="customerPhone" value={formData.customerPhone} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700">Address</label>
                                <input type="text" name="customerAddress" value={formData.customerAddress} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
                            </div>
                        </div>
                    </section>

                    {/* Job Details */}
                    <section>
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Job Details</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Description</label>
                                <textarea name="description" rows={3} value={formData.description} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Priority</label>
                                    <select name="priority" value={formData.priority} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2">
                                        <option value="low">Low</option>
                                        <option value="medium">Medium</option>
                                        <option value="high">High</option>
                                        <option value="critical">Critical</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Status</label>
                                    <select name="status" value={formData.status} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2">
                                        <option value="pending">Pending</option>
                                        <option value="unscheduled">Unscheduled</option>
                                        <option value="scheduled">Scheduled</option>
                                        <option value="in_progress">In Progress</option>
                                        <option value="completed">Completed</option>
                                        <option value="cancelled">Cancelled</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Request Details - NEW SECTION */}
                    <section>
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center">
                            <Settings2 className="w-4 h-4 mr-2" />
                            Request Details
                        </h3>
                        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* Communication Preference */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 flex items-center mb-1">
                                        {formData.communicationPreference === 'phone' && <Phone className="w-4 h-4 mr-1 text-blue-600" />}
                                        {formData.communicationPreference === 'email' && <Mail className="w-4 h-4 mr-1 text-blue-600" />}
                                        {formData.communicationPreference === 'text' && <MessageCircle className="w-4 h-4 mr-1 text-blue-600" />}
                                        Contact Method
                                    </label>
                                    <select
                                        name="communicationPreference"
                                        value={formData.communicationPreference}
                                        onChange={handleChange}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 bg-white"
                                    >
                                        <option value="phone">📞 Phone Call</option>
                                        <option value="text">💬 Text Message</option>
                                        <option value="email">📧 Email</option>
                                    </select>
                                </div>

                                {/* Complexity */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 flex items-center mb-1">
                                        <Gauge className="w-4 h-4 mr-1 text-orange-600" />
                                        Complexity
                                    </label>
                                    <select
                                        name="complexity"
                                        value={formData.complexity}
                                        onChange={handleChange}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 bg-white"
                                    >
                                        <option value="simple">🟢 Simple</option>
                                        <option value="medium">🟡 Medium</option>
                                        <option value="complex">🔴 Complex</option>
                                    </select>
                                </div>

                                {/* Material Scheduling Override */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 flex items-center mb-1">
                                        <Package className="w-4 h-4 mr-1 text-emerald-600" />
                                        Material Scheduling
                                    </label>
                                    <select
                                        name="materialSchedulingOverride"
                                        value={formData.materialSchedulingOverride}
                                        onChange={handleChange}
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 bg-white"
                                    >
                                        <option value="">Use org default</option>
                                        <option value="allow_all">📅 Schedule Anytime</option>
                                        <option value="estimated_availability">🚚 Wait for Materials</option>
                                        <option value="in_stock_only">✅ In-Stock Only</option>
                                    </select>
                                </div>

                                {/* Estimated Duration (moved here for better grouping) */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 flex items-center mb-1">
                                        <Clock className="w-4 h-4 mr-1 text-amber-600" />
                                        Time to Resolve
                                    </label>
                                    <select name="estimated_duration" value={formData.estimated_duration} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 bg-white">
                                        <option value="30">30 Mins</option>
                                        <option value="60">1 Hour</option>
                                        <option value="90">1.5 Hours</option>
                                        <option value="120">2 Hours</option>
                                        <option value="150">2.5 Hours</option>
                                        <option value="180">3 Hours</option>
                                        <option value="240">4 Hours</option>
                                        <option value="300">5 Hours</option>
                                        <option value="360">6 Hours</option>
                                        <option value="480">Full Day</option>
                                    </select>
                                </div>
                            </div>

                            {/* Tools Needed */}
                            <div className="mt-4">
                                <label className="block text-sm font-medium text-gray-700 flex items-center mb-1">
                                    <Wrench className="w-4 h-4 mr-1 text-green-600" />
                                    Tools Needed
                                </label>
                                <input
                                    type="text"
                                    name="toolsNeeded"
                                    value={formData.toolsNeeded}
                                    onChange={handleChange}
                                    placeholder="e.g., Multimeter, Wrench, Screwdriver"
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 bg-white"
                                />
                                <p className="text-xs text-gray-500 mt-1">Comma-separated list of tools</p>
                            </div>
                        </div>
                    </section>

                    {/* Customer Availability - Read Only */}
                    {job.request?.availabilityWindows && job.request.availabilityWindows.length > 0 && (
                        <section>
                            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center">
                                <Calendar className="w-4 h-4 mr-2" />
                                Customer Availability
                            </h3>
                            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                                <p className="text-xs text-green-700 mb-3">Customer's preferred appointment times:</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {job.request.availabilityWindows.map((window, idx) => (
                                        <div key={idx} className="bg-white rounded-md p-2 border border-green-300 text-sm">
                                            <div className="font-semibold text-gray-900 capitalize">{window.day}</div>
                                            <div className="text-gray-600">
                                                {window.startTime} - {window.endTime}
                                                {window.preferredTime && (
                                                    <span className="ml-1 text-green-700 text-xs">({window.preferredTime})</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    )}

                    {/* ── Job Estimate & Details ─────────────────────── */}
                    {((job as any).costBreakdown || (job as any).aiRecommendation) && (
                        <section>
                            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center">
                                <DollarSign className="w-4 h-4 mr-2" />
                                Job Estimate & Details
                                {(job as any).aiEstimatedAt && (
                                    <span className="ml-2 text-[10px] font-normal text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                        <Sparkles className="w-2.5 h-2.5" /> AI Generated
                                    </span>
                                )}
                            </h3>

                            <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                                {/* Diagnosis */}
                                {(job as any).aiRecommendation?.diagnosis && (
                                    <div className="px-4 py-3 border-b border-gray-200 bg-violet-50">
                                        <p className="text-xs font-semibold text-violet-700 mb-1 flex items-center gap-1">
                                            <Sparkles className="w-3 h-3" /> AI Diagnosis
                                        </p>
                                        <p className="text-sm text-gray-700">{(job as any).aiRecommendation.diagnosis}</p>
                                    </div>
                                )}

                                {/* Materials / Parts Table */}
                                {(() => {
                                    const costBreakdown = (job as any).costBreakdown;
                                    const aiRec = (job as any).aiRecommendation;
                                    const parts = costBreakdown?.parts || aiRec?.partsNeeded || [];

                                    if (parts.length === 0) return null;

                                    return (
                                        <div className="px-4 py-3 border-b border-gray-200">
                                            <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                                                <Package className="w-3 h-3 text-blue-500" /> Materials & Parts
                                            </p>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-xs">
                                                    <thead>
                                                        <tr className="text-gray-500 border-b border-gray-200">
                                                            <th className="text-left py-1.5 pr-2 font-medium">Item</th>
                                                            <th className="text-center py-1.5 px-2 font-medium w-12">Qty</th>
                                                            <th className="text-right py-1.5 px-2 font-medium w-20">Unit Cost</th>
                                                            {costBreakdown && <th className="text-right py-1.5 px-2 font-medium w-16">Markup</th>}
                                                            <th className="text-right py-1.5 pl-2 font-medium w-20">Total</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {parts.map((part: any, idx: number) => {
                                                            const qty = part.quantity || 1;
                                                            const cost = part.baseCost || part.estimatedCost || 0;
                                                            const markup = part.markupPercent || 0;
                                                            const custPrice = part.customerPrice || cost;
                                                            const lineTotal = part.lineTotal || (qty * custPrice);

                                                            return (
                                                                <tr key={idx} className="border-b border-gray-100 last:border-0">
                                                                    <td className="py-1.5 pr-2 text-gray-800">{part.name}</td>
                                                                    <td className="py-1.5 px-2 text-center text-gray-600">{qty}</td>
                                                                    <td className="py-1.5 px-2 text-right text-gray-600">${cost.toFixed(2)}</td>
                                                                    {costBreakdown && (
                                                                        <td className="py-1.5 px-2 text-right text-gray-500">{markup}%</td>
                                                                    )}
                                                                    <td className="py-1.5 pl-2 text-right font-medium text-gray-800">${lineTotal.toFixed(2)}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                            {costBreakdown?.materialSubtotal != null && (
                                                <div className="flex justify-end mt-1.5 pt-1.5 border-t border-gray-200">
                                                    <span className="text-xs text-gray-500 mr-2">Materials Subtotal:</span>
                                                    <span className="text-xs font-semibold text-gray-800">${costBreakdown.materialSubtotal.toFixed(2)}</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* Labor */}
                                {(() => {
                                    const costBreakdown = (job as any).costBreakdown;
                                    const laborData = costBreakdown?.labor;
                                    const estimatedDuration = job.estimated_duration || (job as any).aiRecommendation?.estimatedDuration;

                                    return (
                                        <div className="px-4 py-3 border-b border-gray-200">
                                            <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                                                <Clock className="w-3 h-3 text-amber-500" /> Labor
                                            </p>
                                            <div className="flex items-center justify-between">
                                                <div className="text-sm text-gray-700">
                                                    {laborData ? (
                                                        <>{laborData.hours} hrs × ${laborData.rate}/hr</>
                                                    ) : estimatedDuration ? (
                                                        <>Estimated: {estimatedDuration >= 60
                                                            ? `${Math.floor(estimatedDuration / 60)}h${estimatedDuration % 60 > 0 ? ` ${estimatedDuration % 60}m` : ''}`
                                                            : `${estimatedDuration}m`
                                                        }</>
                                                    ) : 'Not estimated'}
                                                </div>
                                                {laborData && (
                                                    <span className="text-sm font-semibold text-gray-800">${laborData.total.toFixed(2)}</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Drive Time */}
                                {(job as any).costBreakdown?.driveTime?.enabled && (
                                    <div className="px-4 py-3 border-b border-gray-200">
                                        <div className="flex items-center justify-between">
                                            <p className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                                                <Truck className="w-3 h-3 text-green-500" /> Drive Time / Service Call
                                            </p>
                                            <span className="text-sm font-semibold text-gray-800">
                                                ${(job as any).costBreakdown.driveTime.amount.toFixed(2)}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* Grand Total */}
                                {(job as any).costBreakdown?.grandTotal != null && (
                                    <div className="px-4 py-3 bg-blue-50">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm font-bold text-blue-800">Estimated Total</p>
                                            <span className="text-lg font-bold text-blue-800">
                                                ${(job as any).costBreakdown.grandTotal.toFixed(2)}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* Tools Needed (from AI) */}
                                {(() => {
                                    const aiTools = (job as any).aiRecommendation?.toolsNeeded
                                        || (job as any).intakeReview?.overrides?.additionalTools
                                        || [];
                                    if (aiTools.length === 0 && !formData.toolsNeeded) return null;

                                    const allTools = aiTools.length > 0
                                        ? aiTools
                                        : formData.toolsNeeded.split(',').map((t: string) => t.trim()).filter(Boolean);

                                    if (allTools.length === 0) return null;

                                    return (
                                        <div className="px-4 py-3 border-t border-gray-200">
                                            <p className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
                                                <Wrench className="w-3 h-3 text-orange-500" /> Tools Needed
                                            </p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {allTools.map((tool: string, idx: number) => (
                                                    <span key={idx} className="inline-flex items-center gap-1 bg-orange-50 text-orange-700 border border-orange-200 text-xs px-2 py-1 rounded-full">
                                                        <Wrench className="w-2.5 h-2.5" /> {typeof tool === 'string' ? tool : (tool as any).name || tool}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Safety Warnings */}
                                {(job as any).aiRecommendation?.safetyWarnings?.length > 0 && (
                                    <div className="px-4 py-3 border-t border-gray-200 bg-red-50">
                                        <p className="text-xs font-semibold text-red-700 mb-1.5 flex items-center gap-1">
                                            <AlertTriangle className="w-3 h-3" /> Safety Warnings
                                        </p>
                                        <ul className="space-y-1">
                                            {(job as any).aiRecommendation.safetyWarnings.map((warning: string, idx: number) => (
                                                <li key={idx} className="text-xs text-red-600 flex items-start gap-1.5">
                                                    <span className="text-red-400 mt-0.5">•</span> {warning}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {/* Customer Notes */}
                                {job.request?.description && (
                                    <div className="px-4 py-3 border-t border-gray-200">
                                        <p className="text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1">
                                            <FileText className="w-3 h-3 text-indigo-500" /> Customer Notes
                                        </p>
                                        <p className="text-sm text-gray-700 bg-white rounded p-2 border border-gray-200 italic">
                                            "{job.request.description}"
                                        </p>
                                    </div>
                                )}
                            </div>
                        </section>
                    )}

                    {/* Scheduling & Parts */}
                    <section>
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Schedule & Parts</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 flex items-center"><Calendar className="w-4 h-4 mr-1" /> Scheduled Time</label>
                                <input type="datetime-local" name="scheduled_at" value={formData.scheduled_at} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2" />
                            </div>
                            <div className="flex items-end">
                                <div className="flex items-center">
                                    <input type="checkbox" id="parts_needed" name="parts_needed" checked={formData.parts_needed} onChange={(e) => setFormData(p => ({ ...p, parts_needed: e.target.checked }))} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
                                    <label htmlFor="parts_needed" className="ml-2 block text-sm text-gray-900 flex items-center"><Wrench className="w-4 h-4 mr-1" /> Parts Needed</label>
                                </div>
                            </div>
                            {formData.parts_needed && (
                                <div className="md:col-span-2">
                                    <textarea name="parts_description" placeholder="List parts needed..." rows={2} value={formData.parts_description} onChange={handleChange} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2 bg-yellow-50" />
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                <div className="flex justify-between items-center p-6 border-t bg-gray-50 sticky bottom-0">
                    <button onClick={handleDelete} className="text-red-600 hover:text-red-800 flex items-center px-4 py-2 rounded border border-transparent hover:bg-red-50">
                        <Trash2 className="w-4 h-4 mr-2" /> Delete Job
                    </button>
                    <div className="flex space-x-3">
                        <button onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                            Cancel
                        </button>
                        <button onClick={handleSave} className="flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700">
                            <Save className="w-4 h-4 mr-2" /> Save Changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
