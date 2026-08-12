import React, { useState, useEffect, useCallback } from 'react';
import { db, functions } from '../firebase';
import { doc, getDoc, updateDoc, serverTimestamp, collection, addDoc, setDoc, deleteField, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../auth/AuthProvider';
import toast from 'react-hot-toast';
import {
  Sparkles, Bot, Wrench, Package, Truck, Clock, Shield,
  AlertTriangle, ChevronDown, ChevronUp, Edit3, Save, Send,
  DollarSign, Loader2, CheckCircle2, Trash2, Plus, Info,
  Briefcase, FileText, BarChart3, Zap, Target, Lightbulb,
  X, RefreshCw, Phone, Mail, MessageSquare, User, PhoneCall,
  ExternalLink, Search, Store, MapPin
} from 'lucide-react';
import { PortalTicket, QuoteLineItem } from '../types';
import { CustomerPhotoStrip } from './CustomerPhotoStrip';
import { MaterialLookupModal, SelectedMaterialResult } from './inventory/MaterialLookupModal';
import { sanitizeForFirestore } from '../lib/aiQuoteGenerator';
import { getCanonicalMaterialKey } from '../lib/materialUtils';
import { getVendorStockDetails, isLocalVendor } from '../utils/vendorStock';
import { RichVendorDropdown } from './RichVendorDropdown';

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

function extractStateOrArea(address: string): string | null {
  if (!address) return null;
  const upperAddress = address.toUpperCase();
  
  // Look for standard 2-letter state abbreviations at the end before zip
  const stateRegex = /\b([A-Z]{2})\b\s+\d{5}(-\d{4})?$/;
  const match = address.match(stateRegex);
  if (match) return match[1].toUpperCase();

  // Check full state names
  const states = [
    'ALABAMA','ALASKA','ARIZONA','ARKANSAS','CALIFORNIA','COLORADO','CONNECTICUT','DELAWARE','FLORIDA','GEORGIA',
    'HAWAII','IDAHO','ILLINOIS','INDIANA','IOWA','KANSAS','KENTUCKY','LOUISIANA','MAINE','MARYLAND',
    'MASSACHUSETTS','MICHIGAN','MINNESOTA','MISSISSIPPI','MISSOURI','MONTANA','NEBRASKA','NEVADA',
    'NEW HAMPSHIRE','NEW JERSEY','NEW MEXICO','NEW YORK','NORTH CAROLINA','NORTH DAKOTA','OHIO','OKLAHOMA',
    'OREGON','PENNSYLVANIA','RHODE ISLAND','SOUTH CAROLINA','SOUTH DAKOTA','TENNESSEE','TEXAS','UTAH',
    'VERMONT','VIRGINIA','WASHINGTON','WEST VIRGINIA','WISCONSIN','WYOMING'
  ];
  
  for (const state of states) {
    if (upperAddress.includes(state)) {
      return state;
    }
  }
  
  // Check general state abbreviation surrounded by word boundaries
  const stateAbbrs = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
    'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
    'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
  ];
  for (const abbr of stateAbbrs) {
    const regex = new RegExp(`\\b${abbr}\\b`);
    if (regex.test(upperAddress)) {
      return abbr;
    }
  }

  return null;
}

export const InlineAIQuotePanel: React.FC<InlineAIQuotePanelProps> = ({
  ticket,
  job,
  onQuoteSent,
  onNavigateToQuote
}) => {
  const { user, organization } = useAuth();
  const [loading, setLoading] = useState(true);
  const [aiRec, setAiRec] = useState<AIRecommendation | null>(null);
  const [quoteData, setQuoteData] = useState<any>(null);
  const [lineItems, setLineItems] = useState<EditableLineItem[]>([]);
  const [scopeOfWork, setScopeOfWork] = useState('');
  const [editingScope, setEditingScope] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingRevision, setGeneratingRevision] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [jobData, setJobData] = useState<any>(null);
  const [editingAi, setEditingAi] = useState(false);
  const [editableAiRec, setEditableAiRec] = useState<AIRecommendation | null>(null);
  const [showSendOptions, setShowSendOptions] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  // Editable customer details
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');

  // Quote Display Settings State
  const [presentationMode, setPresentationMode] = useState<'detailed' | 'category_rollup' | 'single_price'>('detailed');
  const [displayTax, setDisplayTax] = useState(true);
  const [taxRate, setTaxRate] = useState<number>(0);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('fixed');
  const [discountValue, setDiscountValue] = useState(0);
  const [discountReason, setDiscountReason] = useState('');
  const [taxSourceInfo, setTaxSourceInfo] = useState<{ source: string; justification?: string; taxRate?: number; taxName?: string; } | null>(null);
  const [loadingTaxLookup, setLoadingTaxLookup] = useState(false);

  // Deposit override — allows tech to waive deposit requirement for this quote
  const [noDepositOverride, setNoDepositOverride] = useState(false);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);

  // Material Lookup Modal State
  const [isLookupModalOpen, setIsLookupModalOpen] = useState(false);
  const [lookupSearchTerm, setLookupSearchTerm] = useState('');
  const [orgVendors, setOrgVendors] = useState<{ id: string; name: string; website?: string }[]>([]);

  const triggerTaxLookup = useCallback(async (address: string) => {
    if (!address?.trim()) return;
    setLoadingTaxLookup(true);
    try {
      const lookupLocationTaxRateFn = httpsCallable(functions, 'lookupLocationTaxRate');
      const res = await lookupLocationTaxRateFn({
        address,
        orgId: user?.org_id || 'demo-org'
      });
      const data = res.data as any;
      if (data && data.taxRate !== undefined) {
        setTaxRate(data.taxRate);
        setTaxSourceInfo({
          source: data.source,
          justification: data.justification,
          taxRate: data.taxRate,
          taxName: data.taxName
        });
      }
    } catch (err) {
      console.error('Failed to lookup tax rate for location:', err);
    } finally {
      setLoadingTaxLookup(false);
    }
  }, [user?.org_id]);

  useEffect(() => {
    if (!user) return;
    const orgId = user.org_id || 'demo-org';
    const fetchVendors = async () => {
      try {
        const q = query(collection(db, 'vendors'), where('organizationId', '==', orgId));
        const snap = await getDocs(q);
        const list = snap.docs.map(doc => ({ id: doc.id, name: doc.data().name, website: doc.data().website }));
        list.sort((a, b) => a.name.localeCompare(b.name));
        setOrgVendors(list);
      } catch (err) {
        console.warn('Error fetching vendors in panel:', err);
      }
    };
    fetchVendors();
  }, [user]);

  const handleVendorSelectForLineItem = (itemId: string, value: string) => {
    const item = lineItems.find(li => li.id === itemId);
    if (!item) return;

    if (value === 'SEARCH_CATALOG') {
      setLookupSearchTerm(item.description);
      setIsLookupModalOpen(true);
      return;
    }

    if (value.startsWith('SEARCH:')) {
      const vendorName = value.replace('SEARCH:', '');
      const vendorObj = orgVendors.find(v => v.name === vendorName);
      toast(`Searching ${vendorName} for pricing...`);
      (async () => {
        try {
          const searchVendorCatalogFn = httpsCallable(functions, 'searchVendorCatalog');
          const res: any = await searchVendorCatalogFn({
            vendorName: vendorName,
            website: vendorObj?.website || '',
            searchTerm: item.description,
          });
          const products = res.data?.products || [];
          if (products.length > 0) {
            const first = products[0];
            const rawPrice = typeof first.price === 'number' ? first.price : parseFloat(String(first.price).replace(/[^0-9.]/g, '')) || 0;
            if (rawPrice > 0) {
              const markup = item.markupPercentage || organization?.settings?.materialMarkup || 30;
              const newPrice = Math.round(rawPrice * (1 + markup / 100) * 100) / 100;
              const updatedAlternates = (item.alternateVendors || [])
                .filter(v => v.vendorName !== vendorName);
              if (item.vendorName && item.baseCost > 0) {
                updatedAlternates.push({
                  vendorId: item.vendorName,
                  vendorName: item.vendorName,
                  unitCost: item.baseCost,
                  vendorProductUrl: item.vendorProductUrl,
                });
              }
              setLineItems(prev => prev.map(li => {
                if (li.id !== itemId) return li;
                return {
                  ...li,
                  baseCost: rawPrice,
                  unitPrice: newPrice,
                  total: newPrice * li.quantity,
                  vendorName,
                  vendorProductUrl: first.url || item.vendorProductUrl,
                  priceSource: 'vendor' as const,
                  alternateVendors: updatedAlternates.length > 0 ? updatedAlternates : undefined,
                };
              }));
              toast.success(`Found price at ${vendorName}: $${rawPrice.toFixed(2)}`);
              return;
            }
          }
          toast.error(`No price found for ${item.description} at ${vendorName}`);
        } catch (err) {
          console.error('Failed to search vendor catalog:', err);
          toast.error(`Failed to search ${vendorName}`);
        }
      })();
      return;
    }

    if (value.startsWith('ALT:')) {
      const key = value.replace('ALT:', '');
      const altMatch = (item.alternateVendors || []).find(v => v.vendorId === key || v.vendorName === key);
      if (altMatch) {
        const markup = item.markupPercentage || organization?.settings?.materialMarkup || 30;
        const newPrice = Math.round(altMatch.unitCost * (1 + markup / 100) * 100) / 100;

        const updatedAlternates = (item.alternateVendors || [])
          .filter(v => v.vendorId !== altMatch.vendorId && v.vendorName !== altMatch.vendorName);
        if (item.vendorName && item.baseCost > 0) {
          updatedAlternates.push({
            vendorId: item.vendorName,
            vendorName: item.vendorName,
            unitCost: item.baseCost,
            vendorProductUrl: item.vendorProductUrl,
          });
        }

        setLineItems(prev => prev.map(li => {
          if (li.id !== itemId) return li;
          return {
            ...li,
            baseCost: altMatch.unitCost,
            unitPrice: newPrice,
            total: newPrice * li.quantity,
            vendorName: altMatch.vendorName,
            vendorProductUrl: altMatch.vendorProductUrl || li.vendorProductUrl,
            priceSource: 'vendor' as const,
            alternateVendors: updatedAlternates.length > 0 ? updatedAlternates : undefined,
          };
        }));
      }
      return;
    }

    const altMatch = (item.alternateVendors || []).find(v => v.vendorName === value);
    if (altMatch) {
      const markup = item.markupPercentage || organization?.settings?.materialMarkup || 30;
      const newPrice = Math.round(altMatch.unitCost * (1 + markup / 100) * 100) / 100;

      const updatedAlternates = (item.alternateVendors || [])
        .filter(v => v.vendorId !== altMatch.vendorId && v.vendorName !== altMatch.vendorName);
      if (item.vendorName && item.baseCost > 0) {
        updatedAlternates.push({
          vendorId: item.vendorName,
          vendorName: item.vendorName,
          unitCost: item.baseCost,
          vendorProductUrl: item.vendorProductUrl,
        });
      }

      setLineItems(prev => prev.map(li => {
        if (li.id !== itemId) return li;
        return {
          ...li,
          baseCost: altMatch.unitCost,
          unitPrice: newPrice,
          total: newPrice * li.quantity,
          vendorName: altMatch.vendorName,
          vendorProductUrl: altMatch.vendorProductUrl || li.vendorProductUrl,
          priceSource: 'vendor' as const,
          alternateVendors: updatedAlternates.length > 0 ? updatedAlternates : undefined,
        };
      }));
    } else {
      setLineItems(prev => prev.map(li => li.id === itemId ? { ...li, vendorName: value } : li));
    }
  };

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
          // Initialize editable customer fields from job data
          setCustomerName(j.customer?.name || ticket?.requestorName || '');
          setCustomerPhone(j.customer?.phone || ticket?.requestorPhone || '');
          setCustomerEmail(j.customer?.email || ticket?.requestorEmail || '');
          setCustomerAddress(j.customer?.address || ticket?.address || '');
          if (j.aiRecommendation) {
            setAiRec(j.aiRecommendation);
            setEditableAiRec(j.aiRecommendation);
          }
        }
      }

      // Fetch quote with line items
      if (targetQuoteId) {
        let quoteSnap = await getDoc(doc(db, 'quotes', targetQuoteId));
        if (quoteSnap.exists()) {
          let q = quoteSnap.data();

          // Auto-generate missing AI revision proposal if in tech_review
          if (q.status === 'tech_review' && !q.aiRevisionProposal) {
            console.log('AI revision proposal missing for tech_review quote. Auto-generating...');
            try {
              const generateAIQuoteRevisionFn = httpsCallable(functions, 'generateAIQuoteRevision');
              await generateAIQuoteRevisionFn({ quoteId: targetQuoteId });
              // Fetch the updated quote snap
              quoteSnap = await getDoc(doc(db, 'quotes', targetQuoteId));
              if (quoteSnap.exists()) {
                q = quoteSnap.data();
              }
            } catch (revErr) {
              console.error('Failed to auto-generate missing AI revision proposal:', revErr);
            }
          }

          setQuoteData({ id: quoteSnap.id, ...q });
          const isRevision = q.status === 'tech_review' && q.aiRevisionProposal;
          const itemsToLoad = isRevision ? q.aiRevisionProposal.lineItems : q.lineItems;
          const scopeToLoad = isRevision ? q.aiRevisionProposal.scopeOfWork : q.scopeOfWork;
          
          const rawItems = (itemsToLoad || []).map((li: any) => ({ ...li, _editing: false }));
          
          // Consolidate duplicate or synonym material line items by canonical key
          const consolidatedItems: any[] = [];
          const materialKeyMap = new Map<string, any>();

          for (const item of rawItems) {
            if (item.type !== 'material' || !item.description) {
              consolidatedItems.push(item);
              continue;
            }

            // Decompose generic bundled consumable strings if present
            const descLower = item.description.toLowerCase();
            if (descLower.includes('miscellaneous service consumables') || descLower.includes('consumables (sealants') || descLower === 'miscellaneous consumables') {
              const defaultMarkup = item.markupPercentage || organization?.settings?.materialMarkup || 30;
              const subItems = [
                { desc: 'Pipe Sealant Tape', cost: 0.83, vendor: 'Home Depot' },
                { desc: "Plumber's Putty (14 oz)", cost: 1.47, vendor: 'Home Depot' },
                { desc: 'Toilet Wax Ring & Closet Bolts', cost: 3.51, vendor: 'Home Depot' },
              ];
              for (const sub of subItems) {
                const p = Math.round(sub.cost * (1 + defaultMarkup / 100) * 100) / 100;
                const subItem = {
                  id: `decomp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                  type: 'material',
                  description: sub.desc,
                  quantity: 1,
                  unit: 'each',
                  baseCost: sub.cost,
                  markupPercentage: defaultMarkup,
                  unitPrice: p,
                  total: p,
                  taxable: true,
                  isOptional: false,
                  priceSource: 'vendor',
                  vendorName: sub.vendor,
                };
                const subKey = getCanonicalMaterialKey(sub.desc);
                materialKeyMap.set(subKey, subItem);
                consolidatedItems.push(subItem);
              }
              continue;
            }

            const cKey = getCanonicalMaterialKey(item.description);
            if (!cKey) {
              consolidatedItems.push(item);
              continue;
            }

            if (materialKeyMap.has(cKey)) {
              const existing = materialKeyMap.get(cKey);
              existing.quantity = Math.max(Number(existing.quantity) || 1, Number(item.quantity) || 1);
              existing.total = Math.round(existing.unitPrice * existing.quantity * 100) / 100;
              
              // Merge alternateVendors
              const existingAlts = existing.alternateVendors || [];
              const newAlts = item.alternateVendors || [];
              const altMap = new Map<string, any>();
              for (const a of [...existingAlts, ...newAlts]) {
                if (a && a.vendorName) {
                  altMap.set(a.vendorName.toLowerCase(), a);
                }
              }
              if (item.vendorName && item.baseCost > 0 && item.vendorName !== existing.vendorName) {
                altMap.set(item.vendorName.toLowerCase(), {
                  vendorId: item.vendorName,
                  vendorName: item.vendorName,
                  unitCost: item.baseCost,
                  vendorProductUrl: item.vendorProductUrl
                });
              }
              existing.alternateVendors = Array.from(altMap.values()).filter(a => a.vendorName !== existing.vendorName);
            } else {
              materialKeyMap.set(cKey, item);
              consolidatedItems.push(item);
            }
          }

          setLineItems(consolidatedItems);

          // Auto pre-fetch prices for unsearched org vendors in the background
          if (orgVendors && orgVendors.length > 0) {
            (async () => {
              for (const item of rawItems) {
                if (item.type !== 'material' || !item.description) continue;
                const unsearched = orgVendors.filter(ov =>
                  ov.name !== item.vendorName &&
                  !(item.alternateVendors || []).some((av: any) => av.vendorName === ov.name)
                );
                for (const ov of unsearched) {
                  try {
                    const searchVendorCatalogFn = httpsCallable(functions, 'searchVendorCatalog');
                    const res: any = await searchVendorCatalogFn({
                      vendorName: ov.name,
                      website: ov.website || '',
                      searchTerm: item.description,
                    });
                    const products = res.data?.products || [];
                    if (products.length > 0) {
                      const first = products[0];
                      const rawPrice = typeof first.price === 'number' ? first.price : parseFloat(String(first.price).replace(/[^0-9.]/g, '')) || 0;
                      if (rawPrice > 0) {
                        setLineItems(prev => prev.map(li => {
                          if (li.id !== item.id) return li;
                          const existingAlts = li.alternateVendors || [];
                          if (existingAlts.some((a: any) => a.vendorName === ov.name)) return li;
                          return {
                            ...li,
                            alternateVendors: [
                              ...existingAlts,
                              {
                                vendorId: ov.name,
                                vendorName: ov.name,
                                unitCost: rawPrice,
                                vendorProductUrl: first.url,
                              }
                            ]
                          };
                        }));
                      }
                    }
                  } catch (e) {
                    // silent fail background fetch
                  }
                }
              }
            })();
          }

          setScopeOfWork(scopeToLoad || '');
          setPresentationMode(q.presentationMode || 'detailed');
          setDisplayTax(q.displayTax !== false);
          setDiscountType(q.discountType || 'fixed');
          setDiscountValue(q.discountValue || 0);
          setDiscountReason(q.discountReason || '');
          
          if (q.taxRate !== undefined) {
            setTaxRate(q.taxRate);
            if (q.taxSourceInfo) {
              setTaxSourceInfo(q.taxSourceInfo);
            }
          } else {
            const addr = q.customer?.address || ticket?.address || job?.customer?.address || '';
            if (addr) {
              await triggerTaxLookup(addr);
            } else {
              setTaxRate(0);
            }
          }
        }
      } else {
        const addr = ticket?.address || job?.customer?.address || '';
        if (addr) {
          await triggerTaxLookup(addr);
        } else {
          setTaxRate(0);
        }
      }
    } catch (err) {
      console.error('Error loading AI panel data:', err);
    } finally {
      setLoading(false);
    }
  }, [ticket?.autoJobId, ticket?.autoQuoteId, job?.id, job?.active_quote_id, user?.org_id, ticket?.address, job?.customer?.address, triggerTaxLookup]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ──── Generate AI Quote Revision (manual regeneration) ────
  const handleGenerateRevision = async (customerRequestOverride?: string) => {
    const targetQuoteId = ticket?.autoQuoteId || job?.active_quote_id || quoteData?.id;
    if (!targetQuoteId) return;

    setGeneratingRevision(true);
    try {
      const generateAIQuoteRevisionFn = httpsCallable(functions, 'generateAIQuoteRevision');
      const res = await generateAIQuoteRevisionFn({
        quoteId: targetQuoteId,
        customerRequest: customerRequestOverride || ''
      });
      const data = res.data as any;
      if (data && data.success) {
        toast.success('AI Revision Proposal generated!');
        await loadData();
      } else {
        toast.error('Failed to generate AI revision proposal');
      }
    } catch (err) {
      console.error('Error generating AI quote revision:', err);
      toast.error('Error generating AI quote revision');
    } finally {
      setGeneratingRevision(false);
    }
  };

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
            photos: ticket.photoUrls || [],
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

        const jobRef = await addDoc(collection(db, 'jobs'), sanitizeForFirestore(jobDataPayload));
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
        await updateDoc(doc(db, 'tickets', ticket.id), sanitizeForFirestore({
          autoJobId: jobRefId,
          autoQuoteId: quoteId,
          status: 'PENDING'
        }));

        // Get the quote total
        const quoteDoc = await getDoc(doc(db, 'quotes', quoteId));
        if (quoteDoc.exists()) {
          await updateDoc(doc(db, 'tickets', ticket.id), sanitizeForFirestore({
            autoQuoteTotal: quoteDoc.data().total || 0
          }));
        }
        ticket.autoJobId = jobRefId;
        ticket.autoQuoteId = quoteId;
      }

      // If we only have job, update job with active quote
      if (job && !ticket) {
        await updateDoc(doc(db, 'jobs', job.id), sanitizeForFirestore({
          active_quote_id: quoteId,
          status: 'quote_pending'
        }));
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
        await updateDoc(doc(db, 'jobs', targetJobId), sanitizeForFirestore({
          aiRecommendation: editableAiRec
        }));
        setAiRec(editableAiRec);
        setEditingAi(false);
      }

      // Save customer details if edited
      if (targetJobId) {
        const updatedCustomer = {
          name: customerName || 'Unknown',
          phone: customerPhone || '',
          email: customerEmail || '',
          address: customerAddress || ''
        };
        await updateDoc(doc(db, 'jobs', targetJobId), sanitizeForFirestore({ customer: updatedCustomer }));
        setJobData((prev: any) => ({ ...prev, customer: updatedCustomer }));
        setEditingCustomer(false);

        // Trigger tax lookup if address changed
        if (customerAddress && customerAddress !== jobData?.customer?.address) {
          await triggerTaxLookup(customerAddress);
        }

        // Also update ticket if present
        if (ticket) {
          await updateDoc(doc(db, 'tickets', ticket.id), sanitizeForFirestore({
            requestorName: customerName,
            requestorPhone: customerPhone,
            requestorEmail: customerEmail,
            address: customerAddress
          }));
        }
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
      const taxAmount = displayTax ? Math.round(taxableAmount * (taxRate / 100) * 100) / 100 : 0;
      
      const total = Math.round((discountedSubtotal + taxAmount) * 100) / 100;

      const isRevision = quoteData?.status === 'tech_review';
      const updatePayload: any = {
        lineItems: cleanItems,
        scopeOfWork,
        subtotal,
        taxRate,
        taxAmount,
        discount: discountAmount,
        discountType,
        discountValue,
        discountReason,
        presentationMode,
        displayTax,
        taxSourceInfo: taxSourceInfo || null,
        total,
        updatedAt: serverTimestamp()
      };

      if (isRevision) {
        updatePayload.aiRevisionProposal = deleteField();
      }

      await updateDoc(doc(db, 'quotes', targetQuoteId), sanitizeForFirestore(updatePayload));

      // Update ticket total if we have one
      if (ticket) {
        await updateDoc(doc(db, 'tickets', ticket.id), sanitizeForFirestore({
          autoQuoteTotal: total
        }));
      }

      // Save AI-resolved tax rate to shared global collection if not changed by the tech
      if (taxSourceInfo && taxSourceInfo.source === 'ai' && taxRate === taxSourceInfo.taxRate && customerAddress) {
        const detectedState = extractStateOrArea(customerAddress);
        if (detectedState) {
          try {
            await setDoc(doc(db, 'global_tax_rates', detectedState), sanitizeForFirestore({
              stateOrArea: detectedState,
              taxRate,
              taxName: taxSourceInfo.taxName || 'Sales Tax',
              justification: taxSourceInfo.justification || `Shared rate for ${detectedState}`,
              verified: true,
              updatedAt: new Date()
            }), { merge: true });
          } catch (err) {
            console.error('Failed to save shared global tax rate:', err);
          }
        }
      }

      setQuoteData((prev: any) => {
        const next = { ...prev, subtotal, taxAmount, total, lineItems: cleanItems };
        if (isRevision) {
          delete next.aiRevisionProposal;
        }
        return next;
      });
      setEditingItemId(null);
      toast.success('Quote updated');
    } catch (err) {
      toast.error('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  // ──── Approve AI Revision Proposal ────
  const handleApproveRevision = async () => {
    const targetQuoteId = ticket?.autoQuoteId || job?.active_quote_id;
    if (!targetQuoteId) return;
    setSaving(true);
    try {
      const cleanItems = lineItems.map(({ _editing, ...rest }) => rest);
      const nonOptional = cleanItems.filter(i => !i.isOptional);
      const subtotal = cleanItems.reduce((sum, i) => sum + i.total, 0);

      let discountAmount = 0;
      if (discountValue > 0) {
        if (discountType === 'percentage') {
          discountAmount = subtotal * (discountValue / 100);
        } else {
          discountAmount = discountValue;
        }
      }
      
      const discountedSubtotal = Math.max(0, subtotal - discountAmount);
      const taxableAmount = nonOptional.filter(i => i.taxable).reduce((sum, i) => sum + i.total, 0);
      const taxAmount = displayTax ? Math.round(taxableAmount * (taxRate / 100) * 100) / 100 : 0;
      const total = Math.round((discountedSubtotal + taxAmount) * 100) / 100;

      await updateDoc(doc(db, 'quotes', targetQuoteId), {
        lineItems: cleanItems,
        scopeOfWork,
        subtotal,
        taxRate,
        taxAmount,
        discount: discountAmount,
        discountType,
        discountValue,
        discountReason,
        presentationMode,
        displayTax,
        taxSourceInfo: taxSourceInfo || null,
        total,
        aiRevisionProposal: deleteField(),
        updatedAt: serverTimestamp()
      });

      if (ticket) {
        await updateDoc(doc(db, 'tickets', ticket.id), {
          autoQuoteTotal: total
        });
      }

      setQuoteData((prev: any) => ({
        ...prev,
        subtotal,
        taxAmount,
        total,
        lineItems: cleanItems,
        aiRevisionProposal: undefined
      }));
      setEditingItemId(null);
      toast.success('AI Revision Approved & Saved!');
    } catch (err) {
      toast.error('Failed to approve AI revision');
    } finally {
      setSaving(false);
    }
  };

  // ──── Send quote to customer ────
  const handleSendQuote = async (method: 'email' | 'sms' | 'both' | 'voice' = 'email') => {
    const targetQuoteId = ticket?.autoQuoteId || job?.active_quote_id;
    if (!targetQuoteId) return;
    setSending(true);
    setShowSendOptions(false);
    try {
      // Save first
      await handleSave();

      // Use local editable customer state
      const custPhone = customerPhone || ticket?.requestorPhone || jobData?.customer?.phone || job?.customer?.phone;
      const custEmail = customerEmail || ticket?.requestorEmail || jobData?.customer?.email || job?.customer?.email;
      const custName = customerName || ticket?.requestorName || jobData?.customer?.name || job?.customer?.name || 'Customer';
      const targetJobId = ticket?.autoJobId || job?.id || jobData?.id;

      const requests: Promise<any>[] = [];
      const quoteUrl = `${window.location.origin}/quote/${targetQuoteId}`;
      const finalTotal = (quoteData?.total || 0).toFixed(2);

      if (method === 'voice') {
          // Queue AI Voice Callback — this writes directly to Firestore
          if (!custPhone) {
            toast.error('No phone number available for callback');
            setSending(false);
            return;
          }
          const jobDesc = jobData?.request?.description || job?.request?.description || ticket?.description || '';
          const callbackData = {
              orgId: user?.org_id || 'demo-org',
              customerPhone: custPhone,
              customerName: custName,
              quoteId: targetQuoteId,
              jobId: targetJobId,
              jobDescription: jobDesc,
              status: 'pending',
              createdAt: serverTimestamp(),
              requestedBy: user?.uid
          };
          requests.push(addDoc(collection(db, 'pending_callbacks'), callbackData));
      } else {
          // Email — use branded sendQuoteEmail cloud function for professional template
          if (method === 'email' || method === 'both') {
            if (!custEmail) {
              toast.error('No email address available. Try SMS or Voice Callback instead.');
              setSending(false);
              return;
            }
            // Ensure the quote has customer email before calling the cloud function
            await updateDoc(doc(db, 'quotes', targetQuoteId), {
              'customer.email': custEmail,
              'customer.name': custName,
            });
            const sendQuoteEmailFn = httpsCallable(functions, 'sendQuoteEmail');
            requests.push(sendQuoteEmailFn({ quoteId: targetQuoteId }));
          }
          if (method === 'sms' || method === 'both') {
            if (!custPhone) {
              toast.error('No phone number available for SMS.');
              setSending(false);
              return;
            }
            // Use initiateCustomerCallback or just queue a text via pending mechanism
            // For now, create a simple SMS via the sendCustomerQuestion function or direct
            toast('SMS delivery will be available soon. Use Email or Voice Callback.', { icon: 'ℹ️' });
          }
      }

      await Promise.all(requests);

      // Mark quote as sent + apply deposit override if checked
      const sendUpdate: any = {
        status: 'sent',
        sentAt: serverTimestamp(),
        sentVia: method
      };
      if (noDepositOverride) {
        sendUpdate.depositCondition = 'none';
        sendUpdate.depositExplicitlyWaived = true;
        sendUpdate['agreement.requiresDeposit'] = false;
        sendUpdate['agreement.depositAmount'] = 0;
      }
      await updateDoc(doc(db, 'quotes', targetQuoteId), sendUpdate);

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
    } catch (err: any) {
      console.error('Send quote error:', err);
      toast.error(err?.message || 'Failed to send quote. Check the console for details.');
    } finally {
      setSending(false);
    }
  };

  // ──── Helpers ────
  function cleanDescription(desc: string): string {
    if (!desc) return '';
    return desc
      .replace(/^\[Portal Quote Request\]\s*/i, '')
      .replace(/^\[Public Portal Request\]\s*/i, '')
      .replace(/^urgency:\s*[a-z0-9_-]+\s*/i, '')
      .trim();
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

  function getPriceSourceBadge(item: EditableLineItem) {
    if (item.type !== 'material') return null;
    const source = item.priceSource;
    switch (source) {
      case 'vendor':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
            <Store className="w-2.5 h-2.5" /> {item.vendorName || 'Vendor'}
          </span>
        );
      case 'inventory':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
            <Package className="w-2.5 h-2.5" /> Inventory
          </span>
        );
      case 'ai_estimate':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
            <Bot className="w-2.5 h-2.5" /> AI Estimate
          </span>
        );
      case 'fallback':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
            <AlertTriangle className="w-2.5 h-2.5" /> Fallback
          </span>
        );
      default:
        // Legacy line items without priceSource — infer from notes
        if (item.notes?.includes('inventory') || item.notes?.includes('in stock')) {
          return (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
              <Package className="w-2.5 h-2.5" /> Inventory
            </span>
          );
        }
        if (item.notes?.toLowerCase().includes('estimated') || item.notes?.toLowerCase().includes('sourcing')) {
          return (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
              <Bot className="w-2.5 h-2.5" /> AI Estimate
            </span>
          );
        }
        return null;
    }
  }

  function getProductLinkUrl(item: EditableLineItem): string | null {
    if (item.type !== 'material') return null;
    // Priority: vendor product URL → Google Shopping search
    if (item.vendorProductUrl) return item.vendorProductUrl;
    if (item.description) {
      return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(item.description)}`;
    }
    return null;
  }

  function getStockBadge(item: EditableLineItem) {
    if (item.type !== 'material') return null;
    const isLocal = isLocalVendor(item.vendorName);
    const stockDetails = getVendorStockDetails(item.vendorName || 'Supplier', item.stockQuantity, isLocal);

    if (stockDetails.stockStatus === 'out_of_stock') {
      return <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full border border-red-200">Out of stock</span>;
    }

    if (isLocal) {
      return (
        <span className="text-[10px] font-extrabold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300 shadow-2xs inline-flex items-center gap-1">
          <MapPin className="w-2.5 h-2.5 text-emerald-700" /> {stockDetails.statusBadgeText}
        </span>
      );
    }

    if (stockDetails.stockStatus === 'low_stock') {
      return <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200">{stockDetails.statusBadgeText}</span>;
    }

    return <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200">{stockDetails.statusBadgeText}</span>;
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
          {/* ═══════════ COMMUNICATION HISTORY ═══════════ */}
          {quoteData?.customerNotes && quoteData.customerNotes.length > 0 && (
            <div className="bg-amber-50/50 rounded-xl p-4 border border-amber-200">
              <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-amber-600" />
                Communication History
              </h4>
              <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                {quoteData.customerNotes.map((note: any, idx: number) => {
                  if (note.type === 'status_change' || note.author === 'system') {
                    return (
                      <div key={idx} className="flex flex-col items-center py-1">
                        <div className="flex items-center gap-1.5 bg-gray-100 border border-gray-200 rounded-full px-3 py-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          <span className="text-[10px] font-medium text-gray-600">{note.text}</span>
                        </div>
                        {note.waitingFor && (
                          <span className={`mt-0.5 text-[9px] font-bold px-2 py-0.5 rounded-full ${
                            note.waitingFor === 'customer'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}>
                            ⏳ Waiting for {note.waitingFor === 'customer' ? 'Customer' : 'Technician'}
                          </span>
                        )}
                        <span className="text-[9px] text-gray-400 mt-0.5">
                          {new Date(note.createdAt).toLocaleString()}
                        </span>
                      </div>
                    );
                  }

                  const isCustomer = note.author === 'customer';
                  return (
                    <div key={idx} className={`flex flex-col ${isCustomer ? 'items-end' : 'items-start'}`}>
                      <div className={`p-2.5 rounded-lg max-w-[85%] text-xs ${
                        isCustomer 
                          ? 'bg-blue-100 text-blue-900 rounded-tr-sm' 
                          : 'bg-white border text-gray-800 rounded-tl-sm shadow-sm'
                      }`}>
                        <p className="leading-relaxed">{note.text}</p>
                      </div>
                      <span className="text-[9px] text-gray-400 mt-1 px-1">
                        {isCustomer ? 'Customer' : 'Technician'} • {new Date(note.createdAt).toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ═══════════ AI REVISION PROPOSAL BANNER ═══════════ */}
          {quoteData?.status === 'tech_review' && quoteData?.aiRevisionProposal && (
            <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-indigo-500/10 border border-amber-300 rounded-xl p-4 shadow-sm backdrop-blur-sm animate-in fade-in duration-300">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md animate-pulse shrink-0">
                    <Bot className="w-5.5 h-5.5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-bold text-gray-900 flex items-center gap-1.5 flex-wrap">
                      AI Revision Proposal Pending Review
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        <Sparkles className="w-2.5 h-2.5 mr-0.5" /> AI Generated
                      </span>
                    </h4>
                    <p className="text-xs text-gray-600 mt-1">
                      Gemini has drafted a revised quote based on the customer's request.
                    </p>
                    <div className="mt-2 text-xs bg-white/70 border border-amber-200/55 rounded-lg p-2.5 text-gray-700 italic">
                      "{quoteData.aiRevisionProposal.customerRequest}"
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-3 bg-white/40 border border-amber-200/40 rounded-xl p-3 md:min-w-[200px] shrink-0">
                  <div className="text-left md:text-right">
                    <span className="text-[10px] uppercase font-bold text-gray-400 block">Total Comparison</span>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span className="text-xs line-through text-gray-400 font-semibold">${Number(quoteData.total || 0).toFixed(2)}</span>
                      <span className="text-lg font-black text-indigo-700">${Number(quoteData.aiRevisionProposal.total || 0).toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleGenerateRevision()}
                      disabled={saving || generatingRevision}
                      className="flex items-center gap-2 px-3 py-2 bg-white border border-amber-300 text-amber-700 text-xs font-bold rounded-lg hover:bg-amber-50 transition-all shadow-sm disabled:opacity-50"
                    >
                      {generatingRevision ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      Regenerate AI
                    </button>
                    <button
                      onClick={handleApproveRevision}
                      disabled={saving || generatingRevision}
                      className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold rounded-lg hover:from-amber-600 hover:to-orange-600 transition-all shadow-md hover:shadow-lg disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      Approve AI Revision
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════ RECOVERY BANNER (AI exists but no quote) ═══════════ */}
          {aiRec && !quoteData && lineItems.length === 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span className="text-xs font-bold text-amber-900">AI analysis is ready, but the quote wasn't generated. Click to create it now.</span>
              </div>
              <button
                onClick={handleGenerateAIAnalysis}
                disabled={generating}
                className="flex items-center gap-2 px-3 py-1.5 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
              >
                {generating ? (
                  <><Loader2 className="w-3 h-3 animate-spin" /> Generating...</>
                ) : (
                  <><Sparkles className="w-3 h-3" /> Generate Quote</>
                )}
              </button>
            </div>
          )}
          {/* ═══════════ CONTACT PREFERENCE BANNER ═══════════ */}
          {(jobData?.request?.contactPreference || (ticket as any)?.collectedInfo?.contactPreference) && (
            <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
              (jobData?.request?.contactPreference || (ticket as any)?.collectedInfo?.contactPreference) === 'call'
                ? 'bg-purple-50 border-purple-200'
                : (jobData?.request?.contactPreference || (ticket as any)?.collectedInfo?.contactPreference) === 'text'
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-emerald-50 border-emerald-200'
            }`}>
              {(jobData?.request?.contactPreference || (ticket as any)?.collectedInfo?.contactPreference) === 'call' ? (
                <Phone className="w-4 h-4 text-purple-600" />
              ) : (jobData?.request?.contactPreference || (ticket as any)?.collectedInfo?.contactPreference) === 'text' ? (
                <MessageSquare className="w-4 h-4 text-blue-600" />
              ) : (
                <Mail className="w-4 h-4 text-emerald-600" />
              )}
              <span className="text-xs font-bold text-gray-800">
                Customer requested contact via <span className="uppercase">{jobData?.request?.contactPreference || (ticket as any)?.collectedInfo?.contactPreference}</span>
              </span>
              {(jobData?.request?.contactPreference || (ticket as any)?.collectedInfo?.contactPreference) === 'call' && (
                <button
                  onClick={() => { setShowSendOptions(false); handleSendQuote('voice'); }}
                  disabled={sending}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-xs font-bold rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                >
                  <Phone className="w-3 h-3" /> Queue AI Callback
                </button>
              )}
            </div>
          )}

          {/* ═══════════ EDITABLE CUSTOMER DETAILS ═══════════ */}
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-indigo-500" />
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Customer Details</span>
              </div>
              <button onClick={() => setEditingCustomer(!editingCustomer)}
                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
                <Edit3 className="w-3 h-3" /> {editingCustomer ? 'Done' : 'Edit'}
              </button>
            </div>
            {editingCustomer ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-gray-500 mb-0.5">Name</label>
                  <input value={customerName} onChange={e => setCustomerName(e.target.value)}
                    className="w-full text-sm border border-blue-200 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-300" placeholder="Customer name" />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-0.5">Phone</label>
                  <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
                    className="w-full text-sm border border-blue-200 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-300" placeholder="+1..." />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-0.5">Email</label>
                  <input value={customerEmail} onChange={e => setCustomerEmail(e.target.value)}
                    className="w-full text-sm border border-blue-200 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-300" placeholder="email@..." />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 mb-0.5">Address</label>
                  <input value={customerAddress} onChange={e => setCustomerAddress(e.target.value)}
                    className="w-full text-sm border border-blue-200 rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-300" placeholder="Service address" />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div><span className="text-gray-400 text-xs">Name:</span> <span className="text-gray-800 font-medium">{customerName || '—'}</span></div>
                <div><span className="text-gray-400 text-xs">Phone:</span> <span className="text-gray-800">{customerPhone || '—'}</span></div>
                <div><span className="text-gray-400 text-xs">Email:</span> <span className="text-gray-800">{customerEmail || '—'}</span></div>
                <div className="col-span-2"><span className="text-gray-400 text-xs">Address:</span> <span className="text-gray-800">{customerAddress || '—'}</span></div>
              </div>
            )}
          </div>

          {/* ═══════════ CALL TRANSCRIPT (COLLAPSIBLE) ═══════════ */}
          {(() => {
            const transcriptData = (ticket as any)?.transcript || (job as any)?.transcript;
            if (!transcriptData || !Array.isArray(transcriptData) || transcriptData.length === 0) return null;
            return (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setShowTranscript(!showTranscript)}
                  className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <PhoneCall className="w-4 h-4 text-purple-600" />
                    <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Call Transcript</span>
                    <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                      {transcriptData.length} messages
                    </span>
                  </div>
                  {showTranscript
                    ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                    : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                  }
                </button>
                {showTranscript && (
                  <div className="border-t border-gray-100 px-3 py-3">
                    <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
                      {transcriptData.map((msg: any, idx: number) => {
                        // Handle both string-based ("User: hello") and object-based ({role, text}) entries
                        const isString = typeof msg === 'string';
                        const role = isString
                          ? (msg.startsWith('AI:') || msg.startsWith('Agent:') || msg.startsWith('Assistant:') ? 'assistant' : 'caller')
                          : (msg.role || 'caller');
                        const isAssistant = role === 'assistant' || role === 'ai' || role === 'bot';
                        const text = isString
                          ? msg.replace(/^(AI|Agent|Assistant|User|Caller):\s*/i, '')
                          : (msg.content || msg.text || '');
                        const ts = !isString && msg.timestamp ? new Date(msg.timestamp) : null;
                        if (!text) return null;
                        return (
                          <div key={idx} className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}>
                            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                              isAssistant
                                ? 'bg-purple-100 text-purple-900 rounded-tl-sm'
                                : 'bg-blue-600 text-white rounded-tr-sm'
                            }`}>
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="text-[10px] font-bold opacity-60 uppercase tracking-wider">
                                  {isAssistant ? 'AI Agent' : 'Caller'}
                                </span>
                                {ts && (
                                  <span className="text-[9px] opacity-40">
                                    {ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                )}
                              </div>
                              {text}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ═══════════ CUSTOMER SUBMITTED PHOTOS ═══════════ */}
          {(() => {
            const customerPhotos: string[] = ticket?.photoUrls || jobData?.request?.photos || [];
            if (!customerPhotos.length) return null;
            return (
              <CustomerPhotoStrip photos={customerPhotos} label="Customer Submitted Photos" maxVisible={5} />
            );
          })()}

          {/* ═══════════ ORIGINAL CUSTOMER REQUEST ═══════════ */}
          {(() => {
            const rawDescription = ticket?.description || jobData?.request?.description || '';
            if (!rawDescription) return null;
            return (
              <div className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Original Customer Request</span>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-lg p-3 border border-gray-100 whitespace-pre-line">
                  {cleanDescription(rawDescription)}
                </p>
              </div>
            );
          })()}

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
                <button onClick={() => {
                  setLookupSearchTerm('');
                  setIsLookupModalOpen(true);
                }}
                  className="text-[10px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-1 rounded transition-colors flex items-center gap-1">
                  <Search className="w-3 h-3" /> Search & Add Material
                </button>
                <button onClick={() => addLineItem('labor')}
                  className="text-[10px] font-medium text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors">
                  + Labor
                </button>
                <button onClick={() => addLineItem('material')}
                  className="text-[10px] font-medium text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded transition-colors">
                  + Blank Material
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
              {/* ─── Category Roll-up View ─── */}
              {presentationMode === 'category_rollup' && !editingItemId ? (
                <>
                  {(['labor', 'material', 'equipment', 'travel'] as const).map(type => {
                    const items = lineItems.filter(i => i.type === type);
                    if (items.length === 0) return null;
                    const catTotal = items.reduce((s, i) => s + (i.total || 0), 0);
                    return (
                      <div key={type} className="px-3 py-2.5 flex items-center justify-between hover:bg-gray-50/60 transition-colors">
                        <div className="flex items-center gap-2">
                          {getTypeIcon(type)}
                          <span className="text-sm font-medium text-gray-800">{getTypeLabel(type)}</span>
                          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{items.length} item{items.length > 1 ? 's' : ''}</span>
                        </div>
                        <span className="text-sm font-bold text-gray-800">${catTotal.toFixed(2)}</span>
                      </div>
                    );
                  })}
                  <div className="px-3 py-2 text-center">
                    <button onClick={() => setPresentationMode('detailed')}
                      className="text-[10px] text-blue-600 hover:text-blue-800 font-medium">
                      Show detailed line items →
                    </button>
                  </div>
                </>
              ) : presentationMode === 'single_price' && !editingItemId ? (
                <div className="px-3 py-4 text-center">
                  <div className="text-xs text-gray-500 mb-1">Customer will see a single total price</div>
                  <div className="text-xl font-bold text-indigo-700">${totals.total.toFixed(2)}</div>
                  <button onClick={() => setPresentationMode('detailed')}
                    className="text-[10px] text-blue-600 hover:text-blue-800 font-medium mt-2">
                    Show detailed line items →
                  </button>
                </div>
              ) : (
              <>
              {lineItems.map(item => {
                const isEditing = editingItemId === item.id;
                const productLink = getProductLinkUrl(item);
                const priceBadge = getPriceSourceBadge(item);
                const stockBadge = getStockBadge(item);
                const hasMarkup = item.type === 'material' && item.baseCost != null && item.markupPercentage != null && item.markupPercentage > 0;

                return (
                  <div
                    key={item.id}
                    onMouseEnter={() => setHoveredItemId(item.id)}
                    onMouseLeave={() => setHoveredItemId(null)}
                    className={`px-3 py-2.5 group relative hover:bg-gray-50/60 transition-colors ${item.isOptional ? 'opacity-70' : ''}`}
                  >
                    {/* Hover Flyout Card for Material Items */}
                    {hoveredItemId === item.id && item.type === 'material' && !isEditing && (() => {
                      const activeVendorInfo = getVendorStockDetails(item.vendorName || 'Active Supplier', item.stockQuantity);

                      return (
                        <div className="absolute left-1/4 top-full mt-1 z-50 w-84 bg-white/95 backdrop-blur-md rounded-xl shadow-2xl border border-blue-200 p-3.5 animate-in fade-in zoom-in-95 duration-150 pointer-events-none">
                          <div className="flex items-start gap-3 border-b border-gray-100 pb-2.5 mb-2.5">
                            <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                              <Package className="w-5 h-5 text-blue-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold text-gray-900 truncate">{item.description}</div>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 bg-blue-50 text-blue-800 rounded border border-blue-200">
                                  <Store className="w-2.5 h-2.5 mr-0.5" /> {item.vendorName || 'Active Supplier'}
                                </span>
                                {activeVendorInfo.isLocal && (
                                  <span className="inline-flex items-center text-[9px] font-extrabold px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full border border-emerald-300">
                                    <MapPin className="w-2.5 h-2.5 mr-0.5" /> Local Store
                                  </span>
                                )}
                                <span className={`text-[10px] font-bold ${activeVendorInfo.stockStatus === 'out_of_stock' ? 'text-red-600' : activeVendorInfo.stockStatus === 'low_stock' ? 'text-amber-600' : 'text-emerald-700'}`}>
                                  {activeVendorInfo.statusBadgeText}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Shipping & Delivery Info */}
                          <div className="bg-gradient-to-r from-blue-50/80 to-indigo-50/80 rounded-lg p-2 mb-2 border border-blue-100 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1 text-blue-800 font-medium text-[11px]">
                              <Truck className="w-3.5 h-3.5 text-blue-600" />
                              <span>Fulfillment / Delivery:</span>
                            </div>
                            <span className="font-bold text-blue-900 text-[11px]">
                              {activeVendorInfo.deliveryText}
                            </span>
                          </div>

                          {/* Pricing Breakdown */}
                          <div className="grid grid-cols-2 gap-2 mb-2 text-xs">
                            <div className="bg-gray-50 rounded p-1.5 border border-gray-100">
                              <div className="text-[10px] text-gray-500">Unit Base Cost</div>
                              <div className="font-semibold text-gray-800">${(item.baseCost || 0).toFixed(2)}</div>
                            </div>
                            <div className="bg-emerald-50 rounded p-1.5 border border-emerald-100">
                              <div className="text-[10px] text-emerald-600">Customer Price (+{item.markupPercentage || 30}%)</div>
                              <div className="font-bold text-emerald-800">${(item.unitPrice || 0).toFixed(2)}</div>
                            </div>
                          </div>

                          {/* Pre-fetched Supplier Price & Stock Comparison Grid */}
                          <div className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider mb-1">Supplier Price & Stock Comparison</div>
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {/* Active Selected Vendor */}
                            <div className="flex items-center justify-between px-2.5 py-1.5 bg-blue-50/90 rounded-lg border border-blue-200 text-[11px] font-semibold text-blue-900">
                              <div className="flex items-center gap-1 min-w-0">
                                <CheckCircle2 className="w-3 h-3 text-blue-600 shrink-0" />
                                {activeVendorInfo.isLocal && (
                                  <span className="text-[9px] font-extrabold bg-emerald-100 text-emerald-800 px-1 py-0.2 rounded shrink-0">
                                    Local
                                  </span>
                                )}
                                <span className="truncate">{item.vendorName || 'Selected Vendor'}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                  activeVendorInfo.stockStatus === 'out_of_stock'
                                    ? 'bg-red-100 text-red-700'
                                    : activeVendorInfo.isLocal
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-blue-100 text-blue-800'
                                }`}>
                                  {activeVendorInfo.statusBadgeText}
                                </span>
                                <span className="font-bold text-blue-950">${(item.baseCost || 0).toFixed(2)}</span>
                              </div>
                            </div>

                            {/* Alternate Vendors */}
                            {(item.alternateVendors || [])
                              .filter(av => av.vendorName !== item.vendorName)
                              .map((av, idx) => {
                                const altInfo = getVendorStockDetails(av.vendorName, av.stockQuantity, av.isLocalVendor, av.localDistanceMiles);

                                return (
                                  <div key={idx} className="flex items-center justify-between px-2.5 py-1.5 bg-gray-50 hover:bg-gray-100/80 rounded-lg text-[11px] text-gray-700 transition-colors border border-gray-100">
                                    <div className="flex items-center gap-1 min-w-0">
                                      {altInfo.isLocal && (
                                        <span className="text-[9px] font-extrabold bg-emerald-100 text-emerald-800 px-1 py-0.2 rounded shrink-0">
                                          Local
                                        </span>
                                      )}
                                      <span className="font-medium truncate">{av.vendorName}</span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                        altInfo.stockStatus === 'out_of_stock'
                                          ? 'bg-red-100 text-red-700'
                                          : altInfo.isLocal
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : 'bg-gray-200 text-gray-700'
                                      }`}>
                                        {altInfo.statusBadgeText}
                                      </span>
                                      <span className="font-semibold text-gray-900">${av.unitCost.toFixed(2)}</span>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      );
                    })()}

                    <div className="flex items-center gap-3">
                      {/* Type icon */}
                      <div className="flex-shrink-0">{getTypeIcon(item.type)}</div>

                      {/* Description + metadata row */}
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
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm text-gray-800 font-medium">{item.description}</span>
                            {item.isOptional && <span className="text-[10px] text-amber-600 font-medium">(optional)</span>}
                            {priceBadge}
                            {stockBadge}

                            {/* Interactive Rich Vendor Selector Dropdown */}
                            {item.type === 'material' && (
                              <RichVendorDropdown
                                activeVendorName={item.vendorName}
                                activeBaseCost={item.baseCost}
                                activeStockQuantity={item.stockQuantity}
                                activeProductUrl={item.vendorProductUrl}
                                alternateVendors={item.alternateVendors}
                                orgVendors={orgVendors}
                                itemDescription={item.description}
                                onSelectVendor={(val) => handleVendorSelectForLineItem(item.id, val)}
                                className="ml-1"
                              />
                            )}

                            {productLink && !isEditing && (
                              <a
                                href={productLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-0.5 text-[10px] font-medium text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
                                title={item.vendorProductUrl ? `View on ${item.vendorName || 'vendor site'}` : 'Search Google Shopping'}
                              >
                                {item.vendorProductUrl ? (
                                  <><ExternalLink className="w-2.5 h-2.5" /> View Product</>
                                ) : (
                                  <><Search className="w-2.5 h-2.5" /> Look Up Price</>
                                )}
                              </a>
                            )}
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
                      <div className="w-24 flex-shrink-0">
                        {isEditing ? (
                          <input
                            type="number" step="0.01" min="0"
                            value={item.unitPrice}
                            onChange={e => updateLineItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                            className="w-full text-sm border border-blue-200 rounded px-1.5 py-1 text-right focus:ring-1 focus:ring-blue-300"
                          />
                        ) : (
                          <div className="text-right">
                            <span className="text-xs text-gray-500">${item.unitPrice.toFixed(2)}/{item.unit}</span>
                            {hasMarkup && (
                              <div className="text-[10px] text-gray-400 leading-tight">
                                cost ${item.baseCost!.toFixed(2)} +{item.markupPercentage}%
                              </div>
                            )}
                          </div>
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
                  </div>
                );
              })}
              </>
              )}
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
                  <div className="flex items-center gap-3 mt-1.5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={displayTax}
                        onChange={e => setDisplayTax(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-gray-700">Display Tax</span>
                    </label>
                    {displayTax && (
                      <div className="flex items-center gap-1 ml-2">
                        <span className="text-gray-500">Rate:</span>
                        <input
                          type="number"
                          value={taxRate}
                          onChange={e => setTaxRate(parseFloat(e.target.value) || 0)}
                          min="0"
                          step="0.001"
                          className="w-14 border border-gray-300 rounded px-1 py-0.5 text-right focus:ring-1 focus:ring-blue-300"
                        />
                        <span className="text-gray-500">%</span>
                      </div>
                    )}
                    {loadingTaxLookup && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 ml-1" />
                    )}
                    {!loadingTaxLookup && taxSourceInfo && (
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ml-2 ${
                        taxSourceInfo.source === 'settings'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      }`} title={taxSourceInfo.justification}>
                        {taxSourceInfo.source === 'settings' ? 'Settings Rate' : 'AI Resolved'}
                      </span>
                    )}
                  </div>
                  {displayTax && taxSourceInfo?.justification && (
                    <div className="text-[10px] text-slate-500 mt-1 italic leading-tight">
                      {taxSourceInfo.justification}
                    </div>
                  )}
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
              {displayTax && (
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-xs text-gray-500">Tax ({taxRate}%)</span>
                  <span className="text-sm text-gray-700">${totals.taxAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-200">
                <span className="text-sm font-bold text-gray-900">Total</span>
                <span className="text-lg font-bold text-indigo-700">${totals.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* ═══════════ DEPOSIT OVERRIDE ═══════════ */}
          <label className="flex items-center gap-2 cursor-pointer py-1 mt-1">
            <input
              type="checkbox"
              checked={noDepositOverride}
              onChange={(e) => setNoDepositOverride(e.target.checked)}
              className="w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500"
            />
            <span className={`text-xs font-medium ${noDepositOverride ? 'text-amber-700' : 'text-gray-500'}`}>
              No Deposit Required
            </span>
            {noDepositOverride && (
              <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">
                Deposit waived
              </span>
            )}
          </label>

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

              {showSendOptions && (() => {
                const pref = jobData?.request?.contactPreference || (ticket as any)?.collectedInfo?.contactPreference;
                return (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowSendOptions(false)} />
                  <div className="absolute right-0 bottom-full mb-2 w-56 bg-white rounded-lg shadow-xl ring-1 ring-black ring-opacity-5 overflow-hidden z-20 divide-y divide-gray-100 origin-bottom-right animate-in fade-in slide-in-from-bottom-2">
                    {/* Show preferred method first with highlight */}
                    {pref === 'call' && (
                      <button
                        onClick={() => handleSendQuote('voice')}
                        className="w-full text-left px-4 py-3 bg-purple-50 hover:bg-purple-100 text-sm font-medium text-purple-800 transition-colors flex items-center gap-2"
                      >
                        <Phone className="w-4 h-4" /> AI Voice Callback
                        <span className="ml-auto text-[10px] bg-purple-200 text-purple-800 px-1.5 py-0.5 rounded-full font-bold">Requested</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleSendQuote('email')}
                      className={`w-full text-left px-4 py-3 hover:bg-emerald-50 text-sm font-medium text-gray-700 hover:text-emerald-700 transition-colors flex items-center gap-2 ${pref === 'email' ? 'bg-emerald-50/50' : ''}`}
                    >
                      <Mail className="w-4 h-4" /> Send via Email
                      {pref === 'email' && <span className="ml-auto text-[10px] bg-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded-full font-bold">Requested</span>}
                    </button>
                    <button
                      onClick={() => handleSendQuote('sms')}
                      className={`w-full text-left px-4 py-3 hover:bg-emerald-50 text-sm font-medium text-gray-700 hover:text-emerald-700 transition-colors flex items-center gap-2 ${pref === 'text' ? 'bg-blue-50/50' : ''}`}
                    >
                      <MessageSquare className="w-4 h-4" /> Send via SMS
                      {pref === 'text' && <span className="ml-auto text-[10px] bg-blue-200 text-blue-800 px-1.5 py-0.5 rounded-full font-bold">Requested</span>}
                    </button>
                    <button
                      onClick={() => handleSendQuote('both')}
                      className="w-full text-left px-4 py-3 hover:bg-emerald-50 text-sm font-medium text-gray-700 hover:text-emerald-700 transition-colors flex items-center gap-2"
                    >
                      <Send className="w-4 h-4" /> Send via Both
                    </button>
                    {pref !== 'call' && (
                      <button
                        onClick={() => handleSendQuote('voice')}
                        className="w-full text-left px-4 py-3 hover:bg-purple-50 text-sm font-medium text-purple-700 hover:text-purple-800 transition-colors flex items-center gap-2"
                      >
                        <Phone className="w-4 h-4" /> Queue AI Voice Callback
                      </button>
                    )}
                  </div>
                </>
                );
              })()}
            </div>
          </div>
          {/* Material Lookup Modal */}
          <MaterialLookupModal
            isOpen={isLookupModalOpen}
            onClose={() => setIsLookupModalOpen(false)}
            initialSearchTerm={lookupSearchTerm}
            markupPercent={organization?.settings?.materialMarkup || 30}
            onSelectMaterial={(selected: SelectedMaterialResult) => {
              const newItem: EditableLineItem = {
                id: crypto.randomUUID(),
                type: 'material',
                description: selected.name,
                quantity: 1,
                unit: selected.unit || 'each',
                unitPrice: selected.customerPrice,
                baseCost: selected.baseCost,
                markupPercentage: organization?.settings?.materialMarkup || 30,
                total: selected.customerPrice,
                taxable: true,
                isOptional: false,
                priceSource: selected.vendorName ? 'vendor' : (selected.materialId ? 'inventory' : 'ai_estimate'),
                vendorName: selected.vendorName,
                vendorProductUrl: selected.vendorProductUrl,
                materialId: selected.materialId,
                alternateVendors: selected.alternateVendors,
                _editing: false
              };
              setLineItems(prev => [...prev, newItem]);
              toast.success(`Added ${selected.name} to quote materials`);
            }}
          />
        </div>
      )}
    </div>
  );
};
