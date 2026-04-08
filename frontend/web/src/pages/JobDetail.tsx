import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { doc, getDoc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';
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
import { AIMaterialAssessor } from '../components/materials/AIMaterialAssessor';
import { ArrowLeft, FileText, Image, DollarSign, CheckSquare, MapPin, Phone, Mail } from 'lucide-react';

export const JobDetail: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'details' | 'photos' | 'costs' | 'checklist'>('details');
  const [showCompletionWizard, setShowCompletionWizard] = useState(false);
  const [generatingInvoice, setGeneratingInvoice] = useState(false); // State

  const handleGenerateInvoice = async () => {
    if (!job || !job.org_id) return;
    if (!window.confirm('Generate a Draft Invoice from this Job\'s costs?')) return;

    setGeneratingInvoice(true);
    try {
      // Calculate Costs
      const costs = job.costs || { labor: { items: [], total: 0 }, parts: { items: [], total: 0 }, mileage: { total: 0 }, other: { items: [], total: 0 } } as any;

      const invoiceItems = [];

      // Labor
      // Check if labor is object or number. If object, look for items or calculate from hours
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

      // Parts
      if (costs.parts && typeof costs.parts === 'object' && costs.parts.items) {
        costs.parts.items.forEach((p: any) => {
          invoiceItems.push({
            description: `Part: ${p.name}`,
            quantity: p.quantity,
            unit_price: p.unitCost, // Using cost as price for now if price not available
            amount: p.total,
            total: p.total
          });
        });
      }

      // Mileage
      if (costs.mileage && typeof costs.mileage === 'object' && costs.mileage.total > 0) {
        invoiceItems.push({
          description: `Mileage: ${costs.mileage.miles} miles`,
          quantity: 1,
          unit_price: costs.mileage.total,
          amount: costs.mileage.total,
          total: costs.mileage.total
        });
      }

      // Other
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

      const total = invoiceItems.reduce((sum, item) => sum + item.total, 0);

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
        createdAt: new Date(), // serverTimestamp() defined in imports? No.
        payments_applied: 0,
        source_job_id: job.id
      };

      const docRef = await addDoc(collection(db, 'invoices'), invoiceData);

      await updateDoc(doc(db, 'jobs', job.id), {
        invoice_id: docRef.id
      });

      // We need to notify user
      // navigate(`/invoices/${docRef.id}`); // navigate available
      window.location.href = `/invoices/${docRef.id}`; // Force reload/nav

    } catch (err) {
      console.error(err);
      alert('Failed to generate invoice');
    } finally {
      setGeneratingInvoice(false);
    }
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

  const tabs = [
    { id: 'details', label: 'Details', icon: FileText },
    { id: 'photos', label: 'Photos', icon: Image },
    { id: 'costs', label: 'Costs', icon: DollarSign },
    { id: 'checklist', label: 'Checklist', icon: CheckSquare }
  ];

  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800',
    unscheduled: 'bg-gray-100 text-gray-800',
    scheduled: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-amber-100 text-amber-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800'
  };

  const priorityColors = {
    low: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    high: 'bg-orange-100 text-orange-800',
    critical: 'bg-red-100 text-red-800'
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6 mb-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold text-gray-900">{job.customer.name}</h1>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[job.status]}`}>
                  {job.status.replace('_', ' ').toUpperCase()}
                </span>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${priorityColors[job.priority]}`}>
                  {job.priority.toUpperCase()} PRIORITY
                </span>
              </div>

              <div className="flex items-center gap-4 text-sm text-gray-600">
                <div className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {job.customer.address}
                </div>
                {job.customer.phone && (
                  <div className="flex items-center gap-1">
                    <Phone className="w-4 h-4" />
                    {job.customer.phone}
                  </div>
                )}
                {job.customer.email && (
                  <div className="flex items-center gap-1">
                    <Mail className="w-4 h-4" />
                    {job.customer.email}
                  </div>
                )}
              </div>
            </div>

            {job.scheduled_at && (
              <div className="text-right">
                <p className="text-sm text-gray-500">Scheduled For</p>
                <p className="text-lg font-semibold text-gray-900">
                  {job.scheduled_at ? (job.scheduled_at?.toDate?.() || new Date(job.scheduled_at)).toLocaleDateString() : 'TBD'}
                </p>
                <p className="text-sm text-gray-600">
                  {job.scheduled_at ? (job.scheduled_at?.toDate?.() || new Date(job.scheduled_at)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </p>
              </div>
            )}

            {job.status !== 'completed' && job.status !== 'cancelled' && (
              <div className="ml-6">
                <button
                  onClick={() => setShowCompletionWizard(true)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 shadow-sm font-medium"
                >
                  <CheckSquare className="w-5 h-5" />
                  Complete Job
                </button>
                <button
                  onClick={handleGenerateInvoice}
                  disabled={generatingInvoice}
                  className="mt-2 px-4 py-2 bg-white text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 flex items-center gap-2 shadow-sm font-medium"
                >
                  {generatingInvoice ? <div className="w-4 h-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /> : <FileText className="w-4 h-4" />}
                  Generate Invoice
                </button>
                {/* Completion Wizard */}
                <JobCompletionWizard
                  job={job}
                  isOpen={showCompletionWizard}
                  onClose={() => setShowCompletionWizard(false)}
                  onComplete={() => {
                    getDoc(doc(db, 'jobs', job.id)).then(snap => {
                        if (snap.exists()) setJob({ id: snap.id, ...snap.data() } as Job);
                    });
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow mb-4">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6">
              {tabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${activeTab === tab.id
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

        {/* Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {activeTab === 'details' && (
              <div className="space-y-4">
                {/* Job Info Card */}
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

                  {job.parts_needed && (
                    <div className="mt-4 pt-4 border-t">
                      <h3 className="text-sm font-medium mb-2">Parts Needed</h3>
                      <p className="text-sm text-orange-600">{job.parts_description || 'Yes'}</p>
                    </div>
                  )}
                </div>

                {/* AI Material Assessor */}
                <AIMaterialAssessor jobId={job.id} onAddMaterialToJob={(method, name, qty, details) => {
                    alert(`In a full implementation, this would immediately add ${qty} ${name} to the job's required materials or quote list.`);
                }} />

                {/* Customer Notes */}
                <CustomerNotes customerId={job.id} />
              </div>
            )}

            {activeTab === 'photos' && (
              <JobPhotos jobId={job.id} allowUpload={job.status !== 'completed'} />
            )}

            {activeTab === 'costs' && (
              <JobCostTracker job={job} readOnly={job.status === 'completed'} />
            )}

            {activeTab === 'checklist' && (
              <JobChecklist jobId={job.id} />
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Quote Options */}
            <JobQuoteOptions 
              job={job} 
              onJobUpdated={() => {
                getDoc(doc(db, 'jobs', job.id)).then(snap => {
                  if (snap.exists()) setJob({ id: snap.id, ...snap.data() } as Job);
                });
              }}
            />

            {/* Communication */}
            <AppointmentReminders job={job} />

            {/* Signature (if completed or in progress) */}
            {(job.status === 'completed' || job.status === 'in_progress') && (
              <SignatureCapture
                jobId={job.id}
                existingSignature={job.signature ? {
                  id: '',
                  job_id: job.id,
                  org_id: job.org_id,
                  signatureDataUrl: job.signature.dataUrl,
                  signerName: job.signature.signerName,
                  signerRole: 'customer',
                  signedAt: job.signature.signedAt
                } : undefined}
                readOnly={!!job.signature}
              />
            )}

            {/* Tools Tracker */}
            <JobToolsTracker 
              jobId={job.id} 
              jobName={job.customer.name} 
              readOnly={job.status === 'completed' || job.status === 'cancelled'} 
            />

            {/* Mileage */}
            <MileageTracker jobId={job.id} compact />
          </div>
        </div>
      </div>
    </div>
  );
};
