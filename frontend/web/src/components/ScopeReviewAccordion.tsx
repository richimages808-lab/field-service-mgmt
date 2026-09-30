import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  Wrench,
  Package,
  Truck,
  DollarSign,
  ShieldCheck,
  Edit3,
  Plus,
  ArrowDownRight,
  UserCheck,
  History,
  Layers,
  Sparkles,
  Building2,
  Users,
  PenTool
} from 'lucide-react';
import { QuoteLineItem, QuoteStatus } from '../types';
import { ClientScopeApprovalModal } from './quotes/ClientScopeApprovalModal';

export interface ScopeVersionItem {
  id: string;
  versionNumber: number;
  label: string; // e.g. "Original Scope of Work" or "Modified Scope 1"
  isOriginal: boolean;
  scopeDescription: string;
  changeReason?: string;
  timestamp?: any;
  status: QuoteStatus | 'approved' | 'pending' | 'sent' | 'tech_review' | 'declined' | 'draft' | string;
  statusLabel?: string;
  approval?: {
    approvedBy?: string;
    approvedAt?: any;
    approvedVia?: 'on_glass' | 'sms_pending' | 'sms_approved' | 'phone_verbal' | 'email' | 'link' | string;
    signatureDataUrl?: string;
    techName?: string;
  };
  dispatcherApproval?: {
    status: 'approved' | 'pending' | 'not_required';
    approvedBy?: string;
    approvedAt?: any;
  };
  customerApproval?: {
    status: 'approved' | 'pending' | 'not_required';
    approvedBy?: string;
    approvedAt?: any;
    approvedVia?: string;
    signatureDataUrl?: string;
  };
  totals: {
    subtotal: number;
    laborTotal: number;
    materialTotal: number;
    equipmentTotal: number;
    travelTotal: number;
    taxAmount?: number;
    discount?: number;
    total: number;
  };
  lineItems: QuoteLineItem[];
  isCurrentActive?: boolean;
}

export interface ScopeReviewAccordionProps {
  originalScope: ScopeVersionItem;
  modifiedScopes: ScopeVersionItem[];
  canEditCurrent?: boolean;
  onEditCurrentScope?: () => void;
  onRecordNewScopeChange?: () => void;
  onApproveDispatcherScope?: (versionId: string) => Promise<void>;
  onApproveCustomerScope?: (versionId: string, approvalData: {
    approvedBy: string;
    approvedVia: 'on_glass' | 'phone_verbal' | 'sms_approved' | 'email';
    signatureDataUrl?: string;
    notes?: string;
    agreedToTerms: boolean;
  }) => Promise<void>;
  className?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
}

export const ScopeReviewAccordion: React.FC<ScopeReviewAccordionProps> = ({
  originalScope,
  modifiedScopes,
  canEditCurrent = true,
  onEditCurrentScope,
  onRecordNewScopeChange,
  onApproveDispatcherScope,
  onApproveCustomerScope,
  className = '',
  customerName = '',
  customerPhone = '',
  customerEmail = ''
}) => {
  // All versions combined: Original at top, then modified 1, 2, ...
  const allVersions = [originalScope, ...modifiedScopes];

  // Default state: all sections expanded if <= 2, otherwise open original and latest
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    allVersions.forEach((ver, index) => {
      // Default: Original is open, and latest version is open
      initial[ver.id] = index === 0 || index === allVersions.length - 1;
    });
    return initial;
  });

  const [approvingVersionId, setApprovingVersionId] = useState<string | null>(null);
  const [scopeToApproveCustomer, setScopeToApproveCustomer] = useState<{
    target: ScopeVersionItem;
    previous?: ScopeVersionItem;
  } | null>(null);
  const [expandedRiders, setExpandedRiders] = useState<Record<string, boolean>>({});

  const toggleSection = (id: string) => {
    setOpenSections(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    allVersions.forEach(v => {
      next[v.id] = true;
    });
    setOpenSections(next);
  };

  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    allVersions.forEach(v => {
      next[v.id] = false;
    });
    setOpenSections(next);
  };

  const formatDate = (val: any) => {
    if (!val) return '—';
    try {
      const d = val?.toDate ? val.toDate() : (typeof val === 'string' ? new Date(val) : (val instanceof Date ? val : null));
      if (!d || isNaN(d.getTime())) return '—';
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '—';
    }
  };

  const formatApprovalChannel = (via?: string) => {
    if (!via) return 'Direct';
    switch (via) {
      case 'on_glass': return 'On-Glass Signature';
      case 'sms_approved': return 'SMS Text Verification';
      case 'sms_pending': return 'SMS Pending Verification';
      case 'email': return 'Email Digital Signoff';
      case 'phone_verbal': return 'Verbal Phone Confirmation';
      case 'link': return 'Customer Web Portal';
      default: return via.replace(/_/g, ' ').toUpperCase();
    }
  };

  const handleDispatcherApprovalClick = async (versionId: string) => {
    if (!onApproveDispatcherScope) return;
    setApprovingVersionId(versionId);
    try {
      await onApproveDispatcherScope(versionId);
    } finally {
      setApprovingVersionId(null);
    }
  };

  const renderStatusBadge = (version: ScopeVersionItem) => {
    const status = version.status;
    const approval = version.approval;
    const disp = version.dispatcherApproval;
    const cust = version.customerApproval;

    // Check if either is pending
    const dispPending = disp?.status === 'pending';
    const custPending = cust?.status === 'pending' || status === 'pending' || status === 'sent';

    if (dispPending && custPending) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300 shadow-sm">
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          Awaiting Customer & Dispatcher Signoff
        </span>
      );
    }

    if (dispPending) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-900 border border-indigo-300 shadow-sm">
          <Building2 className="w-3.5 h-3.5 text-indigo-600" />
          Pending Dispatcher Signoff
        </span>
      );
    }

    if (custPending) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200 shadow-sm">
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          {approval?.approvedVia === 'sms_pending' ? 'Pending SMS Approval' : 'Awaiting Customer Approval'}
        </span>
      );
    }

    if (status === 'approved') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-sm">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          Approved
        </span>
      );
    }

    if (status === 'declined') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200 shadow-sm">
          <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
          Declined
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
        Draft
      </span>
    );
  };

  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden ${className}`}>
      {/* ── Header Bar ── */}
      <div className="bg-gradient-to-r from-slate-50 to-blue-50/40 px-4 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-600 text-white rounded-lg shadow-sm">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
                Scope of Work & Change Order History
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                {modifiedScopes.length === 0
                  ? 'Original Scope (Active)'
                  : `Original + ${modifiedScopes.length} Modified Scope${modifiedScopes.length !== 1 ? 's' : ''}`}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Track initial job scope, change orders, quote line items, and customer & dispatcher approvals
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={expandAll}
            className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-white/80 transition-colors"
          >
            Expand All
          </button>
          <span className="text-gray-300">|</span>
          <button
            type="button"
            onClick={collapseAll}
            className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-white/80 transition-colors"
          >
            Collapse All
          </button>

          {onRecordNewScopeChange && (
            <button
              type="button"
              onClick={onRecordNewScopeChange}
              className="ml-2 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg shadow-sm transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Modify Scope
            </button>
          )}
        </div>
      </div>

      {/* ── Accordion Stack: Original at top, Modified 1, 2, ... below ── */}
      <div className="divide-y divide-gray-200">
        {allVersions.map((version, idx) => {
          const isOpen = !!openSections[version.id];
          const isOriginal = version.isOriginal;
          const isCurrent = version.isCurrentActive ?? (idx === allVersions.length - 1);
          const prevVersion = idx > 0 ? allVersions[idx - 1] : undefined;
          const deltaTotal = prevVersion ? (version.totals?.total || 0) - (prevVersion.totals?.total || 0) : 0;
          const custPending = version.customerApproval?.status === 'pending' || version.status === 'pending' || version.status === 'sent';

          return (
            <div
              key={version.id}
              className={`transition-colors ${
                isCurrent ? 'bg-white' : isOriginal ? 'bg-slate-50/50' : 'bg-gray-50/30'
              }`}
            >
              {/* Accordion Row Header */}
              <div
                onClick={() => toggleSection(version.id)}
                className={`w-full px-4 py-3.5 flex items-center justify-between cursor-pointer select-none transition-colors ${
                  isCurrent
                    ? 'hover:bg-blue-50/30 border-l-4 border-l-blue-600'
                    : isOriginal
                    ? 'hover:bg-slate-100/70 border-l-4 border-l-slate-400'
                    : 'hover:bg-indigo-50/40 border-l-4 border-l-indigo-400'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-gray-400 hover:text-gray-600 transition-transform duration-200">
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-blue-600" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-500" />
                    )}
                  </span>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-gray-900">
                        {version.label}
                      </span>

                      {/* Tag badges */}
                      {isOriginal ? (
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-slate-200 text-slate-700 border border-slate-300">
                          Initial Baseline
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-indigo-100 text-indigo-700 border border-indigo-200">
                          Scope Change #{version.versionNumber - 1}
                        </span>
                      )}

                      {isCurrent && (
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs">
                          Current Active Scope
                        </span>
                      )}

                      {renderStatusBadge(version)}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                      <span>Created: {formatDate(version.timestamp)}</span>
                      {version.approval?.approvedAt && (
                        <>
                          <span>•</span>
                          <span className="text-emerald-700 font-medium">
                            Approved: {formatDate(version.approval.approvedAt)}
                          </span>
                        </>
                      )}
                      {version.changeReason && (
                        <>
                          <span>•</span>
                          <span className="text-gray-700 italic">
                            Reason: "{version.changeReason}"
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right side: Totals + Pricing Delta Badge */}
                <div className="flex items-center gap-3">
                  {idx > 0 && deltaTotal !== 0 && (
                    <div className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-black ${
                      deltaTotal > 0 ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {deltaTotal > 0 ? `+${deltaTotal.toFixed(2)}` : deltaTotal.toFixed(2)}
                    </div>
                  )}
                  <div className="text-right">
                    <div className="text-[10px] text-gray-400 uppercase font-semibold">Quote Total</div>
                    <div className="text-base font-extrabold text-gray-900">
                      ${(version.totals?.total || 0).toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Accordion Body Content */}
              {isOpen && (
                <div className="px-5 pb-5 pt-1 space-y-4 bg-white/80 border-t border-gray-100">
                  {/* 1. Scope Description */}
                  <div className="bg-slate-50/70 border border-slate-200 rounded-lg p-3.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-blue-600" />
                        {isOriginal ? 'Original Scope Description' : 'Modified Scope Description'}
                      </span>
                      {isCurrent && canEditCurrent && onEditCurrentScope && (
                        <button
                          type="button"
                          onClick={onEditCurrentScope}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1"
                        >
                          <Edit3 className="w-3 h-3" />
                          Edit Scope
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">
                      {version.scopeDescription || 'No detailed scope description provided.'}
                    </p>

                    {version.changeReason && !isOriginal && (
                      <div className="mt-2 pt-2 border-t border-slate-200/80 text-xs text-amber-900 flex items-start gap-1.5">
                        <ArrowDownRight className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                        <div>
                          <strong className="font-semibold text-amber-950">Reason for Modification:</strong>{' '}
                          {version.changeReason}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 2. Breakdown Metrics Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="bg-blue-50/70 border border-blue-100 rounded-lg p-2 text-center">
                      <div className="flex items-center justify-center gap-1 text-[11px] font-medium text-blue-700">
                        <Wrench className="w-3.5 h-3.5" /> Labor
                      </div>
                      <div className="text-sm font-bold text-blue-900 mt-0.5">
                        ${(version.totals.laborTotal || 0).toFixed(2)}
                      </div>
                    </div>

                    <div className="bg-emerald-50/70 border border-emerald-100 rounded-lg p-2 text-center">
                      <div className="flex items-center justify-center gap-1 text-[11px] font-medium text-emerald-700">
                        <Package className="w-3.5 h-3.5" /> Materials
                      </div>
                      <div className="text-sm font-bold text-emerald-900 mt-0.5">
                        ${(version.totals.materialTotal || 0).toFixed(2)}
                      </div>
                    </div>

                    <div className="bg-purple-50/70 border border-purple-100 rounded-lg p-2 text-center">
                      <div className="flex items-center justify-center gap-1 text-[11px] font-medium text-purple-700">
                        <DollarSign className="w-3.5 h-3.5" /> Equipment
                      </div>
                      <div className="text-sm font-bold text-purple-900 mt-0.5">
                        ${(version.totals.equipmentTotal || 0).toFixed(2)}
                      </div>
                    </div>

                    <div className="bg-amber-50/70 border border-amber-100 rounded-lg p-2 text-center">
                      <div className="flex items-center justify-center gap-1 text-[11px] font-medium text-amber-700">
                        <Truck className="w-3.5 h-3.5" /> Travel
                      </div>
                      <div className="text-sm font-bold text-amber-900 mt-0.5">
                        ${(version.totals.travelTotal || 0).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* 3. Quote Line Items Table with Diff Indicators */}
                  {version.lineItems && version.lineItems.length > 0 && (
                    <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-3 py-1.5 border-b border-gray-200 flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                          {isOriginal ? 'Original Quote Line Items' : 'Modified Quote Line Items & Scope Diff'}
                        </span>
                        <span className="text-[11px] text-gray-500 font-medium">
                          {version.lineItems.length} item{version.lineItems.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-gray-50/60 text-gray-500 border-b border-gray-100">
                            <tr>
                              <th className="px-3 py-2 font-semibold">Item & Type</th>
                              <th className="px-3 py-2 font-semibold text-center">Qty</th>
                              <th className="px-3 py-2 font-semibold text-right">Unit Price</th>
                              <th className="px-3 py-2 font-semibold text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 text-gray-700">
                            {version.lineItems.map((item, itemIdx) => {
                              const prevMatch = prevVersion?.lineItems?.find(
                                p => (p.id && p.id === item.id) || p.description.trim().toLowerCase() === item.description.trim().toLowerCase()
                              );
                              const isNewItem = prevVersion && !prevMatch;
                              const isAdjustedItem = prevVersion && prevMatch && (prevMatch.quantity !== item.quantity || prevMatch.unitPrice !== item.unitPrice);

                              return (
                                <tr key={item.id || itemIdx} className={`hover:bg-slate-50/50 ${isNewItem ? 'bg-emerald-50/30' : ''}`}>
                                  <td className="px-3 py-2">
                                    <div className="font-medium text-gray-900 flex items-center flex-wrap gap-1">
                                      <span>{item.description}</span>
                                      {isNewItem && (
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                                          + New Scope Item
                                        </span>
                                      )}
                                      {isAdjustedItem && (
                                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                          Adjusted (was {prevMatch.quantity} × ${(prevMatch.unitPrice || 0).toFixed(2)})
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[10px] text-gray-400 capitalize">{item.type}</div>
                                  </td>
                                  <td className="px-3 py-2 text-center text-gray-600">
                                    {item.quantity}
                                  </td>
                                  <td className="px-3 py-2 text-right text-gray-600">
                                    ${(item.unitPrice || 0).toFixed(2)}
                                  </td>
                                  <td className="px-3 py-2 text-right font-semibold text-gray-900">
                                    ${(item.total || 0).toFixed(2)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot className="bg-gray-50 font-semibold text-gray-900 border-t border-gray-200">
                            <tr>
                              <td colSpan={3} className="px-3 py-2 text-right">
                                Subtotal:
                              </td>
                              <td className="px-3 py-2 text-right">
                                ${(version.totals.subtotal || 0).toFixed(2)}
                              </td>
                            </tr>
                            {typeof version.totals.taxAmount === 'number' && version.totals.taxAmount > 0 && (
                              <tr className="text-gray-600 font-normal">
                                <td colSpan={3} className="px-3 py-1 text-right">
                                  Tax:
                                </td>
                                <td className="px-3 py-1 text-right font-semibold text-gray-900">
                                  ${version.totals.taxAmount.toFixed(2)}
                                </td>
                              </tr>
                            )}
                            <tr className="text-sm font-bold text-gray-900 bg-gray-100/70">
                              <td colSpan={3} className="px-3 py-2 text-right">
                                Total:
                              </td>
                              <td className="px-3 py-2 text-right text-blue-900 font-extrabold">
                                ${(version.totals.total || 0).toFixed(2)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* 4. Multi-Party Approval & Verification Audit Card */}
                  <div className="mt-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wide">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        Approval & Verification Tracking
                      </div>
                      <div>
                        {renderStatusBadge(version)}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700">
                      {/* Customer Approval Detail */}
                      <div className="bg-white rounded-lg p-2.5 border border-slate-200/80 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-slate-900 flex items-center gap-1">
                              <UserCheck className="w-3.5 h-3.5 text-blue-600" /> Customer Authorization
                            </span>
                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                              version.status === 'approved' || version.customerApproval?.status === 'approved'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {version.status === 'approved' || version.customerApproval?.status === 'approved' ? 'Approved' : 'Pending Signoff'}
                            </span>
                          </div>
                          <div className="space-y-0.5 text-[11px]">
                            <div>
                              <span className="text-slate-400">Signer:</span>{' '}
                              <strong>{version.customerApproval?.approvedBy || version.approval?.approvedBy || (version.status === 'approved' ? 'Customer on file' : 'Awaiting signoff')}</strong>
                            </div>
                            <div>
                              <span className="text-slate-400">Method:</span>{' '}
                              <span>{formatApprovalChannel(version.customerApproval?.approvedVia || version.approval?.approvedVia)}</span>
                            </div>
                            <div>
                              <span className="text-slate-400">Timestamp:</span>{' '}
                              <span>{formatDate(version.customerApproval?.approvedAt || version.approval?.approvedAt || version.timestamp)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Customer Approval Action Button */}
                        {(!version.customerApproval || version.customerApproval.status === 'pending') && version.status !== 'approved' && onApproveCustomerScope && (
                          <div className="pt-2 mt-2 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setScopeToApproveCustomer({
                                  target: version,
                                  previous: prevVersion
                                });
                              }}
                              className="w-full text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 py-1.5 px-2.5 rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5"
                            >
                              <PenTool className="w-3.5 h-3.5" />
                              <span>Record Client Scope Approval</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Dispatcher Approval Detail */}
                      <div className="bg-white rounded-lg p-2.5 border border-slate-200/80 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-slate-900 flex items-center gap-1">
                              <Building2 className="w-3.5 h-3.5 text-indigo-600" /> Dispatcher / Office
                            </span>
                            <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                              version.dispatcherApproval?.status === 'pending'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-indigo-100 text-indigo-800'
                            }`}>
                              {version.dispatcherApproval?.status === 'pending' ? 'Pending Review' : 'Authorized'}
                            </span>
                          </div>
                          <div className="space-y-0.5 text-[11px]">
                            <div>
                              <span className="text-slate-400">Authorizer:</span>{' '}
                              <strong>{version.dispatcherApproval?.approvedBy || version.approval?.techName || 'Office Staff'}</strong>
                            </div>
                            <div>
                              <span className="text-slate-400">Status:</span>{' '}
                              <span>{version.dispatcherApproval?.status === 'pending' ? 'Requires Office Signoff' : 'Approved internally'}</span>
                            </div>
                          </div>
                        </div>

                        {version.dispatcherApproval?.status === 'pending' && onApproveDispatcherScope && (
                          <div className="pt-2 mt-2 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => handleDispatcherApprovalClick(version.id)}
                              disabled={approvingVersionId === version.id}
                              className="w-full text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 py-1.5 px-2 rounded shadow-xs transition-colors flex items-center justify-center gap-1"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              {approvingVersionId === version.id ? 'Approving...' : 'Approve as Dispatcher'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Signature Preview if on-glass signature was captured */}
                    {(version.approval?.signatureDataUrl || version.customerApproval?.signatureDataUrl) && (
                      <div className="mt-2 pt-2 border-t border-slate-200 flex items-center gap-3">
                        <div className="text-[11px] text-slate-500">Digital Signature:</div>
                        <div className="bg-white border border-gray-300 rounded p-1 inline-block">
                          <img
                            src={version.approval?.signatureDataUrl || version.customerApproval?.signatureDataUrl}
                            alt="Customer Signature"
                            className="h-8 max-w-[150px] object-contain"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 5. Contract Adjustments & Change Order Legal Rider Drawer */}
                  <div className="mt-3 border border-slate-200 rounded-xl overflow-hidden bg-slate-50/70">
                    <button
                      type="button"
                      onClick={() => setExpandedRiders(prev => ({ ...prev, [version.id]: !prev[version.id] }))}
                      className="w-full px-3.5 py-2 flex items-center justify-between text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-blue-600" />
                        <span>Contract Adjustments & Scope Change Rider</span>
                      </div>
                      {expandedRiders[version.id] ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                    </button>
                    {expandedRiders[version.id] && (
                      <div className="p-3 bg-white border-t border-slate-200 text-[11px] text-slate-600 space-y-2 leading-relaxed">
                        <div>
                          <strong className="text-slate-900 block font-semibold">1. Unforeseen & Concealed Jobsite Conditions</strong>
                          Any concealed piping, structural, wiring, or environmental conditions encountered that were not observable during initial inspection constitute necessary work and are authorized under this change order.
                        </div>
                        <div>
                          <strong className="text-slate-900 block font-semibold">2. Price Adjustment & Payment Terms</strong>
                          Total revised scope sum is updated to ${(version.totals?.total || 0).toFixed(2)}. Additional materials, specialized equipment, and labor hours are billed per this change order schedule.
                        </div>
                        <div>
                          <strong className="text-slate-900 block font-semibold">3. Standard Trade Warranty</strong>
                          All modified scope materials are backed by original manufacturer warranties and our standard trade workmanship guarantee.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Client Scope Approval Modal */}
      {scopeToApproveCustomer && (
        <ClientScopeApprovalModal
          isOpen={!!scopeToApproveCustomer}
          onClose={() => setScopeToApproveCustomer(null)}
          scopeVersion={scopeToApproveCustomer.target}
          previousVersion={scopeToApproveCustomer.previous}
          customerName={customerName}
          customerPhone={customerPhone}
          customerEmail={customerEmail}
          onConfirmApproval={async (data) => {
            if (onApproveCustomerScope) {
              await onApproveCustomerScope(scopeToApproveCustomer.target.id, data);
            }
          }}
        />
      )}
    </div>
  );
};
