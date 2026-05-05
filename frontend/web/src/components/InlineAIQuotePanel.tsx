import React, { useState, useEffect, useCallback } from 'react';
import { db, functions } from '../firebase';
import { doc, getDoc, updateDoc, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../auth/AuthProvider';
import toast from 'react-hot-toast';
import {
  Sparkles, Bot, Wrench, Package, Truck, Clock, Shield,
  AlertTriangle, ChevronDown, ChevronUp, Edit3, Save, Send,
  DollarSign, Loader2, CheckCircle2, Trash2, Plus, Info,
  Briefcase, FileText, BarChart3, Zap, Target, Lightbulb,
  X, RefreshCw
} from 'lucide-react';
import { PortalTicket, QuoteLineItem } from '../types';

interface InlineAIQuotePanelProps {
  ticket?: PortalTicket;
  job?: any; // Allow passing job directly
  onQuoteSent?: () => void;
  onNavigateToQuote?: (jobId: string, quoteId: string) => void;
}

interface AIRecommendation {
  diagnosis: string;
  solution: string;
  estimatedDuration: number;
  complexity: string;
  confidence: number;
  partsNeeded: { name: string; quantity: number; estimatedCost: number; essential: boolean }[];
  toolsRequired: { name: string; essential: boolean; owned: boolean }[];
  safetyWarnings: string[];
  priority: string;
  priorityReason: string;
}

interface EditableLineItem extends QuoteLineItem {
  _editing?: boolean;
}

export const InlineAIQuotePanel: React.FC<InlineAIQuotePanelProps> = ({
  ticket,
  job,
  onQuoteSent,
  onNavigateToQuote
}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [aiRec, setAiRec] = useState<AIRecommendation | null>(null);
  const [quoteData, setQuoteData] = useState<any>(null);
  const [lineItems, setLineItems] = useState<EditableLineItem[]>([]);
  const [scopeOfWork, setScopeOfWork] = useState('');
  const [editingScope, setEditingScope] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [jobData, setJobData] = useState<any>(null);
  const [editingAi, setEditingAi] = useState(false);
  const [editableAiRec, setEditableAiRec] = useState<AIRecommendation | null>(null);
  const [showSendOptions, setShowSendOptions] = useState(false);

  // Quote Display Settings State
  const [presentationMode, setPresentationMode] = useState<'detailed' | 'category_rollup' | 'single_price'>('detailed');
  const [displayTax, setDisplayTax] = useState(true);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('fixed');
  const [discountValue, setDiscountValue] = useState(0);
  const [discountReason, setDiscountReason] = useState('');

  // Load AI analysis + quote data
  const loadData = useCallback(async () => {
    const targetJobId = ticket?.autoJobId || job?.id;
    const targetQuoteId = ticket?.autoQuoteId || job?.active_quote_id || job?.latestQuoteId;

    if (!targetJobId && !targetQuoteId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch job for AI recommendation
      if (targetJobId) {
        const jobSnap = await getDoc(doc(db, 'jobs', targetJobId));
        if (jobSnap.exists()) {
          const j = jobSnap.data();
          setJobData({ id: jobSnap.id, ...j });
          if (j.aiRecommendation) {
            setAiRec(j.aiRecommendation);
            setEditableAiRec(j.aiRecommendation);
          }
        }
      }

      // Fetch quote with line items
      if (targetQuoteId) {
        const quoteSnap = await getDoc(doc(db, 'quotes', targetQuoteId));
        if (quoteSnap.exists()) {
          const q = quoteSnap.data();
          setQuoteData({ id: quoteSnap.id, ...q });
          setLineItems((q.lineItems || []).map((li: any) => ({ ...li, _editing: false })));
          setScopeOfWork(q.scopeOfWork || '');
          setPresentationMode(q.presentationMode || 'detailed');
          setDisplayTax(q.displayTax !== false);
          setDiscountType(q.discountType || 'fixed');
          setDiscountValue(q.discountValue || 0);
          setDiscountReason(q.discountReason || '');
        }
      }
    } catch (err) {
      console.error('Error loading AI panel data:', err);
    } finally {
      setLoading(false);
    }
  }, [ticket?.autoJobId, ticket?.autoQuoteId, job?.id, job?.active_quote_id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ──── Generate AI Analysis (for tickets without auto-quote) ────
  const handleGenerateAIAnalysis = async () => {
    if (!user?.uid || !user?.org_id) return;
    setGenerating(true);
    try {
      let jobRefId = job?.id;
      let jobDataPayload: any = null;

      // If no job exists, create one from ticket
      if (!jobRefId && ticket) {
        jobDataPayload = {
          org_id: user.org_id,
          customer: {
            name: ticket.requestorName || 'Unknown Customer',
            phone: ticket.requestorPhone || '',
            email: ticket.requestorEmail || '',
            address: ticket.address || ''
          },
          request: {
            description: cleanDescription(ticket.description),
            source: 'portal'
          },
          status: 'pending',
          priority: ticket.metadata?.urgency === 'emergency' ? 'high' : 'medium',
          createdAt: serverTimestamp(),
          createdBy: user.uid,
          source: ticket.source || 'WEBSITE_PORTAL'
        };
        if (ticket.address) jobDataPayload.location = { address: ticket.address };
        
        if ((ticket.metadata as any)?.aiRecommendation) {
          jobDataPayload.aiRecommendation = (ticket.metadata as any).aiRecommendation;
        } else if ((ticket as any).aiRecommendation) {
          jobDataPayload.aiRecommendation = (ticket as any).aiRecommendation;
        }

        const jobRef = await addDoc(collection(db, 'jobs'), jobDataPayload);
        jobRefId = jobRef.id;
      }

      // Now generate AI quote
      const { generateAIDefaultQuote } = await import('../lib/aiQuoteGenerator');

      const techSnap = await getDoc(doc(db, 'technicians', user.uid));
      const rateCard = techSnap.exists() ? techSnap.data().rateCard : null;

      const jobSnap = await getDoc(doc(db, 'jobs', jobRefId));
      const j = { id: jobSnap.id, ...jobSnap.data() } as any;

      const quoteId = await generateAIDefaultQuote(
        j,
        user.uid,
        user.displayName || user.email || 'Staff',
        rateCard,
        ''
      );

      // Update ticket with auto-generated references if we have a ticket
      if (ticket) {
        await updateDoc(doc(db, 'tickets', ticket.id), {
          autoJobId: jobRefId,
          autoQuoteId: quoteId,
          status: 'PENDING'
        });

        // Get the quote total
        const quoteDoc = await getDoc(doc(db, 'quotes', quoteId));
        if (quoteDoc.exists()) {
          await updateDoc(doc(db, 'tickets', ticket.id), {
            autoQuoteTotal: quoteDoc.data().total || 0
          });
        }
        ticket.autoJobId = jobRefId;
        ticket.autoQuoteId = quoteId;
      }

      // If we only have job, update job with active quote
      if (job && !ticket) {
        await updateDoc(doc(db, 'jobs', job.id), {
          active_quote_id: quoteId,
          status: 'quote_pending'
        });
        job.active_quote_id = quoteId;
      }

      toast.success('AI analysis & quote generated!');
      await loadData();
    } catch (err) {
      console.error('Generate AI analysis error:', err);
      toast.error('Failed to generate AI analysis');
    } finally {
      setGenerating(false);
    }
  };

  // ──── Update line item ────
  const updateLineItem = (id: string, field: string, value: any) => {
    setLineItems(prev => prev.map(li => {
      if (li.id !== id) return li;
      const updated = { ...li, [field]: value };
      // Recalculate total
      if (field === 'quantity' || field === 'unitPrice') {
        updated.total = Number(updated.quantity) * Number(updated.unitPrice);
      }
      return updated;
    }));
  };

  // ──── Add new line item ────
  const addLineItem = (type: 'labor' | 'material' | 'equipment' | 'travel') => {
    const newItem: EditableLineItem = {
      id: crypto.randomUUID(),
      type,
      description: '',
      quantity: 1,
      unit: type === 'labor' ? 'hours' : type === 'travel' ? 'flat' : 'each',
      unitPrice: 0,
      total: 0,
      taxable: type === 'material' || type === 'equipment',
      isOptional: false,
      _editing: true
    };
    setLineItems(prev => [...prev, newItem]);
    setEditingItemId(newItem.id);
  };

  // ──── Remove line item ────
  const removeLineItem = (id: string) => {
    setLineItems(prev => prev.filter(li => li.id !== id));
  };

  // ──── Save edits to Firestore ────
  const handleSave = async () => {
    const targetQuoteId = ticket?.autoQuoteId || job?.active_quote_id;
    if (!targetQuoteId) return;
    setSaving(true);
    try {
      const targetJobId = ticket?.autoJobId || job?.id;
      if (editingAi && editableAiRec && targetJobId) {
        await updateDoc(doc(db, 'jobs', targetJobId), {
          aiRecommendation: editableAiRec
        });
        setAiRec(editableAiRec);
        setEditingAi(false);
      }

      const cleanItems = lineItems.map(({ _editing, ...rest }) => rest);
      const nonOptional = cleanItems.filter(i => !i.isOptional);
      const subtotal = cleanItems.reduce((sum, i) => sum + i.total, 0);

      // Calculate discount
      let discountAmount = 0;
      if (discountValue > 0) {
        if (discountType === 'percentage') {
          discountAmount = subtotal * (discountValue / 100);
        } else {
          discountAmount = discountValue;
        }
      }
      
      const discountedSubtotal = Math.max(0, subtotal - discountAmount);
      
      // Calculate tax only if displayTax is true (optional business logic, but typical for simplicity in this flow)
      const taxableAmount = nonOptional.filter(i => i.taxable).reduce((sum, i) => sum + i.total, 0);
      // Prorate discount across taxable amount to be accurate, or just apply tax directly to taxable amount if tax is pre-discount. Let's do pre-discount tax for simplicity or use the same logic as CreateQuote.tsx.
      // Wait, in CreateQuote.tsx, tax is calculated on the pre-discount taxable amount.
      const taxRate = quoteData?.taxRate || 0;
      const taxAmount = displayTax ? Math.round(taxableAmount * (taxRate / 100) * 100) / 100 : 0;
      
      const total = Math.round((discountedSubtotal + taxAmount) * 100) / 100;

      await updateDoc(doc(db, 'quotes', targetQuoteId), {
        lineItems: cleanItems,
        scopeOfWork,
        subtotal,
        taxAmount,
        discount: discountAmount,
        discountType,
        discountValue,
        discountReason,
        presentationMode,
        displayTax,
        total,
        updatedAt: serverTimestamp()
      });

      // Update ticket total if we have one
      if (ticket) {
        await updateDoc(doc(db, 'tickets', ticket.id), {
          autoQuoteTotal: total
        });
      }

      setQuoteData((prev: any) => ({ ...prev, subtotal, taxAmount, total, lineItems: cleanItems }));
      setEditingItemId(null);
      toast.success('Quote updated');
    } catch (err) {
      toast.error('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  // ──── Send quote to customer ────
  const handleSendQuote = async (method: 'email' | 'sms' | 'both' = 'email') => {
    const targetQuoteId = ticket?.autoQuoteId || job?.active_quote_id;
    if (!targetQuoteId) return;
    setSending(true);
    setShowSendOptions(false);
    try {
      // Save first
      await handleSave();

      const customerEmail = ticket?.requestorEmail || jobData?.customer?.email || job?.customer?.email;
      const customerPhone = ticket?.requestorPhone || jobData?.customer?.phone || job?.customer?.phone;
      const customerName = ticket?.requestorName || jobData?.customer?.name || job?.customer?.name || 'Customer';
      
      const sendQuoteNotification = httpsCallable(functions, 'sendQuoteNotification');
      
      const requests = [];
      const quoteUrl = `${window.location.origin}/quote/${targetQuoteId}`;
      const finalTotal = (quoteData?.total || 0).toFixed(2);
      
      if (method === 'email' || method === 'both') {
          requests.push(sendQuoteNotification({
              quoteId: targetQuoteId,
              jobId: ticket?.autoJobId || job?.id || jobData?.id,
              customerEmail,
              customerPhone,
              customerName,
              communicationMethod: 'email',
              quoteUrl,
              total: finalTotal
          }));
      }
      
      if (method === 'sms' || method === 'both') {
          requests.push(sendQuoteNotification({
              quoteId: targetQuoteId,
              jobId: ticket?.autoJobId || job?.id || jobData?.id,
              customerEmail,
              customerPhone,
              customerName,
              communicationMethod: 'text',
              quoteUrl,
              total: finalTotal
          }));
      }

      await Promise.all(requests);

      // Mark quote as sent
      await updateDoc(doc(db, 'quotes', targetQuoteId), {
        status: 'sent',
        sentAt: serverTimestamp(),
        sentVia: method
      });

      // Mark ticket as acknowledged if ticket exists
      if (ticket) {
        await updateDoc(doc(db, 'tickets', ticket.id), {
          status: 'ACKNOWLEDGED',
          acknowledgedAt: serverTimestamp(),
          acknowledgedBy: user?.uid || 'unknown'
        });
      }

      toast.success(`Quote sent to customer via ${method}!`);
      onQuoteSent?.();
    } catch (err) {
      toast.error('Failed to send quote');
    } finally {
      setSending(false);
    }
  };

  // ──── Helpers ────
  function cleanDescription(desc: string): string {
    return desc.replace(/^\[Public Portal Request\]\s*/i, '').replace(/^Urgency:\s*(Normal|Emergency)\s*/i, '').trim();
  }

  function getComplexityColor(c: string): string {
    switch (c) {
      case 'simple': return '#10b981';
      case 'medium': return '#f59e0b';
      case 'complex': return '#ef4444';
      default: return '#6b7280';
    }
  }

  function getTypeIcon(type: string) {
    switch (type) {
      case 'labor': return <Wrench className="w-3.5 h-3.5 text-blue-500" />;
      case 'material': return <Package className="w-3.5 h-3.5 text-emerald-500" />;
      case 'equipment': return <Wrench className="w-3.5 h-3.5 text-purple-500" />;
      case 'travel': return <Truck className="w-3.5 h-3.5 text-amber-500" />;
      default: return <DollarSign className="w-3.5 h-3.5 text-gray-500" />;
    }
  }

  function getTypeLabel(type: string) {
    switch (type) {
      case 'labor': return 'Labor';
      case 'material': return 'Material';
      case 'equipment': return 'Equipment/Tool';
      case 'travel': return 'Travel';
      default: return type;
    }
  }

  // ──── Calculate totals ────
  const calcTotals = () => {
    const nonOptional = lineItems.filter(i => !i.isOptional);
    const subtotal = lineItems.reduce((sum, i) => sum + (i.total || 0), 0);
    
    // Calculate discount
    let discountAmount = 0;
    if (discountValue > 0) {
      if (discountType === 'percentage') {
        discountAmount = subtotal * (discountValue / 100);
      } else {
        discountAmount = discountValue;
      }
    }
    
    const discountedSubtotal = Math.max(0, subtotal - discountAmount);

    const taxRate = quoteData?.taxRate || 0;
    const taxableAmount = nonOptional.filter(i => i.taxable).reduce((sum, i) => sum + (i.total || 0), 0);
    const taxAmount = displayTax ? Math.round(taxableAmount * (taxRate / 100) * 100) / 100 : 0;
    const total = Math.round((discountedSubtotal + taxAmount) * 100) / 100;

    const laborTotal = lineItems.filter(i => i.type === 'labor').reduce((s, i) => s + i.total, 0);
    const materialTotal = lineItems.filter(i => i.type === 'material').reduce((s, i) => s + i.total, 0);
    const equipmentTotal = lineItems.filter(i => i.type === 'equipment').reduce((s, i) => s + i.total, 0);
    const travelTotal = lineItems.filter(i => i.type === 'travel').reduce((s, i) => s + i.total, 0);

    return { subtotal, discountedSubtotal, discountAmount, taxAmount, total, laborTotal, materialTotal, equipmentTotal, travelTotal };
  };

  // ──── No auto-quote yet — show generate button ────
  const hasTargetJobOrQuote = (ticket && (ticket.autoJobId || ticket.autoQuoteId)) || (job && (job.id && job.active_quote_id));
  
  if (!hasTargetJobOrQuote) {
    return (
      <div className="mt-3 bg-gradient-to-r from-indigo-50 via-purple-50 to-blue-50 border border-indigo-200 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-indigo-600" />
            <span className="text-sm font-bold text-indigo-900">AI Analysis Not Yet Generated</span>
          </div>
          <button
            onClick={handleGenerateAIAnalysis}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-bold rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-md disabled:opacity-50"
          >
            {generating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Generate AI Recommendation</>
            )}
          </button>
        </div>
        <p className="text-xs text-indigo-600 mt-2">
          AI will analyze the request, recommend a resolution path, estimate labor/materials/tools costs based on your work history, and generate an editable draft quote.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mt-3 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-6 text-center">
        <Loader2 className="w-6 h-6 text-purple-500 animate-spin mx-auto mb-2" />
        <span className="text-sm text-purple-600 font-medium">Loading AI analysis...</span>
      </div>
    );
  }

  const totals = calcTotals();

  return (
    <div className="mt-3 bg-gradient-to-br from-slate-50 via-indigo-50/30 to-purple-50/30 border border-indigo-200 rounded-xl overflow-hidden">
      {/* ═══════════ HEADER ═══════════ */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-600/5 to-purple-600/5 hover:from-indigo-600/10 hover:to-purple-600/10 transition-all"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
            <Bot className="w-4.5 h-4.5 text-white" />
          </div>
          <div className="text-left">
            <span className="text-sm font-bold text-gray-900">AI Recommendation & Quote</span>
            {aiRec && (
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: `${getComplexityColor(aiRec.complexity)}20`, color: getComplexityColor(aiRec.complexity) }}>
                  {aiRec.complexity}
                </span>
                <span className="text-[10px] text-gray-400">
                  ~{Math.round(aiRec.estimatedDuration / 60 * 10) / 10}hr est. • {Math.round(aiRec.confidence * 100)}% confidence
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-indigo-700">${totals.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="p-4 space-y-4">
          {/* ═══════════ AI DIAGNOSIS & SOLUTION ═══════════ */}
          {aiRec && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Diagnosis */}
              <div className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-4 h-4 text-red-500" />
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Diagnosis</span>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{aiRec.diagnosis}</p>
              </div>

              {/* Recommended Solution */}
              <div className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Recommended Resolution</span>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{aiRec.solution}</p>
              </div>
            </div>
          )}

          {/* Safety Warnings */}
          {aiRec?.safetyWarnings && aiRec.safetyWarnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <span className="text-xs font-bold text-amber-800">Safety Notes</span>
                <ul className="text-xs text-amber-700 mt-0.5 list-disc list-inside">
                  {aiRec.safetyWarnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            </div>
          )}

          {/* ═══════════ MATERIALS & TOOLS (AI EXTRACTED) ═══════════ */}
          {/* Note: Materials and Tools have been removed from the UI as they are handled by quote line items. */}


          {/* ═══════════ SCOPE OF WORK (EDITABLE) ═══════════ */}
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Scope of Work</span>
              </div>
              <button onClick={() => setEditingScope(!editingScope)}
                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
                <Edit3 className="w-3 h-3" /> {editingScope ? 'Done' : 'Edit'}
              </button>
            </div>
            {editingScope ? (
              <textarea
                value={scopeOfWork}
                onChange={e => setScopeOfWork(e.target.value)}
                className="w-full text-sm border border-blue-200 rounded-lg p-2 min-h-[80px] focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
              />
            ) : (
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{scopeOfWork || 'No scope defined'}</p>
            )}
          </div>

          {/* ═══════════ COST BREAKDOWN SUMMARY ═══════════ */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="bg-blue-50 rounded-lg p-2.5 text-center border border-blue-100">
              <Wrench className="w-4 h-4 text-blue-600 mx-auto mb-1" />
              <div className="text-xs text-blue-600 font-medium">Labor</div>
              <div className="text-sm font-bold text-blue-800">${totals.laborTotal.toFixed(2)}</div>
            </div>
            <div className="bg-emerald-50 rounded-lg p-2.5 text-center border border-emerald-100">
              <Package className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
              <div className="text-xs text-emerald-600 font-medium">Materials</div>
              <div className="text-sm font-bold text-emerald-800">${totals.materialTotal.toFixed(2)}</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-2.5 text-center border border-purple-100">
              <Wrench className="w-4 h-4 text-purple-600 mx-auto mb-1" />
              <div className="text-xs text-purple-600 font-medium">Equipment</div>
              <div className="text-sm font-bold text-purple-800">${totals.equipmentTotal.toFixed(2)}</div>
            </div>
            <div className="bg-amber-50 rounded-lg p-2.5 text-center border border-amber-100">
              <Truck className="w-4 h-4 text-amber-600 mx-auto mb-1" />
              <div className="text-xs text-amber-600 font-medium">Travel</div>
              <div className="text-sm font-bold text-amber-800">${totals.travelTotal.toFixed(2)}</div>
            </div>
          </div>

          {/* ═══════════ EDITABLE LINE ITEMS ═══════════ */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Quote Line Items</span>
              <div className="flex items-center gap-1">
                <button onClick={() => addLineItem('labor')}
                  className="text-[10px] font-medium text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors">
                  + Labor
                </button>
                <button onClick={() => addLineItem('material')}
                  className="text-[10px] font-medium text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded transition-colors">
                  + Material
                </button>
                <button onClick={() => addLineItem('equipment')}
                  className="text-[10px] font-medium text-purple-600 hover:bg-purple-50 px-2 py-1 rounded transition-colors">
                  + Tool
                </button>
                <button onClick={() => addLineItem('travel')}
                  className="text-[10px] font-medium text-amber-600 hover:bg-amber-50 px-2 py-1 rounded transition-colors">
                  + Travel
                </button>
              </div>
            </div>

            <div className="divide-y divide-gray-100">
              {lineItems.map(item => {
                const isEditing = editingItemId === item.id;
                return (
                  <div key={item.id} className={`px-3 py-2 flex items-center gap-3 group hover:bg-gray-50/60 transition-colors ${item.isOptional ? 'opacity-70' : ''}`}>
                    {/* Type icon */}
                    <div className="flex-shrink-0">{getTypeIcon(item.type)}</div>

                    {/* Description */}
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <input
                          value={item.description}
                          onChange={e => updateLineItem(item.id, 'description', e.target.value)}
                          className="w-full text-sm border border-blue-200 rounded px-2 py-1 focus:ring-1 focus:ring-blue-300"
                          placeholder="Description..."
                          autoFocus
                        />
                      ) : (
                        <div>
                          <span className="text-sm text-gray-800 font-medium">{item.description}</span>
                          {item.notes && <p className="text-[11px] text-gray-400 truncate">{item.notes}</p>}
                          {item.isOptional && <span className="text-[10px] text-amber-600 font-medium ml-1">(optional)</span>}
                        </div>
                      )}
                    </div>

                    {/* Qty */}
                    <div className="w-16 flex-shrink-0">
                      {isEditing ? (
                        <input
                          type="number" step="0.25" min="0"
                          value={item.quantity}
                          onChange={e => updateLineItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                          className="w-full text-sm border border-blue-200 rounded px-1.5 py-1 text-right focus:ring-1 focus:ring-blue-300"
                        />
                      ) : (
                        <span className="text-xs text-gray-500">{item.quantity} {item.unit}</span>
                      )}
                    </div>

                    {/* Unit Price */}
                    <div className="w-20 flex-shrink-0">
                      {isEditing ? (
                        <input
                          type="number" step="0.01" min="0"
                          value={item.unitPrice}
                          onChange={e => updateLineItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                          className="w-full text-sm border border-blue-200 rounded px-1.5 py-1 text-right focus:ring-1 focus:ring-blue-300"
                        />
                      ) : (
                        <span className="text-xs text-gray-500">${item.unitPrice.toFixed(2)}/{item.unit}</span>
                      )}
                    </div>

                    {/* Total */}
                    <div className="w-20 flex-shrink-0 text-right">
                      <span className="text-sm font-bold text-gray-800">${(item.total || 0).toFixed(2)}</span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {isEditing ? (
                        <button onClick={() => setEditingItemId(null)}
                          className="p-1 text-green-600 hover:bg-green-50 rounded">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button onClick={() => setEditingItemId(item.id)}
                          className="p-1 text-blue-500 hover:bg-blue-50 rounded">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => removeLineItem(item.id)}
                        className="p-1 text-red-400 hover:bg-red-50 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ═══════════ QUOTE DISPLAY SETTINGS ═══════════ */}
            <div className="bg-gray-50 px-3 py-3 border-t border-gray-200 text-xs">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-3.5 h-3.5 text-gray-500" />
                <span className="font-bold text-gray-700 uppercase tracking-wide">Quote Display Settings</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-600 mb-1">Presentation Mode</label>
                  <select
                    value={presentationMode}
                    onChange={e => setPresentationMode(e.target.value as any)}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-300"
                  >
                    <option value="detailed">Detailed (Line by Line)</option>
                    <option value="category_rollup">Category Roll-up</option>
                    <option value="single_price">Single Price Summary</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">Tax Settings</label>
                  <label className="flex items-center gap-2 mt-2">
                    <input
                      type="checkbox"
                      checked={displayTax}
                      onChange={e => setDisplayTax(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-gray-700">Calculate & Display Tax</span>
                  </label>
                </div>
                <div className="md:col-span-2 grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-gray-600 mb-1">Discount Type</label>
                    <select
                      value={discountType}
                      onChange={e => setDiscountType(e.target.value as any)}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-300"
                    >
                      <option value="fixed">Fixed Amount ($)</option>
                      <option value="percentage">Percentage (%)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-gray-600 mb-1">Value</label>
                    <input
                      type="number"
                      min="0"
                      step={discountType === 'percentage' ? '1' : '0.01'}
                      value={discountValue}
                      onChange={e => setDiscountValue(parseFloat(e.target.value) || 0)}
                      className="w-full border border-gray-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-300"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-600 mb-1">Reason (Optional)</label>
                    <input
                      type="text"
                      value={discountReason}
                      onChange={e => setDiscountReason(e.target.value)}
                      placeholder="e.g. New Customer"
                      className="w-full border border-gray-300 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-300"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Totals row */}
            <div className="px-3 py-2.5 bg-gradient-to-r from-gray-50 to-indigo-50/50 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Subtotal</span>
                <span className="text-sm text-gray-700">${totals.subtotal.toFixed(2)}</span>
              </div>
              {totals.discountAmount > 0 && (
                <div className="flex items-center justify-between mt-0.5 text-emerald-600">
                  <span className="text-xs">Discount</span>
                  <span className="text-sm">-${totals.discountAmount.toFixed(2)}</span>
                </div>
              )}
              {totals.taxAmount > 0 && (
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-xs text-gray-500">Tax ({quoteData?.taxRate || 0}%)</span>
                  <span className="text-sm text-gray-700">${totals.taxAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-200">
                <span className="text-sm font-bold text-gray-900">Total</span>
                <span className="text-lg font-bold text-indigo-700">${totals.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* ═══════════ ACTION BUTTONS ═══════════ */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Changes
              </button>
              {((ticket && ticket.autoQuoteId) || (job && job.active_quote_id)) && onNavigateToQuote && (
                <button
                  onClick={() => onNavigateToQuote(
                    (ticket ? ticket.autoJobId : job.id)!, 
                    (ticket ? ticket.autoQuoteId : job.active_quote_id)!
                  )}
                  className="flex items-center gap-1.5 px-3 py-2 text-gray-500 text-xs font-medium hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" /> Full Quote Editor
                </button>
              )}
            </div>
            <div className="relative">
              <button
                onClick={() => setShowSendOptions(!showSendOptions)}
                disabled={sending || lineItems.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-sm font-bold rounded-lg hover:from-emerald-600 hover:to-emerald-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send Quote <ChevronDown className={`w-4 h-4 transition-transform ${showSendOptions ? 'rotate-180' : ''}`} />
              </button>

              {showSendOptions && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowSendOptions(false)} />
                  <div className="absolute right-0 bottom-full mb-2 w-48 bg-white rounded-lg shadow-xl ring-1 ring-black ring-opacity-5 overflow-hidden z-20 divide-y divide-gray-100 origin-bottom-right animate-in fade-in slide-in-from-bottom-2">
                    <button
                      onClick={() => handleSendQuote('email')}
                      className="w-full text-left px-4 py-3 hover:bg-emerald-50 text-sm font-medium text-gray-700 hover:text-emerald-700 transition-colors"
                    >
                      Send via Email
                    </button>
                    <button
                      onClick={() => handleSendQuote('sms')}
                      className="w-full text-left px-4 py-3 hover:bg-emerald-50 text-sm font-medium text-gray-700 hover:text-emerald-700 transition-colors"
                    >
                      Send via SMS
                    </button>
                    <button
                      onClick={() => handleSendQuote('both')}
                      className="w-full text-left px-4 py-3 hover:bg-emerald-50 text-sm font-medium text-gray-700 hover:text-emerald-700 transition-colors"
                    >
                      Send via Both
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
