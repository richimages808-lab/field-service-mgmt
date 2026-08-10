import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, FileEdit, ClipboardCheck, FastForward, Loader2 } from 'lucide-react';
import { Job, Quote } from '../../types';
import { useAuth } from '../../auth/AuthProvider';
import { generateAIDefaultQuote, sanitizeForFirestore } from '../../lib/aiQuoteGenerator';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import toast from 'react-hot-toast';

interface JobQuoteOptionsProps {
  job: Job;
  onJobUpdated: () => void;
}

export const JobQuoteOptions: React.FC<JobQuoteOptionsProps> = ({ job, onJobUpdated }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  // Determine if we should show these options
  // Show if job is pending, unscheduled (and no quote), or quote_pending (but no quote selected yet)
  const isPending = job.status === 'pending' || job.status === 'quote_pending' || (job.status === 'unscheduled' && !job.active_quote_id);

  if (!isPending) return null;

  const handleGenerateAIQuote = async () => {
    if (!user) {
      toast.error('You must be logged in');
      return;
    }

    // Use org_id from user object, fall back to job's org_id
    const orgId = (user as any).org_id || job.org_id;
    if (!orgId) {
      toast.error('Organization not found — please reload the page');
      return;
    }

    setLoadingAction('ai_quote');
    try {
      // 1. Fetch technician's rate card config (may not exist for dispatchers)
      let rateCard = null;
      let defaultRateTierId = '';

      try {
        const techDoc = await getDoc(doc(db, 'technicians', user.uid));
        if (techDoc.exists()) {
          rateCard = techDoc.data().rateCard || null;
        }
      } catch (e) {
        console.warn('No technician profile found, using defaults');
      }

      // If no technician rate card, try to load org-level rate card
      if (!rateCard) {
        try {
          const orgDoc = await getDoc(doc(db, 'organizations', orgId));
          if (orgDoc.exists()) {
            rateCard = orgDoc.data().rateCard || null;
          }
        } catch (e) {
          console.warn('Could not fetch org rate card, using defaults');
        }
      }

      // If customer has a specific rate tier
      if (job.customer_id) {
        try {
          const custDoc = await getDoc(doc(db, 'customers', job.customer_id));
          if (custDoc.exists() && custDoc.data().defaultRateTierId) {
            defaultRateTierId = custDoc.data().defaultRateTierId;
          }
        } catch (e) {
          console.warn('Could not fetch customer rate tier');
        }
      }

      // 2. Generate Quote
      const loadingToast = toast.loading('Generating AI quote...');
      const newQuoteId = await generateAIDefaultQuote(
        job,
        user.uid,
        user.displayName || user.email || 'Dispatcher',
        rateCard,
        defaultRateTierId
      );
      toast.dismiss(loadingToast);
      toast.success('AI quote generated!');

      // 3. Navigate to quote editor
      navigate(`/quotes/new/${job.id}?quoteId=${newQuoteId}`);

    } catch (err: any) {
      console.error('AI Quote generation error:', err);
      toast.error(err?.message || 'Failed to generate AI quote');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleManualQuote = () => {
    navigate(`/quotes/new/${job.id}`);
  };

  const handlePerformInspection = async () => {
    setLoadingAction('inspection');
    try {
      await updateDoc(doc(db, 'jobs', job.id), sanitizeForFirestore({
        status: 'in_progress',
        category: 'inspection' // Update category to clarify
      }));
      toast.success('Job moved to In Progress — Inspection');
      onJobUpdated();
    } catch (err: any) {
      console.error('Perform inspection error:', err);
      toast.error(err?.message || 'Failed to update job');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSkipQuote = async () => {
    setLoadingAction('skip');
    try {
      await updateDoc(doc(db, 'jobs', job.id), sanitizeForFirestore({
        status: job.scheduled_at ? 'scheduled' : 'unscheduled',
        active_quote_id: 'skipped'
      }));
      toast.success('Quote skipped — job ready for scheduling');
      onJobUpdated();
    } catch (err: any) {
      console.error('Skip quote error:', err);
      toast.error(err?.message || 'Failed to skip quote');
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 border-2 border-blue-100">
      <h3 className="text-lg font-semibold text-gray-900 mb-2">Next Steps</h3>
      <p className="text-sm text-gray-600 mb-4">Choose how to proceed with this job request.</p>
      
      <div className="grid grid-cols-1 gap-3">
        <button
          onClick={handleGenerateAIQuote}
          disabled={loadingAction !== null}
          className="w-full flex items-start text-left gap-3 p-3 rounded-lg border border-purple-200 hover:border-purple-400 bg-purple-50 hover:bg-purple-100 transition-colors"
        >
          {loadingAction === 'ai_quote' ? <Loader2 className="w-5 h-5 text-purple-600 animate-spin mt-0.5" /> : <Bot className="w-5 h-5 text-purple-600 mt-0.5" />}
          <div>
            <div className="font-medium text-purple-900">Generate AI Quote</div>
            <div className="text-xs text-purple-700">Auto-calculated using your rate card, estimated hours, and materials.</div>
          </div>
        </button>

        <button
          onClick={handleManualQuote}
          disabled={loadingAction !== null}
          className="w-full flex items-start text-left gap-3 p-3 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors"
        >
          <FileEdit className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <div className="font-medium text-gray-900">Create Manual Quote</div>
            <div className="text-xs text-gray-500">Build a quote from scratch.</div>
          </div>
        </button>

        <button
          onClick={handlePerformInspection}
          disabled={loadingAction !== null}
          className="w-full flex items-start text-left gap-3 p-3 rounded-lg border border-gray-200 hover:border-orange-400 hover:bg-orange-50 transition-colors"
        >
          {loadingAction === 'inspection' ? <Loader2 className="w-5 h-5 text-orange-600 animate-spin mt-0.5" /> : <ClipboardCheck className="w-5 h-5 text-orange-600 mt-0.5" />}
          <div>
            <div className="font-medium text-gray-900">Perform Inspection</div>
            <div className="text-xs text-gray-500">Do an on-site paid or free inspection prior to quoting.</div>
          </div>
        </button>

        <button
          onClick={handleSkipQuote}
          disabled={loadingAction !== null}
          className="w-full flex items-start text-left gap-3 p-3 rounded-lg border border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition-colors"
        >
          {loadingAction === 'skip' ? <Loader2 className="w-5 h-5 text-gray-600 animate-spin mt-0.5" /> : <FastForward className="w-5 h-5 text-gray-600 mt-0.5" />}
          <div>
            <div className="font-medium text-gray-900">Skip Quote</div>
            <div className="text-xs text-gray-500">Proceed directly to scheduling or performing the work.</div>
          </div>
        </button>
      </div>
    </div>
  );
};
