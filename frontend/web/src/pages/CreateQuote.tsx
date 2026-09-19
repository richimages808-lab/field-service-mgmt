import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, query, where, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import { Job, Quote, QuoteLineItem, MaterialItem, DEFAULT_OVERRUN_PROTECTION, Customer, RateCardMatrix, AlternateVendor } from '../types';
import { sanitizeForFirestore } from '../lib/aiQuoteGenerator';
import { ALL_JURISDICTIONS } from '../lib/quoteTerms';
import { recalculateDepositForQuote } from '../lib/quoteService';
import {
    FileText,
    Plus,
    Trash2,
    Save,
    Send,
    ArrowLeft,
    DollarSign,
    Clock,
    AlertTriangle,
    Package,
    Wrench,
    Truck,
    Receipt,
    Percent,
    Info,
    CheckCircle,
    CheckCircle2,
    MessageSquare,
    Sparkles,
    User,
    Search,
    Loader2,
    ExternalLink,
    RotateCcw,
    History
} from 'lucide-react';
import { MaterialLookupModal, SelectedMaterialResult } from '../components/inventory/MaterialLookupModal';
import { InlineAIQuotePanel } from '../components/InlineAIQuotePanel';
import { RichVendorDropdown } from '../components/RichVendorDropdown';
import { findBestMatchingMaterial, buildAllVendorPricing, selectVendorByOrgPriorities, isToolOwnedOrStandard } from '../utils/procurementLogic';
import { isLocalVendor } from '../utils/vendorStock';
import toast from 'react-hot-toast';

const LINE_ITEM_TYPES = [
    { value: 'labor', label: 'Labor', icon: Clock },
    { value: 'material', label: 'Material', icon: Package },
    { value: 'equipment', label: 'Equipment', icon: Wrench },
    { value: 'travel', label: 'Travel', icon: Truck },
    { value: 'fee', label: 'Fee', icon: Receipt },
    { value: 'discount', label: 'Discount', icon: Percent }
];

const generateQuoteNumber = () => {
    const year = new Date().getFullYear();
    const randomNum = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
    return `Q-${year}-${randomNum}`;
};

/** Extract jurisdiction (US state code) from a customer address. */
function extractJurisdictionFromAddress(addressStr: string, structuredAddr?: any): string | null {
    // 1. Check structured address object first (has explicit .state field)
    if (structuredAddr?.state) {
        const state = structuredAddr.state.trim().toUpperCase();
        // If it's already a 2-letter code, use it directly
        if (/^[A-Z]{2}$/.test(state)) return state;
        // If it's a full state name, look it up
        const found = ALL_JURISDICTIONS.find(j => j.name.toUpperCase() === state);
        if (found) return found.code;
    }

    if (!addressStr) return null;

    // 2. Try regex: "City, ST 12345" pattern
    const stateZipMatch = addressStr.match(/\b([A-Z]{2})\b\s+\d{5}/);
    if (stateZipMatch) {
        const candidate = stateZipMatch[1];
        if (ALL_JURISDICTIONS.some(j => j.code === candidate)) return candidate;
    }

    // 3. Try comma-separated: "City, State"
    const commaMatch = addressStr.match(/,\s*([A-Z]{2})(?:\s|,|$)/i);
    if (commaMatch) {
        const candidate = commaMatch[1].toUpperCase();
        if (ALL_JURISDICTIONS.some(j => j.code === candidate)) return candidate;
    }

    // 4. Check for full state names in the address
    const upperAddr = addressStr.toUpperCase();
    for (const j of ALL_JURISDICTIONS) {
        if (j.country === 'US' && upperAddr.includes(j.name.toUpperCase())) {
            return j.code;
        }
    }

    return null;
}

export const CreateQuote: React.FC = () => {
    const { jobId, quoteId: routeQuoteId } = useParams<{ jobId?: string; quoteId?: string }>();
    const [searchParams] = useSearchParams();
    const quoteId = routeQuoteId || searchParams.get('quoteId');
    const targetJobId = jobId || searchParams.get('jobId') || undefined;
    const navigate = useNavigate();
    const { user, organization } = useAuth();

    const [job, setJob] = useState<Job | null>(null);
    const [customerData, setCustomerData] = useState<Customer | null>(null);
    const [rateCard, setRateCard] = useState<RateCardMatrix | null>(null);
    const [materials, setMaterials] = useState<MaterialItem[]>([]);
    const [orgTools, setOrgTools] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Material Lookup Modal State
    const [isLookupModalOpen, setIsLookupModalOpen] = useState(false);

    // Permission check for Markups
    const isDispatchOrSolo = user?.role === 'admin' || user?.role === 'dispatcher' || (user as any)?.techType === 'solo';

    // Quote state
    const [scopeOfWork, setScopeOfWork] = useState('');
    const [lineItems, setLineItems] = useState<QuoteLineItem[]>([]);
    const [taxRate, setTaxRate] = useState(0);
    const [presentationMode, setPresentationMode] = useState<'detailed' | 'category_rollup' | 'single_price'>('detailed');
    const [displayTax, setDisplayTax] = useState(true);
    const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('fixed');
    const [discountValue, setDiscountValue] = useState(0);
    const [discountReason, setDiscountReason] = useState('');
    const [estimatedDuration, setEstimatedDuration] = useState(0);
    const [validDays, setValidDays] = useState(30);
    const [overrunSettings, setOverrunSettings] = useState(DEFAULT_OVERRUN_PROTECTION);
    const [jurisdictionState, setJurisdictionState] = useState('');
    
    // Deposit settings
    const [depositCondition, setDepositCondition] = useState('none');
    const [depositAmount, setDepositAmount] = useState(0);
    const [requiresDeposit, setRequiresDeposit] = useState(false);
    const [signatureRequired, setSignatureRequired] = useState(true);
    const [upfrontPolicy, setUpfrontPolicy] = useState<any>(null);
    const [evaluatedRule, setEvaluatedRule] = useState<string>('none');
    const [customJurisdictions, setCustomJurisdictions] = useState<any[]>([]);

    // Editing quote state
    const [existingQuote, setExistingQuote] = useState<Quote | null>(null);
    const [revisionComment, setRevisionComment] = useState('');

    // Standalone quote (no job) customer fields
    const [standaloneCustomerName, setStandaloneCustomerName] = useState('');
    const [standaloneCustomerEmail, setStandaloneCustomerEmail] = useState('');
    const [standaloneCustomerPhone, setStandaloneCustomerPhone] = useState('');
    const [standaloneCustomerAddress, setStandaloneCustomerAddress] = useState('');
    const isStandalone = !targetJobId && !quoteId;

    // AI Quote Generation State
    const [aiLoading, setAiLoading] = useState(false);
    const [aiRecommendation, setAiRecommendation] = useState<any | null>(null);
    const [aiError, setAiError] = useState('');
    const [aiModificationNote, setAiModificationNote] = useState('');
    const [orgVendors, setOrgVendors] = useState<any[]>([]);

    // Stored AI Quote & Revision History State (persisted per quote in session)
    const [storedAiQuote, setStoredAiQuote] = useState<{
        diagnosis?: string;
        solution?: string;
        partsNeeded?: any[];
        toolsNeeded?: any[];
        estimatedDuration?: number;
        lineItems: QuoteLineItem[];
        total: number;
        timestamp: number;
        scope: string;
        modNote?: string;
    } | null>(() => {
        try {
            const cached = sessionStorage.getItem(`stored_ai_quote_${quoteId || targetJobId || 'new'}`);
            return cached ? JSON.parse(cached) : null;
        } catch {
            return null;
        }
    });

    const [aiQuoteHistory, setAiQuoteHistory] = useState<Array<{
        id: string;
        label: string;
        lineItems: QuoteLineItem[];
        total: number;
        timestamp: number;
        recommendation?: any;
        estimatedDuration?: number;
        scope?: string;
    }>>([]);

    useEffect(() => {
        const loadData = async () => {
            if (!user?.uid) {
                setLoading(false);
                return;
            }

            try {
                const orgId = (user as any).org_id || (user as any).organization?.id || 'demo-org';
                let currentJobId = targetJobId;

                if (quoteId) {
                    const quoteDoc = await getDoc(doc(db, 'quotes', quoteId));
                    if (quoteDoc.exists()) {
                        const quoteData = { id: quoteDoc.id, ...quoteDoc.data() } as Quote;
                        setExistingQuote(quoteData);
                        currentJobId = quoteData.job_id;
                        setScopeOfWork(quoteData.scopeOfWork || '');
                        if (quoteData.estimatedDuration) {
                            setEstimatedDuration(quoteData.estimatedDuration);
                        }
                        if (quoteData.validUntil) {
                            const validUntilDate = quoteData.validUntil.toDate ? quoteData.validUntil.toDate() : new Date(quoteData.validUntil);
                            const today = new Date();
                            const diffDays = Math.ceil((validUntilDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                            setValidDays(diffDays > 0 ? diffDays : 30);
                        }
                        setLineItems(quoteData.lineItems || []);
                        setTaxRate(quoteData.taxRate || 0);
                        setPresentationMode(quoteData.presentationMode || 'detailed');
                        setDisplayTax(quoteData.displayTax !== false); // Default to true
                        setDiscountType(quoteData.discountType || 'fixed');
                        setDiscountValue(quoteData.discountValue || quoteData.discount || 0);
                        if (quoteData.agreement) {
                            setRequiresDeposit(quoteData.agreement.requiresDeposit || false);
                            if (quoteData.agreement.depositAmount) {
                                setDepositAmount(quoteData.agreement.depositAmount);
                                if (!quoteData.depositCondition) {
                                    setDepositCondition('custom');
                                }
                            }
                            if (quoteData.agreement.signatureRequired !== undefined) {
                                setSignatureRequired(quoteData.agreement.signatureRequired);
                            }
                        }
                        if (quoteData.depositCondition) {
                            const isDraftOrReview = quoteData.status === 'draft' || quoteData.status === 'tech_review';
                            if (isDraftOrReview && quoteData.depositCondition !== 'custom' && quoteData.depositCondition !== 'none') {
                                setDepositCondition('policy');
                            } else {
                                setDepositCondition(quoteData.depositCondition);
                            }
                        }
                        if (quoteData.overrunProtection) {
                            setOverrunSettings(quoteData.overrunProtection);
                        }
                        if (quoteData.agreement?.jurisdictionState) {
                            setJurisdictionState(quoteData.agreement.jurisdictionState);
                        }
                    }
                }

                if (currentJobId) {
                    // Load job
                    const jobDoc = await getDoc(doc(db, 'jobs', currentJobId));
                    if (jobDoc.exists()) {
                        const jobData = { id: jobDoc.id, ...jobDoc.data() } as Job;
                        setJob(jobData);
                        if (!quoteId) {
                            setScopeOfWork(jobData.request?.description || '');
                            if (jobData.estimated_duration) {
                                setEstimatedDuration(jobData.estimated_duration);
                            }
                            if ((jobData as any).aiRecommendation) {
                                setAiRecommendation((jobData as any).aiRecommendation);
                            }
                            if ((jobData as any).costBreakdown) {
                                const cb = (jobData as any).costBreakdown;
                                const loadedItems: QuoteLineItem[] = [];
                                if (cb.labor?.hours > 0) {
                                    loadedItems.push({
                                        id: `item-labor-${Date.now()}`,
                                        type: 'labor',
                                        description: `Labor: Service & Installation (${cb.labor.hours} hr${cb.labor.hours > 1 ? 's' : ''})`,
                                        quantity: cb.labor.hours,
                                        unit: 'hours',
                                        unitPrice: cb.labor.rate || 85,
                                        total: cb.labor.hours * (cb.labor.rate || 85),
                                        taxable: true,
                                        isOptional: false,
                                    });
                                }
                                if (Array.isArray(cb.parts)) {
                                    cb.parts.forEach((p: any, idx: number) => {
                                        loadedItems.push({
                                            id: `item-part-${Date.now()}-${idx}`,
                                            type: 'material',
                                            description: p.name,
                                            quantity: p.quantity || 1,
                                            unit: 'each',
                                            unitPrice: p.customerPrice || 0,
                                            baseCost: p.baseCost,
                                            markupPercentage: p.markupPercent,
                                            total: (p.quantity || 1) * (p.customerPrice || 0),
                                            taxable: true,
                                            isOptional: false,
                                            priceSource: p.vendorName ? 'vendor' : 'ai_estimate',
                                            vendorName: p.vendorName,
                                            vendorProductUrl: p.vendorProductUrl,
                                            alternateVendors: p.alternateVendors
                                        });
                                    });
                                }
                                if (loadedItems.length > 0) {
                                    setLineItems(loadedItems);
                                }
                            }
                        }
                        if (jobData.customer_id) {
                            const custDoc = await getDoc(doc(db, 'customers', jobData.customer_id));
                            if (custDoc.exists()) {
                                const customer = { id: custDoc.id, ...custDoc.data() } as Customer;
                                setCustomerData(customer);

                                // Auto-resolve tax rate based on location/address for new quotes
                                if (!quoteId) {
                                    const primaryAddr = customer.addresses?.find((a: any) => a.isDefault) || customer.addresses?.[0];
                                    const customerAddressStr = primaryAddr ? `${primaryAddr.street || ''}, ${primaryAddr.city || ''}, ${primaryAddr.state || ''} ${primaryAddr.zip || ''}`.trim() : '';
                                    const jobAddress = jobData.customer?.address || customerAddressStr || '';
                                    if (jobAddress) {
                                        try {
                                            const { httpsCallable } = await import('firebase/functions');
                                            const { functions } = await import('../firebase');
                                            const lookupFn = httpsCallable(functions, 'lookupLocationTaxRate');
                                            const res = await lookupFn({
                                                address: jobAddress,
                                                orgId: orgId
                                            });
                                            const resData = res.data as any;
                                            if (resData && resData.taxRate !== undefined) {
                                                setTaxRate(resData.taxRate);
                                            }
                                        } catch (e) {
                                            console.error('Error auto-resolving tax rate for quote location:', e);
                                        }
                                    }

                                    // Auto-detect jurisdiction from customer address for T&C
                                    if (!quoteId) {
                                        const addrForJurisdiction = jobAddress || customerAddressStr || '';
                                        const detectedState = extractJurisdictionFromAddress(addrForJurisdiction, primaryAddr);
                                        if (detectedState) {
                                            setJurisdictionState(detectedState);
                                        }
                                    }}
                            }
                        }
                    }
                }

                if (user?.uid) {
                    const techDoc = await getDoc(doc(db, 'technicians', user.uid));
                    if (techDoc.exists() && techDoc.data().rateCard) {
                        setRateCard(techDoc.data().rateCard as RateCardMatrix);
                    }
                }

                // Load materials for dropdown (with org_id and organizationId support)
                if (orgId) {
                    let materialsSnapshot = await getDocs(query(
                        collection(db, 'materials'),
                        where('org_id', '==', orgId)
                    ));
                    if (materialsSnapshot.empty) {
                        materialsSnapshot = await getDocs(query(
                            collection(db, 'materials'),
                            where('organizationId', '==', orgId)
                        ));
                    }
                    const materialsData = materialsSnapshot.docs.map(d => ({
                        id: d.id,
                        ...d.data()
                    })) as MaterialItem[];
                    setMaterials(materialsData);

                    // Load tools to check existing inventory against AI quote recommendations
                    let toolsSnapshot = await getDocs(query(
                        collection(db, 'tools'),
                        where('org_id', '==', orgId)
                    ));
                    if (toolsSnapshot.empty) {
                        toolsSnapshot = await getDocs(query(
                            collection(db, 'tools'),
                            where('organizationId', '==', orgId)
                        ));
                    }
                    const toolsData = toolsSnapshot.docs.map(d => ({
                        id: d.id,
                        ...d.data()
                    }));
                    setOrgTools(toolsData);

                    // Load vendors for dropdown (with fallback support)
                    let vendorsSnapshot = await getDocs(query(
                        collection(db, 'vendors'),
                        where('organizationId', '==', orgId)
                    ));
                    if (vendorsSnapshot.empty) {
                        vendorsSnapshot = await getDocs(query(
                            collection(db, 'vendors'),
                            where('org_id', '==', orgId)
                        ));
                    }
                    const vendorsData = vendorsSnapshot.docs.map(d => ({
                        id: d.id,
                        name: d.data().name || '',
                        website: d.data().website || '',
                        isLocal: d.data().isLocal || false
                    }));
                    vendorsData.sort((a, b) => a.name.localeCompare(b.name));
                    setOrgVendors(vendorsData);

                    // Load org settings for upfront payment policy
                    try {
                        const orgDoc = await getDoc(doc(db, 'organizations', orgId));
                        if (orgDoc.exists()) {
                            const orgData = orgDoc.data();
                            const policy = orgData.settings?.upfrontPaymentPolicy;
                            if (policy) {
                                setUpfrontPolicy(policy);
                            }
                            const customJ = orgData.settings?.termsConfig?.customJurisdictions;
                            if (customJ) {
                                setCustomJurisdictions(customJ);
                            }
                            
                            // Auto-apply upfront payment policy for new quotes
                            if (!quoteId) {
                                const hasRules = policy?.defaultRules?.length > 0 || (policy?.defaultRule && policy.defaultRule !== 'none');
                                if (policy?.enabled && hasRules) {
                                    setDepositCondition('policy');
                                    setRequiresDeposit(true);
                                }
                            }
                        }
                    } catch (err) {
                        console.error('Error loading org settings:', err);
                    }
                }

            } catch (error) {
                console.error('Error loading data:', error);
            } finally {
                setLoading(false);
            }
        };

        loadData().then(() => {
            // Final fallback: if jurisdiction was never set (no address found), default to 'HI'
            setJurisdictionState(prev => prev || 'HI');
        });
    }, [jobId, quoteId, user?.uid]);

    const addLineItem = (type: QuoteLineItem['type']) => {
        let defaultPrice = 0;
        let defaultDesc = '';

        if (type === 'labor') {
            defaultDesc = 'Standard Labor';
            let hourlyRate = rateCard?.standardHourlyRate || 85;
            
            const tierId = customerData?.billing?.defaultRateTierId;
            if (tierId && rateCard?.customRates) {
                const tier = rateCard.customRates.find((t: any) => t.id === tierId);
                if (tier) {
                    defaultDesc = `Labor (${tier.name})`;
                    if (tier.condition.type === 'percentage') {
                        // Assuming negative amount is discount, positive is markup
                        hourlyRate = hourlyRate * (1 + (tier.condition.amount / 100));
                    } else if (tier.condition.type === 'hourly') {
                        hourlyRate = hourlyRate + tier.condition.amount;
                    } else if (tier.condition.type === 'flat') {
                        hourlyRate = tier.condition.amount;
                    }
                }
            }
            defaultPrice = hourlyRate;
        }

        const newItem: QuoteLineItem = {
            id: crypto.randomUUID(),
            type,
            description: defaultDesc,
            quantity: 1,
            unit: type === 'labor' ? 'hour' : 'each',
            unitPrice: defaultPrice,
            total: defaultPrice,
            taxable: type !== 'labor' && type !== 'discount',
            isOptional: false
        };
        setLineItems([...lineItems, newItem]);
    };

    const updateLineItem = (id: string, updates: Partial<QuoteLineItem>) => {
        setLineItems(lineItems.map(item => {
            if (item.id === id) {
                const updated = { ...item, ...updates };
                // Recalculate total
                updated.total = updated.quantity * updated.unitPrice;
                if (updated.type === 'discount') {
                    updated.total = -Math.abs(updated.total);
                }
                return updated;
            }
            return item;
        }));
    };

    const removeLineItem = (id: string) => {
        setLineItems(lineItems.filter(item => item.id !== id));
    };

    const addMaterialFromInventory = (material: MaterialItem) => {
        const markup = organization?.settings?.materialMarkup || 30;
        const initialAlternates = material.vendors ? material.vendors.map((v: any) => ({
            vendorId: v.vendorId || v.vendorName,
            vendorName: v.vendorName,
            unitCost: v.unitCost,
            vendorProductUrl: v.vendorProductUrl,
            vendorProductTitle: v.vendorProductTitle,
            stockQuantity: v.stockQuantity,
            isLocalVendor: v.isLocalVendor
        })) : [];

        const allOptions = buildAllVendorPricing(material.name, material.unitCost || (material.unitPrice ? material.unitPrice / 1.3 : 10), initialAlternates, orgVendors);
        const { selectedVendor, priorityReason } = selectVendorByOrgPriorities(allOptions, organization?.settings);
        const winning = selectedVendor || allOptions[0];
        const baseCost = winning ? winning.unitCost : (material.unitCost || 10);
        const unitPrice = material.unitPrice || Math.round(baseCost * (1 + markup / 100) * 100) / 100;
        const alternates = allOptions.filter(v => v.vendorName !== winning?.vendorName);

        const newItem: QuoteLineItem = {
            id: crypto.randomUUID(),
            type: 'material',
            description: material.name,
            quantity: 1,
            unit: material.unit || 'each',
            unitPrice: unitPrice,
            baseCost: baseCost,
            markupPercentage: markup,
            total: unitPrice,
            taxable: material.taxable !== false,
            materialId: material.id,
            isOptional: false,
            vendorName: winning?.vendorName,
            vendorProductUrl: winning?.vendorProductUrl,
            stockQuantity: winning?.stockQuantity,
            alternateVendors: alternates,
            priceSource: 'vendor',
            notes: priorityReason ? `Selected by ${priorityReason}` : undefined
        };
        setLineItems([...lineItems, newItem]);
    };

    const switchQuoteItemVendor = (itemId: string, vendor: AlternateVendor) => {
        setLineItems(prev => prev.map(item => {
            if (item.id !== itemId) return item;
            const updatedAlternates = (item.alternateVendors || [])
                .filter(v => v.vendorName !== vendor.vendorName && v.vendorId !== vendor.vendorId);
            if (item.vendorName && (item.baseCost || 0) > 0) {
                updatedAlternates.unshift({
                    vendorId: item.vendorName,
                    vendorName: item.vendorName,
                    unitCost: item.baseCost || 0,
                    vendorProductUrl: item.vendorProductUrl,
                    vendorProductTitle: item.description,
                    stockQuantity: item.stockQuantity,
                    isLocalVendor: isLocalVendor(item.vendorName)
                });
            }
            const markup = item.markupPercentage || organization?.settings?.materialMarkup || 30;
            const newUnitPrice = Math.round(vendor.unitCost * (1 + markup / 100) * 100) / 100;
            return {
                ...item,
                description: vendor.vendorProductTitle || item.description,
                baseCost: vendor.unitCost,
                unitPrice: newUnitPrice,
                total: item.quantity * newUnitPrice,
                vendorName: vendor.vendorName,
                vendorProductUrl: vendor.vendorProductUrl,
                stockQuantity: vendor.stockQuantity,
                priceSource: 'vendor' as const,
                alternateVendors: updatedAlternates.length > 0 ? updatedAlternates : undefined,
            };
        }));
    };

    const handleQuoteVendorSelect = (itemId: string, value: string) => {
        const item = lineItems.find(i => i.id === itemId);
        if (!item) return;

        if (value === 'SEARCH_CATALOG') {
            setIsLookupModalOpen(true);
            return;
        }

        const raw = value.startsWith('ALT:') ? value.replace('ALT:', '') : value.startsWith('SEARCH:') ? value.replace('SEARCH:', '') : value;
        const [vendorKey, customPriceStr] = raw.split(':');

        // 1. Direct match in item.alternateVendors
        const altMatch = (item.alternateVendors || []).find(v => v.vendorId === vendorKey || v.vendorName === vendorKey);
        if (altMatch) {
            switchQuoteItemVendor(itemId, altMatch);
            return;
        }

        // 2. Match in orgVendors with derived customPrice
        const orgVendor = orgVendors.find(v => v.id === vendorKey || v.name === vendorKey);
        const unitCost = customPriceStr ? parseFloat(customPriceStr) : (item.baseCost || 10);
        switchQuoteItemVendor(itemId, {
            vendorId: orgVendor?.id || vendorKey,
            vendorName: orgVendor?.name || vendorKey,
            unitCost: unitCost,
            isLocalVendor: isLocalVendor(vendorKey)
        });
    };

    const handleRevertToPreviousQuote = (targetSnapshotId?: string) => {
        const target = targetSnapshotId
            ? aiQuoteHistory.find(s => s.id === targetSnapshotId)
            : aiQuoteHistory[0];

        if (!target) {
            toast.error('No previous quote version found in history.');
            return;
        }

        setLineItems(target.lineItems);
        if (target.recommendation) {
            setAiRecommendation(target.recommendation);
        }
        if (target.estimatedDuration) {
            setEstimatedDuration(target.estimatedDuration);
        }
        if (target.scope) {
            setScopeOfWork(target.scope);
        }
        toast.success(`↺ Restored quote: ${target.label} ($${target.total.toFixed(2)})`);
    };

    const handleGenerateAIQuote = async (customModNote?: string | any) => {
        const modNote = (typeof customModNote === 'string' ? customModNote : aiModificationNote).trim();
        const desc = scopeOfWork.trim();
        if (!desc || desc.length < 5) {
            toast.error('Please enter a brief description in Scope of Work first.');
            const el = document.getElementById('scope-of-work-textarea');
            if (el) el.focus();
            return;
        }

        // Store snapshot of current quote before modifying so user never loses their work
        const currentTotal = lineItems.reduce((sum, item) => sum + item.total, 0);
        if (lineItems.length > 0) {
            const snapshot = {
                id: `snap-${Date.now()}`,
                label: modNote ? `Before: "${modNote.length > 25 ? modNote.slice(0, 25) + '...' : modNote}"` : 'Initial Quote',
                lineItems: [...lineItems],
                total: currentTotal,
                timestamp: Date.now(),
                recommendation: aiRecommendation,
                estimatedDuration,
                scope: scopeOfWork,
            };
            setAiQuoteHistory(prev => [snapshot, ...prev.slice(0, 8)]);
            setStoredAiQuote({
                diagnosis: aiRecommendation?.diagnosis,
                solution: aiRecommendation?.solution,
                partsNeeded: aiRecommendation?.partsNeeded,
                toolsNeeded: aiRecommendation?.toolsNeeded,
                estimatedDuration,
                lineItems: [...lineItems],
                total: currentTotal,
                timestamp: Date.now(),
                scope: scopeOfWork,
                modNote,
            });
            try {
                sessionStorage.setItem(`stored_ai_quote_${quoteId || targetJobId || 'new'}`, JSON.stringify(snapshot));
            } catch (e) {
                console.warn('Failed to cache AI quote snapshot in sessionStorage', e);
            }
        }

        // Build existing quote payload so AI modifies the baseline quote rather than starting from scratch
        const previousEstimatePayload = lineItems.length > 0 ? {
            diagnosis: aiRecommendation?.diagnosis || storedAiQuote?.diagnosis,
            solution: aiRecommendation?.solution || storedAiQuote?.solution,
            estimatedDuration: estimatedDuration || storedAiQuote?.estimatedDuration || 60,
            partsNeeded: aiRecommendation?.partsNeeded || storedAiQuote?.partsNeeded || [],
            toolsNeeded: aiRecommendation?.toolsNeeded || storedAiQuote?.toolsNeeded || [],
            existingLineItems: lineItems.map(item => ({
                id: item.id,
                type: item.type,
                description: item.description,
                quantity: item.quantity,
                unit: item.unit,
                unitPrice: item.unitPrice,
                baseCost: item.baseCost,
                vendorName: item.vendorName,
                total: item.total,
            })),
            modificationRequest: modNote || undefined,
            originalScope: desc,
        } : undefined;

        setAiLoading(true);
        setAiError('');

        try {
            const orgId = (user as any)?.org_id || organization?.id || 'demo-org';
            const customerName = job?.customer?.name || standaloneCustomerName || 'Customer';
            const customerAddress = job?.customer?.address || standaloneCustomerAddress || '';

            const generateEstimate = httpsCallable(functions, 'generateJobEstimate');
            const result = await generateEstimate({
                description: desc,
                modificationRequest: modNote || undefined,
                previousEstimate: previousEstimatePayload,
                orgId,
                customerName,
                address: customerAddress || undefined,
            });

            const data = result.data as any;
            if (!data?.success || !data?.recommendation) {
                toast.error(data?.error || 'AI estimate did not return a valid recommendation.');
                return;
            }

            const rec = data.recommendation;

            // CRITICAL GUARD: If the AI failed or returned an empty diagnosis while we already have line items,
            // DO NOT destroy the existing quote!
            const isFailedAnalysis = (rec.diagnosis && rec.diagnosis.includes('AI analysis could not be completed')) ||
                                     (!rec.partsNeeded?.length && !rec.solution && lineItems.length > 0);

            if (isFailedAnalysis) {
                toast.error('AI was unable to refine the quote with this request. Your existing quote has been kept intact.');
                return;
            }

            setAiRecommendation(rec);

            // Update estimated duration
            if (rec.estimatedDuration) {
                setEstimatedDuration(rec.estimatedDuration);
            }

                // If a modification note was processed, document it in Scope of Work
                if (modNote) {
                    setScopeOfWork(prev => {
                        if (!prev.includes(modNote)) {
                            return `${prev}\n\n[Modification Request: ${modNote}]`.trim();
                        }
                        return prev;
                    });
                    setAiModificationNote('');
                } else if (rec.diagnosis && rec.solution) {
                    // Append diagnosis & recommended solution to Scope of Work if not already present
                    setScopeOfWork(prev => {
                        if (!prev.includes('Recommended Solution:')) {
                            return `${prev}\n\nDiagnosis: ${rec.diagnosis}\n\nRecommended Solution: ${rec.solution}`.trim();
                        }
                        return prev;
                    });
                }

                // Build line items
                const newLineItems: QuoteLineItem[] = [];

                // 1. Labor line item
                const durationMin = rec.estimatedDuration || 120;
                const laborHours = Math.max(0.5, Math.round((durationMin / 60) * 2) / 2);
                const hourlyRate = rateCard?.standardHourlyRate || organization?.settings?.defaultHourlyRate || 100;
                newLineItems.push({
                    id: `labor-${Date.now()}`,
                    type: 'labor',
                    description: `Standard Labor: Service & Installation (${laborHours} hr${laborHours > 1 ? 's' : ''})`,
                    quantity: laborHours,
                    unit: 'hour',
                    unitPrice: hourlyRate,
                    total: laborHours * hourlyRate,
                    taxable: false,
                    isOptional: false,
                });

                // 2. Material line items
                const markup = organization?.settings?.materialMarkup || 30;
                const parts = rec.partsNeeded || [];
                const searchVendorCatalogFn = httpsCallable(functions, 'searchVendorCatalog');
                const defaultTargetVendor = organization?.settings?.defaultVendorId || (orgVendors[0]?.name) || 'Home Depot';

                for (const p of parts) {
                    if (!p || !p.name) continue;

                    // Match against org inventory materials using strict matching
                    const matchedMat = findBestMatchingMaterial(p.name, materials);

                    let baseCost = p.estimatedCost || p.unitCost || (matchedMat ? matchedMat.unitCost : 0) || 12;
                    let initialAlternates: AlternateVendor[] = [];
                    let resolvedProductTitle = p.vendorProductTitle || p.name;
                    let resolvedProductUrl = p.vendorProductUrl || '';

                    if (matchedMat?.vendors && matchedMat.vendors.length > 0) {
                        initialAlternates = matchedMat.vendors.map((v: any) => ({
                            vendorId: v.vendorId || v.vendorName,
                            vendorName: v.vendorName,
                            unitCost: v.unitCost,
                            vendorProductUrl: v.vendorProductUrl,
                            vendorProductTitle: v.vendorProductTitle,
                            stockQuantity: v.stockQuantity,
                            isLocalVendor: v.isLocalVendor,
                        }));
                        if (matchedMat.unitCost && (!baseCost || baseCost <= 0)) {
                            baseCost = matchedMat.unitCost;
                        }
                    } else {
                        // Include any vendor already resolved by AI job estimate
                        if (p.vendorName && (p.estimatedCost || p.unitCost)) {
                            initialAlternates.push({
                                vendorId: p.vendorName,
                                vendorName: p.vendorName,
                                unitCost: p.estimatedCost || p.unitCost,
                                vendorProductUrl: p.vendorProductUrl,
                                vendorProductTitle: p.vendorProductTitle || p.name,
                                stockQuantity: 10,
                                isLocalVendor: isLocalVendor(p.vendorName)
                            });
                        }
                        if (p.alternateVendors && p.alternateVendors.length > 0) {
                            for (const alt of p.alternateVendors) {
                                if (!initialAlternates.some(a => a.vendorName === alt.vendorName)) {
                                    initialAlternates.push(alt);
                                }
                            }
                        }

                        // Query live vendor catalog / cache if not in inventory
                        try {
                            const catRes: any = await Promise.race([
                                searchVendorCatalogFn({ vendorName: defaultTargetVendor, searchTerm: p.name }),
                                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3500))
                            ]);
                            const catProducts = catRes?.data?.products;
                            if (Array.isArray(catProducts) && catProducts.length > 0) {
                                catProducts.forEach((cp: any, cpIdx: number) => {
                                    const priceVal = parseFloat(String(cp.price || '').replace(/[^0-9.]/g, '')) || 0;
                                    if (priceVal > 0) {
                                        const vendorNameForProduct = cp.vendorName || (cpIdx === 0 ? 'Home Depot' : (cpIdx === 1 ? "Lowe's" : (cpIdx === 2 ? 'Amazon Business' : 'Johnstone Supply')));
                                        initialAlternates.push({
                                            vendorId: vendorNameForProduct,
                                            vendorName: vendorNameForProduct,
                                            unitCost: priceVal,
                                            vendorProductTitle: cp.title,
                                            vendorProductUrl: cp.url,
                                            stockQuantity: 10,
                                            isLocalVendor: isLocalVendor(vendorNameForProduct)
                                        });
                                        if (cpIdx === 0 && (!baseCost || baseCost <= 15)) {
                                            baseCost = priceVal;
                                            resolvedProductTitle = cp.title;
                                            resolvedProductUrl = cp.url;
                                        }
                                    }
                                });
                            }
                        } catch {
                            // Fallback to synthetic multi-vendor pricing matrix gracefully
                        }
                    }

                    // Build full multi-supplier pricing matrix
                    const allVendorOptions = buildAllVendorPricing(p.name, baseCost, initialAlternates, orgVendors);

                    // Choose winning supplier based on the priorities the organization has configured
                    const { selectedVendor, priorityReason } = selectVendorByOrgPriorities(allVendorOptions, organization?.settings);
                    const winningVendor = selectedVendor || allVendorOptions[0];
                    const finalBaseCost = winningVendor ? winningVendor.unitCost : baseCost;
                    const qty = p.quantity || 1;
                    const customerPrice = Math.round(finalBaseCost * (1 + markup / 100) * 100) / 100;

                    // Remaining suppliers are the alternates for the dropdown
                    const alternates = allVendorOptions.filter(v => v.vendorName !== winningVendor?.vendorName);

                    const finalDescription = winningVendor?.vendorProductTitle && winningVendor.vendorProductTitle !== `${p.name} (${winningVendor.vendorName})`
                        ? winningVendor.vendorProductTitle
                        : (resolvedProductTitle || p.name);

                    newLineItems.push({
                        id: `mat-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                        type: 'material',
                        description: finalDescription,
                        quantity: qty,
                        unit: 'each',
                        unitPrice: customerPrice,
                        baseCost: finalBaseCost,
                        markupPercentage: markup,
                        total: qty * customerPrice,
                        taxable: true,
                        isOptional: false,
                        priceSource: 'vendor',
                        vendorName: winningVendor?.vendorName,
                        vendorProductUrl: winningVendor?.vendorProductUrl || resolvedProductUrl,
                        stockQuantity: winningVendor?.stockQuantity,
                        alternateVendors: alternates,
                        notes: priorityReason ? `Selected by ${priorityReason}` : undefined
                    });
                }

                // 3. Tool & Equipment line items
                const toolsList: Array<{ name: string; quantity?: number; estimatedCost?: number }> = [];
                if (Array.isArray(rec.requiredTools)) {
                    for (const t of rec.requiredTools) {
                        const tName = typeof t === 'string' ? t : t.name;
                        if (tName) toolsList.push({ name: tName, quantity: 1, estimatedCost: (t as any).estimatedCost });
                    }
                } else if (Array.isArray(rec.toolsNeeded)) {
                    for (const t of rec.toolsNeeded) {
                        const tName = typeof t === 'string' ? t : t.name;
                        if (tName) toolsList.push({ name: tName, quantity: 1 });
                    }
                }

                for (const tool of toolsList) {
                    // Do not bill customer for tools that the shop/technician already owns in inventory or standard contractor tools
                    if (isToolOwnedOrStandard(tool.name, orgTools)) {
                        console.log(`[Quote AI] Excluded tool "${tool.name}" - already owned in shop inventory or standard technician equipment.`);
                        continue;
                    }

                    const toolCost = tool.estimatedCost || 35;
                    const toolOptions = buildAllVendorPricing(tool.name, toolCost, [], orgVendors);
                    const { selectedVendor: toolWinner, priorityReason: toolPriorityReason } = selectVendorByOrgPriorities(toolOptions, organization?.settings);
                    const winningTool = toolWinner || toolOptions[0];
                    const finalToolCost = winningTool ? winningTool.unitCost : toolCost;
                    const toolCustomerPrice = Math.round(finalToolCost * (1 + markup / 100) * 100) / 100;
                    const toolAlternates = toolOptions.filter(v => v.vendorName !== winningTool?.vendorName);

                    newLineItems.push({
                        id: `tool-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                        type: 'equipment',
                        description: winningTool?.vendorProductTitle || tool.name,
                        quantity: tool.quantity || 1,
                        unit: 'each',
                        unitPrice: toolCustomerPrice,
                        baseCost: finalToolCost,
                        markupPercentage: markup,
                        total: (tool.quantity || 1) * toolCustomerPrice,
                        taxable: true,
                        isOptional: false,
                        priceSource: 'vendor',
                        vendorName: winningTool?.vendorName,
                        vendorProductUrl: winningTool?.vendorProductUrl,
                        stockQuantity: winningTool?.stockQuantity,
                        alternateVendors: toolAlternates,
                        notes: toolPriorityReason ? `Selected by ${toolPriorityReason}` : undefined
                    });
                }

                setLineItems(newLineItems);

                // Update stored snapshot with the new quote version
                const newTotal = newLineItems.reduce((sum, item) => sum + item.total, 0);
                const newSnapshot = {
                    id: `snap-${Date.now()}`,
                    label: modNote ? `Modified: "${modNote.length > 25 ? modNote.slice(0, 25) + '...' : modNote}"` : 'AI Generated Quote',
                    lineItems: newLineItems,
                    total: newTotal,
                    timestamp: Date.now(),
                    recommendation: rec,
                    estimatedDuration: rec.estimatedDuration || estimatedDuration,
                    scope: scopeOfWork,
                    diagnosis: rec.diagnosis,
                    solution: rec.solution,
                    partsNeeded: rec.partsNeeded,
                    toolsNeeded: rec.toolsNeeded || rec.requiredTools || [],
                    modNote: modNote || undefined,
                };
                setStoredAiQuote(newSnapshot);
                try {
                    sessionStorage.setItem(`stored_ai_quote_${quoteId || targetJobId || 'new'}`, JSON.stringify(newSnapshot));
                } catch (e) {
                    console.warn('Failed to cache AI quote snapshot in sessionStorage', e);
                }

                toast.success(modNote ? `✨ AI Quote refined with: "${modNote}"` : `✨ AI Quote generated with ${newLineItems.length} line items!`);
        } catch (err: any) {
            console.error('Failed to generate AI quote:', err);
            toast.error(err?.message || 'Failed to generate AI quote');
            setAiError(err?.message || 'Failed to generate AI quote');
        } finally {
            setAiLoading(false);
        }
    };

    // Calculate totals
    const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
    const taxableAmount = lineItems.filter(item => item.taxable).reduce((sum, item) => sum + item.total, 0);
    
    // Ensure subtotal isn't negative if it's strange data
    const discountAmount = discountType === 'percentage' 
        ? (subtotal * discountValue) / 100 
        : discountValue;
        
    // Calculate tax on the post-discount taxable amount (assuming discount applies proportionally)
    const taxAmount = displayTax ? (taxableAmount * taxRate) / 100 : 0; // For simplicity, we just calculate tax and don't apply discount to tax unless needed.
    const total = subtotal + taxAmount - discountAmount;

    useEffect(() => {
        const result = recalculateDepositForQuote({
            total,
            lineItems,
            depositCondition,
            existingDepositAmount: depositAmount,
            requiresDeposit,
            upfrontPolicy,
            customerData
        });

        setRequiresDeposit(result.requiresDeposit);
        setDepositAmount(result.depositAmount);
        setEvaluatedRule(result.evaluatedRule);
    }, [depositCondition, total, lineItems, upfrontPolicy, customerData]);

    const handleSaveQuote = async (sendToCustomer: boolean = false) => {
        if (!user?.uid) return;

        // For standalone quotes, validate customer fields
        const effectiveCustomer = job ? job.customer : {
            name: standaloneCustomerName.trim(),
            email: standaloneCustomerEmail.trim(),
            address: standaloneCustomerAddress.trim(),
            phone: standaloneCustomerPhone.trim()
        };

        if (!effectiveCustomer.name) {
            toast.error('Customer name is required');
            return;
        }
        if (sendToCustomer && !effectiveCustomer.email) {
            toast.error('Customer email is required to send the quote');
            return;
        }

        setSaving(true);
        try {
            const orgId = (user as any).org_id;
            const now = new Date();
            const validUntil = new Date(now.getTime() + validDays * 24 * 60 * 60 * 1000);

            const depositRecalc = recalculateDepositForQuote({
                total,
                lineItems,
                depositCondition,
                existingDepositAmount: depositAmount,
                requiresDeposit,
                upfrontPolicy,
                customerData
            });

            const quoteData: Omit<Quote, 'id'> = {
                org_id: orgId,
                job_id: job?.id || '',
                customer_id: job?.customer_id || '',
                tech_id: user.uid,
                quoteNumber: existingQuote?.quoteNumber || generateQuoteNumber(),
                version: (existingQuote?.version || 0) + 1,
                scopeOfWork,
                lineItems,
                subtotal,
                taxRate,
                taxAmount,
                discount: discountAmount,
                discountType,
                discountValue,
                presentationMode,
                displayTax,
                discountReason: discountAmount > 0 ? discountReason : '',
                total,
                overrunProtection: overrunSettings,
                estimatedDuration,
                validUntil: validUntil,
                agreement: {
                    termsVersion: '1.0',
                    jurisdictionState,
                    requiresDeposit: depositRecalc.requiresDeposit,
                    depositAmount: depositRecalc.depositAmount,
                    depositPercent: depositRecalc.depositPercent,
                    signatureRequired: signatureRequired
                },
                status: sendToCustomer ? 'sent' : 'draft',
                depositCondition: depositCondition === 'policy' ? depositRecalc.evaluatedRule : depositCondition,
                createdAt: existingQuote?.createdAt || serverTimestamp(),
                updatedAt: serverTimestamp(),
                createdBy: existingQuote?.createdBy || user.uid,
                sentAt: sendToCustomer ? serverTimestamp() : undefined,
                sentVia: sendToCustomer ? 'link' : undefined,
                customerNotes: existingQuote?.customerNotes || [],
                customer: existingQuote?.customer || effectiveCustomer
            };

            let docId = '';

            if (existingQuote) {
                docId = existingQuote.id;
                
                if (sendToCustomer && existingQuote.status === 'tech_review') {
                    // Use quoteService back-and-forth logic
                    const { updateAndResendQuote } = await import('../lib/quoteService');
                    await updateAndResendQuote({
                        quoteId: docId,
                        updates: { ...quoteData, status: 'sent' } as any,
                        techName: (user as any).name || user?.displayName || 'Technician',
                        techNotes: revisionComment.trim() || undefined,
                    });
                } else {
                    // Direct update — also append revision comment if provided
                    const quoteRef = doc(db, 'quotes', docId);
                    const updateData = { ...quoteData };
                    delete (updateData as any).createdAt;
                    delete (updateData as any).createdBy;

                    // Add tech comment if provided
                    if (revisionComment.trim()) {
                        const existingNotes = existingQuote.customerNotes || [];
                        const techComment = {
                            text: revisionComment.trim(),
                            createdAt: new Date().toISOString(),
                            author: 'tech' as const,
                            type: 'message' as const,
                        };
                        updateData.customerNotes = [...existingNotes, techComment];
                    }

                    // Add status change note when sending to customer
                    if (sendToCustomer) {
                        const notes = updateData.customerNotes || existingQuote.customerNotes || [];
                        const statusNote = {
                            text: `Quote updated and sent to customer`,
                            createdAt: new Date().toISOString(),
                            author: 'system' as const,
                            type: 'status_change' as const,
                            waitingFor: 'customer' as const,
                        };
                        updateData.customerNotes = [...notes, statusNote];
                    }

                    await updateDoc(quoteRef, sanitizeForFirestore(updateData));
                }
            } else {
                const docRef = await addDoc(collection(db, 'quotes'), sanitizeForFirestore(quoteData));
                docId = docRef.id;
            }

            if (sendToCustomer && !existingQuote?.status) {
                // Use quote service to send NEW quote
                const { sendQuoteToCustomer } = await import('../lib/quoteService');
                const quoteLink = await sendQuoteToCustomer({
                    quoteId: docId,
                    customerEmail: effectiveCustomer.email,
                    customerName: effectiveCustomer.name,
                    techName: (user as any).name || 'Technician',
                    sentBy: user.uid
                });

                alert(`Quote emailed to ${effectiveCustomer.email}!\n\nDirect link:\n${quoteLink}`);
            } else if (sendToCustomer && existingQuote?.status === 'tech_review') {
                 alert(`Quote revised and emailed back to customer!`);
            } else if (sendToCustomer && existingQuote?.status !== 'tech_review') {
                 // re-sending existing quote that wasn't in tech_review
                 const { sendQuoteToCustomer } = await import('../lib/quoteService');
                 await sendQuoteToCustomer({
                     quoteId: docId,
                     customerEmail: effectiveCustomer.email,
                     customerName: effectiveCustomer.name,
                     techName: (user as any).name || 'Technician',
                     sentBy: user.uid
                 });
                 alert(`Quote emailed to ${effectiveCustomer.email}!`);
            }

            if (sendToCustomer) {
                // Navigate to the quote detail view when sent
                navigate(`/quote/${docId}`);
            } else {
                // Stay on the quotes dashboard so the saved draft is visible
                navigate('/quotes');
            }

        } catch (error) {
            console.error('Error saving quote:', error);
            alert('Failed to save quote. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    if (!job && !isStandalone) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                    <p className="text-gray-600">Job not found</p>
                    <button
                        onClick={() => navigate(-1)}
                        className="mt-4 text-blue-600 hover:text-blue-700"
                    >
                        Go back
                    </button>
                </div>
            </div>
        );
    }

    const isManualMode = searchParams.get('mode') === 'manual';

    if ((existingQuote?.status === 'tech_review' || existingQuote?.status === 'draft') && !isManualMode) {
        return (
            <div className="min-h-screen bg-gray-50 py-6">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                    {/* Header */}
                    <div className="flex items-center gap-4 mb-6">
                        <button
                            onClick={() => navigate(-1)}
                            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700 transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                                <Sparkles className="w-6 h-6 text-indigo-600 animate-pulse" />
                                Review & Revise Quote (AI Assisted)
                            </h1>
                            <p className="text-gray-500 mb-1">
                                {job ? `For Job #${job.id.slice(0, 8)} - ${job.customer.name}` : `For ${standaloneCustomerName || 'Standalone Customer'}`}
                            </p>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-md border border-indigo-100 p-6">
                        <div className="mb-4">
                            <h2 className="text-base font-bold text-gray-800">AI Quote Generator</h2>
                            <p className="text-sm text-gray-500 mt-1">
                                Review the customer's requested changes, apply the AI-suggested revision, and edit or refine individual line items as needed.
                            </p>
                        </div>

                        <InlineAIQuotePanel
                            job={{ id: job.id, active_quote_id: quoteId }}
                            onQuoteSent={() => {
                                toast.success('Quote updated and sent!');
                                navigate('/quotes');
                            }}
                            onNavigateToQuote={(jobId, qId) => {
                                navigate(`/quotes/${qId}/edit?mode=manual`);
                            }}
                        />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-6">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">
                            {existingQuote ? 'Edit Quote' : isStandalone ? 'New Standalone Quote' : 'Create Quote'}
                        </h1>
                        <p className="text-gray-500 mb-1">
                            {job ? `For Job #${job.id.slice(0, 8)} - ${job.customer.name}` : 'Manual quote — not linked to a job'}
                        </p>
                        {existingQuote?.previousVersions && existingQuote.previousVersions.length > 0 && (
                            <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                Version {existingQuote.version} • {existingQuote.previousVersions.length} previous version{existingQuote.previousVersions.length !== 1 ? 's' : ''}
                            </div>
                        )}
                    </div>
                </div>

                {/* Customer Change Request Alert Banner */}
                {existingQuote?.status === 'tech_review' && (
                    <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-5 mb-6 shadow-sm flex items-start gap-4">
                        <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <h3 className="text-base font-bold text-amber-900">Customer Requested Quote Changes</h3>
                                <span className="px-2.5 py-0.5 bg-amber-200 text-amber-800 rounded-full text-xs font-bold uppercase">Needs Review</span>
                            </div>
                            <p className="text-sm text-amber-800 mb-3">
                                The customer reviewed this quote and submitted revision notes below. Review the proposed adjustments, modify the line items or scope of work accordingly, and re-send the quote.
                            </p>
                            {existingQuote.customerNotes && existingQuote.customerNotes.length > 0 && (
                                <div className="p-3 bg-white rounded-lg border border-amber-200 text-sm text-gray-800 font-medium shadow-2xs">
                                    "{existingQuote.customerNotes[existingQuote.customerNotes.length - 1]?.text}"
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Customer Proposed Changes History */}
                {existingQuote?.customerNotes && existingQuote.customerNotes.length > 0 && existingQuote.status !== 'tech_review' && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">Customer Communication History</h2>
                        <div className="space-y-4">
                            {existingQuote.customerNotes.map((note, index) => (
                                <div key={index} className={`flex flex-col ${note.author === 'tech' ? 'items-end' : 'items-start'}`}>
                                    <div className={`p-3 rounded-lg max-w-[80%] ${note.author === 'tech' ? 'bg-blue-100 text-blue-900' : 'bg-white border text-gray-800'}`}>
                                        <p className="text-sm shadow-sm">{note.text}</p>
                                    </div>
                                    <span className="text-xs text-gray-500 mt-1">
                                        {note.author === 'tech' ? 'You' : 'Customer'} • {new Date(note.createdAt).toLocaleString()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Standalone Customer Entry */}
                {isStandalone && (
                    <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <User className="w-5 h-5 text-blue-600" />
                            Customer Information
                        </h2>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Customer Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={standaloneCustomerName}
                                    onChange={(e) => setStandaloneCustomerName(e.target.value)}
                                    placeholder="John Smith"
                                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Email <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="email"
                                    value={standaloneCustomerEmail}
                                    onChange={(e) => setStandaloneCustomerEmail(e.target.value)}
                                    placeholder="john@example.com"
                                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                                <input
                                    type="tel"
                                    value={standaloneCustomerPhone}
                                    onChange={(e) => setStandaloneCustomerPhone(e.target.value)}
                                    placeholder="555-123-4567"
                                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                                <input
                                    type="text"
                                    value={standaloneCustomerAddress}
                                    onChange={(e) => setStandaloneCustomerAddress(e.target.value)}
                                    placeholder="123 Main St, Honolulu, HI 96801"
                                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Job Info Summary (only when linked to a job) */}
                {job && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                    <div className="flex items-start gap-3">
                        <FileText className="w-5 h-5 text-blue-600 mt-0.5" />
                        <div>
                            <h3 className="font-medium text-blue-900">Job Request</h3>
                            <p className="text-blue-800 text-sm mt-1">{(job.request?.description || 'No description')}</p>
                        </div>
                    </div>
                </div>
                )}

                {/* Scope of Work */}
                <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-gray-900">Scope of Work</h2>
                        <span className="text-xs text-gray-500">
                            Describe the service needed to auto-generate quote items
                        </span>
                    </div>
                    <textarea
                        id="scope-of-work-textarea"
                        value={scopeOfWork}
                        onChange={(e) => setScopeOfWork(e.target.value)}
                        rows={4}
                        className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm leading-relaxed"
                        placeholder="Describe the work to be performed (e.g., installation of a freestanding refrigerator with water line and shut-off valve, HVAC tune-up, electrical breaker panel upgrade)..."
                    />

                    {/* Generate AI Quote Action Button or Refine with Modification Request */}
                    <div className="mt-3">
                        {lineItems.length === 0 && !aiRecommendation ? (
                            <>
                                <button
                                    type="button"
                                    onClick={() => handleGenerateAIQuote()}
                                    disabled={aiLoading}
                                    className="w-full py-3.5 px-5 bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-700 hover:via-indigo-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-xl font-bold flex items-center justify-center gap-2.5 shadow-md hover:shadow-lg transition-all transform active:scale-[0.99]"
                                >
                                    {aiLoading ? (
                                        <>
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            <span>Analyzing scope & generating AI quote line items...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-5 h-5" />
                                            <span>Generate AI Quote & Materials</span>
                                        </>
                                    )}
                                </button>
                                <p className="text-xs text-gray-500 text-center mt-1.5">
                                    AI analyzes the scope, calculates labor duration, checks your inventory materials & vendor pricing, and auto-fills quote line items.
                                </p>
                            </>
                        ) : (
                            <div className="p-4 bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 border border-purple-200 rounded-xl space-y-3 shadow-xs">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <Sparkles className="w-4 h-4 text-purple-700" />
                                        <span className="text-sm font-bold text-purple-950">Request AI Quote Modification</span>
                                        <span className="text-[10px] uppercase font-bold tracking-wider bg-purple-200/80 text-purple-900 px-2 py-0.5 rounded-full">
                                            Refine Quote
                                        </span>
                                        <span className="text-[11px] font-medium text-purple-800 bg-white/80 border border-purple-200 px-2 py-0.5 rounded-md">
                                            Baseline: {lineItems.length} item{lineItems.length !== 1 ? 's' : ''} (${subtotal.toFixed(2)})
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {aiQuoteHistory.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => handleRevertToPreviousQuote()}
                                                className="flex items-center gap-1 text-[11px] font-semibold text-purple-700 bg-white hover:bg-purple-100 border border-purple-300 rounded-lg px-2.5 py-1 transition shadow-2xs"
                                                title={`Revert back to ${aiQuoteHistory[0].label} ($${aiQuoteHistory[0].total.toFixed(2)})`}
                                            >
                                                <RotateCcw className="w-3 h-3 text-purple-600" />
                                                <span>Revert to Previous (${aiQuoteHistory[0].total.toFixed(2)})</span>
                                            </button>
                                        )}
                                        <span className="text-xs text-purple-700 hidden sm:inline">
                                            AI modifies the existing quote with your changes
                                        </span>
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row items-stretch gap-2">
                                    <input
                                        type="text"
                                        value={aiModificationNote}
                                        onChange={(e) => setAiModificationNote(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' && aiModificationNote.trim()) handleGenerateAIQuote(); }}
                                        placeholder="e.g., Needs a larger 12,000 BTU window AC unit instead, add electrical surge protector..."
                                        className="flex-1 px-3.5 py-2.5 bg-white border border-purple-300 focus:border-purple-600 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-purple-200 shadow-2xs"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleGenerateAIQuote()}
                                        disabled={aiLoading || !aiModificationNote.trim()}
                                        className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:from-gray-300 disabled:to-gray-400 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition shrink-0"
                                    >
                                        {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                        Refine Quote with AI
                                    </button>
                                </div>

                                <div className="flex items-center gap-1.5 flex-wrap text-xs pt-0.5">
                                    <span className="text-gray-500 font-medium text-[11px]">Quick adjustments:</span>
                                    {[
                                        'Needs larger 12,000 BTU unit',
                                        'Needs 10,000 BTU unit',
                                        'Add surge protector & disconnect',
                                        'Upgrade to inverter AC unit',
                                        'Increase labor to 2.5 hours'
                                    ].map((preset) => (
                                        <button
                                            key={preset}
                                            type="button"
                                            onClick={() => setAiModificationNote(preset)}
                                            className="px-2 py-0.5 bg-white border border-purple-200 hover:border-purple-400 hover:bg-purple-100/50 text-purple-700 rounded-md text-[11px] font-medium transition shadow-2xs"
                                        >
                                            + {preset}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* AI Assessment & Tools Banner */}
                    {aiRecommendation && (
                        <div className="mt-4 p-4 bg-purple-50/80 border border-purple-200 rounded-xl space-y-3">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center">
                                        <Sparkles className="w-4 h-4 text-purple-700" />
                                    </div>
                                    <span className="text-sm font-bold text-purple-900">AI Quote Assessment</span>
                                    {aiRecommendation.confidence != null && (
                                        <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200">
                                            {Math.round(aiRecommendation.confidence * 100)}% Confidence
                                        </span>
                                    )}
                                </div>
                                {estimatedDuration > 0 && (
                                    <span className="text-xs font-semibold text-purple-700 bg-white px-2.5 py-1 rounded-lg border border-purple-200">
                                        Est. Duration: {estimatedDuration < 60 ? `${estimatedDuration} min` : `${Math.floor(estimatedDuration / 60)}h ${estimatedDuration % 60 ? `${estimatedDuration % 60}m` : ''}`}
                                    </span>
                                )}
                            </div>

                            {aiRecommendation.diagnosis && (
                                <div>
                                    <span className="text-xs font-bold text-purple-900 uppercase tracking-wide">Diagnosis:</span>
                                    <p className="text-xs text-purple-800 mt-0.5">{aiRecommendation.diagnosis}</p>
                                </div>
                            )}

                            {aiRecommendation.solution && (
                                <div>
                                    <span className="text-xs font-bold text-purple-900 uppercase tracking-wide">Recommended Solution:</span>
                                    <p className="text-xs text-purple-800 mt-0.5">{aiRecommendation.solution}</p>
                                </div>
                            )}

                            {aiRecommendation.recommendedTools && aiRecommendation.recommendedTools.length > 0 && (
                                <div>
                                    <span className="text-xs font-bold text-purple-900 uppercase tracking-wide flex items-center gap-1 mb-1">
                                        <Wrench className="w-3.5 h-3.5" /> Recommended Tools:
                                    </span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {aiRecommendation.recommendedTools.map((t: string, idx: number) => (
                                            <span key={idx} className="text-[11px] font-medium px-2 py-0.5 bg-white text-purple-800 rounded-md border border-purple-200 shadow-2xs">
                                                {t}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Line Items */}
                <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-gray-100">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                Line Items
                                {lineItems.length > 0 && (
                                    <span className="text-xs bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-full">
                                        {lineItems.length}
                                    </span>
                                )}
                            </h2>
                            <p className="text-xs text-gray-500">Click a button below to add labor, materials, equipment, or other fees to your quote</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1 mr-1">
                                <Plus className="w-3.5 h-3.5 text-blue-600" /> Add:
                            </span>
                            {LINE_ITEM_TYPES.map(type => (
                                <button
                                    key={type.value}
                                    type="button"
                                    onClick={() => addLineItem(type.value as QuoteLineItem['type'])}
                                    title={`Click to add a new ${type.label} line item to this quote`}
                                    className="inline-flex items-center px-2.5 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-300 hover:border-blue-500 hover:bg-blue-50/70 hover:text-blue-700 rounded-lg transition-all shadow-2xs group"
                                >
                                    <Plus className="w-3 h-3 mr-1 text-gray-400 group-hover:text-blue-600 transition-colors" />
                                    <type.icon className="w-3.5 h-3.5 mr-1 text-gray-500 group-hover:text-blue-600 transition-colors" />
                                    <span>{type.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Materials Quick Add */}
                    {/* Search & Lookup Button */}
                    <div className="mb-4 flex items-center justify-between">
                        <button
                            type="button"
                            onClick={() => setIsLookupModalOpen(true)}
                            className="px-3.5 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors shadow-sm"
                        >
                            <Search className="w-4 h-4" /> Search & Add Material from Inventory or Vendor Catalogs
                        </button>
                    </div>

                    {materials.length > 0 && (
                        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                            <p className="text-sm font-medium text-gray-700 mb-2">Quick Add from Inventory:</p>
                            <div className="flex flex-wrap gap-2">
                                {materials.slice(0, 8).map(m => (
                                    <button
                                        key={m.id}
                                        onClick={() => addMaterialFromInventory(m)}
                                        className="inline-flex items-center px-2 py-1 text-xs bg-white border border-gray-200 rounded hover:bg-blue-50 hover:border-blue-300"
                                    >
                                        <Package className="w-3 h-3 mr-1 text-gray-400" />
                                        {m.name}
                                    </button>
                                ))}
                                {materials.length > 8 && (
                                    <span className="text-xs text-gray-400 self-center">
                                        +{materials.length - 8} more
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Line Items Table */}
                    {lineItems.length === 0 ? (
                        <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
                            <Plus className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                            <p className="text-gray-600 font-medium">No line items yet</p>
                            <p className="text-sm text-gray-400 mb-4">Click the type buttons above or generate instantly from your Scope of Work with AI</p>
                            <button
                                type="button"
                                onClick={handleGenerateAIQuote}
                                disabled={aiLoading}
                                className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-xl text-sm font-bold shadow-sm hover:shadow transition"
                            >
                                {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                Generate AI Quote Line Items
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {lineItems.map((item, index) => {
                                const typeInfo = LINE_ITEM_TYPES.find(t => t.value === item.type);
                                const isSelectedByTag = item.notes?.startsWith('Selected by ');
                                const userNotes = isSelectedByTag ? '' : (item.notes || '');

                                return (
                                    <div 
                                        key={item.id} 
                                        className="p-3.5 sm:p-4 bg-white rounded-xl border border-gray-200/90 hover:border-blue-300 shadow-xs transition-all space-y-2.5"
                                    >
                                        {/* Tier 1: Header - Type Badge, Index, Taxable, Priority Auto-tag, Line Total, Trash */}
                                        <div className="flex items-center justify-between gap-2.5 flex-wrap">
                                            <div className="flex items-center gap-2">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-bold ${
                                                    item.type === 'labor' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                                    item.type === 'material' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                                    item.type === 'equipment' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                                    item.type === 'travel' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                                                    item.type === 'discount' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                                                    'bg-gray-100 text-gray-700 border border-gray-200'
                                                }`}>
                                                    {typeInfo && <typeInfo.icon className="w-3.5 h-3.5" />}
                                                    {typeInfo ? typeInfo.label : item.type}
                                                </span>
                                                <span className="text-xs text-gray-400 font-semibold">#{index + 1}</span>
                                                <label className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 cursor-pointer ml-1">
                                                    <input
                                                        type="checkbox"
                                                        checked={item.taxable !== false}
                                                        onChange={(e) => updateLineItem(item.id, { taxable: e.target.checked })}
                                                        className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                                    />
                                                    <span>Taxable</span>
                                                </label>
                                                {isSelectedByTag && item.notes && (
                                                    <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                                        ✨ {item.notes.replace('Selected by ', '')}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-3">
                                                <div className="flex items-baseline gap-1.5">
                                                    <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Total:</span>
                                                    <span className={`text-base font-bold ${item.type === 'discount' ? 'text-green-600' : 'text-gray-900'}`}>
                                                        {item.type === 'discount' ? '-' : ''}${Math.abs(item.total).toFixed(2)}
                                                    </span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => removeLineItem(item.id)}
                                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Remove item"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Tier 2: Product Description & Notes - Full width row, max horizontal space */}
                                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-center">
                                            <div className="lg:col-span-7">
                                                <input
                                                    type="text"
                                                    value={item.description}
                                                    onChange={(e) => updateLineItem(item.id, { description: e.target.value })}
                                                    placeholder="Product / service description..."
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                                                    title={item.description}
                                                />
                                            </div>
                                            <div className="lg:col-span-5">
                                                <input
                                                    type="text"
                                                    value={userNotes}
                                                    onChange={(e) => updateLineItem(item.id, { notes: e.target.value })}
                                                    placeholder={isSelectedByTag ? `Tag: ${item.notes} (type to edit)` : "Specs, model #, size, or notes..."}
                                                    className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50/70 placeholder:text-gray-400"
                                                    title={userNotes || item.notes}
                                                />
                                            </div>
                                        </div>

                                        {/* Tier 3: Compact Pricing & Supplier Toolbar */}
                                        <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap bg-slate-50/80 -mx-3.5 -mb-3.5 sm:-mx-4 sm:-mb-4 px-3.5 sm:px-4 py-2 rounded-b-xl text-xs">
                                            <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
                                                {/* Quantity */}
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[11px] font-bold text-gray-500 uppercase">Qty:</span>
                                                    <input
                                                        type="number"
                                                        value={item.quantity}
                                                        onChange={(e) => updateLineItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                                                        min="0"
                                                        step="0.5"
                                                        className="w-16 h-7 border border-gray-300 rounded-md text-xs text-center font-bold bg-white focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>

                                                {/* Unit */}
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[11px] font-bold text-gray-500 uppercase">Unit:</span>
                                                    <input
                                                        type="text"
                                                        value={item.unit}
                                                        onChange={(e) => updateLineItem(item.id, { unit: e.target.value })}
                                                        className="w-16 h-7 border border-gray-300 rounded-md text-xs text-center font-medium bg-white focus:ring-2 focus:ring-blue-500"
                                                        placeholder="each"
                                                    />
                                                </div>

                                                {/* Base Cost (Materials & Equipment) */}
                                                {(item.type === 'material' || item.type === 'equipment') && item.baseCost != null && item.baseCost > 0 && (
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-[11px] font-bold text-gray-400 uppercase">Cost:</span>
                                                        <span className="h-7 px-2 bg-gray-200/80 text-gray-800 rounded-md font-bold flex items-center text-xs">
                                                            ${item.baseCost.toFixed(2)}
                                                        </span>
                                                    </div>
                                                )}

                                                {/* Markup % */}
                                                {(item.type === 'material' || item.type === 'equipment') && isDispatchOrSolo && (
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[11px] font-bold text-amber-800 uppercase">Markup:</span>
                                                        <div className="flex items-center h-7 bg-amber-50 border border-amber-300 rounded-md overflow-hidden">
                                                            <input 
                                                                type="number" 
                                                                value={item.markupPercentage || 0}
                                                                onChange={(e) => {
                                                                    const markup = parseFloat(e.target.value) || 0;
                                                                    const baseCost = item.baseCost || (item.unitPrice / (1 + (item.markupPercentage || 0)/100));
                                                                    const newPrice = Math.round(baseCost * (1 + markup / 100) * 100) / 100;
                                                                    updateLineItem(item.id, { 
                                                                        markupPercentage: markup,
                                                                        baseCost: baseCost,
                                                                        unitPrice: newPrice 
                                                                    });
                                                                }}
                                                                className="w-12 px-1 text-xs text-right bg-transparent text-amber-900 font-bold focus:outline-none"
                                                            />
                                                            <span className="px-1 text-[10px] font-bold text-amber-700 bg-amber-100/60 h-full flex items-center border-l border-amber-200">%</span>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Unit Price */}
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[11px] font-bold text-gray-700 uppercase">
                                                        {item.type === 'material' || item.type === 'equipment' ? 'Price:' : 'Rate:'}
                                                    </span>
                                                    <div className="relative flex items-center">
                                                        <span className="absolute left-2 text-gray-400 font-medium">$</span>
                                                        <input
                                                            type="number"
                                                            value={item.unitPrice}
                                                            onChange={(e) => {
                                                                const newPrice = parseFloat(e.target.value) || 0;
                                                                const markup = item.markupPercentage || 0;
                                                                const newBase = markup > 0 ? newPrice / (1 + markup/100) : newPrice;
                                                                updateLineItem(item.id, { unitPrice: newPrice, baseCost: newBase });
                                                            }}
                                                            min="0"
                                                            step="0.01"
                                                            className="w-24 h-7 pl-5 pr-2 border border-gray-300 rounded-md text-xs text-right font-bold text-gray-900 bg-white focus:ring-2 focus:ring-blue-500"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Sourcing / Supplier Selection (Materials & Equipment) */}
                                            {(item.type === 'material' || item.type === 'equipment') && (
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-gray-500 font-bold text-[11px] uppercase">Supplier:</span>
                                                    {(() => {
                                                        const itemAlternates = (item.alternateVendors && item.alternateVendors.length > 0)
                                                            ? item.alternateVendors
                                                            : buildAllVendorPricing(item.description, item.baseCost || (item.unitPrice ? Math.round(item.unitPrice / 1.3 * 100) / 100 : 10), [], orgVendors);
                                                        const priorityReason = item.notes?.startsWith('Selected by') ? item.notes.replace('Selected by ', '') : undefined;
                                                        const sourcingStrategy = organization?.settings?.defaultSourcingStrategy || organization?.settings?.situationRules?.standard || 'lowest_cost';

                                                        return (
                                                            <RichVendorDropdown
                                                                activeVendorName={item.vendorName}
                                                                activeBaseCost={item.baseCost || (item.unitPrice ? Math.round(item.unitPrice / 1.3 * 100) / 100 : 0)}
                                                                activeStockQuantity={item.stockQuantity}
                                                                activeProductUrl={item.vendorProductUrl}
                                                                alternateVendors={itemAlternates}
                                                                orgVendors={orgVendors}
                                                                itemDescription={item.description}
                                                                priorityReason={priorityReason}
                                                                orgSourcingStrategy={sourcingStrategy}
                                                                buttonSize="sm"
                                                                onSelectVendor={(val) => handleQuoteVendorSelect(item.id, val)}
                                                            />
                                                        );
                                                    })()}
                                                    {item.vendorProductUrl && (
                                                        <a
                                                            href={item.vendorProductUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1 text-[11px] bg-white border border-blue-200 px-2 py-0.5 rounded shadow-2xs hover:bg-blue-50 transition"
                                                            title={`View on ${item.vendorName || 'vendor website'}`}
                                                        >
                                                            View <ExternalLink className="w-2.5 h-2.5" />
                                                        </a>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsLookupModalOpen(true)}
                                                        className="text-[11px] text-blue-700 hover:text-blue-900 font-semibold shrink-0 hover:underline px-0.5"
                                                    >
                                                        Look up ↗
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Bottom Add Line Item Quick Bar */}
                            <div className="pt-3 pb-1 flex items-center justify-between flex-wrap gap-2 border-t border-dashed border-gray-200">
                                <span className="text-xs font-semibold text-gray-500 flex items-center gap-1">
                                    <Plus className="w-3.5 h-3.5 text-blue-600" /> Add another line item:
                                </span>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    {LINE_ITEM_TYPES.map(type => (
                                        <button
                                            key={type.value}
                                            type="button"
                                            onClick={() => addLineItem(type.value as QuoteLineItem['type'])}
                                            title={`Add a new ${type.label} line item`}
                                            className="inline-flex items-center px-2.5 py-1 text-xs font-semibold text-gray-600 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-400 hover:text-blue-700 rounded-lg transition-all group"
                                        >
                                            <Plus className="w-3 h-3 mr-1 text-gray-400 group-hover:text-blue-600 transition-colors" />
                                            <type.icon className="w-3.5 h-3.5 mr-1 text-gray-500 group-hover:text-blue-600 transition-colors" />
                                            <span>{type.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Presentation & Discount Settings */}
                    {lineItems.length > 0 && (
                        <div className="mt-6 pt-6 border-t">
                            <h3 className="font-semibold text-gray-900 mb-4">Quote Display Settings</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Presentation Mode</label>
                                    <select
                                        value={presentationMode}
                                        onChange={(e) => setPresentationMode(e.target.value as any)}
                                        className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="detailed">Detailed Line Items</option>
                                        <option value="category_rollup">Roll-up by Category</option>
                                        <option value="single_price">Single Price Summary</option>
                                    </select>
                                    <label className="flex items-center gap-2 mt-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={displayTax}
                                            onChange={(e) => setDisplayTax(e.target.checked)}
                                            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                        />
                                        <span className="text-sm text-gray-700">Display tax as separate line</span>
                                    </label>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Discount</label>
                                    <div className="flex items-center gap-2 mb-2">
                                        <select
                                            value={discountType}
                                            onChange={(e) => setDiscountType(e.target.value as any)}
                                            className="w-1/3 border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="fixed">$ Amount</option>
                                            <option value="percentage">% Percent</option>
                                        </select>
                                        <input
                                            type="number"
                                            value={discountValue || ''}
                                            onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                                            placeholder="Amount"
                                            className="flex-1 border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <input
                                        type="text"
                                        value={discountReason}
                                        onChange={(e) => setDiscountReason(e.target.value)}
                                        placeholder="Reason (optional, shown to customer)"
                                        className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Totals */}
                    {lineItems.length > 0 && (
                        <div className="mt-6 pt-4 border-t space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Subtotal</span>
                                <span className="font-medium">${subtotal.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-gray-600">Tax ({taxRate}%)</span>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        value={taxRate}
                                        onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                                        min="0"
                                        step="0.001"
                                        className="w-20 border border-gray-300 rounded p-1 text-sm text-right"
                                    />
                                    <span className="font-medium w-24 text-right">${taxAmount.toFixed(2)}</span>
                                </div>
                            </div>
                            {discountAmount > 0 && (
                                <div className="flex justify-between text-sm text-green-600">
                                    <span>Discount</span>
                                    <span>-${discountAmount.toFixed(2)}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-lg font-semibold pt-2 border-t">
                                <span>Total</span>
                                <span>${total.toFixed(2)}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Overrun Protection */}
                <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
                    <div className="flex items-start gap-3 mb-4">
                        <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">Overrun Protection</h2>
                            <p className="text-sm text-gray-500">
                                Protect yourself by getting customer agreement for potential cost increases
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={overrunSettings.enabled}
                                onChange={(e) => setOverrunSettings({ ...overrunSettings, enabled: e.target.checked })}
                                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                            />
                            <span className="text-gray-700">Enable overrun protection</span>
                        </label>

                        {overrunSettings.enabled && (
                            <div className="ml-7 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Maximum overrun without re-approval
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            value={overrunSettings.maxOverrunPercent}
                                            onChange={(e) => setOverrunSettings({
                                                ...overrunSettings,
                                                maxOverrunPercent: parseInt(e.target.value) || 0
                                            })}
                                            min="0"
                                            max="100"
                                            className="w-20 border border-gray-300 rounded-lg p-2 text-center"
                                        />
                                        <span className="text-gray-600">%</span>
                                        <span className="text-sm text-gray-500 ml-2">
                                            (up to ${((total * overrunSettings.maxOverrunPercent) / 100).toFixed(2)} over quote)
                                        </span>
                                    </div>
                                </div>

                                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                    <div className="flex items-start gap-2">
                                        <Info className="w-4 h-4 text-amber-600 mt-0.5" />
                                        <p className="text-sm text-amber-800">
                                            Customer will agree to pay up to {overrunSettings.maxOverrunPercent}% over the quoted amount
                                            without requiring additional approval. For larger overages, you must contact the customer.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Payment Terms & Deposit */}
                <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment Terms & Agreement</h2>
                    <div className="flex flex-col gap-4">
                        <label className="flex items-center gap-3 cursor-pointer pb-4 border-b border-gray-100">
                            <input
                                type="checkbox"
                                checked={signatureRequired}
                                onChange={(e) => setSignatureRequired(e.target.checked)}
                                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                            />
                            <div>
                                <span className="text-gray-700 font-medium block">Require customer signature for approval</span>
                                <span className="text-sm text-gray-500">Customer must sign before the quote can be accepted</span>
                            </div>
                        </label>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Deposit Requirement</label>
                            <select
                                value={depositCondition}
                                onChange={(e) => setDepositCondition(e.target.value)}
                                className="w-full max-w-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500"
                            >
                                {upfrontPolicy?.enabled && (
                                    <option value="policy">Follow Organization Policy (Auto-evaluate)</option>
                                )}
                                <option value="none">No Deposit Required</option>
                                <option value="custom">Custom Amount</option>
                                <option value="always">Always ({upfrontPolicy?.depositPercent ?? 50}% of Total)</option>
                                <option value="new_customers_only">New Customers Only ({upfrontPolicy?.depositPercent ?? 50}%)</option>
                                <option value="over_threshold">Over Threshold (${upfrontPolicy?.overThreshold ?? 500} - {upfrontPolicy?.depositPercent ?? 50}%)</option>
                                <option value="materials_only">100% Materials/Parts</option>
                                <option value="paid_estimate">Paid Estimate (Flat Fee: ${upfrontPolicy?.paidEstimateAmount ?? 75})</option>
                                {depositCondition === '50_percent' && <option value="50_percent">50% of Total (Legacy)</option>}
                                {depositCondition === '100_percent_materials' && <option value="100_percent_materials">100% of Materials (Legacy)</option>}
                                {depositCondition === '50_percent_if_over_500' && <option value="50_percent_if_over_500">50% if Total &gt; $500 (Legacy)</option>}
                            </select>
                        </div>

                        {depositCondition === 'policy' && (
                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 mt-2 max-w-sm">
                                <div className="text-sm font-semibold text-blue-900 mb-2">
                                    Organization Policy Applied
                                </div>
                                <div className="space-y-1 text-sm text-blue-800">
                                    <div className="flex justify-between">
                                        <span>Active Rule:</span>
                                        <span className="font-medium capitalize">
                                            {evaluatedRule === 'none' ? 'None (No rules matched)' : evaluatedRule.replace(/_/g, ' ')}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Deposit Amount:</span>
                                        <span className="font-bold">${depositAmount.toFixed(2)}</span>
                                    </div>
                                </div>
                                {requiresDeposit && (
                                    <p className="text-xs text-blue-600 mt-2 pt-2 border-t border-blue-200">
                                        {evaluatedRule === 'paid_estimate'
                                            ? 'This flat fee covers the on-site evaluation. If work proceeds, it will be applied toward the final invoice.'
                                            : `Remaining balance due upon completion: $${Math.max(0, total - depositAmount).toFixed(2)}`}
                                    </p>
                                )}
                            </div>
                        )}

                        {depositCondition !== 'none' && depositCondition !== 'policy' && (
                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 mt-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {depositCondition === 'paid_estimate' ? 'Paid Estimate Fee' : 'Required Deposit Amount'}
                                </label>
                                <div className="relative max-w-xs">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                                    <input
                                        type="number"
                                        value={depositAmount}
                                        onChange={(e) => setDepositAmount(parseFloat(e.target.value) || 0)}
                                        disabled={depositCondition !== 'custom' && depositCondition !== 'paid_estimate'}
                                        min="0"
                                        step="0.01"
                                        className="w-full border border-gray-300 rounded-lg p-2.5 pl-7 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                                    />
                                </div>
                                {depositCondition === 'paid_estimate' ? (
                                    <p className="text-sm text-gray-600 mt-2">
                                        This flat fee covers the on-site evaluation. If work proceeds, it is applied toward the final invoice.
                                    </p>
                                ) : (
                                    <p className="text-sm text-gray-600 mt-2">
                                        Remaining balance due upon completion: <span className="font-medium text-gray-900">${Math.max(0, total - depositAmount).toFixed(2)}</span>
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Estimate & Validity */}
                <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Estimate Details</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Estimated Duration (minutes)
                            </label>
                            <input
                                type="number"
                                value={estimatedDuration}
                                onChange={(e) => setEstimatedDuration(parseInt(e.target.value) || 0)}
                                min="0"
                                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                                {Math.floor(estimatedDuration / 60)}h {estimatedDuration % 60}m
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Quote Valid For (days)
                            </label>
                            <input
                                type="number"
                                value={validDays}
                                onChange={(e) => setValidDays(parseInt(e.target.value) || 0)}
                                min="1"
                                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Jurisdiction (State)
                            </label>
                            <select
                                value={jurisdictionState}
                                onChange={(e) => setJurisdictionState(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500"
                            >
                                <optgroup label="United States">
                                    {ALL_JURISDICTIONS.filter(j => j.country === 'US' && !['PR','GU','VI'].includes(j.code)).map(j => (
                                        <option key={j.code} value={j.code}>{j.name}</option>
                                    ))}
                                </optgroup>
                                <optgroup label="US Territories">
                                    {ALL_JURISDICTIONS.filter(j => ['PR','GU','VI'].includes(j.code)).map(j => (
                                        <option key={j.code} value={j.code}>{j.name}</option>
                                    ))}
                                </optgroup>
                                <optgroup label="International">
                                    {ALL_JURISDICTIONS.filter(j => j.country !== 'US').map(j => (
                                        <option key={j.code} value={j.code}>{j.name}</option>
                                    ))}
                                </optgroup>
                                {customJurisdictions.length > 0 && (
                                    <optgroup label="Custom / AI Generated">
                                        {customJurisdictions.map(j => (
                                            <option key={j.code} value={j.code}>{j.name}</option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Revision Comment — shown when editing an existing quote */}
                {existingQuote && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center gap-2 mb-3">
                            <MessageSquare className="w-5 h-5 text-blue-600" />
                            <h3 className="text-base font-bold text-gray-900">
                                {existingQuote.status === 'tech_review' ? 'Reply to Customer' : 'Add a Note'}
                            </h3>
                        </div>
                        {existingQuote.status === 'tech_review' && existingQuote.customerNotes?.length ? (() => {
                            const latestCustomerNote = [...existingQuote.customerNotes].reverse().find(n => n.author === 'customer');
                            return latestCustomerNote ? (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                                    <p className="text-xs font-semibold text-amber-700 mb-1">Customer requested:</p>
                                    <p className="text-sm text-gray-800">&ldquo;{latestCustomerNote.text}&rdquo;</p>
                                </div>
                            ) : null;
                        })() : null}
                        <textarea
                            value={revisionComment}
                            onChange={(e) => setRevisionComment(e.target.value)}
                            rows={3}
                            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            placeholder={existingQuote.status === 'tech_review'
                                ? 'E.g., I\'ve adjusted the quote per your request. Removed the piping work and updated the total...'
                                : 'Optional — add a note about the changes you made to this quote...'
                            }
                        />
                        <p className="text-xs text-gray-400 mt-1.5">
                            This note will be visible to the customer in the communication history.
                        </p>
                    </div>
                )}

                {/* Bottom page clearance for sticky footer */}
                <div className="pb-28" />
            </div>

            {/* Sticky Bottom Action Bar */}
            <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-gray-200 p-3.5 shadow-xl">
                <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
                    <div className="flex flex-col shrink-0">
                        <span className="text-xs text-gray-500 font-medium truncate max-w-[200px] sm:max-w-none">
                            {job?.customer?.name || standaloneCustomerName || 'New Quote'} • {lineItems.length} line item{lineItems.length !== 1 ? 's' : ''}
                            {requiresDeposit && depositAmount > 0 ? ` • Deposit: $${depositAmount.toFixed(2)}` : ''}
                        </span>
                        <span className="text-base font-bold text-gray-900">
                            Total: ${total.toFixed(2)}
                        </span>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap sm:flex-nowrap">
                        {lineItems.length === 0 ? (
                            <button
                                type="button"
                                onClick={() => handleGenerateAIQuote()}
                                disabled={aiLoading}
                                className="px-4 py-2 text-sm font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl flex items-center gap-1.5 shadow-sm transition disabled:opacity-50"
                            >
                                {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                Generate AI Quote
                            </button>
                        ) : (
                            <div className="flex items-center gap-1.5 bg-purple-50/80 border border-purple-200 rounded-xl p-1 pr-1.5 shadow-2xs">
                                <input
                                    type="text"
                                    value={aiModificationNote}
                                    onChange={(e) => setAiModificationNote(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' && aiModificationNote.trim()) handleGenerateAIQuote(); }}
                                    placeholder="Request modification (e.g. larger 12,000 BTU unit)..."
                                    className="w-44 sm:w-60 lg:w-72 h-8 px-2.5 text-xs bg-white border border-purple-200 focus:border-purple-500 rounded-lg text-gray-900 placeholder:text-gray-400 focus:ring-1 focus:ring-purple-400"
                                />
                                <button
                                    type="button"
                                    onClick={() => handleGenerateAIQuote()}
                                    disabled={aiLoading || !aiModificationNote.trim()}
                                    title="Regenerate quote with requested changes"
                                    className="h-8 px-2.5 text-xs font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:from-gray-300 disabled:to-gray-400 text-white rounded-lg flex items-center gap-1 shadow-xs transition shrink-0"
                                >
                                    {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                    Refine AI
                                </button>
                                {aiQuoteHistory.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => handleRevertToPreviousQuote()}
                                        title={`Revert to previous quote ($${aiQuoteHistory[0].total.toFixed(2)})`}
                                        className="h-8 px-2 text-xs font-semibold text-purple-700 bg-white border border-purple-200 hover:bg-purple-100/70 rounded-lg flex items-center gap-1 shadow-2xs transition shrink-0"
                                    >
                                        <RotateCcw className="w-3 h-3 text-purple-600" />
                                        <span className="hidden md:inline">Revert</span>
                                    </button>
                                )}
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={() => navigate(-1)}
                            className="px-3.5 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => handleSaveQuote(false)}
                            disabled={saving || lineItems.length === 0}
                            className="px-3.5 py-2 text-sm font-semibold border border-blue-600 text-blue-600 hover:bg-blue-50 rounded-xl transition disabled:opacity-50 shrink-0"
                        >
                            Save Draft
                        </button>
                        <button
                            type="button"
                            onClick={() => handleSaveQuote(true)}
                            disabled={saving || lineItems.length === 0}
                            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm flex items-center gap-2 shadow-sm transition disabled:opacity-50 shrink-0"
                        >
                            <Send className="w-4 h-4" />
                            {existingQuote?.status === 'tech_review' ? 'Update & Resend' : 'Save & Send Quote'}
                        </button>
                    </div>
                </div>
            </div>
            {/* Material Lookup Modal */}
            <MaterialLookupModal
                isOpen={isLookupModalOpen}
                onClose={() => setIsLookupModalOpen(false)}
                markupPercent={organization?.settings?.materialMarkup || 30}
                onSelectMaterial={(selected: SelectedMaterialResult) => {
                    const newItem: QuoteLineItem = {
                        id: `item-${Date.now()}`,
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
                        alternateVendors: selected.alternateVendors
                    };
                    setLineItems(prev => [...prev, newItem]);
                    toast.success(`Added ${selected.name} to quote materials`);
                }}
            />
        </div>
    );
};
