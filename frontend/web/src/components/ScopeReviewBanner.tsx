import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { ShieldAlert, CheckCircle2, Loader2 } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import type { ScopeReview } from '../types';

interface ScopeReviewBannerProps {
  scopeReview?: ScopeReview | null;
  /** Job to clear the flag on when the dispatcher marks it reviewed. */
  jobId?: string;
  /** Quote(s) to clear the flag on as well. */
  quoteIds?: Array<string | undefined | null>;
  /** Called with the updated review after it is marked reviewed. */
  onResolved?: (review: ScopeReview) => void;
  /** Compact variant for tighter layouts (e.g. estimate panels). */
  compact?: boolean;
  /** When true, no Firestore writes are made — only onResolved is called (unsaved drafts). */
  localOnly?: boolean;
}

/**
 * Banner shown when the AI scope check flagged a request as outside the company's
 * listed services. The quote is held until a dispatcher reviews it.
 */
export const ScopeReviewBanner: React.FC<ScopeReviewBannerProps> = ({
  scopeReview,
  jobId,
  quoteIds = [],
  onResolved,
  compact = false,
  localOnly = false,
}) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);

  if (!scopeReview || scopeReview.status !== 'needs_review') return null;

  const handleMarkReviewed = async () => {
    const reviewed: ScopeReview = {
      ...scopeReview,
      status: 'reviewed',
      reviewedAt: new Date().toISOString(),
      reviewedBy: user?.uid || '',
      reviewedByName: user?.displayName || user?.email || 'Dispatcher',
    };
    if (localOnly) {
      onResolved?.(reviewed);
      return;
    }
    setSaving(true);
    try {
      const writes: Promise<void>[] = [];
      if (jobId) writes.push(updateDoc(doc(db, 'jobs', jobId), { scopeReview: reviewed }));
      Array.from(new Set(quoteIds.filter(Boolean) as string[])).forEach(qid => {
        writes.push(updateDoc(doc(db, 'quotes', qid), { scopeReview: reviewed, needsScopeReview: false }));
      });
      await Promise.all(writes);
      toast.success('Scope reviewed — this request can now be quoted');
      onResolved?.(reviewed);
    } catch (err) {
      console.error('Failed to mark scope reviewed:', err);
      toast.error('Could not update the scope review');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      id="scope-review-banner"
      role="alert"
      className={`relative overflow-hidden rounded-2xl border border-amber-300/70 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 shadow-sm ${compact ? 'p-3 mb-3' : 'p-4 mb-5'}`}
    >
      <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-amber-400 to-orange-500" />
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 pl-2">
        <div className="shrink-0 p-2 rounded-xl bg-amber-100 text-amber-700 animate-pulse">
          <ShieldAlert className={compact ? 'w-4 h-4' : 'w-5 h-5'} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-bold text-amber-900 ${compact ? 'text-sm' : 'text-base'}`}>
            Needs review — request may be outside your services
          </p>
          <p className="text-sm text-amber-800 mt-0.5">{scopeReview.reason}</p>
          {(scopeReview.requestTrades?.length || scopeReview.companyTrades?.length) ? (
            <div className="flex flex-wrap gap-1.5 mt-2 text-xs">
              {scopeReview.requestTrades?.map(t => (
                <span key={`req-${t}`} className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 font-semibold">
                  Requested: {t}
                </span>
              ))}
              {scopeReview.companyTrades?.map(t => (
                <span key={`co-${t}`} className="px-2 py-0.5 rounded-full bg-white/80 border border-amber-200 text-amber-800">
                  You offer: {t}
                </span>
              ))}
            </div>
          ) : null}
          {!compact && (
            <p className="text-xs text-amber-700/80 mt-2">
              The AI quote was not sent to the customer. Confirm your team can do this work, or decline the request.
              If you do offer it, add it under Settings → Company Services so similar requests aren't flagged.
            </p>
          )}
        </div>
        <button
          id="scope-review-mark-reviewed"
          type="button"
          onClick={handleMarkReviewed}
          disabled={saving}
          className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold shadow-sm transition-all hover:shadow-md active:scale-95 disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          We do this — OK to quote
        </button>
      </div>
    </div>
  );
};

/** Small pill for lists (jobs list, queues). */
export const ScopeReviewBadge: React.FC<{ scopeReview?: ScopeReview | null }> = ({ scopeReview }) => {
  if (!scopeReview || scopeReview.status !== 'needs_review') return null;
  return (
    <span
      title={scopeReview.reason}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold border border-amber-200"
    >
      <ShieldAlert className="w-3 h-3" />
      Scope review
    </span>
  );
};

export default ScopeReviewBanner;
