import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, FileEdit, ClipboardCheck, FastForward, Loader2 } from 'lucide-react';
import { Job, Quote } from '../../types';
import { useAuth } from '../../auth/AuthProvider';
import { generateAIDefaultQuote } from '../../lib/aiQuoteGenerator';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';

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
    if (!user || !user.org_id) return;
    setLoadingAction('ai_quote');
    try {
      // 1. Fetch technician's rate card config
      const techDoc = await getDoc(doc(db, 'technicians', user.uid));
      let rateCard = null;
      let defaultRateTierId = '';

      if (techDoc.exists()) {
        const techData = techDoc.data();
        rateCard = techData.rateCard;
      }

      // If customer has a specific rate tier
      if (job.customer_id) {
        const custDoc = await getDoc(doc(db, 'customers', job.customer_id));
        if (custDoc.exists() && custDoc.data().defaultRateTierId) {
          defaultRateTierId = custDoc.data().defaultRateTierId;
        }
      }

      // 2. Generate Quote
      const newQuoteId = await generateAIDefaultQuote(
        job,
        user.uid,
        user.displayName || user.email || 'Technician',
        rateCard,
        defaultRateTierId
      );

      // 3. Navigate to quote editor / view
      // Navigate to /quotes/new/:jobId with quote pre-created or just to edit the quote
      // Assuming CreateQuote handles existing quote or we just drop them there
      navigate(`/quotes/new/${job.id}?quoteId=${newQuoteId}`);

    } catch (err) {
      console.error(err);
      alert('Failed to generate AI quote');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleManualQuote = () => {
    navigate(`/quotes/new/${job.id}`);
  };

  const handlePerformInspection = async () => {
    if (!window.confirm('Proceed with an inspection? This will move the job to In Progress.')) return;
    setLoadingAction('inspection');
    try {
      await updateDoc(doc(db, 'jobs', job.id), {
        status: 'in_progress',
        category: 'inspection' // Update category to clarify
      });
      onJobUpdated();
    } catch (err) {
      console.error(err);
      alert('Failed to update job');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSkipQuote = async () => {
    if (!window.confirm('Skip quote and proceed to scheduling/work?')) return;
    setLoadingAction('skip');
    try {
      await updateDoc(doc(db, 'jobs', job.id), {
        status: job.scheduled_at ? 'scheduled' : 'unscheduled',
        active_quote_id: 'skipped'
      });
      onJobUpdated();
    } catch (err) {
      console.error(err);
      alert('Failed to skip quote');
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
