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
    const [editedDescription, setEditedDescription] = useState(job.request.description || '');
    const [editedJobType, setEditedJobType] = useState(job.request.type || 'General');

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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full my-8">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 rounded-t-lg flex justify-between items-start" data-version="2.1">
                    <div className="flex-1">
                        <h2 className="text-2xl font-bold mb-2">Job Request Review (v2)</h2>
                        <div className="flex items-center gap-4 text-blue-100">
                            <span className="flex items-center gap-1">
                                <User className="w-4 h-4" />
                                {job.customer.name}
                            </span>
                            <span className="flex items-center gap-1">
                                <MapPin className="w-4 h-4" />
                                {job.customer.address.split(',').slice(0, 2).join(',')}
                            </span>
                        </div>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="text-white hover:text-gray-200 transition-colors"
                >
                    <X className="w-6 h-6" />
                </button>
            </div>

            <div className="p-6 max-h-[calc(100vh-200px)] overflow-y-auto">
                {/* CUSTOMER REQUEST SECTION */}
                <div className="space-y-6 mb-8">
                    {/* Issue Description */}
                    <div className="bg-white border-2 border-blue-200 rounded-lg p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-blue-600" />
                            Issue Description
                        </h3>
                        <textarea
                            value={editedDescription}
                            onChange={(e) => setEditedDescription(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-700 leading-relaxed"
                            rows={4}
                            placeholder="Describe the issue..."
                        />
                        <div className="mt-4 flex items-center gap-4 text-sm">
                            <div className="flex items-center gap-2">
                                <label className="text-gray-600">Type:</label>
                                <select
                                    value={editedJobType}
                                    onChange={(e) => setEditedJobType(e.target.value)}
                                    className="px-3 py-1 bg-white border border-gray-300 rounded-full focus:ring-2 focus:ring-blue-500"
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
                            <span className="px-3 py-1 bg-gray-100 rounded-full text-gray-600">
                                Source: {job.request.source || 'Unknown'}
                            </span>
                        </div>
                    </div>

                    {/* Customer Photos and Videos */}
                    {((job.request.photos && job.request.photos.length > 0) || (job.request.videos && job.request.videos.length > 0)) && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <Image className="w-5 h-5 text-blue-600" />
                                Customer Media
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {job.request.photos?.map((photo, idx) => (
                                    <div key={idx} className="relative group cursor-pointer">
                                        <img
                                            src={photo}
                                            alt={`Photo ${idx + 1}`}
                                            className="w-full h-32 object-cover rounded-lg border-2 border-gray-300 hover:border-blue-500 transition-colors"
                                        />
                                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all rounded-lg flex items-center justify-center">
                                            <ExternalLink className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                    </div>
                                ))}
                                {job.request.videos?.map((video, idx) => (
                                    <div key={idx} className="relative group cursor-pointer">
                                        <div className="w-full h-32 bg-gray-800 rounded-lg border-2 border-gray-300 hover:border-blue-500 transition-colors flex items-center justify-center">
                                            <PlayCircle className="w-12 h-12 text-white" />
                                        </div>
                                        <span className="absolute bottom-2 left-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded">
                                            Video {idx + 1}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Customer Contact & Communication Preference - CLICK TO EDIT */}
                    <div className="bg-gradient-to-br from-green-50 to-blue-50 border-2 border-green-300 rounded-lg p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <MessageCircle className="w-5 h-5 text-green-600" />
                            Customer Contact Information
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Left Column - Contact Details */}
                            <div className="space-y-3">
                                {/* Phone - Click to Edit */}
                                <div
                                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/50 cursor-pointer transition-all"
                                    onClick={() => setEditingField(editingField === 'phone' ? null : 'phone')}
                                >
                                    <Phone className="w-5 h-5 text-gray-600" />
                                    <div className="flex-1">
                                        <p className="text-xs text-gray-500">Phone</p>
                                        {editingField === 'phone' ? (
                                            <input
                                                autoFocus
                                                type="tel"
                                                value={editedPhone}
                                                onChange={(e) => setEditedPhone(e.target.value)}
                                                onBlur={() => setEditingField(null)}
                                                onKeyDown={(e) => e.key === 'Enter' && setEditingField(null)}
                                                onClick={(e) => e.stopPropagation()}
                                                className="w-full px-2 py-1 border border-green-400 rounded focus:ring-2 focus:ring-green-500 font-semibold"
                                            />
                                        ) : (
                                            <p className="font-semibold text-gray-900 flex items-center gap-2">
                                                {editedPhone} <Edit3 className="w-3 h-3 text-gray-400" />
                                            </p>
                                        )}
                                    </div>
                                </div>
                                {/* Email - Click to Edit */}
                                <div
                                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/50 cursor-pointer transition-all"
                                    onClick={() => setEditingField(editingField === 'email' ? null : 'email')}
                                >
                                    <Mail className="w-5 h-5 text-gray-600" />
                                    <div className="flex-1">
                                        <p className="text-xs text-gray-500">Email</p>
                                        {editingField === 'email' ? (
                                            <input
                                                autoFocus
                                                type="email"
                                                value={editedEmail}
                                                onChange={(e) => setEditedEmail(e.target.value)}
                                                onBlur={() => setEditingField(null)}
                                                onKeyDown={(e) => e.key === 'Enter' && setEditingField(null)}
                                                onClick={(e) => e.stopPropagation()}
                                                className="w-full px-2 py-1 border border-green-400 rounded focus:ring-2 focus:ring-green-500 font-semibold"
                                            />
                                        ) : (
                                            <p className="font-semibold text-gray-900 flex items-center gap-2">
                                                {editedEmail} <Edit3 className="w-3 h-3 text-gray-400" />
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                            {/* Right Column - Communication Preference - Click to Edit */}
                            <div
                                className="bg-white border-2 border-green-400 rounded-lg p-4 cursor-pointer hover:shadow-md transition-all"
                                onClick={() => setEditingField(editingField === 'contactMethod' ? null : 'contactMethod')}
                            >
                                <p className="text-xs text-gray-500 mb-2 flex items-center gap-2">
                                    Preferred Contact Method <Edit3 className="w-3 h-3 text-gray-400" />
                                </p>
                                {editingField === 'contactMethod' ? (
                                    <select
                                        autoFocus
                                        value={editedCommunicationPref}
                                        onChange={(e) => {
                                            setEditedCommunicationPref(e.target.value as 'phone' | 'text' | 'email');
                                            setEditingField(null);
                                        }}
                                        onBlur={() => setEditingField(null)}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 text-green-700 font-semibold"
                                    >
                                        <option value="phone">📞 Phone Call</option>
                                        <option value="text">💬 Text Message</option>
                                        <option value="email">📧 Email</option>
                                    </select>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <div className="p-2 bg-green-100 rounded-full">
                                            {editedCommunicationPref === 'phone' ? <Phone className="w-5 h-5 text-green-600" /> :
                                                editedCommunicationPref === 'text' ? <MessageSquare className="w-5 h-5 text-green-600" /> :
                                                    <Mail className="w-5 h-5 text-green-600" />}
                                        </div>
                                        <div>
                                            <p className="font-bold text-green-700">
                                                {editedCommunicationPref === 'phone' ? '📞 Phone Call' :
                                                    editedCommunicationPref === 'text' ? '💬 Text Message' : '📧 Email'}
                                            </p>
                                            <p className="text-xs text-gray-600">Click to change</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Requested Schedule */}
                    {job.request.availabilityWindows && job.request.availabilityWindows.length > 0 && (
                        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-6">
                            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <Calendar className="w-5 h-5 text-yellow-600" />
                                Customer Availability
                            </h3>
                            <div className="space-y-3">
                                {job.request.availabilityWindows.map((window, idx) => (
                                    <div key={idx} className="bg-white rounded-lg p-4 border border-yellow-200">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="font-semibold text-gray-900 capitalize">
                                                    {window.day}
                                                </p>
                                                <p className="text-sm text-gray-600">
                                                    {window.startTime} - {window.endTime}
                                                    {window.preferredTime && (
                                                        <span className="ml-2 text-yellow-700">
                                                            (Prefers {window.preferredTime})
                                                        </span>
                                                    )}
                                                </p>
                                            </div>
                                            <CheckCircle className="w-5 h-5 text-green-600" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                    }
                </div>

                {/* DIVIDER */}
                <div className="border-t-4 border-blue-300 my-8"></div>

                {/* AI RECOMMENDATIONS SECTION */}
                <div className="space-y-6">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <span className="px-3 py-1 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-full text-sm">
                            AI
                        </span>
                        Intelligent Analysis & Recommendations
                    </h2>

                    {
                        recommendation ? (
                            <div className="space-y-4">
                                {/* Priority & Duration - CLICK TO EDIT */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Priority - Click to Edit */}
                                    <div
                                        className={`p-4 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md ${editedPriority === 'critical' ? 'bg-red-50 border-red-400' :
                                            editedPriority === 'high' ? 'bg-orange-50 border-orange-400' :
                                                editedPriority === 'medium' ? 'bg-yellow-50 border-yellow-400' :
                                                    'bg-gray-50 border-gray-300'
                                            }`}
                                        onClick={() => setEditingField(editingField === 'priority' ? null : 'priority')}
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <AlertTriangle className="w-5 h-5" />
                                            <h4 className="font-semibold">Priority</h4>
                                            <Edit3 className="w-3 h-3 text-gray-400 ml-auto" />
                                        </div>
                                        {editingField === 'priority' ? (
                                            <select
                                                autoFocus
                                                value={editedPriority}
                                                onChange={(e) => {
                                                    setEditedPriority(e.target.value as 'low' | 'medium' | 'high' | 'critical');
                                                    setEditingField(null);
                                                }}
                                                onBlur={() => setEditingField(null)}
                                                onClick={(e) => e.stopPropagation()}
                                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-bold uppercase"
                                            >
                                                <option value="low">🟢 LOW</option>
                                                <option value="medium">🟡 MEDIUM</option>
                                                <option value="high">🟠 HIGH</option>
                                                <option value="critical">🔴 CRITICAL</option>
                                            </select>
                                        ) : (
                                            <p className="text-2xl font-bold uppercase">
                                                {editedPriority === 'critical' ? '🔴' : editedPriority === 'high' ? '🟠' : editedPriority === 'medium' ? '🟡' : '🟢'} {editedPriority}
                                            </p>
                                        )}
                                        <p className="text-sm text-gray-600 mt-2 italic">AI: "{recommendation.priorityReason}"</p>
                                    </div>

                                    {/* Duration - Click to Edit */}
                                    <div
                                        className="p-4 bg-blue-50 border-2 border-blue-400 rounded-lg cursor-pointer transition-all hover:shadow-md"
                                        onClick={() => setEditingField(editingField === 'duration' ? null : 'duration')}
                                    >
                                        <div className="flex items-center gap-2 mb-2">
                                            <Clock className="w-5 h-5 text-blue-600" />
                                            <h4 className="font-semibold">Duration</h4>
                                            <Edit3 className="w-3 h-3 text-gray-400 ml-auto" />
                                        </div>
                                        {editingField === 'duration' ? (
                                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    autoFocus
                                                    type="number"
                                                    value={editedDuration}
                                                    onChange={(e) => setEditedDuration(parseInt(e.target.value) || 60)}
                                                    onBlur={() => setEditingField(null)}
                                                    onKeyDown={(e) => e.key === 'Enter' && setEditingField(null)}
                                                    min="15"
                                                    step="15"
                                                    className="w-24 px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-bold text-xl"
                                                />
                                                <span className="font-bold text-xl">min</span>
                                            </div>
                                        ) : (
                                            <p className="text-2xl font-bold">{editedDuration} min</p>
                                        )}
                                        {/* Complexity - Click to Edit */}
                                        <div
                                            className="mt-2"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingField(editingField === 'complexity' ? null : 'complexity');
                                            }}
                                        >
                                            <span className="text-sm text-gray-600">Complexity: </span>
                                            {editingField === 'complexity' ? (
                                                <select
                                                    autoFocus
                                                    value={editedComplexity}
                                                    onChange={(e) => {
                                                        setEditedComplexity(e.target.value as 'simple' | 'medium' | 'complex');
                                                        setEditingField(null);
                                                    }}
                                                    onBlur={() => setEditingField(null)}
                                                    className="ml-2 px-2 py-1 bg-white border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-sm"
                                                >
                                                    <option value="simple">Simple</option>
                                                    <option value="medium">Medium</option>
                                                    <option value="complex">Complex</option>
                                                </select>
                                            ) : (
                                                <span className="font-semibold text-blue-700 hover:underline cursor-pointer">
                                                    {editedComplexity} ✏️
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="p-4 bg-purple-50 border-2 border-purple-400 rounded-lg">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Wrench className="w-5 h-5 text-purple-600" />
                                            <h4 className="font-semibold">Skills Required</h4>
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                            {recommendation.skillsRequired.map((skill, idx) => (
                                                <span key={idx} className="px-2 py-1 bg-purple-200 text-purple-800 rounded text-xs font-medium">
                                                    {skill}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Tools Required */}
                                <div className="bg-gray-50 border border-gray-300 rounded-lg p-4">
                                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                                        <Wrench className="w-5 h-5 text-gray-600" />
                                        Required Tools
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {recommendation.requiredTools.map((tool, idx) => (
                                            <div key={idx} className={`flex items-center justify-between p-2 rounded ${tool.owned ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
                                                }`}>
                                                <span className="flex items-center gap-2">
                                                    {tool.owned ? (
                                                        <CheckCircle className="w-4 h-4" />
                                                    ) : (
                                                        <AlertCircle className="w-4 h-4" />
                                                    )}
                                                    {tool.name}
                                                </span>
                                                {tool.essential && !tool.owned && (
                                                    <span className="text-xs font-bold px-2 py-1 bg-red-500 text-white rounded">
                                                        ESSENTIAL
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Materials */}
                                {recommendation.recommendedMaterials.length > 0 && (
                                    <div className="bg-blue-50 border border-blue-300 rounded-lg p-4">
                                        <h4 className="font-semibold mb-3 flex items-center gap-2">
                                            <Package className="w-5 h-5 text-blue-600" />
                                            Recommended Materials
                                        </h4>
                                        <div className="space-y-2">
                                            {recommendation.recommendedMaterials.map((material, idx) => (
                                                <div key={idx} className="flex items-center justify-between bg-white p-2 rounded">
                                                    <div>
                                                        <span className="font-medium">{material.name}</span>
                                                        {material.quantity && (
                                                            <span className="text-gray-600 ml-2">({material.quantity})</span>
                                                        )}
                                                    </div>
                                                    {material.estimatedCost && (
                                                        <span className="text-green-700 font-semibold">
                                                            ${material.estimatedCost}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Fix Instructions */}
                                {recommendation.fixInstructions && (
                                    <div className="bg-indigo-50 border border-indigo-300 rounded-lg p-4">
                                        <h4 className="font-semibold mb-3 flex items-center gap-2">
                                            <Video className="w-5 h-5 text-indigo-600" />
                                            Repair Resources
                                        </h4>
                                        <p className="text-gray-700 mb-3">{recommendation.fixInstructions.summary}</p>
                                        <div className="flex flex-wrap gap-3">
                                            {recommendation.fixInstructions.videoUrl && (
                                                <a
                                                    href={recommendation.fixInstructions.videoUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                                                >
                                                    <Video className="w-4 h-4" />
                                                    YouTube Videos
                                                    <ExternalLink className="w-4 h-4" />
                                                </a>
                                            )}
                                            {recommendation.fixInstructions.stepByStepUrl && (
                                                <a
                                                    href={recommendation.fixInstructions.stepByStepUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                                                >
                                                    <FileText className="w-4 h-4" />
                                                    Step-by-Step Guide
                                                    <ExternalLink className="w-4 h-4" />
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Safety Considerations */}
                                {recommendation.safetyConsiderations && recommendation.safetyConsiderations.length > 0 && (
                                    <div className="bg-red-50 border-2 border-red-400 rounded-lg p-4">
                                        <h4 className="font-semibold mb-3 flex items-center gap-2 text-red-800">
                                            <AlertTriangle className="w-5 h-5" />
                                            Safety Considerations
                                        </h4>
                                        <ul className="space-y-2">
                                            {recommendation.safetyConsiderations.map((safety, idx) => (
                                                <li key={idx} className="flex items-start gap-2 text-red-800">
                                                    <AlertCircle className="w-4 h-4 mt-1 flex-shrink-0" />
                                                    <span>{safety}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-center py-8">
                                <div className="inline-block w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                <p className="mt-4 text-gray-600">Generating AI recommendations...</p>
                            </div>
                        )
                    }
                </div >

                {/* DIVIDER */}
                < div className="border-t-4 border-blue-300 my-8" ></div >

                {/* Tech Notes */}
                < div className="bg-gray-50 border border-gray-300 rounded-lg p-4" >
                    <h4 className="font-semibold mb-3">Internal Tech Notes</h4>
                    <textarea
                        value={techNotes}
                        onChange={(e) => setTechNotes(e.target.value)}
                        placeholder="Add any internal notes about this job..."
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        rows={3}
                    />
                    <button
                        onClick={handleSaveNotes}
                        disabled={loading}
                        className="mt-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg disabled:opacity-50"
                    >
                        Save Notes
                    </button>
                </div >

                {/* Q&A Section */}
                < div className="bg-blue-50 border border-blue-300 rounded-lg p-4" >
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-blue-600" />
                        Questions for Customer
                    </h4>

                    {/* Existing Questions */}
                    {
                        job.intakeReview?.questionsForCustomer && job.intakeReview.questionsForCustomer.length > 0 && (
                            <div className="space-y-2 mb-4">
                                {job.intakeReview.questionsForCustomer.map((q, idx) => (
                                    <div key={idx} className="bg-white p-3 rounded border border-blue-200">
                                        <p className="font-medium text-gray-900">Q: {q.question}</p>
                                        {(q as any).answer ? (
                                            <p className="text-green-700 mt-1">A: {(q as any).answer}</p>
                                        ) : (
                                            <p className="text-gray-500 text-sm mt-1 italic">Awaiting customer response...</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )
                    }

                    {/* New Question */}
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newQuestion}
                            onChange={(e) => setNewQuestion(e.target.value)}
                            placeholder="Type your question..."
                            className="flex-1 p-3 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            onKeyPress={(e) => e.key === 'Enter' && handleAskQuestion()}
                        />
                        <button
                            onClick={handleAskQuestion}
                            disabled={loading || !newQuestion.trim()}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
                        >
                            <Send className="w-4 h-4" />
                            Ask
                        </button>
                    </div>
                </div >
            </div >

            {/* Footer Actions - Simplified since all fields are editable inline */}
            < div className="bg-gray-100 px-6 py-4 rounded-b-lg border-t space-y-4" >
                {/* Parts Needed Row */}
                < div className="flex items-center gap-6" >
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={editedPartsNeeded}
                            onChange={(e) => setEditedPartsNeeded(e.target.checked)}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-gray-700">Parts Purchase Required</span>
                    </label>
                    {
                        editedPartsNeeded && (
                            <input
                                type="text"
                                value={editedPartsDescription}
                                onChange={(e) => setEditedPartsDescription(e.target.value)}
                                placeholder="Describe parts needed..."
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                            />
                        )
                    }
                </div >

                {/* Approval Notes Row */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Approval Notes (optional)</label>
                    <textarea
                        value={approvalNotes}
                        onChange={(e) => setApprovalNotes(e.target.value)}
                        placeholder="Add any notes about this approval..."
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                    <button
                        onClick={handleReject}
                        disabled={loading}
                        className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
                    >
                        <XCircle className="w-5 h-5" />
                        Reject
                    </button>
                    <div className="flex gap-3">
                        <button
                            onClick={handleApproveAndQuote}
                            disabled={loading}
                            className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
                        >
                            <DollarSign className="w-5 h-5" />
                            {loading ? 'Processing...' : 'Create Quote'}
                        </button>
                        <button
                            onClick={handleApprove}
                            disabled={loading}
                            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
                        >
                            <CheckCircle className="w-5 h-5" />
                            {loading ? 'Approving...' : 'Approve & Schedule'}
                        </button>
                    </div>
                </div>
            </div>
        </div>

    );
};
