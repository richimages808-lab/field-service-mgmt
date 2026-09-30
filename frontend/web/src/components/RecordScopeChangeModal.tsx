import React, { useState } from 'react';
import { 
  X, Plus, Trash2, ShieldCheck, DollarSign, FileText, CheckCircle2, 
  Sparkles, AlertTriangle, UserCheck, Building2, Users, ArrowRight, Loader2,
  ExternalLink, Store, MapPin, Package
} from 'lucide-react';
import { QuoteLineItem } from '../types';
import { generateAIScopeModification } from '../lib/aiScopeModifier';
import { RichVendorDropdown } from './RichVendorDropdown';
import { buildAllVendorPricing, selectVendorByOrgPriorities, AlternateVendorItem } from '../utils/procurementLogic';

interface RecordScopeChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentScope: string;
  existingLineItems?: QuoteLineItem[];
  currentTotal?: number;
  tradeCategory?: string;
  defaultApprovalPolicy?: {
    requireApproval: 'always' | 'threshold' | 'materials_only' | 'never';
    defaultApprover: 'customer' | 'dispatcher' | 'both' | 'none';
    costThreshold: number;
    percentageThreshold: number;
  };
  currentUser?: {
    name?: string;
    role?: string;
  };
  orgVendors?: any[];
  defaultSourcingStrategy?: 'lowest_cost' | 'local_availability' | 'fastest_shipping' | 'preferred_vendor' | 'total_visit_cost';
  materialMarkup?: number;
  onConfirm: (data: {
    changeReason: string;
    newScopeDescription: string;
    additionalItems: QuoteLineItem[];
    combinedItems?: QuoteLineItem[];
    requiredApprovalFrom: 'customer' | 'dispatcher' | 'both' | 'none';
    customerApprovalStatus: 'approved' | 'pending' | 'not_required';
    customerApprovalMethod?: 'phone_verbal' | 'on_glass' | 'email' | 'sms_pending';
    customerApproverName?: string;
    dispatcherApprovalStatus: 'approved' | 'pending' | 'not_required';
    dispatcherApproverName?: string;
    aiReasoning?: string;
  }) => Promise<void>;
}

export const RecordScopeChangeModal: React.FC<RecordScopeChangeModalProps> = ({
  isOpen,
  onClose,
  currentScope,
  existingLineItems = [],
  currentTotal = 0,
  tradeCategory = 'General',
  defaultApprovalPolicy,
  currentUser,
  orgVendors = [],
  defaultSourcingStrategy = 'lowest_cost',
  materialMarkup = 30,
  onConfirm
}) => {
  // Discovery input for AI Generation
  const [discoveryPrompt, setDiscoveryPrompt] = useState('');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiGeneratedSuccess, setAiGeneratedSuccess] = useState(false);
  const [aiReasoning, setAiReasoning] = useState('');

  // Sourcing Strategy Preference
  const [sourcingStrategy, setSourcingStrategy] = useState<'lowest_cost' | 'local_availability' | 'fastest_shipping' | 'preferred_vendor' | 'total_visit_cost'>(
    defaultSourcingStrategy || 'lowest_cost'
  );

  // Scope Fields
  const [changeReason, setChangeReason] = useState('');
  const [newScopeDescription, setNewScopeDescription] = useState(currentScope || '');
  const [additionalItems, setAdditionalItems] = useState<QuoteLineItem[]>([]);

  // Approval Policy & Configuration
  const [requiredApprovalFrom, setRequiredApprovalFrom] = useState<'customer' | 'dispatcher' | 'both' | 'none'>(
    defaultApprovalPolicy?.defaultApprover || 'both'
  );
  const [policyNotification, setPolicyNotification] = useState<string>('');

  // Customer Approval State
  const [customerApprovedNow, setCustomerApprovedNow] = useState(true);
  const [customerApprovalMethod, setCustomerApprovalMethod] = useState<'phone_verbal' | 'on_glass' | 'email' | 'sms_pending'>('phone_verbal');
  const [customerApproverName, setCustomerApproverName] = useState('');

  // Dispatcher Approval State
  const [dispatcherApprovedNow, setDispatcherApprovedNow] = useState(true);
  const [dispatcherApproverName, setDispatcherApproverName] = useState(currentUser?.name || 'Dispatcher on Duty');

  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  // Run AI Scope Generator
  const handleAIGenerateScope = async () => {
    if (!discoveryPrompt.trim()) {
      alert('Please describe what was discovered on-site or requested by the customer.');
      return;
    }

    setIsGeneratingAI(true);
    try {
      const res = await generateAIScopeModification({
        originalScope: currentScope,
        currentLineItems: existingLineItems,
        changeDiscovery: discoveryPrompt.trim(),
        tradeCategory,
        hourlyRate: 125,
        sourcingStrategy,
        markup: materialMarkup,
        orgVendors,
        approvalPolicy: defaultApprovalPolicy
      });

      setNewScopeDescription(res.newScopeDescription);
      setChangeReason(discoveryPrompt.trim());
      setAdditionalItems(res.addedItems);
      setAiReasoning(res.reasoning);
      setRequiredApprovalFrom(res.recommendedApproval.requiredFrom);
      setPolicyNotification(res.recommendedApproval.reason);
      setAiGeneratedSuccess(true);
    } catch (err) {
      console.error('AI Scope Generation Error:', err);
      alert('Failed to generate AI scope modification. You can still enter items manually.');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // Re-evaluate material vendors when user switches their Sourcing Strategy preference
  const handleSourcingStrategyChange = (newStrategy: typeof sourcingStrategy) => {
    setSourcingStrategy(newStrategy);
    if (additionalItems.length === 0) return;

    setAdditionalItems(prev => prev.map(item => {
      if (item.type !== 'material' && item.type !== 'equipment') return item;
      const allVendorOptions = buildAllVendorPricing(item.description, item.baseCost || (item.unitPrice ? Math.round(item.unitPrice / 1.3 * 100) / 100 : 20), item.alternateVendors as AlternateVendorItem[] || [], orgVendors);
      const { selectedVendor, priorityReason } = selectVendorByOrgPriorities(allVendorOptions, {
        defaultSourcingStrategy: newStrategy
      });
      const winning = selectedVendor || allVendorOptions[0];
      if (!winning) return item;

      const markup = item.markupPercentage || materialMarkup || 30;
      const newCustomerPrice = Math.round(winning.unitCost * (1 + markup / 100) * 100) / 100;
      const newTotal = Math.round(item.quantity * newCustomerPrice * 100) / 100;
      const alternates = allVendorOptions.filter(v => v.vendorName !== winning.vendorName);

      return {
        ...item,
        vendorName: winning.vendorName,
        baseCost: winning.unitCost,
        unitPrice: newCustomerPrice,
        total: newTotal,
        vendorProductUrl: winning.vendorProductUrl,
        stockQuantity: winning.stockQuantity,
        alternateVendors: alternates,
        notes: priorityReason ? `Selected by ${priorityReason}` : item.notes
      };
    }));
  };

  // Vendor selection handler for an individual item
  const handleModalVendorSelect = (itemId: string, value: string) => {
    setAdditionalItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const raw = value.startsWith('ALT:') ? value.replace('ALT:', '') : value;
      const [vendorKey, customPriceStr] = raw.split(':');

      const allAlternates = (item.alternateVendors || []) as AlternateVendorItem[];
      const match = allAlternates.find(v => v.vendorId === vendorKey || v.vendorName === vendorKey);

      let selectedUnitCost = item.baseCost || 10;
      let selectedVendorName = item.vendorName || 'Supplier';
      let selectedUrl = item.vendorProductUrl;
      let selectedStock = item.stockQuantity;
      let selectedTitle = item.description;

      if (match) {
        selectedUnitCost = match.unitCost;
        selectedVendorName = match.vendorName;
        selectedUrl = match.vendorProductUrl || selectedUrl;
        selectedStock = match.stockQuantity;
        selectedTitle = match.vendorProductTitle || selectedTitle;
      } else if (customPriceStr) {
        selectedUnitCost = parseFloat(customPriceStr) || selectedUnitCost;
        selectedVendorName = vendorKey;
      } else {
        selectedVendorName = vendorKey;
      }

      const markup = item.markupPercentage || materialMarkup || 30;
      const newCustomerPrice = Math.round(selectedUnitCost * (1 + markup / 100) * 100) / 100;
      const newTotal = Math.round(item.quantity * newCustomerPrice * 100) / 100;

      // Rotate current vendor into alternates
      const updatedAlternates = allAlternates.filter(v => v.vendorName !== selectedVendorName);
      if (item.vendorName && item.vendorName !== selectedVendorName) {
        updatedAlternates.unshift({
          vendorId: item.vendorName,
          vendorName: item.vendorName,
          unitCost: item.baseCost || 10,
          vendorProductUrl: item.vendorProductUrl,
          vendorProductTitle: item.description,
          stockQuantity: item.stockQuantity
        });
      }

      return {
        ...item,
        description: selectedTitle || item.description,
        vendorName: selectedVendorName,
        baseCost: selectedUnitCost,
        unitPrice: newCustomerPrice,
        total: newTotal,
        vendorProductUrl: selectedUrl,
        stockQuantity: selectedStock,
        alternateVendors: updatedAlternates,
        notes: `Selected: ${selectedVendorName}`
      };
    }));
  };

  const addItem = (type: 'labor' | 'material' | 'equipment' | 'travel') => {
    const markup = materialMarkup || 30;
    if (type === 'material' || type === 'equipment') {
      const defaultMatName = 'Additional Material / Hardware';
      const defaultCost = 45.00;
      const allVendorOptions = buildAllVendorPricing(defaultMatName, defaultCost, [], orgVendors);
      const { selectedVendor, priorityReason } = selectVendorByOrgPriorities(allVendorOptions, {
        defaultSourcingStrategy: sourcingStrategy
      });
      const winning = selectedVendor || allVendorOptions[0];
      const customerPrice = Math.round(winning.unitCost * (1 + markup / 100) * 100) / 100;

      const newItem: QuoteLineItem = {
        id: `new-item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        description: defaultMatName,
        type,
        quantity: 1,
        unit: 'each',
        baseCost: winning.unitCost,
        markupPercentage: markup,
        unitPrice: customerPrice,
        total: customerPrice,
        taxable: true,
        isOptional: false,
        priceSource: 'vendor',
        vendorName: winning.vendorName,
        vendorProductUrl: winning.vendorProductUrl,
        stockQuantity: winning.stockQuantity,
        alternateVendors: allVendorOptions.filter(v => v.vendorName !== winning.vendorName),
        notes: priorityReason ? `Selected by ${priorityReason}` : undefined
      };
      setAdditionalItems(prev => [...prev, newItem]);
    } else {
      const newItem: QuoteLineItem = {
        id: `new-item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        description: type === 'labor' ? 'Additional Service Labor' : 'Additional Travel',
        type,
        quantity: 1,
        unit: type === 'labor' ? 'hours' : 'trip',
        unitPrice: type === 'labor' ? 125 : 50,
        total: type === 'labor' ? 125 : 50,
        taxable: false,
        isOptional: false,
        priceSource: 'ai_estimate'
      };
      setAdditionalItems(prev => [...prev, newItem]);
    }
  };

  const updateItem = (id: string, updates: Partial<QuoteLineItem>) => {
    setAdditionalItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, ...updates };
      if (updates.quantity !== undefined || updates.unitPrice !== undefined) {
        updated.total = Math.round((updated.quantity * (updated.unitPrice || 0)) * 100) / 100;
      }
      return updated;
    }));
  };

  const removeItem = (id: string) => {
    setAdditionalItems(prev => prev.filter(item => item.id !== id));
  };

  const additionalTotal = additionalItems.reduce((sum, it) => sum + (it.total || 0), 0);
  const projectedTotal = currentTotal + additionalTotal;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changeReason.trim()) {
      alert('Please provide a reason for the scope change.');
      return;
    }
    if (!newScopeDescription.trim()) {
      alert('Please provide the new scope of work description.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Determine dispatcher approval status
      const needsDispatcherApproval = requiredApprovalFrom === 'dispatcher' || requiredApprovalFrom === 'both';
      const dispatcherApprovalStatus: 'approved' | 'pending' | 'not_required' = 
        !needsDispatcherApproval 
          ? 'not_required'
          : dispatcherApprovedNow 
          ? 'approved' 
          : 'pending';

      // Determine customer approval status
      const needsCustomerApproval = requiredApprovalFrom === 'customer' || requiredApprovalFrom === 'both';
      const customerApprovalStatus: 'approved' | 'pending' | 'not_required' =
        !needsCustomerApproval
          ? 'not_required'
          : customerApprovedNow
          ? 'approved'
          : 'pending';

      await onConfirm({
        changeReason: changeReason.trim(),
        newScopeDescription: newScopeDescription.trim(),
        additionalItems,
        requiredApprovalFrom,
        customerApprovalStatus,
        customerApprovalMethod: customerApprovedNow ? customerApprovalMethod : undefined,
        customerApproverName: customerApprovedNow ? (customerApproverName.trim() || 'Customer on site') : undefined,
        dispatcherApprovalStatus,
        dispatcherApproverName: dispatcherApprovedNow ? dispatcherApproverName.trim() : undefined,
        aiReasoning
      });

      onClose();
    } catch (err) {
      console.error('Failed to submit scope modification:', err);
      alert('Failed to save scope modification. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-gray-100 flex items-start justify-between bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/20 backdrop-blur-md rounded-xl shadow-inner">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base tracking-tight">Record Scope of Work Modification</h3>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 shadow-xs">
                  AI-POWERED
                </span>
              </div>
              <p className="text-xs text-blue-100 mt-0.5">
                Preserve original baseline and generate an additive, fully tracked scope revision
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
          
          {/* ═══════════ AI SCOPE ASSISTANT ═══════════ */}
          <div className="bg-gradient-to-r from-indigo-50/90 via-purple-50/70 to-blue-50/90 border border-indigo-200 rounded-2xl p-4 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                  <Sparkles className="w-4 h-4 text-amber-300" />
                </div>
                <span className="text-xs font-black text-indigo-950 uppercase tracking-wider">
                  AI Scope Assistant (Default)
                </span>
              </div>
              <span className="text-[11px] font-semibold text-indigo-700 bg-white/80 border border-indigo-200 px-2.5 py-0.5 rounded-full">
                Additive by default • Combines original tasks + discovered needs
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-800">
                What was discovered on-site or requested by the customer?
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="e.g. Customer requested we also change out a sink"
                  value={discoveryPrompt}
                  onChange={e => setDiscoveryPrompt(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAIGenerateScope();
                    }
                  }}
                  className="flex-1 text-xs border border-indigo-200 rounded-xl px-3.5 py-2.5 bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium text-gray-900"
                />
                <button
                  type="button"
                  onClick={handleAIGenerateScope}
                  disabled={isGeneratingAI || !discoveryPrompt.trim()}
                  className="px-4 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 rounded-xl shadow-md flex items-center gap-1.5 transition-all disabled:opacity-50 shrink-0 cursor-pointer"
                >
                  {isGeneratingAI ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      Generate AI Scope
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Sourcing Strategy Preference Bar */}
            <div className="flex items-center justify-between gap-3 flex-wrap pt-1 bg-white/60 border border-indigo-100 rounded-xl px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-indigo-950 flex items-center gap-1">
                  <Store className="w-3.5 h-3.5 text-indigo-600" /> Material Sourcing Preference:
                </span>
                <select
                  value={sourcingStrategy}
                  onChange={e => handleSourcingStrategyChange(e.target.value as any)}
                  className="text-xs font-bold bg-white text-indigo-950 border border-indigo-200 rounded-lg px-2.5 py-1 shadow-2xs focus:ring-2 focus:ring-indigo-400 cursor-pointer"
                >
                  <option value="lowest_cost">🏷️ Lowest Cost (Best Profit Margin)</option>
                  <option value="local_availability">📍 Local Branch Availability (In Stock Today)</option>
                  <option value="fastest_shipping">⚡ Fastest Fulfillment (Same Day Pickup)</option>
                  <option value="preferred_vendor">⭐ Preferred Supplier Strategy</option>
                </select>
              </div>
              <span className="text-[11px] text-indigo-700 font-medium hidden sm:inline">
                Sourced across Home Depot, Lowe's, Ferguson, Amazon & Grainger
              </span>
            </div>

            {/* Quick Suggestions */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-gray-500 font-bold uppercase">Quick Suggestions:</span>
              <button
                type="button"
                onClick={() => setDiscoveryPrompt('customer requested we also change out a sink')}
                className="text-[10px] font-semibold bg-white hover:bg-indigo-100/70 border border-indigo-200 text-indigo-800 px-2 py-0.5 rounded-full transition-colors cursor-pointer"
              >
                + Change Out Sink
              </button>
              <button
                type="button"
                onClick={() => setDiscoveryPrompt('Discovered corroded cast iron pipe section behind vanity; needs cast iron pipe and manifold replacement')}
                className="text-[10px] font-semibold bg-white hover:bg-indigo-100/70 border border-indigo-200 text-indigo-800 px-2 py-0.5 rounded-full transition-colors cursor-pointer"
              >
                + Cast Iron & Manifold
              </button>
              <button
                type="button"
                onClick={() => setDiscoveryPrompt('Customer requested replacing dual quarter-turn shutoff ball valves')}
                className="text-[10px] font-semibold bg-white hover:bg-indigo-100/70 border border-indigo-200 text-indigo-800 px-2 py-0.5 rounded-full transition-colors cursor-pointer"
              >
                + Shutoff Valves
              </button>
              <button
                type="button"
                onClick={() => setDiscoveryPrompt('Customer requested commode toilet replacement and reinforced wax-free gasket reset')}
                className="text-[10px] font-semibold bg-white hover:bg-indigo-100/70 border border-indigo-200 text-indigo-800 px-2 py-0.5 rounded-full transition-colors cursor-pointer"
              >
                + Toilet Replacement
              </button>
              <button
                type="button"
                onClick={() => setDiscoveryPrompt('Damaged drywall behind cabinet; requires moisture-resistant patch and rough texture prep')}
                className="text-[10px] font-semibold bg-white hover:bg-indigo-100/70 border border-indigo-200 text-indigo-800 px-2 py-0.5 rounded-full transition-colors cursor-pointer"
              >
                + Drywall Access Patch
              </button>
            </div>

            {aiGeneratedSuccess && aiReasoning && (
              <div className="text-xs bg-white/95 border border-indigo-200 rounded-xl p-3 text-indigo-950 flex items-start gap-2 shadow-2xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-black text-indigo-900">AI Scope Synthesis:</span> {aiReasoning}
                </div>
              </div>
            )}
          </div>

          {/* Reason for change */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">
              Reason for Scope Modification *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. customer requested we also change out a sink"
              value={changeReason}
              onChange={e => setChangeReason(e.target.value)}
              className="w-full text-xs font-medium border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
            />
          </div>

          {/* New / Updated Scope Description */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">
                Unified Scope of Work Description *
              </label>
              <span className="text-[11px] text-gray-400">
                Includes original tasks + new additions
              </span>
            </div>
            <textarea
              required
              rows={4}
              placeholder="Describe the comprehensive updated scope of work..."
              value={newScopeDescription}
              onChange={e => setNewScopeDescription(e.target.value)}
              className="w-full text-xs border border-gray-300 rounded-lg p-3 leading-relaxed focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium text-gray-900"
            />
          </div>

          {/* Additional Line Items for this Scope Change */}
          <div className="border border-gray-200 rounded-2xl p-4 bg-gray-50/70 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-black text-gray-800 uppercase tracking-wide flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-blue-600" />
                  Additional Scope Line Items & Sourced Materials
                </span>
                <p className="text-[11px] text-gray-500">
                  Actual physical parts, supplier pricing, and labor tasks generated for this scope modification
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => addItem('labor')}
                  className="text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1 rounded-lg transition-colors cursor-pointer"
                >
                  + Labor
                </button>
                <button
                  type="button"
                  onClick={() => addItem('material')}
                  className="text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1 rounded-lg transition-colors cursor-pointer"
                >
                  + Material
                </button>
              </div>
            </div>

            {additionalItems.length === 0 ? (
              <p className="text-xs text-gray-500 italic text-center py-4 bg-white rounded-xl border border-dashed border-gray-200">
                No additional line items added. Use the AI Scope Assistant above or click "+ Material" to add items.
              </p>
            ) : (
              <div className="space-y-2.5">
                {additionalItems.map((item) => {
                  const isMaterial = item.type === 'material' || item.type === 'equipment';

                  return (
                    <div key={item.id} className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm space-y-2">
                      {/* Line Item Main Row */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <input
                            type="text"
                            placeholder="Item description"
                            value={item.description}
                            onChange={e => updateItem(item.id, { description: e.target.value })}
                            className="w-full text-xs font-bold text-gray-800 border border-gray-300 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-blue-400"
                          />
                        </div>
                        <select
                          value={item.type}
                          onChange={e => updateItem(item.id, { type: e.target.value as any })}
                          className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 capitalize font-medium text-gray-700 shrink-0"
                        >
                          <option value="labor">Labor</option>
                          <option value="material">Material</option>
                          <option value="equipment">Equipment</option>
                          <option value="travel">Travel</option>
                        </select>
                        <div className="w-16 shrink-0">
                          <input
                            type="number"
                            min="0.25"
                            step="any"
                            placeholder="Qty"
                            value={item.quantity}
                            onChange={e => updateItem(item.id, { quantity: Math.max(0.1, parseFloat(e.target.value) || 1) })}
                            className="w-full text-xs border border-gray-300 rounded-lg px-1.5 py-1.5 text-center font-bold text-gray-800"
                            title="Quantity"
                          />
                        </div>
                        <div className="w-24 shrink-0 flex items-center gap-1 text-xs text-gray-700 bg-gray-50 border border-gray-300 rounded-lg px-2 py-1.5">
                          <span className="text-gray-400 font-bold">$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Price"
                            value={item.unitPrice}
                            onChange={e => updateItem(item.id, { unitPrice: Math.max(0, parseFloat(e.target.value) || 0) })}
                            className="w-full text-xs font-extrabold text-gray-900 bg-transparent text-right focus:outline-none"
                            title="Customer Unit Price"
                          />
                        </div>
                        <div className="text-xs font-black text-gray-900 w-20 text-right shrink-0">
                          ${(item.total || 0).toFixed(2)}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="text-gray-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 transition shrink-0 cursor-pointer"
                          title="Remove line item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Sourcing & Supplier Options Bar (Materials & Equipment) */}
                      {isMaterial && (
                        <div className="flex items-center justify-between gap-2 flex-wrap bg-slate-50 border border-slate-200/80 rounded-lg px-2.5 py-1.5 text-[11px]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-gray-500 uppercase text-[10px]">Supplier:</span>
                            <RichVendorDropdown
                              activeVendorName={item.vendorName}
                              activeBaseCost={item.baseCost || (item.unitPrice ? Math.round(item.unitPrice / 1.3 * 100) / 100 : 0)}
                              activeStockQuantity={item.stockQuantity}
                              activeProductUrl={item.vendorProductUrl}
                              alternateVendors={(item.alternateVendors as AlternateVendorItem[]) || buildAllVendorPricing(item.description, item.baseCost || 20, [], orgVendors)}
                              orgVendors={orgVendors}
                              itemDescription={item.description}
                              orgSourcingStrategy={sourcingStrategy}
                              priorityReason={item.notes?.startsWith('Selected by') ? item.notes.replace('Selected by ', '') : undefined}
                              buttonSize="sm"
                              onSelectVendor={(val) => handleModalVendorSelect(item.id, val)}
                            />

                            {/* Direct Clickable Review Link */}
                            {item.vendorProductUrl && (
                              <a
                                href={item.vendorProductUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:text-blue-900 bg-white border border-blue-200 hover:border-blue-300 px-2 py-0.5 rounded shadow-2xs hover:bg-blue-50 transition cursor-pointer"
                                title={`Review actual product spec on ${item.vendorName || 'vendor website'}`}
                              >
                                Review on {item.vendorName || 'Vendor'} <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-[10px] text-gray-500">
                            {item.baseCost !== undefined && item.baseCost > 0 && (
                              <span>
                                Wholesale: <strong className="text-gray-700">${item.baseCost.toFixed(2)}</strong> (+{item.markupPercentage || materialMarkup || 30}% markup)
                              </span>
                            )}
                            {item.notes && item.notes.startsWith('Selected by') && (
                              <span className="font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                ✨ {item.notes.replace('Selected by ', '')}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Cost Delta Summary */}
                <div className="flex items-center justify-between text-xs pt-3 border-t border-gray-200 bg-white p-3 rounded-xl">
                  <span className="text-gray-500">
                    Previous Total: <strong className="text-gray-800">${currentTotal.toFixed(2)}</strong>
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-gray-700">
                      Delta: <span className="text-blue-600 font-black">+{additionalTotal.toFixed(2)}</span>
                    </span>
                    <span className="font-bold text-gray-900 text-sm">
                      Projected Total: <span className="text-indigo-700 font-black">${projectedTotal.toFixed(2)}</span>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ═══════════ CONFIGURABLE APPROVAL POLICY & SIGN-OFF ═══════════ */}
          <div className="border border-indigo-100 bg-indigo-50/40 rounded-2xl p-4 space-y-4 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-black text-gray-800 uppercase tracking-wide">
                  Scope Approval Policy & Authorization
                </span>
              </div>
              <span className="text-[11px] font-semibold text-indigo-700">
                Customer & Dispatcher Signoff Controls
              </span>
            </div>

            {policyNotification && (
              <div className="text-xs bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-900 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>{policyNotification}</div>
              </div>
            )}

            {/* Approval Requirement Selector */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">
                Who must approve this scope modification?
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setRequiredApprovalFrom('both')}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition cursor-pointer ${
                    requiredApprovalFrom === 'both'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Both Customer & Dispatcher</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRequiredApprovalFrom('customer')}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition cursor-pointer ${
                    requiredApprovalFrom === 'customer'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <UserCheck className="w-4 h-4" />
                  <span>Customer Only</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRequiredApprovalFrom('dispatcher')}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition cursor-pointer ${
                    requiredApprovalFrom === 'dispatcher'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  <span>Dispatcher / Office Only</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRequiredApprovalFrom('none')}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition cursor-pointer ${
                    requiredApprovalFrom === 'none'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-300'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Pre-Authorized / None</span>
                </button>
              </div>
            </div>

            {/* Detailed Signoff Capture */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              
              {/* Customer Authorization Section */}
              {(requiredApprovalFrom === 'customer' || requiredApprovalFrom === 'both') && (
                <div className="bg-white p-3.5 rounded-xl border border-gray-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-800 flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                      Customer Verification
                    </span>
                    <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={customerApprovedNow}
                        onChange={e => setCustomerApprovedNow(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="font-semibold">Approved Now</span>
                    </label>
                  </div>

                  {customerApprovedNow ? (
                    <div className="space-y-2 pt-1">
                      <div>
                        <label className="block text-[11px] text-gray-500 font-medium mb-0.5">
                          Verification Channel
                        </label>
                        <select
                          value={customerApprovalMethod}
                          onChange={e => setCustomerApprovalMethod(e.target.value as any)}
                          className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 font-medium"
                        >
                          <option value="phone_verbal">Verbal Authorization (Phone/In-Person)</option>
                          <option value="on_glass">Signed on Tech Device (On-Glass)</option>
                          <option value="email">Customer Confirmed via Email</option>
                          <option value="sms_pending">SMS Approval Link (Send to Phone)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] text-gray-500 font-medium mb-0.5">
                          Authorizer / Signer Name
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. John Doe (Homeowner)"
                          value={customerApproverName}
                          onChange={e => setCustomerApproverName(e.target.value)}
                          className="w-full text-xs border border-gray-300 rounded px-2 py-1.5"
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                      Scope will be created with status <strong>Customer Approval Pending</strong>.
                    </p>
                  )}
                </div>
              )}

              {/* Dispatcher / Office Authorization Section */}
              {(requiredApprovalFrom === 'dispatcher' || requiredApprovalFrom === 'both') && (
                <div className="bg-white p-3.5 rounded-xl border border-gray-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-800 flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-purple-600" />
                      Dispatcher / Office Signoff
                    </span>
                    <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={dispatcherApprovedNow}
                        onChange={e => setDispatcherApprovedNow(e.target.checked)}
                        className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                      />
                      <span className="font-semibold">Approve Now</span>
                    </label>
                  </div>

                  {dispatcherApprovedNow ? (
                    <div className="space-y-2 pt-1">
                      <div>
                        <label className="block text-[11px] text-gray-500 font-medium mb-0.5">
                          Dispatcher / Approver Name
                        </label>
                        <input
                          type="text"
                          value={dispatcherApproverName}
                          onChange={e => setDispatcherApproverName(e.target.value)}
                          className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 font-medium"
                        />
                      </div>
                      <p className="text-[11px] text-emerald-700 bg-emerald-50 p-1.5 rounded border border-emerald-200">
                        ✓ Will be immediately recorded as Dispatcher Approved.
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                      Will be placed into the Dispatcher Approval Queue for office signoff.
                    </p>
                  )}
                </div>
              )}

            </div>
          </div>

          {/* Modal Footer */}
          <div className="pt-4 border-t border-gray-200 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving Scope Change...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Save & Apply Scope Modification
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
