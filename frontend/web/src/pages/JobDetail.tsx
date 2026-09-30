import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { doc, getDoc, updateDoc, addDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import toast from 'react-hot-toast';
import { Job } from '../types';
import {
  JobPhotos,
  JobCostTracker,
  JobChecklist,
  SignatureCapture,
  CustomerNotes,
  AppointmentReminders,
  MileageTracker,
  JobCompletionWizard,
  JobQuoteOptions,
  JobToolsTracker
} from '../components';
import { InlineAIQuotePanel } from '../components/InlineAIQuotePanel';
import { CustomerPhotoStrip } from '../components/CustomerPhotoStrip';
import { useAuth } from '../auth/AuthProvider';
import { canUserDelete, deleteJobWithAudit } from '../lib/deletionService';
import { DeleteReasonModal } from '../components/DeleteReasonModal';
import {
  ArrowLeft, FileText, Image, DollarSign, CheckSquare, MapPin, Phone,
  Mail, Trash2, Sparkles, Layout, Columns, Layers, Calendar, Clock,
  UserCheck, AlertTriangle, ExternalLink, ChevronDown, ChevronUp,
  Wrench, Car, Bell, ShieldCheck, CheckCircle2, MessageSquare, Briefcase,
  Truck, ShoppingCart, Package
} from 'lucide-react';

type JobDetailLayoutMode = 'command_hub' | 'split_workstation' | 'executive_streamline' | 'legacy';

export const JobDetail: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { user, organization } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);

  // Layout switcher state stored in localStorage for sandbox experimentation
  const [layoutMode, setLayoutMode] = useState<JobDetailLayoutMode>(() => {
    return (localStorage.getItem('dispatchbox_job_detail_layout') as JobDetailLayoutMode) || 'command_hub';
  });

  // Command Hub active tab
  const [hubTab, setHubTab] = useState<'overview' | 'quote' | 'dispatch' | 'operations' | 'photos'>('quote');

  // Legacy tab state
  const [legacyTab, setLegacyTab] = useState<'details' | 'photos' | 'costs' | 'checklist'>('details');

  // Executive Streamline operations tab
  const [execOpsTab, setExecOpsTab] = useState<'comms' | 'signature' | 'costs' | 'field'>('comms');

  // Collapsible cards state in Split Workstation
  const [toolsOpen, setToolsOpen] = useState(false);
  const [mileageOpen, setMileageOpen] = useState(false);

  const [showCompletionWizard, setShowCompletionWizard] = useState(false);
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [newScheduleDate, setNewScheduleDate] = useState('');
  const [newScheduleTime, setNewScheduleTime] = useState('09:00');
  const [isUpdatingSchedule, setIsUpdatingSchedule] = useState(false);

  const canDelete = canUserDelete(user, organization, 'job');

  const handleLayoutChange = (mode: JobDetailLayoutMode) => {
    setLayoutMode(mode);
    localStorage.setItem('dispatchbox_job_detail_layout', mode);
  };

  const handleConfirmDeleteJob = async (reasonCategory: string, reasonDetails: string) => {
    if (!job || !user || !jobId) return;
    await deleteJobWithAudit(jobId, job, user, reasonCategory, reasonDetails);
    setIsDeleteModalOpen(false);
    navigate('/jobs');
  };

  const handleGenerateInvoice = async () => {
    if (!job || !job.org_id) return;
    if (job.invoice_id) {
      navigate(`/invoices/${job.invoice_id}`);
      return;
    }
    if (!window.confirm('Generate a Draft Invoice from this Job and approved quote items?')) return;

    setGeneratingInvoice(true);
    try {
      const costs = job.costs || { labor: { items: [], total: 0 }, parts: { items: [], total: 0 }, mileage: { total: 0 }, other: { items: [], total: 0 } } as any;
      const invoiceItems: any[] = [];

      if (typeof costs.labor === 'object') {
        if (costs.labor.items) {
          costs.labor.items.forEach((l: any) => {
            invoiceItems.push({
              description: `Labor: ${l.description || 'Service'}`,
              quantity: l.hours || 1,
              unit_price: l.rate || costs.labor.hourlyRate || 0,
              amount: l.total,
              total: l.total
            });
          });
        } else if (costs.labor.actualMinutes) {
          invoiceItems.push({
            description: 'Labor',
            quantity: costs.labor.actualMinutes / 60,
            unit_price: costs.labor.hourlyRate,
            amount: costs.labor.total,
            total: costs.labor.total
          });
        }
      }

      if (costs.parts && typeof costs.parts === 'object' && costs.parts.items) {
        costs.parts.items.forEach((p: any) => {
          invoiceItems.push({
            description: `Part: ${p.name}`,
            quantity: p.quantity,
            unit_price: p.unitCost,
            amount: p.total,
            total: p.total
          });
        });
      }

      if (costs.mileage && typeof costs.mileage === 'object' && costs.mileage.total > 0) {
        invoiceItems.push({
          description: `Mileage: ${costs.mileage.miles} miles`,
          quantity: 1,
          unit_price: costs.mileage.total,
          amount: costs.mileage.total,
          total: costs.mileage.total
        });
      }

      if (costs.other && Array.isArray(costs.other)) {
        costs.other.forEach((o: any) => {
          invoiceItems.push({
            description: o.description,
            quantity: 1,
            unit_price: o.amount,
            amount: o.amount,
            total: o.amount
          });
        });
      }

      // Fallback 1: If logged field costs are empty, inherit line items from the active quote
      if (invoiceItems.length === 0 && job.active_quote_id) {
        try {
          const quoteSnap = await getDoc(doc(db, 'quotes', job.active_quote_id));
          if (quoteSnap.exists()) {
            const qData = quoteSnap.data();
            if (qData.lineItems && Array.isArray(qData.lineItems) && qData.lineItems.length > 0) {
              qData.lineItems.forEach((item: any) => {
                const itemTotal = Number(item.total) || (Number(item.quantity || 1) * Number(item.unitPrice || 0));
                invoiceItems.push({
                  description: item.description || 'Service Line Item',
                  quantity: Number(item.quantity) || 1,
                  unit_price: Number(item.unitPrice) || itemTotal,
                  amount: itemTotal,
                  total: itemTotal
                });
              });
            }
          }
        } catch (e) {
          console.warn('Failed to load quote items for invoice generation:', e);
        }
      }

      // Fallback 2: Check job line_items or parts array
      if (invoiceItems.length === 0 && (job as any).line_items && Array.isArray((job as any).line_items)) {
        (job as any).line_items.forEach((item: any) => {
          const itemTotal = Number(item.total) || (Number(item.quantity || 1) * Number(item.unit_price || item.unitPrice || 0));
          invoiceItems.push({
            description: item.description || item.name || 'Service',
            quantity: Number(item.quantity) || 1,
            unit_price: Number(item.unit_price || item.unitPrice || 0),
            amount: itemTotal,
            total: itemTotal
          });
        });
      }

      // Fallback 3: If still empty, use job scope / description and estimated amount
      if (invoiceItems.length === 0) {
        const fallbackAmt = Number((job as any).total_estimated_amount) || Number((job as any).total) || 0;
        invoiceItems.push({
          description: (job as any).title || (job as any).description || (job as any).request?.description || 'Field Service Rendered',
          quantity: 1,
          unit_price: fallbackAmt,
          amount: fallbackAmt,
          total: fallbackAmt
        });
      }

      const total = invoiceItems.reduce((sum, item) => sum + (Number(item.total) || 0), 0);

      const invoiceData = {
        org_id: job.org_id,
        customer_id: job.customer_id || '',
        customer: job.customer,
        items: invoiceItems,
        subtotal: total,
        tax_amount: 0,
        total: total,
        balance_due: total,
        status: 'draft',
        createdAt: new Date(),
        payments_applied: 0,
        source_job_id: job.id,
        source_quote_id: job.active_quote_id || null
      };

      const docRef = await addDoc(collection(db, 'invoices'), invoiceData);
      await updateDoc(doc(db, 'jobs', job.id), {
        invoice_id: docRef.id
      });

      navigate(`/invoices/${docRef.id}`);
    } catch (err) {
      console.error(err);
      alert('Failed to generate invoice');
    } finally {
      setGeneratingInvoice(false);
    }
  };

  const refreshJob = () => {
    if (!jobId) return;
    getDoc(doc(db, 'jobs', jobId)).then(snap => {
      if (snap.exists()) setJob({ id: snap.id, ...snap.data() } as Job);
    });
  };

  useEffect(() => {
    if (!jobId) return;

    const fetchJob = async () => {
      try {
        const jobDoc = await getDoc(doc(db, 'jobs', jobId));
        if (jobDoc.exists()) {
          setJob({ id: jobDoc.id, ...jobDoc.data() } as Job);
        } else {
          console.error('Job not found');
        }
      } catch (error) {
        console.error('Error fetching job:', error);
      }
      setLoading(false);
    };

    fetchJob();
  }, [jobId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading job details...</p>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Job Not Found</h2>
          <p className="text-gray-600 mb-4">The job you're looking for doesn't exist.</p>
          <Link to="/" className="text-blue-600 hover:text-blue-800">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    unscheduled: 'bg-gray-100 text-gray-800 border-gray-200',
    scheduled: 'bg-blue-100 text-blue-800 border-blue-200',
    in_progress: 'bg-amber-100 text-amber-800 border-amber-200',
    completed: 'bg-green-100 text-green-800 border-green-200',
    cancelled: 'bg-red-100 text-red-800 border-red-200'
  };

  const priorityColors: Record<string, string> = {
    low: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    medium: 'bg-blue-50 text-blue-700 border-blue-200',
    high: 'bg-orange-50 text-orange-700 border-orange-200',
    critical: 'bg-rose-100 text-rose-800 border-rose-300'
  };

  const scheduledDate = job.scheduled_at
    ? (job.scheduled_at?.toDate?.() || new Date(job.scheduled_at))
    : null;

  const expectedArrivalDate = job.expectedPartsArrivalDate
    ? (job.expectedPartsArrivalDate?.toDate?.() || new Date(job.expectedPartsArrivalDate))
    : null;

  // Schedule conflict detection: if job is scheduled before parts/equipment arrive
  const hasArrivalConflict = Boolean(
    scheduledDate &&
    expectedArrivalDate &&
    job.parts_procurement_status !== 'ready' &&
    !job.parts_ready &&
    scheduledDate.getTime() < expectedArrivalDate.getTime()
  );

  const handleAutoAlignSchedule = async () => {
    if (!expectedArrivalDate || !job) return;
    setIsUpdatingSchedule(true);
    try {
      const aligned = new Date(expectedArrivalDate);
      aligned.setDate(aligned.getDate() + 1);
      aligned.setHours(9, 0, 0, 0);

      await updateDoc(doc(db, 'jobs', job.id), {
        scheduled_at: Timestamp.fromDate(aligned),
        status: 'scheduled',
        updatedAt: Timestamp.now()
      });
      setJob(prev => prev ? { ...prev, scheduled_at: Timestamp.fromDate(aligned), status: 'scheduled' } : null);
      toast.success(`⚡ Job auto-aligned to ${aligned.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at 9:00 AM!`);
    } catch (err: any) {
      toast.error('Failed to reschedule: ' + err.message);
    } finally {
      setIsUpdatingSchedule(false);
    }
  };

  const handleSaveCustomSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScheduleDate || !job) return;
    setIsUpdatingSchedule(true);
    try {
      const [hours, minutes] = newScheduleTime.split(':').map(Number);
      const parsed = new Date(`${newScheduleDate}T00:00:00`);
      parsed.setHours(hours || 9, minutes || 0, 0, 0);

      await updateDoc(doc(db, 'jobs', job.id), {
        scheduled_at: Timestamp.fromDate(parsed),
        status: 'scheduled',
        updatedAt: Timestamp.now()
      });
      setJob(prev => prev ? { ...prev, scheduled_at: Timestamp.fromDate(parsed), status: 'scheduled' } : null);
      setShowScheduleModal(false);
      toast.success(`📅 Job scheduled for ${parsed.toLocaleDateString()} at ${newScheduleTime}!`);
    } catch (err: any) {
      toast.error('Failed to update schedule: ' + err.message);
    } finally {
      setIsUpdatingSchedule(false);
    }
  };

  /* ─────────────────────────────────────────────────────────────
     SANDBOX SWITCHER BANNER
  ───────────────────────────────────────────────────────────── */
  const renderSandboxBanner = () => (
    <div className="mb-5 p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white shadow-xl border border-indigo-700/50">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 bg-blue-500/25 border border-blue-400/40 text-blue-200 text-[10px] font-bold rounded-full uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-cyan-300" />
              Sandbox UI Comparison Studio
            </span>
            <span className="text-xs text-blue-200/80">Compare Job Detail Layouts</span>
          </div>
          <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
            {layoutMode === 'command_hub' && '🎯 Option 1: Command Hub (Full-Width Tabbed Operational Workspace)'}
            {layoutMode === 'split_workstation' && '⚖️ Option 2: Modern Split Workstation (Dual-Pane Pro Inspector)'}
            {layoutMode === 'executive_streamline' && '📄 Option 3: Executive Streamline (Single-Column Linear Flow)'}
            {layoutMode === 'legacy' && '⏪ Option 4: Legacy Layout (Original with Sidebar)'}
          </h2>
          <p className="text-xs text-indigo-200/80 mt-0.5 max-w-2xl">
            {layoutMode === 'command_hub' && 'Deduplicated header + full desktop width for quotes & financials. No crammed columns or empty right-hand space.'}
            {layoutMode === 'split_workstation' && 'Balanced 38/62 split: Left rail for customer context, communications & signatures; right rail for active scope & quote builder.'}
            {layoutMode === 'executive_streamline' && 'Clean, sequential document flow with progressive disclosure. Ideal for rapid reviewing without tab jumping.'}
            {layoutMode === 'legacy' && 'The original production layout with 2/3 left column and 1/3 right sidebar for direct comparison.'}
          </p>
        </div>

        {/* 4-Way Layout Buttons */}
        <div className="flex flex-wrap bg-white/10 p-1.5 rounded-xl backdrop-blur border border-white/15 self-start lg:self-auto gap-1">
          <button
            type="button"
            onClick={() => handleLayoutChange('command_hub')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              layoutMode === 'command_hub'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Layout size={13} />
            Command Hub
          </button>
          <button
            type="button"
            onClick={() => handleLayoutChange('split_workstation')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              layoutMode === 'split_workstation'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Columns size={13} />
            Split Workstation
          </button>
          <button
            type="button"
            onClick={() => handleLayoutChange('executive_streamline')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              layoutMode === 'executive_streamline'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Layers size={13} />
            Executive Streamline
          </button>
          <button
            type="button"
            onClick={() => handleLayoutChange('legacy')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              layoutMode === 'legacy'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-gray-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Clock size={13} />
            Legacy
          </button>
        </div>
      </div>
    </div>
  );

  /* ─────────────────────────────────────────────────────────────
     UNIFIED MODERN HERO HEADER
  ───────────────────────────────────────────────────────────── */
  const renderHeroHeader = () => (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200/90 p-5 mb-5">
      {/* Top utility row: Navigation + Delete */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 hover:text-gray-900 bg-gray-100 hover:bg-gray-200/80 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Jobs
        </button>

        <div className="flex items-center gap-2">
          {canDelete && (
            <button
              onClick={() => setIsDeleteModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors"
              title="Delete Job"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Job
            </button>
          )}
        </div>
      </div>

      {/* Main hero row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="space-y-2.5">
          {/* Customer Name & Status Badges */}
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
              {job.customer.name}
            </h1>
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${statusColors[job.status] || 'bg-gray-100 text-gray-800'}`}>
              {job.status.replace('_', ' ')}
            </span>
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${priorityColors[job.priority] || 'bg-gray-100 text-gray-800'}`}>
              {job.priority} Priority
            </span>
            {job.category && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 capitalize">
                {job.category}
              </span>
            )}
          </div>

          {/* Customer Quick Actions & Meta (No redundancy, interactive one-tap links) */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs sm:text-sm text-gray-600">
            {job.customer.address && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.customer.address)}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-gray-700 hover:text-blue-600 font-medium group transition-colors"
                title="Open in Google Maps"
              >
                <MapPin className="w-4 h-4 text-rose-500 group-hover:scale-110 transition-transform" />
                <span>{job.customer.address}</span>
                <ExternalLink className="w-3 h-3 opacity-40 group-hover:opacity-100" />
              </a>
            )}
            {job.customer.phone && (
              <a
                href={`tel:${job.customer.phone}`}
                className="flex items-center gap-1.5 text-gray-700 hover:text-blue-600 font-medium group transition-colors"
                title="Call Customer"
              >
                <Phone className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition-transform" />
                <span>{job.customer.phone}</span>
              </a>
            )}
            {job.customer.email && (
              <a
                href={`mailto:${job.customer.email}`}
                className="flex items-center gap-1.5 text-gray-700 hover:text-blue-600 font-medium group transition-colors"
                title="Email Customer"
              >
                <Mail className="w-4 h-4 text-blue-500 group-hover:scale-110 transition-transform" />
                <span>{job.customer.email}</span>
              </a>
            )}
          </div>
        </div>

        {/* Schedule & Operational Triggers */}
        <div className="flex flex-wrap items-center gap-4 lg:self-center border-t lg:border-t-0 pt-3 lg:pt-0 border-gray-100">
          {/* Schedule & Tech Pill */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-2.5 flex items-center gap-4 text-left">
            <div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-blue-600" />
                  Scheduled For
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (scheduledDate) {
                      setNewScheduleDate(scheduledDate.toISOString().slice(0, 10));
                      setNewScheduleTime(scheduledDate.toTimeString().slice(0, 5));
                    }
                    setShowScheduleModal(true);
                  }}
                  className="text-[10px] text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer"
                >
                  Edit
                </button>
              </div>
              <p className="text-sm font-bold text-gray-900 mt-0.5">
                {scheduledDate ? scheduledDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unscheduled'}
              </p>
              <p className="text-xs text-gray-500">
                {scheduledDate ? scheduledDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Time TBD'}
              </p>
            </div>

            <div className="h-8 w-px bg-gray-200" />

            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <UserCheck className="w-3 h-3 text-indigo-600" />
                Assigned Tech
              </p>
              <p className="text-sm font-bold text-gray-900 mt-0.5">
                {job.assigned_tech_name || 'Unassigned'}
              </p>
              <p className="text-xs text-gray-500">
                {job.estimated_duration ? `${job.estimated_duration} min est.` : 'Duration TBD'}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {job.status !== 'completed' && job.status !== 'cancelled' && (
              <button
                onClick={() => setShowCompletionWizard(true)}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl flex items-center gap-2 shadow-sm font-semibold text-xs transition-colors"
              >
                <CheckSquare className="w-4 h-4" />
                Complete Job
              </button>
            )}

            <button
              onClick={() => {
                const params = new URLSearchParams();
                params.set('openPO', 'true');
                params.set('prefill', 'true');
                params.set('jobId', job.id);
                params.set('jobTitle', job.customer?.name || job.title || '');
                navigate(`/purchase-orders?${params.toString()}`);
              }}
              className="px-3.5 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl flex items-center gap-1.5 font-semibold text-xs transition-colors shadow-xs"
              title="Open prefilled Purchase Order for this job"
            >
              <ShoppingCart className="w-3.5 h-3.5 text-amber-700" />
              Order Materials & Tools
            </button>

            <button
              onClick={handleGenerateInvoice}
              disabled={generatingInvoice}
              className="px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl flex items-center gap-2 font-semibold text-xs transition-colors shadow-xs"
            >
              {generatingInvoice ? (
                <div className="w-4 h-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              ) : (
                <FileText className="w-4 h-4 text-blue-600" />
              )}
              {job.invoice_id ? 'View Invoice' : 'Generate Invoice'}
            </button>
          </div>
        </div>

        {/* Schedule & Parts Arrival Conflict Warning Banner */}
        {hasArrivalConflict && (
          <div className="mt-4 p-4 bg-rose-50 border border-rose-300 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-rose-950">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-rose-600 text-white rounded-lg shrink-0 mt-0.5 sm:mt-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold flex items-center gap-1.5">
                  Schedule Conflict: Materials & Equipment Expected After Scheduled Time!
                </p>
                <p className="text-xs text-rose-800 mt-0.5">
                  Job is scheduled for <strong>{scheduledDate?.toLocaleDateString()} at {scheduledDate?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>, but materials & equipment are not expected to arrive until <strong>{expectedArrivalDate?.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</strong>.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto shrink-0">
              <button
                type="button"
                onClick={handleAutoAlignSchedule}
                disabled={isUpdatingSchedule}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                ⚡ Auto-Align to Arrival Date
              </button>
              <button
                type="button"
                onClick={() => {
                  if (scheduledDate) {
                    setNewScheduleDate(scheduledDate.toISOString().slice(0, 10));
                    setNewScheduleTime(scheduledDate.toTimeString().slice(0, 5));
                  }
                  setShowScheduleModal(true);
                }}
                className="px-3 py-1.5 bg-white border border-rose-300 hover:bg-rose-100 text-rose-900 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5" />
                Pick Date
              </button>
              <button
                type="button"
                onClick={() => navigate(`/purchase-orders?jobId=${job.id}`)}
                className="px-3 py-1.5 bg-white border border-rose-300 hover:bg-rose-100 text-rose-900 text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                View PO / Tracking
              </button>
            </div>
          </div>
        )}

        {/* Expected Arrival & Fulfillment Schedule Bar (When Ordered or Needed) */}
        {(expectedArrivalDate || job.parts_procurement_status || job.parts_needed) && (
          <div className="mt-4 p-4 bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-white border border-blue-200/80 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={`p-2.5 rounded-xl text-white shadow-xs ${
                job.parts_ready || job.parts_procurement_status === 'ready'
                  ? 'bg-emerald-600'
                  : expectedArrivalDate
                  ? 'bg-blue-600'
                  : 'bg-amber-600'
              }`}>
                {job.parts_ready || job.parts_procurement_status === 'ready' ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <Truck className="w-4 h-4" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                    Equipment & Materials Fulfillment:
                  </span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                    job.parts_ready || job.parts_procurement_status === 'ready'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : expectedArrivalDate
                      ? 'bg-blue-100 text-blue-800 border-blue-300'
                      : 'bg-amber-100 text-amber-800 border-amber-300'
                  }`}>
                    {job.parts_ready || job.parts_procurement_status === 'ready'
                      ? 'Ready on Site / Staged'
                      : expectedArrivalDate
                      ? 'In Transit / On Order'
                      : 'Requisition Pending Order'}
                  </span>
                  {job.partsCarrier && (
                    <span className="text-xs font-medium text-gray-600">
                      via {job.partsCarrier}
                    </span>
                  )}
                  {job.partsTrackingNumber && (
                    <span className="text-xs font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      Tracking: {job.partsTrackingNumber}
                    </span>
                  )}
                </div>

                <p className="text-xs text-gray-600 mt-1">
                  {expectedArrivalDate ? (
                    <>
                      Expected Arrival: <strong className="text-gray-900">{expectedArrivalDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</strong>
                      {scheduledDate && (
                        <span className={`ml-2 font-medium ${scheduledDate.getTime() >= expectedArrivalDate.getTime() ? 'text-emerald-700' : 'text-rose-700'}`}>
                          ({scheduledDate.getTime() >= expectedArrivalDate.getTime() ? '✓ Arrives before scheduled technician dispatch' : '⚠️ Arrives AFTER appointment time'})
                        </span>
                      )}
                    </>
                  ) : (
                    <span>No delivery date scheduled yet. Open Purchase Order to source required items.</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
              <button
                onClick={() => {
                  const params = new URLSearchParams();
                  params.set('openPO', 'true');
                  params.set('prefill', 'true');
                  params.set('jobId', job.id);
                  params.set('jobTitle', job.customer?.name || job.title || '');
                  navigate(`/purchase-orders?${params.toString()}`);
                }}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs transition-colors shadow-xs flex items-center gap-1.5"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                {expectedArrivalDate ? '+ Add Items / New PO' : 'Create PO for this Job'}
              </button>
              <button
                onClick={() => navigate(`/purchase-orders?jobId=${job.id}`)}
                className="px-3.5 py-1.5 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 font-semibold rounded-lg text-xs transition-colors"
              >
                View POs
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Completion Wizard Modal */}
      <JobCompletionWizard
        job={job}
        isOpen={showCompletionWizard}
        onClose={() => setShowCompletionWizard(false)}
        onComplete={refreshJob}
      />
    </div>
  );

  /* ─────────────────────────────────────────────────────────────
     OPTION 1: COMMAND HUB (Full-Width Tabbed Operational Workspace)
  ───────────────────────────────────────────────────────────── */
  const renderCommandHub = () => {
    const hubTabs = [
      { id: 'quote', label: 'Scope & Quote Studio', icon: DollarSign, badge: 'Full Width' },
      { id: 'overview', label: 'Job Overview & Brief', icon: FileText },
      { id: 'dispatch', label: 'Dispatch & Sign-off', icon: Bell },
      { id: 'operations', label: 'Field Operations & Costs', icon: Wrench },
      { id: 'photos', label: 'Photo Gallery', icon: Image, badge: job.request?.photos?.length ? `${job.request.photos.length}` : undefined }
    ];

    return (
      <div className="space-y-4">
        {/* Hub Tab Navigation */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/90 p-1.5 flex flex-wrap gap-1">
          {hubTabs.map(t => {
            const Icon = t.icon;
            const isActive = hubTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setHubTab(t.id as any)}
                className={`px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm flex items-center gap-2 transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/70'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                {t.label}
                {t.badge && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                    isActive ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab 1: Full-Width Scope & Quote Studio */}
        {hubTab === 'quote' && (
          <div className="space-y-4">
            {/* Context callout banner */}
            <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-blue-900">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs">
                  <DollarSign className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-bold text-sm text-blue-950">Active Scope & AI Quote Builder</p>
                  <p className="text-blue-700/90">
                    Full-width desktop canvas. Customer details and duplicate description cards are cleanly hidden.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setHubTab('overview')}
                className="px-3 py-1.5 bg-white border border-blue-300 rounded-lg text-blue-700 hover:bg-blue-100 font-semibold self-start sm:self-auto transition-colors"
              >
                View Customer Brief →
              </button>
            </div>

            <InlineAIQuotePanel
              job={job}
              hideCustomerDetails={true}
              hideCustomerPhotos={true}
              hideOriginalRequest={true}
              hideContactPreference={true}
              onNavigateToQuote={(jobId, quoteId) => navigate(`/quotes/new/${jobId}?quoteId=${quoteId}`)}
              onQuoteSent={refreshJob}
            />
          </div>
        )}

        {/* Tab 2: Clean Job Overview & Brief */}
        {hubTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 space-y-4">
              {/* Job Request Card */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200/90 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare className="w-4 h-4 text-blue-600" />
                  <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide">
                    Customer Problem Description
                  </h3>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-sm text-gray-800 leading-relaxed whitespace-pre-line">
                  {job.request?.description || 'No description provided.'}
                </div>

                {/* Customer photos inline */}
                {job.request?.photos && job.request.photos.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                      Customer Attached Photos ({job.request.photos.length})
                    </p>
                    <CustomerPhotoStrip photos={job.request.photos} label="Customer Photos" maxVisible={6} />
                  </div>
                )}
              </div>

              {/* Customer Notes */}
              <CustomerNotes customerId={job.customer_id || job.id} customerName={job.customer.name} />
            </div>

            {/* Right sidebar for Overview tab */}
            <div className="space-y-4">
              {/* Quick Status & Key Info Card */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200/90 p-5">
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3">
                  Job Classification
                </h3>
                <dl className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                    <dt className="text-gray-500">Category</dt>
                    <dd className="font-semibold text-gray-800 capitalize">{job.category || 'Not specified'}</dd>
                  </div>
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                    <dt className="text-gray-500">Complexity</dt>
                    <dd className="font-semibold text-gray-800 capitalize">{job.complexity || 'Standard'}</dd>
                  </div>
                  <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                    <dt className="text-gray-500">Est. Duration</dt>
                    <dd className="font-semibold text-gray-800">{job.estimated_duration || 60} minutes</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-gray-500">Invoice Status</dt>
                    <dd className="font-semibold text-gray-800">
                      {job.invoice_id ? (
                        <Link to={`/invoices/${job.invoice_id}`} className="text-blue-600 hover:underline">
                          View Invoice #{job.invoice_id.slice(0, 6)}
                        </Link>
                      ) : (
                        'Not Invoiced'
                      )}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Sign-off Preview */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200/90 p-5">
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3">
                  Customer Sign-off
                </h3>
                {job.signature ? (
                  <div className="space-y-2">
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-800 font-semibold">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      Signed by {job.signature.signerName} ({job.signature.signerRole})
                    </div>
                    {job.signature.dataUrl && (
                      <div className="p-2 border rounded-xl bg-white flex justify-center">
                        <img src={job.signature.dataUrl} alt="Signature" className="max-h-20" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    <p className="text-xs text-gray-500 mb-2">No signature captured yet.</p>
                    <button
                      onClick={() => setHubTab('dispatch')}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors"
                    >
                      Capture in Dispatch Tab →
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Dispatch & Sign-off */}
        {hubTab === 'dispatch' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-4">
              <AppointmentReminders job={job} />
            </div>
            <div className="space-y-4">
              <SignatureCapture
                jobId={job.id}
                existingSignature={job.signature ? {
                  id: '',
                  job_id: job.id,
                  org_id: job.org_id,
                  signatureDataUrl: job.signature.dataUrl,
                  signerName: job.signature.signerName,
                  signerRole: (job.signature.signerRole as any) || 'customer',
                  signedAt: job.signature.signedAt,
                  consentText: job.signature.consentText
                } : undefined}
                readOnly={!!job.signature}
                onSignatureComplete={refreshJob}
              />
            </div>
          </div>
        )}

        {/* Tab 4: Field Operations & Costs */}
        {hubTab === 'operations' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="space-y-4">
                <JobCostTracker job={job} readOnly={job.status === 'completed'} />
                <JobChecklist jobId={job.id} />
              </div>
              <div className="space-y-4">
                <MileageTracker jobId={job.id} showSummary={true} />
                <JobToolsTracker
                  jobId={job.id}
                  jobName={job.customer.name}
                  readOnly={job.status === 'completed' || job.status === 'cancelled'}
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Photos */}
        {hubTab === 'photos' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200/90 p-5">
            <JobPhotos jobId={job.id} allowUpload={job.status !== 'completed'} />
          </div>
        )}
      </div>
    );
  };

  /* ─────────────────────────────────────────────────────────────
     OPTION 2: MODERN SPLIT WORKSTATION (Dual-Pane Pro Inspector)
  ───────────────────────────────────────────────────────────── */
  const renderSplitWorkstation = () => (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Left Rail (38% on desktop) - Customer & Dispatch Context */}
      <div className="lg:col-span-5 space-y-4">
        {/* Customer & Request Brief */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/90 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wide">
                Job Request Brief
              </h3>
            </div>
            <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full capitalize">
              {job.category || 'General'}
            </span>
          </div>

          <div className="text-xs text-gray-700 bg-gray-50 border border-gray-100 rounded-xl p-3 leading-relaxed whitespace-pre-line">
            {job.request?.description || 'No description provided.'}
          </div>

          {job.request?.photos && job.request.photos.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-[11px] font-bold text-gray-600 mb-1.5 uppercase tracking-wider">
                Customer Photos ({job.request.photos.length})
              </p>
              <CustomerPhotoStrip photos={job.request.photos} label="Customer Photos" maxVisible={4} />
            </div>
          )}
        </div>

        {/* Appointment Reminders */}
        <AppointmentReminders job={job} compact />

        {/* Signature Capture */}
        <SignatureCapture
          jobId={job.id}
          existingSignature={job.signature ? {
            id: '',
            job_id: job.id,
            org_id: job.org_id,
            signatureDataUrl: job.signature.dataUrl,
            signerName: job.signature.signerName,
            signerRole: (job.signature.signerRole as any) || 'customer',
            signedAt: job.signature.signedAt,
            consentText: job.signature.consentText
          } : undefined}
          readOnly={!!job.signature}
          onSignatureComplete={refreshJob}
        />

        {/* Compact Collapsible: Tools Used */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/90 overflow-hidden">
          <button
            onClick={() => setToolsOpen(!toolsOpen)}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50/80 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-bold text-gray-800 uppercase tracking-wide">
                Tools & Equipment
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
                {toolsOpen ? 'Collapse' : 'Expand'}
              </span>
              {toolsOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </div>
          </button>
          {toolsOpen && (
            <div className="p-4 border-t border-gray-100 bg-gray-50/50">
              <JobToolsTracker
                jobId={job.id}
                jobName={job.customer.name}
                readOnly={job.status === 'completed' || job.status === 'cancelled'}
              />
            </div>
          )}
        </div>

        {/* Compact Collapsible: Mileage Tracker */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200/90 overflow-hidden">
          <button
            onClick={() => setMileageOpen(!mileageOpen)}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50/80 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <Car className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-bold text-gray-800 uppercase tracking-wide">
                Mileage Tracker
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
                {mileageOpen ? 'Collapse' : 'Expand'}
              </span>
              {mileageOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </div>
          </button>
          {mileageOpen && (
            <div className="p-4 border-t border-gray-100 bg-gray-50/50">
              <MileageTracker jobId={job.id} compact />
            </div>
          )}
        </div>

        {/* Customer Notes */}
        <CustomerNotes customerId={job.customer_id || job.id} customerName={job.customer.name} />
      </div>

      {/* Right Rail (62% on desktop) - Scope & Quote Builder */}
      <div className="lg:col-span-7 space-y-4">
        <InlineAIQuotePanel
          job={job}
          hideCustomerDetails={true}
          hideCustomerPhotos={true}
          hideOriginalRequest={true}
          hideContactPreference={true}
          onNavigateToQuote={(jobId, quoteId) => navigate(`/quotes/new/${jobId}?quoteId=${quoteId}`)}
          onQuoteSent={refreshJob}
        />
      </div>
    </div>
  );

  /* ─────────────────────────────────────────────────────────────
     OPTION 3: EXECUTIVE STREAMLINE (Single-Column Linear Flow)
  ───────────────────────────────────────────────────────────── */
  const renderExecutiveStreamline = () => (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* 1. Job Brief Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200/90 p-5">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-blue-600" />
            <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wide">
              Job Brief & Customer Request
            </h3>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>Duration: <strong className="text-gray-800">{job.estimated_duration || 60}m</strong></span>
            <span>Category: <strong className="text-gray-800 capitalize">{job.category || 'Repair'}</strong></span>
          </div>
        </div>

        <p className="text-sm text-gray-800 leading-relaxed bg-gray-50 border border-gray-100 rounded-xl p-4 whitespace-pre-line">
          {job.request?.description || 'No description provided.'}
        </p>

        {job.request?.photos && job.request.photos.length > 0 && (
          <div className="mt-4 pt-3 border-t border-gray-100">
            <CustomerPhotoStrip photos={job.request.photos} label="Customer Submitted Photos" maxVisible={6} />
          </div>
        )}
      </div>

      {/* 2. Scope & AI Quote Builder (Full Width, Deduplicated) */}
      <div className="space-y-4">
        <InlineAIQuotePanel
          job={job}
          hideCustomerDetails={true}
          hideCustomerPhotos={true}
          hideOriginalRequest={true}
          hideContactPreference={true}
          onNavigateToQuote={(jobId, quoteId) => navigate(`/quotes/new/${jobId}?quoteId=${quoteId}`)}
          onQuoteSent={refreshJob}
        />
      </div>

      {/* 3. Field Utilities & Sign-off Tray */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200/90 p-5">
        <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wide mb-3">
          Field Dispatch, Sign-off & Logs
        </h3>

        {/* Sub-tabs */}
        <div className="flex flex-wrap gap-2 mb-4 pb-3 border-b border-gray-100">
          <button
            onClick={() => setExecOpsTab('comms')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              execOpsTab === 'comms' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            Reminders
          </button>
          <button
            onClick={() => setExecOpsTab('signature')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              execOpsTab === 'signature' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Signature
          </button>
          <button
            onClick={() => setExecOpsTab('costs')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              execOpsTab === 'costs' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            Costs & Time
          </button>
          <button
            onClick={() => setExecOpsTab('field')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              execOpsTab === 'field' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            Mileage & Tools
          </button>
        </div>

        {execOpsTab === 'comms' && <AppointmentReminders job={job} />}
        {execOpsTab === 'signature' && (
          <SignatureCapture
            jobId={job.id}
            existingSignature={job.signature ? {
              id: '',
              job_id: job.id,
              org_id: job.org_id,
              signatureDataUrl: job.signature.dataUrl,
              signerName: job.signature.signerName,
              signerRole: (job.signature.signerRole as any) || 'customer',
              signedAt: job.signature.signedAt,
              consentText: job.signature.consentText
            } : undefined}
            readOnly={!!job.signature}
            onSignatureComplete={refreshJob}
          />
        )}
        {execOpsTab === 'costs' && <JobCostTracker job={job} readOnly={job.status === 'completed'} />}
        {execOpsTab === 'field' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MileageTracker jobId={job.id} compact />
            <JobToolsTracker
              jobId={job.id}
              jobName={job.customer.name}
              readOnly={job.status === 'completed' || job.status === 'cancelled'}
            />
          </div>
        )}
      </div>

      {/* Customer Notes */}
      <CustomerNotes customerId={job.customer_id || job.id} customerName={job.customer.name} />
    </div>
  );

  /* ─────────────────────────────────────────────────────────────
     OPTION 4: LEGACY LAYOUT (Original)
  ───────────────────────────────────────────────────────────── */
  const renderLegacyLayout = () => {
    const legacyTabs = [
      { id: 'details', label: 'Details', icon: FileText },
      { id: 'photos', label: 'Photos', icon: Image },
      { id: 'costs', label: 'Costs', icon: DollarSign },
      { id: 'checklist', label: 'Checklist', icon: CheckSquare }
    ];

    return (
      <div>
        {/* Legacy Tabs */}
        <div className="bg-white rounded-lg shadow mb-4">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6">
              {legacyTabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setLegacyTab(tab.id as any)}
                    className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                      legacyTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Legacy Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main Column */}
          <div className="lg:col-span-2">
            {legacyTab === 'details' && (
              <div className="space-y-4">
                {/* Legacy Job Info Card */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-lg font-semibold mb-4">Job Information</h2>
                  <dl className="grid grid-cols-2 gap-4">
                    <div>
                      <dt className="text-sm text-gray-500">Status</dt>
                      <dd className="text-sm font-medium capitalize">{job.status.replace('_', ' ')}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-500">Priority</dt>
                      <dd className="text-sm font-medium capitalize">{job.priority}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-500">Estimated Duration</dt>
                      <dd className="text-sm font-medium">{job.estimated_duration} minutes</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-500">Category</dt>
                      <dd className="text-sm font-medium capitalize">{job.category || 'Not specified'}</dd>
                    </div>
                    {job.assigned_tech_name && (
                      <div>
                        <dt className="text-sm text-gray-500">Assigned To</dt>
                        <dd className="text-sm font-medium">{job.assigned_tech_name}</dd>
                      </div>
                    )}
                    {job.complexity && (
                      <div>
                        <dt className="text-sm text-gray-500">Complexity</dt>
                        <dd className="text-sm font-medium capitalize">{job.complexity}</dd>
                      </div>
                    )}
                  </dl>

                  <div className="mt-6 pt-4 border-t">
                    <h3 className="text-sm font-medium mb-2">Description</h3>
                    <p className="text-sm text-gray-700">{job.request?.description || 'No description provided'}</p>
                  </div>

                  {job.request?.photos && job.request.photos.length > 0 && (
                    <div className="mt-4">
                      <CustomerPhotoStrip photos={job.request.photos} label="Customer Photos" maxVisible={5} />
                    </div>
                  )}
                </div>

                {/* Legacy InlineAIQuotePanel (shows everything) */}
                <InlineAIQuotePanel
                  job={job}
                  onNavigateToQuote={(jobId, quoteId) => navigate(`/quotes/new/${jobId}?quoteId=${quoteId}`)}
                  onQuoteSent={refreshJob}
                />

                <CustomerNotes customerId={job.customer_id || job.id} customerName={job.customer.name} />
              </div>
            )}

            {legacyTab === 'photos' && (
              <JobPhotos jobId={job.id} allowUpload={job.status !== 'completed'} />
            )}

            {legacyTab === 'costs' && (
              <JobCostTracker job={job} readOnly={job.status === 'completed'} />
            )}

            {legacyTab === 'checklist' && (
              <JobChecklist jobId={job.id} />
            )}
          </div>

          {/* Legacy Sidebar */}
          <div className="space-y-4">
            <JobQuoteOptions job={job} onJobUpdated={refreshJob} />
            <AppointmentReminders job={job} />

            {(job.status === 'completed' || job.status === 'in_progress') && (
              <SignatureCapture
                jobId={job.id}
                existingSignature={job.signature ? {
                  id: '',
                  job_id: job.id,
                  org_id: job.org_id,
                  signatureDataUrl: job.signature.dataUrl,
                  signerName: job.signature.signerName,
                  signerRole: (job.signature.signerRole as any) || 'customer',
                  signedAt: job.signature.signedAt,
                  consentText: job.signature.consentText
                } : undefined}
                readOnly={!!job.signature}
                onSignatureComplete={refreshJob}
              />
            )}

            <JobToolsTracker
              jobId={job.id}
              jobName={job.customer.name}
              readOnly={job.status === 'completed' || job.status === 'cancelled'}
            />

            <MileageTracker jobId={job.id} compact />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50/80 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Sandbox UI Comparison Studio Switcher */}
        {renderSandboxBanner()}

        {/* Hero Header */}
        {renderHeroHeader()}

        {/* Selected Layout Mode */}
        {layoutMode === 'command_hub' && renderCommandHub()}
        {layoutMode === 'split_workstation' && renderSplitWorkstation()}
        {layoutMode === 'executive_streamline' && renderExecutiveStreamline()}
        {layoutMode === 'legacy' && renderLegacyLayout()}
      </div>

      {/* Delete Reason Modal */}
      <DeleteReasonModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleConfirmDeleteJob}
        itemType="job"
        itemIdentifier={`Job #${(job as any).job_number || job.id} (${job.customer?.name || 'Customer'})`}
      />

      {/* Inline Reschedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-gray-100">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                  <Calendar className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-gray-900 text-base">Schedule Appointment</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="text-gray-400 hover:text-gray-600 rounded-lg p-1 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveCustomSchedule} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Scheduled Date
                </label>
                <input
                  type="date"
                  required
                  value={newScheduleDate}
                  onChange={e => setNewScheduleDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Appointment Time
                </label>
                <input
                  type="time"
                  required
                  value={newScheduleTime}
                  onChange={e => setNewScheduleTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              {expectedArrivalDate && (
                <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center justify-between">
                  <span>Parts ETA: {expectedArrivalDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const nextDay = new Date(expectedArrivalDate);
                      nextDay.setDate(nextDay.getDate() + 1);
                      setNewScheduleDate(nextDay.toISOString().slice(0, 10));
                      setNewScheduleTime('09:00');
                    }}
                    className="text-blue-700 font-bold underline hover:text-blue-900 cursor-pointer"
                  >
                    Match ETA (+1 day)
                  </button>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="px-4 py-2 border border-gray-200 text-gray-700 font-semibold rounded-xl text-xs hover:bg-gray-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingSchedule}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-sm transition disabled:opacity-50 cursor-pointer"
                >
                  {isUpdatingSchedule ? 'Saving...' : 'Confirm Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
