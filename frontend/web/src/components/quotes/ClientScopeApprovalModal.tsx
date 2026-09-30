import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  PenTool,
  PhoneCall,
  MessageSquare,
  Mail,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ShieldCheck,
  FileText,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ScopeVersionItem } from '../ScopeReviewAccordion';

interface ClientScopeApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  scopeVersion: ScopeVersionItem;
  previousVersion?: ScopeVersionItem;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  onConfirmApproval: (data: {
    approvedBy: string;
    approvedVia: 'on_glass' | 'phone_verbal' | 'sms_approved' | 'email';
    signatureDataUrl?: string;
    notes?: string;
    agreedToTerms: boolean;
  }) => Promise<void>;
}

export const ClientScopeApprovalModal: React.FC<ClientScopeApprovalModalProps> = ({
  isOpen,
  onClose,
  scopeVersion,
  previousVersion,
  customerName = '',
  customerPhone = '',
  customerEmail = '',
  onConfirmApproval
}) => {
  const [method, setMethod] = useState<'on_glass' | 'phone_verbal' | 'sms_approved' | 'email'>('on_glass');
  const [signerName, setSignerName] = useState(customerName || '');
  const [phone, setPhone] = useState(customerPhone || '');
  const [email, setEmail] = useState(customerEmail || '');
  const [verbalNotes, setVerbalNotes] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(true);
  const [showRiderTerms, setShowRiderTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Canvas drawing state for On-Glass Signature
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  // Reset or initialize when modal opens
  useEffect(() => {
    if (isOpen) {
      setSignerName(customerName || '');
      setPhone(customerPhone || '');
      setEmail(customerEmail || '');
      setVerbalNotes('');
      setAgreedToTerms(true);
      setHasSignature(false);
      setShowRiderTerms(false);
    }
  }, [isOpen, customerName, customerPhone, customerEmail]);

  // Canvas setup
  useEffect(() => {
    if (!isOpen || method !== 'on_glass') return;
    const timer = setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.5;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }, 50);
    return () => clearTimeout(timer);
  }, [isOpen, method]);

  if (!isOpen) return null;

  // Calculate pricing delta against previous scope
  const currentTotal = scopeVersion.totals?.total || 0;
  const prevTotal = previousVersion?.totals?.total || 0;
  const deltaTotal = previousVersion ? currentTotal - prevTotal : 0;

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ('touches' in e && e.touches.length > 0) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      };
    }
    const mouseEvent = e as React.MouseEvent<HTMLCanvasElement>;
    return {
      x: (mouseEvent.clientX - rect.left) * scaleX,
      y: (mouseEvent.clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasSignature(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    if ('touches' in e) e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signerName.trim()) {
      toast.error('Please enter the client / authorizer name.');
      return;
    }
    if (!agreedToTerms) {
      toast.error('Please confirm agreement to the scope change terms.');
      return;
    }

    let signatureDataUrl: string | undefined = undefined;
    if (method === 'on_glass') {
      if (!hasSignature || !canvasRef.current) {
        toast.error('Please have the client sign on the signature pad.');
        return;
      }
      signatureDataUrl = canvasRef.current.toDataURL('image/png');
    }

    setSubmitting(true);
    try {
      await onConfirmApproval({
        approvedBy: signerName.trim(),
        approvedVia: method,
        signatureDataUrl,
        notes: method === 'phone_verbal' ? verbalNotes.trim() : undefined,
        agreedToTerms
      });
      toast.success('Customer scope approval successfully recorded!');
      onClose();
    } catch (err: any) {
      console.error('Error recording approval:', err);
      toast.error(err?.message || 'Failed to record customer approval.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/90 rounded-xl text-white shadow-sm">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base leading-tight">Record Client Scope Approval</h3>
              <p className="text-xs text-blue-200 mt-0.5">
                {scopeVersion.label} • ${(scopeVersion.totals?.total || 0).toFixed(2)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
          {/* Scope & Cost Summary Banner */}
          <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 flex items-center justify-between text-xs">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Scope Target</span>
              <div className="font-extrabold text-slate-900 text-sm">{scopeVersion.label}</div>
              {scopeVersion.changeReason && (
                <p className="text-slate-600 text-[11px] line-clamp-1 italic">"{scopeVersion.changeReason}"</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] font-bold text-slate-500 uppercase">Updated Total</div>
              <div className="text-base font-black text-slate-900">${currentTotal.toFixed(2)}</div>
              {deltaTotal !== 0 && (
                <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded mt-0.5 ${
                  deltaTotal > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-800'
                }`}>
                  {deltaTotal > 0 ? `+${deltaTotal.toFixed(2)} adjustment` : `${deltaTotal.toFixed(2)} adjustment`}
                </span>
              )}
            </div>
          </div>

          {/* Authorization Channel Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Select Authorization Method *
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setMethod('on_glass')}
                className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 ${
                  method === 'on_glass'
                    ? 'border-blue-600 bg-blue-50 text-blue-900 ring-2 ring-blue-500/20 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <PenTool className={`w-4 h-4 ${method === 'on_glass' ? 'text-blue-600' : 'text-slate-500'}`} />
                <span className="text-xs font-bold leading-tight">On-Glass Sign</span>
              </button>

              <button
                type="button"
                onClick={() => setMethod('phone_verbal')}
                className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 ${
                  method === 'phone_verbal'
                    ? 'border-blue-600 bg-blue-50 text-blue-900 ring-2 ring-blue-500/20 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <PhoneCall className={`w-4 h-4 ${method === 'phone_verbal' ? 'text-blue-600' : 'text-slate-500'}`} />
                <span className="text-xs font-bold leading-tight">Phone Verbal</span>
              </button>

              <button
                type="button"
                onClick={() => setMethod('sms_approved')}
                className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 ${
                  method === 'sms_approved'
                    ? 'border-blue-600 bg-blue-50 text-blue-900 ring-2 ring-blue-500/20 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <MessageSquare className={`w-4 h-4 ${method === 'sms_approved' ? 'text-blue-600' : 'text-slate-500'}`} />
                <span className="text-xs font-bold leading-tight">SMS Link</span>
              </button>

              <button
                type="button"
                onClick={() => setMethod('email')}
                className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 ${
                  method === 'email'
                    ? 'border-blue-600 bg-blue-50 text-blue-900 ring-2 ring-blue-500/20 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Mail className={`w-4 h-4 ${method === 'email' ? 'text-blue-600' : 'text-slate-500'}`} />
                <span className="text-xs font-bold leading-tight">Email Signoff</span>
              </button>
            </div>
          </div>

          {/* Authorizer Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Client / Authorizer Name *
            </label>
            <input
              type="text"
              required
              value={signerName}
              onChange={e => setSignerName(e.target.value)}
              placeholder="e.g. John Doe (Homeowner / Site Manager)"
              className="w-full px-3 py-2 border rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
            />
          </div>

          {/* 1. On-Glass Digital Signature Canvas */}
          {method === 'on_glass' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <PenTool className="w-3.5 h-3.5 text-blue-600" />
                  Client On-Glass Signature *
                </label>
                <button
                  type="button"
                  onClick={clearCanvas}
                  className="text-[11px] font-semibold text-slate-500 hover:text-red-600 flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" /> Clear Pad
                </button>
              </div>

              <div className="border-2 border-dashed border-slate-300 rounded-xl overflow-hidden bg-white touch-none shadow-inner">
                <canvas
                  ref={canvasRef}
                  width={520}
                  height={150}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="w-full h-[140px] cursor-crosshair block"
                />
              </div>
              <p className="text-[11px] text-slate-500 text-center">
                Draw signature above using your finger, stylus, or mouse.
              </p>
            </div>
          )}

          {/* 2. Phone Verbal Confirmation Fields */}
          {method === 'phone_verbal' && (
            <div className="space-y-3 bg-amber-50/60 p-3.5 rounded-xl border border-amber-200">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                <PhoneCall className="w-4 h-4 text-amber-600" />
                <span>Verbal Phone Approval Record</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Phone Number Confirmed</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="(808) 555-0123"
                    className="w-full px-2.5 py-1.5 border rounded-lg text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Confirmation Time</label>
                  <input
                    type="text"
                    readOnly
                    value={`Recorded ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                    className="w-full px-2.5 py-1.5 border rounded-lg text-xs bg-slate-100 text-slate-600 font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Verbal Discussion Notes / Context</label>
                <textarea
                  rows={2}
                  value={verbalNotes}
                  onChange={e => setVerbalNotes(e.target.value)}
                  placeholder="e.g. Homeowner approved water heater replacement and $350 scope addition over speakerphone with field tech Linda."
                  className="w-full p-2 border rounded-lg text-xs bg-white focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          )}

          {/* 3. SMS Link Dispatch */}
          {method === 'sms_approved' && (
            <div className="space-y-2.5 bg-blue-50/60 p-3.5 rounded-xl border border-blue-200 text-xs">
              <div className="flex items-center gap-2 font-bold text-blue-950">
                <MessageSquare className="w-4 h-4 text-blue-600" />
                <span>SMS One-Tap Approval Link</span>
              </div>
              <p className="text-slate-600 text-[11px]">
                An instant authorization text message will be logged with a digital approval link for the customer's mobile phone.
              </p>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Recipient Mobile Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="(808) 555-0123"
                  className="w-full px-2.5 py-1.5 border rounded-lg text-xs bg-white font-mono"
                />
              </div>
            </div>
          )}

          {/* 4. Email Signoff */}
          {method === 'email' && (
            <div className="space-y-2.5 bg-purple-50/60 p-3.5 rounded-xl border border-purple-200 text-xs">
              <div className="flex items-center gap-2 font-bold text-purple-950">
                <Mail className="w-4 h-4 text-purple-600" />
                <span>Email Written Authorization</span>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Client Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="client@example.com"
                  className="w-full px-2.5 py-1.5 border rounded-lg text-xs bg-white font-mono"
                />
              </div>
            </div>
          )}

          {/* Contract Adjustments & Change Order Legal Rider Drawer */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/70">
            <button
              type="button"
              onClick={() => setShowRiderTerms(!showRiderTerms)}
              className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-bold text-slate-700 hover:bg-slate-100/80 transition-colors"
            >
              <div className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                <span>Contract Adjustments & Scope Change Rider</span>
              </div>
              {showRiderTerms ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showRiderTerms && (
              <div className="p-3 bg-white border-t border-slate-200 text-[11px] text-slate-600 space-y-2 leading-relaxed max-h-48 overflow-y-auto">
                <div>
                  <strong className="text-slate-900 block font-semibold">1. Unforeseen & Concealed Jobsite Conditions</strong>
                  Any concealed piping, structural, or electrical conditions encountered that were not observable during initial inspection constitute necessary work.
                </div>
                <div>
                  <strong className="text-slate-900 block font-semibold">2. Price Adjustment & Payment Terms</strong>
                  The total quote sum is updated to ${(scopeVersion.totals?.total || 0).toFixed(2)}. Additional materials, specialized equipment, and labor hours are billed per this change order schedule.
                </div>
                <div>
                  <strong className="text-slate-900 block font-semibold">3. Standard Trade Warranty</strong>
                  All modified scope materials are backed by original manufacturer warranties and our standard trade workmanship guarantee.
                </div>
              </div>
            )}
          </div>

          {/* Agreement Checkbox */}
          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-50/50 border border-blue-200/80 cursor-pointer">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={e => setAgreedToTerms(e.target.checked)}
              className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 w-4 h-4 shrink-0"
            />
            <span className="text-xs text-slate-800 leading-snug">
              I certify that the client has approved this modified scope of work, the revised total of{' '}
              <strong className="text-blue-900">${currentTotal.toFixed(2)}</strong>, and the standard contract adjustment terms.
            </span>
          </label>

          {/* Footer Actions */}
          <div className="pt-2 border-t flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Recording Approval...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Confirm & Record Approval</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
