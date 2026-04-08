import React, { useState, useEffect } from 'react';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { Job, AIJobRecommendation } from '../types';
import { useAuth } from '../auth/AuthProvider';
import { generateJobRecommendation, techHasRequiredSkills } from '../lib/jobIntakeAI';
import {
    X, AlertTriangle, Clock, Wrench, Package, CheckCircle, XCircle,
    MessageSquare, Send, ExternalLink, Video, FileText, AlertCircle, Calendar,
    Phone, Mail, MessageCircle, User, MapPin, Image, PlayCircle, Edit3, DollarSign
} from 'lucide-react';

interface JobReviewModalProps {
    job: Job;
    onClose: () => void;
    onApprove?: (job: Job) => void;
    onQuoteRequested?: (job: Job) => void;
}

export const JobReviewModal: React.FC<JobReviewModalProps> = ({ job, onClose, onApprove, onQuoteRequested }) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [techNotes, setTechNotes] = useState(job.intakeReview?.techNotes || '');
    const [newQuestion, setNewQuestion] = useState('');
    const [recommendation, setRecommendation] = useState<AIJobRecommendation | null>(
        job.intakeReview?.aiRecommendation || null
    );
    const [approvalNotes, setApprovalNotes] = useState('');

    // Track which field is currently being edited (click-to-edit)
    const [editingField, setEditingField] = useState<string | null>(null);

    // Editable job variables for approval
    const [editedPriority, setEditedPriority] = useState<'low' | 'medium' | 'high' | 'critical'>(
        recommendation?.priority || job.priority || 'medium'
    );
    const [editedDuration, setEditedDuration] = useState(
        recommendation?.estimatedDuration || job.estimated_duration || 60
    );
    const [editedComplexity, setEditedComplexity] = useState<'simple' | 'medium' | 'complex'>(
        recommendation?.complexity || job.complexity || 'medium'
    );
    const [editedTools, setEditedTools] = useState<string>(
        recommendation?.requiredTools?.map(t => t.name).join(', ') || ''
    );
    const [editedMaterials, setEditedMaterials] = useState<string>(
        recommendation?.recommendedMaterials?.map(m => m.name).join(', ') || ''
    );
    const [editedCommunicationPref, setEditedCommunicationPref] = useState<'phone' | 'text' | 'email'>(
        job.request.communicationPreference || 'email'
    );
    const [editedPartsNeeded, setEditedPartsNeeded] = useState(job.parts_needed || false);
    const [editedPartsDescription, setEditedPartsDescription] = useState(job.parts_description || '');

    // Editable customer and job fields (inline editing)
    const [editedCustomerName, setEditedCustomerName] = useState(job.customer.name || '');
    const [editedPhone, setEditedPhone] = useState(job.customer.phone || '');
    const [editedEmail, setEditedEmail] = useState(job.customer.email || '');
    const [editedAddress, setEditedAddress] = useState(job.customer.address || '');
    const [editedDescription, setEditedDescription] = useState(job.request?.description || '');
    const [editedJobType, setEditedJobType] = useState((job.request?.type || 'General') || 'General');

    useEffect(() => {
        // Generate AI recommendation if not already present
        if (!recommendation && user) {
            generateJobRecommendation(job, user).then(setRecommendation);
        }
    }, [job, user, recommendation]);

    const handleSaveNotes = async () => {
        if (!user) return;

        setLoading(true);
        try {
            await updateDoc(doc(db, 'jobs', job.id), {
                'intakeReview.techNotes': techNotes,
                'intakeReview.status': 'in_review',
                'intakeReview.reviewedBy': user.uid,
                'intakeReview.reviewedAt': Timestamp.now()
            });
            alert('Notes saved successfully');
        } catch (error) {
            console.error('Error saving notes:', error);
            alert('Failed to save notes');
        }
        setLoading(false);
    };

    const handleAskQuestion = async () => {
        if (!user || !newQuestion.trim()) return;

        setLoading(true);
        try {
            const questions = job.intakeReview?.questionsForCustomer || [];
            questions.push({
                question: newQuestion.trim(),
                askedAt: Timestamp.now(),
                askedBy: user.uid
            });

            await updateDoc(doc(db, 'jobs', job.id), {
                'intakeReview.questionsForCustomer': questions,
                'intakeReview.status': 'needs_info'
            });

            // Send question to customer via their preferred method
            const communicationMethod = job.request.communicationPreference || 'email';
            if (communicationMethod !== 'phone') {
                try {
                    const sendCustomerQuestion = httpsCallable(functions, 'sendCustomerQuestion');
                    await sendCustomerQuestion({
                        jobId: job.id,
                        customerEmail: job.customer.email,
                        customerPhone: job.customer.phone,
                        customerName: job.customer.name,
                        question: newQuestion.trim(),
                        communicationMethod
                    });
                    console.log(`Question sent via ${communicationMethod}`);
                } catch (commError) {
                    console.error('Error sending automated communication:', commError);
                    // Don't fail the whole operation if communication fails
                }
            }

            setNewQuestion('');
            alert(communicationMethod === 'phone'
                ? 'Question logged - please call customer directly'
                : `Question sent to customer via ${communicationMethod}`);
        } catch (error) {
            console.error('Error asking question:', error);
            alert('Failed to send question');
        }
        setLoading(false);
    };

    const handleApprove = async () => {
        if (!user) return;

        setLoading(true);
        try {
            // Parse tools and materials from comma-separated strings
            const toolsList = editedTools.split(',').map(t => t.trim()).filter(t => t.length > 0);
            const materialsList = editedMaterials.split(',').map(m => m.trim()).filter(m => m.length > 0);

            // Update job with approval and all edited values
            await updateDoc(doc(db, 'jobs', job.id), {
                'status': 'unscheduled', // New status: approved but not yet scheduled
                'intakeReview.status': 'approved',
                'intakeReview.approvalNotes': approvalNotes,
                'intakeReview.reviewedBy': user.uid,
                'intakeReview.reviewedAt': Timestamp.now(),
                'intakeReview.overrides': {
                    priority: editedPriority,
                    estimatedDuration: editedDuration,
                    additionalTools: toolsList,
                    additionalMaterials: materialsList
                },
                // Job fields
                'priority': editedPriority,
                'estimated_duration': editedDuration,
                'complexity': editedComplexity,
                'parts_needed': editedPartsNeeded,
                'parts_description': editedPartsDescription,
                // Customer fields
                'customer.name': editedCustomerName,
                'customer.phone': editedPhone,
                'customer.email': editedEmail,
                'customer.address': editedAddress,
                // Request fields
                'request.description': editedDescription,
                'request.type': editedJobType,
                'request.communicationPreference': editedCommunicationPref
            });

            // Send approval notification to customer via their preferred method
            const communicationMethod = editedCommunicationPref;
            if (communicationMethod !== 'phone') {
                try {
                    const sendJobApprovalNotification = httpsCallable(functions, 'sendJobApprovalNotification');
                    await sendJobApprovalNotification({
                        jobId: job.id,
                        customerEmail: editedEmail,
                        customerPhone: editedPhone,
                        customerName: editedCustomerName,
                        communicationMethod,
                        approvalNotes
                    });
                    console.log(`Approval notification sent via ${communicationMethod}`);
                } catch (commError) {
                    console.error('Error sending approval notification:', commError);
                    // Don't fail the whole operation if communication fails
                }
            }

            if (onApprove) {
                const approvedJob: Job = {
                    ...job,
                    id: job.id,
                    status: 'unscheduled',
                    intakeReview: {
                        ...(job.intakeReview || {}),
                        status: 'approved'
                    }
                };
                onApprove(approvedJob);
            }
            onClose();
        } catch (error) {
            console.error('Error approving job:', error);
            alert('Failed to approve job');
        }
        setLoading(false);
    };

    const handleApproveAndQuote = async () => {
        if (!user) return;

        setLoading(true);
        try {
            // Parse tools and materials from comma-separated strings
            const toolsList = editedTools.split(',').map(t => t.trim()).filter(t => t.length > 0);
            const materialsList = editedMaterials.split(',').map(m => m.trim()).filter(m => m.length > 0);

            // Update job with approval and all edited values
            await updateDoc(doc(db, 'jobs', job.id), {
                'status': 'quote_pending', // Special status: approved and awaiting quote
                'intakeReview.status': 'approved',
                'intakeReview.approvalNotes': approvalNotes,
                'intakeReview.reviewedBy': user.uid,
                'intakeReview.reviewedAt': Timestamp.now(),
                'intakeReview.overrides': {
                    priority: editedPriority,
                    estimatedDuration: editedDuration,
                    additionalTools: toolsList,
                    additionalMaterials: materialsList
                },
                // Job fields
                'priority': editedPriority,
                'estimated_duration': editedDuration,
                'complexity': editedComplexity,
                'parts_needed': editedPartsNeeded,
                'parts_description': editedPartsDescription,
                // Customer fields
                'customer.name': editedCustomerName,
                'customer.phone': editedPhone,
                'customer.email': editedEmail,
                'customer.address': editedAddress,
                // Request fields
                'request.description': editedDescription,
                'request.type': editedJobType,
                'request.communicationPreference': editedCommunicationPref
            });

            if (onQuoteRequested) {
                const approvedJob: Job = {
                    ...job,
                    id: job.id,
                    status: 'quote_pending',
                    intakeReview: {
                        ...(job.intakeReview || {}),
                        status: 'approved'
                    }
                };
                onQuoteRequested(approvedJob);
            }
            onClose();
        } catch (error) {
            console.error('Error approving job for quote:', error);
            alert('Failed to approve job for quote');
        }
        setLoading(false);
    };

    const handleReject = async () => {
        if (!user) return;
        const reason = prompt('Why are you rejecting this job?');
        if (!reason) return;

        setLoading(true);
        try {
            await updateDoc(doc(db, 'jobs', job.id), {
                'intakeReview.status': 'rejected',
                'intakeReview.approvalNotes': reason,
                'intakeReview.reviewedBy': user.uid,
                'intakeReview.reviewedAt': Timestamp.now(),
                'status': 'cancelled'
            });
            onClose();
        } catch (error) {
            console.error('Error rejecting job:', error);
            alert('Failed to reject job');
        }
        setLoading(false);
    };

    const getCommunicationIcon = (pref?: string) => {
        switch (pref) {
            case 'phone': return <Phone className="w-4 h-4" />;
            case 'text': return <MessageCircle className="w-4 h-4" />;
            case 'email': return <Mail className="w-4 h-4" />;
            default: return <Phone className="w-4 h-4" />;
        }
    };

    const getCommunicationLabel = (pref?: string) => {
        switch (pref) {
            case 'phone': return 'Phone Call';
            case 'text': return 'Text Message';
            case 'email': return 'Email';
            default: return 'Phone Call (Default)';
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-900/75 flex items-center justify-center z-50 p-4 overflow-y-auto backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full my-8 flex flex-col font-sans border border-gray-200 text-gray-800">
                {/* Header */}
                <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center bg-gray-50/80 rounded-t-xl">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Review Job Request</h2>
                        <p className="text-sm text-gray-500 mt-1">Update details, review AI recommendations, and schedule the job.</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body - Standard Form Layout */}
                <div className="p-6 overflow-y-auto max-h-[70vh] bg-white">
                    <div className="flex flex-col gap-8">
                        
                        {/* Section 1: Job Details */}
                        <section>
                            <h3 className="text-md font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
                                <FileText className="w-4 h-4 text-blue-500" />
                                Job Details & Scope
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Issue Description</label>
                                    <textarea
                                        value={editedDescription}
                                        onChange={(e) => setEditedDescription(e.target.value)}
                                        className="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                        rows={3}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Job Type</label>
                                    <select
                                        value={editedJobType}
                                        onChange={(e) => setEditedJobType(e.target.value)}
                                        className="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                                    >
                                        <option value="General">General</option>
                                        <option value="Plumbing">Plumbing</option>
                                        <option value="Electrical">Electrical</option>
                                        <option value="HVAC">HVAC</option>
                                        <option value="Appliance">Appliance</option>
                                        <option value="Structural">Structural</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                                    <select
                                        value={editedPriority}
                                        onChange={(e) => setEditedPriority(e.target.value as any)}
                                        className="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                                    >
                                        <option value="low">Low</option>
                                        <option value="medium">Medium</option>
                                        <option value="high">High</option>
                                        <option value="critical">Critical</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Duration (min)</label>
                                    <input
                                        type="number"
                                        value={editedDuration}
                                        onChange={(e) => setEditedDuration(parseInt(e.target.value) || 60)}
                                        step="15"
                                        min="15"
                                        className="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Complexity</label>
                                    <select
                                        value={editedComplexity}
                                        onChange={(e) => setEditedComplexity(e.target.value as any)}
                                        className="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                                    >
                                        <option value="simple">Simple</option>
                                        <option value="medium">Medium</option>
                                        <option value="complex">Complex</option>
                                    </select>
                                </div>
                            </div>
                        </section>

                        {/* Section 2: Customer Information */}
                        <section>
                            <h3 className="text-md font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
                                <User className="w-4 h-4 text-green-500" />
                                Customer Details
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                                    <input
                                        type="text"
                                        value={editedCustomerName}
                                        onChange={(e) => setEditedCustomerName(e.target.value)}
                                        className="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Communication Preference</label>
                                    <select
                                        value={editedCommunicationPref}
                                        onChange={(e) => setEditedCommunicationPref(e.target.value as any)}
                                        className="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                                    >
                                        <option value="phone">Phone Call</option>
                                        <option value="text">Text Message</option>
                                        <option value="email">Email</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                                    <input
                                        type="tel"
                                        value={editedPhone}
                                        onChange={(e) => setEditedPhone(e.target.value)}
                                        className="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                    <input
                                        type="email"
                                        value={editedEmail}
                                        onChange={(e) => setEditedEmail(e.target.value)}
                                        className="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Service Address</label>
                                    <input
                                        type="text"
                                        value={editedAddress}
                                        onChange={(e) => setEditedAddress(e.target.value)}
                                        className="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                                    />
                                </div>
                            </div>
                        </section>

                        {/* Customer Availability Read-Only summary */}
                        {job.request.availabilityWindows && job.request.availabilityWindows.length > 0 && (
                            <section>
                                <h3 className="text-md font-semibold text-gray-900 mb-2 pb-2 border-b border-gray-100 flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-purple-500" />
                                    Customer Availability
                                </h3>
                                <div className="flex flex-wrap gap-2 text-sm">
                                    {job.request.availabilityWindows.map((window, idx) => (
                                        <span key={idx} className="bg-purple-50 text-purple-700 px-3 py-1.5 rounded-md border border-purple-100">
                                            {window.day} ({window.startTime} - {window.endTime})
                                        </span>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Section 3: Preparation & AI Insights */}
                        {recommendation || loading ? (
                            <section>
                                <h3 className="text-md font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
                                    <Wrench className="w-4 h-4 text-amber-500" />
                                    Preparation & AI Insights
                                </h3>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Required Tools</label>
                                        <input
                                            type="text"
                                            value={editedTools}
                                            onChange={(e) => setEditedTools(e.target.value)}
                                            placeholder="Comma-separated list..."
                                            className="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-amber-500 text-sm mb-1"
                                        />
                                        {recommendation?.requiredTools && recommendation.requiredTools.length > 0 && (
                                            <p className="text-xs text-gray-500">
                                                Missing from inventory: {recommendation.requiredTools.filter(t => !t.owned).map(t => t.name).join(', ') || 'None'}
                                            </p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Recommended Materials</label>
                                        <input
                                            type="text"
                                            value={editedMaterials}
                                            onChange={(e) => setEditedMaterials(e.target.value)}
                                            placeholder="Comma-separated list..."
                                            className="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-amber-500 text-sm"
                                        />
                                    </div>
                                </div>

                                {recommendation && (
                                    <div className="bg-blue-50/50 p-4 border border-blue-100 rounded-md mb-4 text-sm text-gray-700">
                                        <p className="font-medium text-blue-900 mb-1">AI Reasoning:</p>
                                        <p className="leading-relaxed">{recommendation.priorityReason}</p>
                                    </div>
                                )}

                                {/* Parts Required Toggle */}
                                <div className="flex items-start gap-4 p-4 border border-gray-200 rounded-md bg-gray-50">
                                    <div className="flex items-center h-5 mt-1">
                                        <input
                                            type="checkbox"
                                            checked={editedPartsNeeded}
                                            onChange={(e) => setEditedPartsNeeded(e.target.checked)}
                                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-sm font-medium text-gray-900 block mb-1">Parts Purchase Required</label>
                                        {editedPartsNeeded && (
                                            <input
                                                type="text"
                                                value={editedPartsDescription}
                                                onChange={(e) => setEditedPartsDescription(e.target.value)}
                                                placeholder="Describe parts needed to be ordered..."
                                                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                                            />
                                        )}
                                    </div>
                                </div>
                            </section>
                        ) : (
                            <div className="text-center py-4 text-sm text-gray-500 flex justify-center items-center gap-2">
                                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                Loading AI insights...
                            </div>
                        )}

                        {/* Notes Section */}
                        <section>
                            <h3 className="text-md font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100 flex items-center gap-2">
                                <Edit3 className="w-4 h-4 text-gray-500" />
                                Internal Notes & Approval
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Internal Tech Notes</label>
                                    <textarea
                                        value={techNotes}
                                        onChange={(e) => setTechNotes(e.target.value)}
                                        placeholder="Add notes for the assigned tech..."
                                        className="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                                        rows={3}
                                    />
                                    <button
                                        onClick={handleSaveNotes}
                                        disabled={loading}
                                        className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                                    >
                                        Save internal notes only
                                    </button>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Approval Comments</label>
                                    <textarea
                                        value={approvalNotes}
                                        onChange={(e) => setApprovalNotes(e.target.value)}
                                        placeholder="Add any specific conditions of approval..."
                                        className="w-full p-2.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 text-sm"
                                        rows={3}
                                    />
                                </div>
                            </div>
                        </section>

                    </div>
                </div>

                {/* Footer / Actions */}
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl flex flex-wrap items-center gap-3 justify-end sm:justify-between">
                    <button
                        onClick={handleReject}
                        disabled={loading}
                        className="px-4 py-2 border border-red-300 text-red-700 hover:bg-red-50 font-medium rounded-lg text-sm transition-colors disabled:opacity-50 flex items-center gap-2 bg-white"
                    >
                        <XCircle className="w-4 h-4" />
                        Reject Request
                    </button>
                    
                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-gray-700 hover:bg-gray-200 font-medium rounded-lg text-sm transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleApproveAndQuote}
                            disabled={loading}
                            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-sm shadow-sm transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                            <DollarSign className="w-4 h-4" />
                            {loading ? 'Processing...' : 'Create Quote'}
                        </button>
                        <button
                            onClick={handleApprove}
                            disabled={loading}
                            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm shadow-sm transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                            <CheckCircle className="w-4 h-4" />
                            {loading ? 'Approving...' : 'Approve & Schedule'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
