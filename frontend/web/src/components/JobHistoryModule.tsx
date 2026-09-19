import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import {
    Clock, Wrench, FileText, MessageSquare, Mail, CheckCircle2,
    DollarSign, User, MapPin, Phone, Shield, ArrowRight,
    ExternalLink, ChevronDown, ChevronUp, RefreshCw, X, Send,
    Calendar, Check, AlertCircle, CreditCard
} from 'lucide-react';
import { CustomerHistoryTimeline } from './CustomerHistoryTimeline';
import { useNavigate } from 'react-router-dom';

interface JobHistoryModuleProps {
    jobId: string;
    initialJob?: any;
    isModal?: boolean;
    onClose?: () => void;
}

export const JobHistoryModule: React.FC<JobHistoryModuleProps> = ({
    jobId,
    initialJob,
    isModal = false,
    onClose
}) => {
    const navigate = useNavigate();
    const [job, setJob] = useState<any>(initialJob || null);
    const [loadingJob, setLoadingJob] = useState(!initialJob);

    useEffect(() => {
        if (!initialJob && jobId) {
            setLoadingJob(true);
            getDoc(doc(db, 'jobs', jobId))
                .then(docSnap => {
                    if (docSnap.exists()) {
                        setJob({ id: docSnap.id, ...docSnap.data() });
                    }
                })
                .catch(err => console.error('[JobHistoryModule] Failed to load job:', err))
                .finally(() => setLoadingJob(false));
        }
    }, [jobId, initialJob]);

    const customer = job?.customer || {};
    const customerPhone = customer.phone || job?.requestorPhone;
    const customerEmail = customer.email;
    const customerName = customer.name || 'Customer';
    const customerId = job?.customer_id || job?.customerId;

    const content = (
        <div className="space-y-5">
            {/* Job Summary Banner */}
            {job && (
                <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-5 shadow-sm space-y-3">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                                    Job History & Audit Trail
                                </span>
                                <span className="text-xs font-mono text-indigo-300">
                                    #{job.jobNumber || job.id.substring(0, 8)}
                                </span>
                            </div>
                            <h3 className="text-base font-bold text-white">
                                {job.title || job.description || 'Service Job'}
                            </h3>
                        </div>

                        <span className={`px-3 py-1 text-xs uppercase font-bold rounded-full border ${
                            job.status === 'completed'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                : job.status === 'scheduled'
                                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                                : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        }`}>
                            {job.status || 'Active'}
                        </span>
                    </div>

                    {/* Customer & Tech Quick Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-white/10 text-xs">
                        <div className="flex items-center gap-2 text-gray-300">
                            <User className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                            <span className="truncate">{customerName}</span>
                        </div>

                        {customerPhone && (
                            <div className="flex items-center gap-2 text-gray-300">
                                <Phone className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                                <span className="font-mono truncate">{customerPhone}</span>
                            </div>
                        )}

                        <div className="flex items-center gap-2 text-gray-300">
                            <Wrench className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                            <span className="truncate">Tech: {job.assignedTechName || 'Unassigned'}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Chronological Event History Stream */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                    <div>
                        <h4 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                            <Clock className="w-4 h-4 text-indigo-600" />
                            <span>Complete Job Lifecycle Timeline</span>
                        </h4>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Chronological log of all customer texts, emails, estimates, approvals, and status transitions for this job.
                        </p>
                    </div>
                </div>

                <CustomerHistoryTimeline
                    jobId={jobId}
                    customerId={customerId}
                    customerName={customerName}
                    customerPhone={customerPhone}
                    customerEmail={customerEmail}
                    orgId={job?.org_id || 'demo-org'}
                    showFilters={true}
                />
            </div>
        </div>
    );

    if (isModal) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
                <div 
                    className="bg-slate-50 rounded-2xl shadow-2xl border border-gray-200 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="p-4 bg-white border-b border-gray-200 flex items-center justify-between flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <Clock className="w-5 h-5 text-indigo-600" />
                            <h3 className="font-bold text-base text-gray-900">Job History & Audit Log</h3>
                        </div>
                        {onClose && (
                            <button
                                onClick={onClose}
                                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-6">
                        {content}
                    </div>
                </div>
            </div>
        );
    }

    return content;
};
