import React, { useState } from 'react';
import { Job } from '../types';
import { db } from '../firebase';
import { doc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { X, Save, Trash2, Calendar, Clock, Wrench, Phone, Mail, MessageCircle, Gauge, Settings2 } from 'lucide-react';
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
        description: job.request.description,
        priority: job.priority,
        status: job.status,
        estimated_duration: job.estimated_duration || 60,
        parts_needed: job.parts_needed || false,
        parts_description: job.parts_description || '',
        scheduled_at: job.scheduled_at?.toDate ? format(job.scheduled_at.toDate(), "yyyy-MM-dd'T'HH:mm") : '',
        // New fields for solo tech editing
        communicationPreference: job.request?.communicationPreference || 'email',
        complexity: job.complexity || 'medium',
        toolsNeeded: job.intakeReview?.overrides?.additionalTools?.join(', ') || ''
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
                                <input type="text" name="customerName" value={formData.customerName} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Phone</label>
                                <input type="tel" name="customerPhone" value={formData.customerPhone} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2" />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700">Address</label>
                                <input type="text" name="customerAddress" value={formData.customerAddress} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2" />
                            </div>
                        </div>
                    </section>

                    {/* Job Details */}
                    <section>
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Job Details</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Description</label>
                                <textarea name="description" rows={3} value={formData.description} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Priority</label>
                                    <select name="priority" value={formData.priority} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2">
                                        <option value="low">Low</option>
                                        <option value="medium">Medium</option>
                                        <option value="high">High</option>
                                        <option value="critical">Critical</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Status</label>
                                    <select name="status" value={formData.status} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2">
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
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 bg-white"
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
                                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 bg-white"
                                    >
                                        <option value="simple">🟢 Simple</option>
                                        <option value="medium">🟡 Medium</option>
                                        <option value="complex">🔴 Complex</option>
                                    </select>
                                </div>

                                {/* Estimated Duration (moved here for better grouping) */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 flex items-center mb-1">
                                        <Clock className="w-4 h-4 mr-1 text-purple-600" />
                                        Time to Resolve
                                    </label>
                                    <select name="estimated_duration" value={formData.estimated_duration} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 bg-white">
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
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 bg-white"
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

                    {/* Scheduling & Parts */}
                    <section>
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Schedule & Parts</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 flex items-center"><Calendar className="w-4 h-4 mr-1" /> Scheduled Time</label>
                                <input type="datetime-local" name="scheduled_at" value={formData.scheduled_at} onChange={handleChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2" />
                            </div>
                            <div className="flex items-end">
                                <div className="flex items-center">
                                    <input type="checkbox" id="parts_needed" name="parts_needed" checked={formData.parts_needed} onChange={(e) => setFormData(p => ({ ...p, parts_needed: e.target.checked }))} className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded" />
                                    <label htmlFor="parts_needed" className="ml-2 block text-sm text-gray-900 flex items-center"><Wrench className="w-4 h-4 mr-1" /> Parts Needed</label>
                                </div>
                            </div>
                            {formData.parts_needed && (
                                <div className="md:col-span-2">
                                    <textarea name="parts_description" placeholder="List parts needed..." rows={2} value={formData.parts_description} onChange={handleChange} className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2 bg-yellow-50" />
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
                        <button onClick={handleSave} className="flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700">
                            <Save className="w-4 h-4 mr-2" /> Save Changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
