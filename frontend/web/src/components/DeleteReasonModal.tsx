import React, { useState } from 'react';
import { Trash2, AlertTriangle, X, Loader2 } from 'lucide-react';
import { STANDARD_JOB_DELETE_REASONS, STANDARD_QUOTE_DELETE_REASONS } from '../lib/deletionService';
import toast from 'react-hot-toast';

interface DeleteReasonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reasonCategory: string, reasonDetails: string) => Promise<void>;
  itemType: 'job' | 'quote';
  itemIdentifier: string;
}

export const DeleteReasonModal: React.FC<DeleteReasonModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  itemType,
  itemIdentifier
}) => {
  const reasons = itemType === 'job' ? STANDARD_JOB_DELETE_REASONS : STANDARD_QUOTE_DELETE_REASONS;
  const [selectedReason, setSelectedReason] = useState(reasons[0]);
  const [customDetails, setCustomDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReason) {
      toast.error('Please select a deletion reason');
      return;
    }

    if (selectedReason === 'Other (Custom Reason)' && !customDetails.trim()) {
      toast.error('Please provide custom details for your deletion reason');
      return;
    }

    setSubmitting(true);
    try {
      await onConfirm(selectedReason, customDetails.trim());
      toast.success(`${itemType === 'job' ? 'Job' : 'Quote'} deleted successfully`);
      onClose();
    } catch (err: any) {
      console.error('Deletion error:', err);
      toast.error(err?.message || `Failed to delete ${itemType}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-red-50 border-b border-red-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-red-950">Delete {itemType === 'job' ? 'Job' : 'Quote'}</h3>
              <p className="text-[11px] font-medium text-red-700">{itemIdentifier}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="text-slate-400 hover:text-slate-600 rounded-lg p-1 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content & Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200/80 rounded-lg p-3 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-900 leading-relaxed">
              This action will remove <strong>{itemIdentifier}</strong> and record an entry in the organization deletion audit log.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
              Reason for Deletion <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value)}
              className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-red-400 focus:border-red-400 transition-all outline-none font-medium text-slate-800"
            >
              {reasons.map((r, idx) => (
                <option key={idx} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
              Additional Notes / Details {selectedReason === 'Other (Custom Reason)' && <span className="text-red-500">*</span>}
            </label>
            <textarea
              rows={3}
              value={customDetails}
              onChange={(e) => setCustomDetails(e.target.value)}
              placeholder="Provide context or explanation for recording..."
              className="w-full text-xs border border-slate-300 rounded-lg p-2.5 focus:ring-2 focus:ring-red-400 focus:border-red-400 outline-none transition-all resize-none text-slate-800"
            />
          </div>

          {/* Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-lg shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" /> Confirm Delete
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
