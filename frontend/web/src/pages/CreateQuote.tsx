import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, query, where, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import { Job, Quote, QuoteLineItem, MaterialItem, DEFAULT_OVERRUN_PROTECTION, Customer, RateCardMatrix, AlternateVendor } from '../types';
import { sanitizeForFirestore } from '../lib/aiQuoteGenerator';
import { ALL_JURISDICTIONS } from '../lib/quoteTerms';
import { recalculateDepositForQuote, createJobFromQuote } from '../lib/quoteService';
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
    History,
    X,
    Phone,
    PhoneCall,
    Mail,
    MapPin,
    Building2,
    ShoppingCart
} from 'lucide-react';
import { MaterialLookupModal, SelectedMaterialResult } from '../components/inventory/MaterialLookupModal';
import { InlineAIQuotePanel } from '../components/InlineAIQuotePanel';
import { RichVendorDropdown } from '../components/RichVendorDropdown';
import { findBestMatchingMaterial, buildAllVendorPricing, selectVendorByOrgPriorities, isToolOwnedOrStandard, classifyEquipmentUsage } from '../utils/procurementLogic';
import { isLocalVendor } from '../utils/vendorStock';
import toast from 'react-hot-toast';
import { dispatchQuoteDelivery } from '../lib/quoteService';
import { generateAIScopeModification } from '../lib/aiScopeModifier';

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
    const { jobId, quoteId: routeQuoteId, orgSlug: routeOrgSlug } = useParams<{ jobId?: string; quoteId?: string; orgSlug?: string }>();
    const [searchParams] = useSearchParams();
    const quoteId = routeQuoteId || searchParams.get('quoteId');
    const targetJobId = jobId || searchParams.get('jobId') || undefined;
    const navigate = useNavigate();
    const { user, organization } = useAuth();
    const effectiveOrgSlug = routeOrgSlug || organization?.slug;
    const basePath = effectiveOrgSlug ? `/${effectiveOrgSlug}` : '';

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

    // Customer requested revision note if present
    const customerRequestedNote = existingQuote?.customerNotes && existingQuote.customerNotes.length > 0
        ? [...existingQuote.customerNotes].reverse().find(n => n.author === 'customer')?.text || ''
        : '';

    // Standalone quote (no job) customer fields & repeat customer lookup
    const [standaloneCustomerName, setStandaloneCustomerName] = useState('');
    const [standaloneCustomerEmail, setStandaloneCustomerEmail] = useState('');
    const [standaloneCustomerPhone, setStandaloneCustomerPhone] = useState('');
    const [standaloneCustomerAddress, setStandaloneCustomerAddress] = useState('');
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
    const [existingCustomers, setExistingCustomers] = useState<Array<{
        id: string;
        name: string;
        companyName?: string;
        email?: string;
        phone?: string;
        address?: string;
        tags?: string[];
        raw: any;
    }>>([]);
    const [customerSearchQuery, setCustomerSearchQuery] = useState('');
    const [showCustomerSearchDropdown, setShowCustomerSearchDropdown] = useState(false);
    const [showNameSuggestions, setShowNameSuggestions] = useState(false);
    const customerDropdownRef = React.useRef<HTMLDivElement>(null);
    const isStandalone = !targetJobId && (!quoteId || (existingQuote ? !existingQuote.job_id : true));
    const [generatedQuoteNumber] = useState<string>(() => generateQuoteNumber());
    const [deliveryChannels, setDeliveryChannels] = useState<{
        email: boolean;
        sms: boolean;
        call: boolean;
    }>({
        email: true,
        sms: true,
        call: false
    });

    // AI Quote Generation State
    const [aiLoading, setAiLoading] = useState(false);
    const [aiRecommendation, setAiRecommendation] = useState<any | null>(null);
    const [aiError, setAiError] = useState('');
    const [aiModificationNote, setAiModificationNote] = useState('');
    const [aiRevisionProposal, setAiRevisionProposal] = useState<any | null>(null);
    const [orgVendors, setOrgVendors] = useState<any[]>([]);

    // Equipment Quoting & Procurement Policy ('one_time_only' | 'all' | 'internal_only')
    const [equipmentQuotePolicy, setEquipmentQuotePolicy] = useState<'one_time_only' | 'all' | 'internal_only'>(
        (organization?.settings as any)?.equipmentQuotePolicy || 'one_time_only'
    );

    useEffect(() => {
        if ((organization?.settings as any)?.equipmentQuotePolicy) {
            setEquipmentQuotePolicy((organization.settings as any).equipmentQuotePolicy);
        }
    }, [organization?.settings?.equipmentQuotePolicy]);

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

                let loadedQuoteData: Quote | null = null;
                if (quoteId) {
                    const quoteDoc = await getDoc(doc(db, 'quotes', quoteId));
                    if (quoteDoc.exists()) {
                        const quoteData = { id: quoteDoc.id, ...quoteDoc.data() } as Quote;
                        loadedQuoteData = quoteData;
                        setExistingQuote(quoteData);
                        currentJobId = quoteData.job_id;
                        if (quoteData.customer) {
                            setStandaloneCustomerName(quoteData.customer.name || '');
                            setStandaloneCustomerEmail(quoteData.customer.email || '');
                            setStandaloneCustomerPhone(quoteData.customer.phone || '');
                            setStandaloneCustomerAddress(quoteData.customer.address || '');
                        }
                        if (quoteData.customer_id) {
                            setSelectedCustomerId(quoteData.customer_id);
                        }
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
                        if (quoteData.status === 'tech_review' && quoteData.customerNotes && quoteData.customerNotes.length > 0) {
                            const latestCustNote = [...quoteData.customerNotes].reverse().find(n => n.author === 'customer');
                            if (latestCustNote?.text) {
                                setAiModificationNote(latestCustNote.text);
                            }
                        }
                        if (quoteData.aiRevisionProposal) {
                            setAiRevisionProposal(quoteData.aiRevisionProposal);
                        }
                        if (quoteData.deliveryMethods && quoteData.deliveryMethods.length > 0) {
                            setDeliveryChannels({
                                email: quoteData.deliveryMethods.includes('email'),
                                sms: quoteData.deliveryMethods.includes('sms'),
                                call: quoteData.deliveryMethods.includes('call')
                            });
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
                    try {
                        let toolsSnapshot = await getDocs(query(
                            collection(db, 'tools'),
                            where('org_id', '==', orgId)
                        )).catch(() => null);
                        if (!toolsSnapshot || toolsSnapshot.empty) {
                            toolsSnapshot = await getDocs(query(
                                collection(db, 'tools'),
                                where('organizationId', '==', orgId)
                            )).catch(() => null);
                        }
                        const toolsData = toolsSnapshot?.docs ? toolsSnapshot.docs.map(d => ({
                            id: d.id,
                            ...d.data()
                        })) : [];
                        setOrgTools(toolsData);
                    } catch (e) {
                        console.warn('Could not load org tools:', e);
                        setOrgTools([]);
                    }

                    // Load vendors for dropdown (with fallback support)
                    try {
                        let vendorsSnapshot = await getDocs(query(
                            collection(db, 'vendors'),
                            where('organizationId', '==', orgId)
                        )).catch(() => null);
                        if (!vendorsSnapshot || vendorsSnapshot.empty) {
                            vendorsSnapshot = await getDocs(query(
                                collection(db, 'vendors'),
                                where('org_id', '==', orgId)
                            )).catch(() => null);
                        }
                        const vendorsData = vendorsSnapshot?.docs ? vendorsSnapshot.docs.map(d => ({
                            id: d.id,
                            name: d.data().name || '',
                            website: d.data().website || '',
                            isLocal: d.data().isLocal || false
                        })) : [];
                        vendorsData.sort((a, b) => a.name.localeCompare(b.name));
                        setOrgVendors(vendorsData);
                    } catch (e) {
                        console.warn('Could not load org vendors:', e);
                        setOrgVendors([]);
                    }

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

                    // Load existing customers for repeat customer auto-lookup
                    try {
                        const customersSnapshot = await getDocs(query(
                            collection(db, 'customers'),
                            where('org_id', '==', orgId)
                        ));
                        const customersList = customersSnapshot.docs.map(d => {
                            const data = d.data();
                            let addrStr = data.address || '';
                            if (!addrStr && Array.isArray(data.addresses) && data.addresses.length > 0) {
                                const defaultAddr = data.addresses.find((a: any) => a.isDefault) || data.addresses[0];
                                addrStr = [defaultAddr.street, defaultAddr.city, defaultAddr.state, defaultAddr.zip].filter(Boolean).join(', ');
                            }
                            return {
                                id: d.id,
                                name: data.name || '',
                                companyName: data.companyName || '',
                                email: data.email || '',
                                phone: data.phone || '',
                                address: addrStr,
                                tags: data.tags || [],
                                raw: { id: d.id, ...data }
                            };
                        });
                        customersList.sort((a, b) => a.name.localeCompare(b.name));
                        setExistingCustomers(customersList);

                        // If editing a quote with customer_id, attach customerData for deposit/terms rules
                        if (loadedQuoteData?.customer_id) {
                            const matched = customersList.find(c => c.id === loadedQuoteData?.customer_id);
                            if (matched) {
                                setCustomerData(matched.raw as Customer);
                            }
                        }
                    } catch (custErr) {
                        console.warn('Error loading customers for quote lookup:', custErr);
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
        const defaultUsageType: 'one_time' | 'long_term' = 'long_term';
        const defaultBillingType: 'customer_billed' | 'company_expense' = 
            equipmentQuotePolicy === 'all' ? 'customer_billed' : 'company_expense';

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
        } else if (type === 'equipment') {
            defaultDesc = 'Equipment / Tool';
            defaultPrice = defaultBillingType === 'customer_billed' ? 45 : 0;
        }

        const newItem: QuoteLineItem = {
            id: crypto.randomUUID(),
            type,
            description: defaultDesc,
            quantity: 1,
            unit: type === 'labor' ? 'hour' : 'each',
            unitPrice: defaultPrice,
            total: defaultPrice,
            taxable: type !== 'labor' && type !== 'discount' && defaultBillingType !== 'company_expense',
            isOptional: false,
            ...(type === 'equipment' && {
                equipmentUsageType: defaultUsageType,
                equipmentBillingType: defaultBillingType,
                queuedForProcurement: true,
                baseCost: 35,
                markupPercentage: organization?.settings?.materialMarkup || 30
            })
        };
        setLineItems([...lineItems, newItem]);
    };

    const updateLineItem = (id: string, updates: Partial<QuoteLineItem>) => {
        setLineItems(lineItems.map(item => {
            if (item.id === id) {
                const updated = { ...item, ...updates };
                // Recalculate total
                if (updated.type === 'equipment' && updated.equipmentBillingType === 'company_expense') {
                    updated.unitPrice = 0;
                    updated.total = 0;
                    updated.taxable = false;
                } else {
                    updated.total = updated.quantity * updated.unitPrice;
                }
                if (updated.type === 'discount') {
                    updated.total = -Math.abs(updated.total);
                }
                return updated;
            }
            return item;
        }));
    };

    // Close customer search dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
                setShowCustomerSearchDropdown(false);
                setShowNameSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelectRepeatCustomer = async (cust: {
        id: string;
        name: string;
        companyName?: string;
        email?: string;
        phone?: string;
        address?: string;
        tags?: string[];
        raw: any;
    }) => {
        setStandaloneCustomerName(cust.name);
        setStandaloneCustomerEmail(cust.email || '');
        setStandaloneCustomerPhone(cust.phone || '');
        setStandaloneCustomerAddress(cust.address || '');
        setSelectedCustomerId(cust.id);
        setCustomerData(cust.raw as Customer);
        setShowCustomerSearchDropdown(false);
        setShowNameSuggestions(false);
        setCustomerSearchQuery('');
        toast.success(`Loaded repeat customer: ${cust.name}`);

        // If customer has an address and quote doesn't have custom tax rate set, auto-resolve tax
        if (cust.address) {
            try {
                const orgId = (user as any)?.org_id || 'demo-org';
                const { httpsCallable } = await import('firebase/functions');
                const { functions } = await import('../firebase');
                const lookupFn = httpsCallable(functions, 'lookupLocationTaxRate');
                const res = await lookupFn({
                    address: cust.address,
                    orgId: orgId
                });
                const resData = res.data as any;
                if (resData && resData.taxRate !== undefined) {
                    setTaxRate(resData.taxRate);
                }
            } catch (e) {
                console.error('Error auto-resolving tax rate for repeat customer:', e);
            }
        }
    };

    const handleClearSelectedCustomer = () => {
        setSelectedCustomerId(null);
        setCustomerData(null);
        toast('Unlinked customer ID. You can enter or edit details freely.');
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
        let desc = scopeOfWork.trim();
        if (!desc && lineItems.length > 0) {
            desc = job?.request?.description || modNote || 'Service & Repair';
        }
        if (!desc || desc.length < 3) {
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

        // Fast-path: When refining/adjusting an existing quote, use instant intelligent scope modifier
        if (lineItems.length > 0 && modNote) {
            setAiLoading(true);
            setAiError('');
            try {
                const hourlyRate = rateCard?.standardHourlyRate || organization?.settings?.defaultHourlyRate || 100;
                const markup = organization?.settings?.materialMarkup || 30;
                const sourcingStrategy = (organization?.settings as any)?.sourcingStrategy || 'lowest_cost';
                const defaultTargetVendor = organization?.settings?.defaultVendorId || (orgVendors[0]?.name) || 'Home Depot';

                const adjustmentResult = await generateAIScopeModification({
                    originalScope: scopeOfWork,
                    currentLineItems: lineItems,
                    changeDiscovery: modNote,
                    tradeCategory: (job as any)?.trade || 'Plumbing',
                    hourlyRate,
                    sourcingStrategy,
                    preferredVendorId: defaultTargetVendor,
                    markup,
                    orgVendors: orgVendors || [],
                });

                // Update line items with combined items (preserving all existing + adding/adjusting)
                setLineItems(adjustmentResult.combinedLineItems);

                // Update Scope of Work
                if (adjustmentResult.newScopeDescription) {
                    setScopeOfWork(adjustmentResult.newScopeDescription);
                } else {
                    setScopeOfWork(prev => `${prev}\n\n[Adjustment: ${modNote}]`.trim());
                }

                // Store new snapshot
                const newTotal = adjustmentResult.combinedLineItems.reduce((sum, item) => sum + (item.total || 0), 0);
                const newSnapshot = {
                    id: `snap-${Date.now()}`,
                    label: `Adjusted: "${modNote.length > 25 ? modNote.slice(0, 25) + '...' : modNote}"`,
                    lineItems: adjustmentResult.combinedLineItems,
                    total: newTotal,
                    timestamp: Date.now(),
                    recommendation: aiRecommendation,
                    estimatedDuration,
                    scope: adjustmentResult.newScopeDescription || scopeOfWork,
                    modNote
                };
                setStoredAiQuote(newSnapshot);
                try {
                    sessionStorage.setItem(`stored_ai_quote_${quoteId || targetJobId || 'new'}`, JSON.stringify(newSnapshot));
                } catch (e) {
                    console.warn('Failed to cache AI quote snapshot in sessionStorage', e);
                }

                setAiModificationNote('');
                const deltaFormatted = (adjustmentResult.deltaCost >= 0 ? '+' : '') + `$${adjustmentResult.deltaCost.toFixed(2)}`;
                toast.success(`✨ Quote adjusted: added ${adjustmentResult.addedItems.length} item(s) (${deltaFormatted})`);
                return;
            } catch (err: any) {
                console.error('Local scope modification error, falling back to cloud estimate:', err);
            } finally {
                setAiLoading(false);
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

                    const usageType = classifyEquipmentUsage(tool.name);
                    const shouldBillCustomer = equipmentQuotePolicy === 'all' || 
                        (equipmentQuotePolicy === 'one_time_only' && usageType === 'one_time');

                    const toolCost = tool.estimatedCost || 35;
                    const toolOptions = buildAllVendorPricing(tool.name, toolCost, [], orgVendors);
                    const { selectedVendor: toolWinner, priorityReason: toolPriorityReason } = selectVendorByOrgPriorities(toolOptions, organization?.settings);
                    const winningTool = toolWinner || toolOptions[0];
                    const finalToolCost = winningTool ? winningTool.unitCost : toolCost;
                    const toolCustomerPrice = Math.round(finalToolCost * (1 + markup / 100) * 100) / 100;
                    const toolAlternates = toolOptions.filter(v => v.vendorName !== winningTool?.vendorName);

                    const billedPrice = shouldBillCustomer ? toolCustomerPrice : 0;
                    const lineTotal = (tool.quantity || 1) * billedPrice;

                    newLineItems.push({
                        id: `tool-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                        type: 'equipment',
                        description: winningTool?.vendorProductTitle || tool.name,
                        quantity: tool.quantity || 1,
                        unit: 'each',
                        unitPrice: billedPrice,
                        baseCost: finalToolCost,
                        markupPercentage: markup,
                        total: lineTotal,
                        taxable: shouldBillCustomer,
                        isOptional: false,
                        priceSource: 'vendor',
                        vendorName: winningTool?.vendorName,
                        vendorProductUrl: winningTool?.vendorProductUrl,
                        stockQuantity: winningTool?.stockQuantity,
                        alternateVendors: toolAlternates,
                        equipmentUsageType: usageType,
                        equipmentBillingType: shouldBillCustomer ? 'customer_billed' : 'company_expense',
                        queuedForProcurement: true,
                        notes: toolPriorityReason 
                            ? `Selected by ${toolPriorityReason}` 
                            : (!shouldBillCustomer ? 'Company Funded Equipment' : undefined)
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

    const handleApplyQuickAdjustment = (preset: string) => {
        setAiModificationNote(preset);
        handleGenerateAIQuote(preset);
    };

    const handleApplyAiRevisionProposal = () => {
        const proposal = aiRevisionProposal || existingQuote?.aiRevisionProposal;
        if (!proposal) return;
        if (proposal.lineItems && proposal.lineItems.length > 0) {
            setLineItems(proposal.lineItems);
        }
        if (proposal.scopeOfWork) {
            setScopeOfWork(proposal.scopeOfWork);
        }
        toast.success('✨ Applied AI Revision Proposal to quote!');
    };

    // Automatic refinement when navigated with ?autoRefine=true
    const autoRefinedRef = useRef(false);
    useEffect(() => {
        if (loading) return;
        const shouldAutoRefine = searchParams.get('autoRefine') === 'true';
        if (shouldAutoRefine && !autoRefinedRef.current && existingQuote?.status === 'tech_review') {
            autoRefinedRef.current = true;
            const latestCustNote = existingQuote.customerNotes && existingQuote.customerNotes.length > 0
                ? [...existingQuote.customerNotes].reverse().find(n => n.author === 'customer')
                : null;
            const noteToUse = latestCustNote?.text || aiModificationNote;
            if (noteToUse) {
                toast(`⚡ Auto-refining quote with customer request: "${noteToUse}"`, { icon: '⚡' });
                handleGenerateAIQuote(noteToUse);
            }
        }
    }, [loading, existingQuote, searchParams]);

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

    const saveQuoteToFirestore = async (sendToCustomer: boolean = false): Promise<string | null> => {
        if (!user?.uid) return null;

        // For standalone quotes, validate customer fields
        const effectiveCustomer = job ? job.customer : {
            name: standaloneCustomerName.trim(),
            email: standaloneCustomerEmail.trim(),
            address: standaloneCustomerAddress.trim(),
            phone: standaloneCustomerPhone.trim()
        };

        if (!effectiveCustomer.name) {
            toast.error('Customer name is required');
            return null;
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

            const currentQuoteNumber = existingQuote?.quoteNumber || generatedQuoteNumber;

            const quoteData: Omit<Quote, 'id'> = {
                org_id: orgId,
                job_id: job?.id || '',
                customer_id: job?.customer_id || selectedCustomerId || '',
                tech_id: user.uid,
                quoteNumber: currentQuoteNumber,
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
                status: sendToCustomer ? 'sent' : (existingQuote?.status === 'tech_review' ? 'tech_review' : 'draft'),
                depositCondition: depositCondition === 'policy' ? depositRecalc.evaluatedRule : depositCondition,
                createdAt: existingQuote?.createdAt || serverTimestamp(),
                updatedAt: serverTimestamp(),
                createdBy: existingQuote?.createdBy || user.uid,
                sentAt: sendToCustomer ? serverTimestamp() : (existingQuote?.sentAt || undefined),
                sentVia: sendToCustomer ? 'link' : (existingQuote?.sentVia || undefined),
                customerNotes: existingQuote?.customerNotes || [],
                customer: existingQuote?.customer || effectiveCustomer
            };

            let docId = '';

            if (existingQuote) {
                docId = existingQuote.id;
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

                await updateDoc(quoteRef, sanitizeForFirestore(updateData));
            } else {
                const docRef = await addDoc(collection(db, 'quotes'), sanitizeForFirestore(quoteData));
                docId = docRef.id;
            }

            return docId;
        } catch (error) {
            console.error('Error saving quote:', error);
            toast.error('Failed to save quote. Please try again.');
            return null;
        } finally {
            setSaving(false);
        }
    };

    const handleSaveQuote = async (sendToCustomer: boolean = false) => {
        if (sendToCustomer) {
            await handleInitiateSendQuote();
            return;
        }

        const docId = await saveQuoteToFirestore(false);
        if (docId) {
            toast.success('Quote saved as draft');
            navigate(basePath ? `${basePath}/quotes` : '/quotes');
        }
    };

    const handleInitiateSendQuote = async () => {
        if (!user?.uid) return;

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

        if (lineItems.length === 0) {
            toast.error('Please add at least one line item before sending');
            return;
        }

        const channelsToSend: Array<'email' | 'sms' | 'call'> = [];
        if (deliveryChannels.email) channelsToSend.push('email');
        if (deliveryChannels.sms) channelsToSend.push('sms');
        if (deliveryChannels.call) channelsToSend.push('call');

        if (channelsToSend.length === 0) {
            toast.error('Please check at least one delivery option (Email, SMS Text, or AI Call).');
            return;
        }

        if (deliveryChannels.email && !effectiveCustomer.email) {
            toast.error('Please provide a customer email address for Email delivery.');
            return;
        }

        if ((deliveryChannels.sms || deliveryChannels.call) && !effectiveCustomer.phone) {
            toast.error('Please provide a customer phone number for SMS or AI Call delivery.');
            return;
        }

        // Save quote to Firestore as 'sent'
        const docId = await saveQuoteToFirestore(true);
        if (!docId) return;

        // Dispatch via selected channels
        try {
            setSaving(true);
            const currentQuoteNumber = existingQuote?.quoteNumber || generatedQuoteNumber;
            const orgId = (user as any)?.org_id || organization?.id || 'demo-org';
            const result = await dispatchQuoteDelivery({
                quoteId: docId,
                quoteNumber: currentQuoteNumber,
                total,
                customerName: effectiveCustomer.name,
                customerEmail: effectiveCustomer.email,
                customerPhone: effectiveCustomer.phone,
                orgId,
                jobId: job?.id,
                scopeOfWork,
                channels: deliveryChannels,
                sentBy: user.displayName || user.email || 'Dispatcher'
            });

            const channelLabels = channelsToSend.map(c => c === 'sms' ? 'SMS Text' : c === 'call' ? 'AI Call' : 'Email').join(' & ');
            if (result.success) {
                toast.success(`Quote sent via ${channelLabels}!`);
            } else if (result.channelsDelivered.length > 0) {
                toast.success(`Quote dispatched via ${result.channelsDelivered.map(c => c === 'sms' ? 'SMS' : c === 'call' ? 'AI Call' : 'Email').join(' & ')}`);
            } else {
                toast.error('Could not complete all delivery channels, but quote was saved.');
            }
        } catch (dispatchError: any) {
            console.error('Error dispatching quote delivery:', dispatchError);
            toast.error('Quote saved, but delivery failed: ' + (dispatchError?.message || 'Unknown error'));
        } finally {
            setSaving(false);
        }

        // Navigate directly to quote details
        navigate(basePath ? `${basePath}/quotes/${docId}` : `/quotes/${docId}`);
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

    return (
        <div className="min-h-screen bg-gray-50 py-4">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                {/* Header */}
                <div className="flex items-center gap-3 mb-3">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-1.5 hover:bg-gray-100 rounded-lg cursor-pointer"
                    >
                        <ArrowLeft className="w-5 h-5 text-gray-700" />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900 leading-tight">
                            {existingQuote ? 'Edit Quote' : isStandalone ? 'New Standalone Quote' : 'Create Quote'}
                        </h1>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span>{job ? `For Job #${job.id.slice(0, 8)} - ${job.customer.name}` : 'Manual quote — not linked to a job'}</span>
                            {existingQuote?.previousVersions && existingQuote.previousVersions.length > 0 && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800">
                                    v{existingQuote.version} • {existingQuote.previousVersions.length} prior
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Approved Quote Action & Conversion Banner */}
                {existingQuote?.status === 'approved' && (
                    <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-white border border-emerald-300 rounded-2xl p-5 mb-4 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div className="flex items-start gap-3.5">
                            <div className="p-3 bg-emerald-600 text-white rounded-xl shadow-xs shrink-0">
                                <CheckCircle className="w-6 h-6" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                        Quote Approved
                                    </span>
                                    {existingQuote.agreement?.customerSignature?.signerName && (
                                        <span className="text-xs text-emerald-900 font-medium">
                                            Signed by {existingQuote.agreement.customerSignature.signerName}
                                        </span>
                                    )}
                                </div>
                                <h3 className="text-base font-bold text-gray-900 mt-1">
                                    Customer Accepted Proposal ({existingQuote.quoteNumber})
                                </h3>
                                <p className="text-xs text-gray-600 mt-0.5">
                                    {existingQuote.job_id
                                        ? 'This quote is linked to an active job. Sourcing, equipment readiness, and scheduling can now be managed.'
                                        : 'Customer has accepted the quote. Convert this quote into an active job to schedule technician dispatch and queue materials.'}
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2.5 self-end md:self-auto shrink-0">
                            {existingQuote.job_id ? (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => navigate(`/jobs/${existingQuote.job_id}`)}
                                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                                    >
                                        <Clock className="w-3.5 h-3.5" />
                                        Open & Schedule Job
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const params = new URLSearchParams();
                                            params.set('openPO', 'true');
                                            params.set('prefill', 'true');
                                            params.set('jobId', existingQuote.job_id!);
                                            params.set('jobTitle', existingQuote.customer?.name || existingQuote.quoteNumber);
                                            navigate(`/purchase-orders?${params.toString()}`);
                                        }}
                                        className="px-3.5 py-2 bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-900 text-xs font-bold rounded-xl shadow-2xs transition flex items-center gap-1.5 cursor-pointer"
                                    >
                                        <ShoppingCart className="w-3.5 h-3.5 text-emerald-700" />
                                        Order Materials & Tools
                                    </button>
                                </>
                            ) : (
                                <button
                                    type="button"
                                    onClick={async () => {
                                        try {
                                            setSaving(true);
                                            const newJobId = await createJobFromQuote(existingQuote);
                                            toast.success('🎉 Successfully created active job from quote!');
                                            navigate(`/jobs/${newJobId}`);
                                        } catch (e: any) {
                                            toast.error('Failed to create job: ' + e.message);
                                        } finally {
                                            setSaving(false);
                                        }
                                    }}
                                    disabled={saving}
                                    className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                                >
                                    <Sparkles className="w-4 h-4" />
                                    Convert to Active Job & Schedule
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Customer Proposed Changes History (if not reviewing) */}
                {existingQuote?.customerNotes && existingQuote.customerNotes.length > 0 && existingQuote.status !== 'tech_review' && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-3">
                        <h2 className="text-sm font-bold text-gray-900 mb-2">Customer Communication History</h2>
                        <div className="space-y-2">
                            {existingQuote.customerNotes.map((note, index) => (
                                <div key={index} className={`flex flex-col ${note.author === 'tech' ? 'items-end' : 'items-start'}`}>
                                    <div className={`p-2.5 rounded-lg max-w-[80%] ${note.author === 'tech' ? 'bg-blue-100 text-blue-900' : 'bg-white border text-gray-800'}`}>
                                        <p className="text-xs shadow-2xs">{note.text}</p>
                                    </div>
                                    <span className="text-[10px] text-gray-500 mt-0.5">
                                        {note.author === 'tech' ? 'You' : 'Customer'} • {new Date(note.createdAt).toLocaleString()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Standalone Customer Entry with Repeat Customer Auto-Lookup */}
                {isStandalone && (
                    <div ref={customerDropdownRef} className="bg-white rounded-xl shadow-sm border p-4 mb-3">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2.5 pb-2 border-b border-gray-100">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                    <User className="w-5 h-5 text-blue-600" />
                                    Customer Information
                                </h2>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Auto-lookup existing repeat customers or enter new client details
                                </p>
                            </div>

                            {selectedCustomerId ? (
                                <div className="flex items-center gap-2">
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                        Repeat Customer Linked
                                    </span>
                                    <button
                                        type="button"
                                        onClick={handleClearSelectedCustomer}
                                        className="text-xs text-gray-500 hover:text-red-600 font-medium underline transition-colors"
                                    >
                                        Unlink / New
                                    </button>
                                </div>
                            ) : existingCustomers.length > 0 ? (
                                <span className="text-xs text-gray-400 bg-gray-50 px-2.5 py-1 rounded-md border border-gray-200">
                                    {existingCustomers.length} saved customer{existingCustomers.length === 1 ? '' : 's'} available
                                </span>
                            ) : null}
                        </div>

                        {/* Repeat Customer Quick Lookup Bar */}
                        {existingCustomers.length > 0 && (
                            <div className="mb-5 relative">
                                <label className="block text-xs font-bold text-blue-900 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                                    Auto Customer Lookup (Repeat Customers)
                                </label>
                                <div className="relative">
                                    <Search className="w-4 h-4 text-blue-500 absolute left-3.5 top-3 pointer-events-none" />
                                    <input
                                        type="text"
                                        placeholder="Search by customer name, phone, email, or address..."
                                        value={customerSearchQuery}
                                        onChange={(e) => {
                                            setCustomerSearchQuery(e.target.value);
                                            setShowCustomerSearchDropdown(true);
                                        }}
                                        onFocus={() => setShowCustomerSearchDropdown(true)}
                                        className="w-full pl-10 pr-10 py-2.5 bg-blue-50/40 hover:bg-blue-50/70 focus:bg-white border border-blue-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-gray-400"
                                    />
                                    {customerSearchQuery && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setCustomerSearchQuery('');
                                                setShowCustomerSearchDropdown(false);
                                            }}
                                            className="absolute right-3 top-2.5 p-1 text-gray-400 hover:text-gray-600 rounded-md"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>

                                {/* Dropdown Results for Quick Lookup Bar */}
                                {showCustomerSearchDropdown && customerSearchQuery.trim().length > 0 && (() => {
                                    const q = customerSearchQuery.toLowerCase().trim();
                                    const filtered = existingCustomers.filter(c => 
                                        c.name.toLowerCase().includes(q) ||
                                        (c.companyName && c.companyName.toLowerCase().includes(q)) ||
                                        (c.phone && c.phone.includes(q)) ||
                                        (c.email && c.email.toLowerCase().includes(q)) ||
                                        (c.address && c.address.toLowerCase().includes(q))
                                    );

                                    return (
                                        <div className="absolute z-40 left-0 right-0 mt-1.5 bg-white rounded-xl shadow-2xl border border-gray-200 max-h-72 overflow-y-auto divide-y divide-gray-100">
                                            {filtered.length > 0 ? (
                                                filtered.slice(0, 8).map(cust => (
                                                    <div
                                                        key={cust.id}
                                                        onClick={() => handleSelectRepeatCustomer(cust)}
                                                        className="p-3.5 hover:bg-blue-50/80 cursor-pointer transition-colors text-left group"
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <p className="text-sm font-bold text-gray-900 group-hover:text-blue-700">
                                                                    {cust.name}
                                                                </p>
                                                                {cust.companyName && (
                                                                    <span className="text-xs text-gray-500 font-normal">
                                                                        ({cust.companyName})
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span className="text-[11px] font-semibold text-blue-600 bg-blue-100/70 px-2 py-0.5 rounded-full">
                                                                Select & Auto-fill
                                                            </span>
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 mt-1">
                                                            {cust.phone && (
                                                                <span className="flex items-center gap-1">
                                                                    <Phone className="w-3 h-3 text-gray-400" />
                                                                    {cust.phone}
                                                                </span>
                                                            )}
                                                            {cust.email && (
                                                                <span className="flex items-center gap-1">
                                                                    <Mail className="w-3 h-3 text-gray-400" />
                                                                    {cust.email}
                                                                </span>
                                                            )}
                                                            {cust.address && (
                                                                <span className="flex items-center gap-1">
                                                                    <MapPin className="w-3 h-3 text-gray-400" />
                                                                    {cust.address}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="p-4 text-center text-sm text-gray-500">
                                                    No existing repeat customers found matching &quot;{customerSearchQuery}&quot;. You can enter new customer details below.
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="relative">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Customer Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={standaloneCustomerName}
                                    onChange={(e) => {
                                        setStandaloneCustomerName(e.target.value);
                                        setShowNameSuggestions(true);
                                    }}
                                    onFocus={() => setShowNameSuggestions(true)}
                                    placeholder="John Smith"
                                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                                    autoFocus
                                />

                                {/* Autocomplete popup on Customer Name directly */}
                                {!selectedCustomerId && showNameSuggestions && standaloneCustomerName.trim().length >= 2 && (() => {
                                    const q = standaloneCustomerName.toLowerCase().trim();
                                    const suggestions = existingCustomers.filter(c => 
                                        c.name.toLowerCase().includes(q) || (c.companyName && c.companyName.toLowerCase().includes(q))
                                    );
                                    if (suggestions.length === 0) return null;
                                    return (
                                        <div className="absolute z-30 left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-gray-200 max-h-52 overflow-y-auto divide-y divide-gray-100">
                                            <div className="px-3 py-1.5 bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                                                Matching Repeat Customers
                                            </div>
                                            {suggestions.slice(0, 5).map(cust => (
                                                <div
                                                    key={cust.id}
                                                    onClick={() => handleSelectRepeatCustomer(cust)}
                                                    className="p-2.5 hover:bg-blue-50 cursor-pointer transition-colors text-left"
                                                >
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-sm font-bold text-gray-900">{cust.name}</span>
                                                        <span className="text-xs text-blue-600 font-medium">Auto-fill ↵</span>
                                                    </div>
                                                    <div className="text-xs text-gray-500 flex items-center gap-3 mt-0.5">
                                                        {cust.phone && <span>📞 {cust.phone}</span>}
                                                        {cust.email && <span>✉️ {cust.email}</span>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}
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
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 mb-3">
                    <div className="flex items-start gap-3">
                        <FileText className="w-5 h-5 text-blue-600 mt-0.5" />
                        <div>
                            <h3 className="font-medium text-blue-900 text-sm">Job Request</h3>
                            <p className="text-blue-800 text-xs mt-0.5">{(job.request?.description || 'No description')}</p>
                        </div>
                    </div>
                </div>
                )}

                {/* Scope of Work */}
                <div className="bg-white rounded-xl shadow-sm border p-4 mb-3">
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <div>
                            <h2 className="text-base font-semibold text-gray-900">Scope of Work</h2>
                            <span className="text-xs text-gray-500">
                                Describe the service needed to auto-generate quote items
                            </span>
                        </div>
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg shadow-2xs">
                            <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <label className="text-xs font-semibold text-slate-700 whitespace-nowrap">Est. Duration:</label>
                            <input
                                type="number"
                                value={estimatedDuration || ''}
                                onChange={(e) => setEstimatedDuration(parseInt(e.target.value) || 0)}
                                placeholder="60"
                                min="0"
                                className="w-14 px-2 py-0.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 bg-white text-center font-medium"
                            />
                            <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
                                min {estimatedDuration > 0 ? `(${Math.floor(estimatedDuration / 60)}h ${estimatedDuration % 60}m)` : ''}
                            </span>
                        </div>
                    </div>
                    <textarea
                        id="scope-of-work-textarea"
                        value={scopeOfWork}
                        onChange={(e) => setScopeOfWork(e.target.value)}
                        rows={2}
                        className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-xs leading-relaxed"
                        placeholder="Describe the work to be performed (e.g., installation of a freestanding refrigerator with water line and shut-off valve, HVAC tune-up, electrical breaker panel upgrade)..."
                    />

                    {/* Generate AI Quote Action Button (only if no line items yet) */}
                    {lineItems.length === 0 && !aiRecommendation && (
                        <div className="mt-3">
                            <button
                                type="button"
                                onClick={() => handleGenerateAIQuote()}
                                disabled={aiLoading}
                                className="w-full py-3 px-5 bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 hover:from-purple-700 hover:via-indigo-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-xl font-bold flex items-center justify-center gap-2.5 shadow-md hover:shadow-lg transition-all transform active:scale-[0.99]"
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
                        </div>
                    )}

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
                <div className="bg-white rounded-xl shadow-sm border p-4 mb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-2.5 border-b border-gray-100">
                        <div>
                            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                                Line Items
                                {lineItems.length > 0 && (
                                    <span className="text-xs bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-full">
                                        {lineItems.length}
                                    </span>
                                )}
                            </h2>
                            <p className="text-xs text-gray-500">Add or edit labor, materials, equipment, and fees</p>
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
                                    className="inline-flex items-center px-2 py-1 text-xs font-semibold text-gray-700 bg-white border border-gray-300 hover:border-blue-500 hover:bg-blue-50/70 hover:text-blue-700 rounded-lg transition-all shadow-2xs group cursor-pointer"
                                >
                                    <Plus className="w-3 h-3 mr-1 text-gray-400 group-hover:text-blue-600 transition-colors" />
                                    <type.icon className="w-3.5 h-3.5 mr-1 text-gray-500 group-hover:text-blue-600 transition-colors" />
                                    <span>{type.label}</span>
                                </button>
                            ))}
                            <button
                                type="button"
                                id="btn-add-adjustment-line"
                                onClick={() => {
                                    const input = document.getElementById('ai-refinement-input');
                                    if (input) {
                                        input.focus();
                                        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    }
                                }}
                                title="Add an adjustment to quote scope or items"
                                className="inline-flex items-center px-2 py-1 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-300 rounded-lg transition-all shadow-2xs group cursor-pointer"
                            >
                                <Sparkles className="w-3 h-3 mr-1 text-purple-600 animate-pulse" />
                                <span>+ Adjustment Line</span>
                            </button>
                        </div>
                    </div>

                    {/* AI Revision Proposal Pending Review Banner */}
                    {((existingQuote?.status === 'tech_review' && (existingQuote?.aiRevisionProposal || aiRevisionProposal)) || aiRevisionProposal) && (
                        <div className="mb-3 p-3.5 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-indigo-500/10 border border-amber-300 rounded-xl shadow-2xs">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                <div className="flex items-start gap-2.5">
                                    <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-white shrink-0 mt-0.5 shadow-2xs">
                                        <Sparkles className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-gray-900 uppercase tracking-wide">AI Revision Proposal Pending Review</span>
                                            <span className="text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded-full">Ready</span>
                                        </div>
                                        <p className="text-xs text-gray-600 mt-0.5">
                                            Customer requested: &ldquo;{(aiRevisionProposal || existingQuote?.aiRevisionProposal)?.customerRequest || customerRequestedNote}&rdquo;
                                        </p>
                                        <div className="text-xs font-bold text-indigo-700 mt-0.5">
                                            Proposed Total: ${Number((aiRevisionProposal || existingQuote?.aiRevisionProposal)?.total || 0).toFixed(2)}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleApplyAiRevisionProposal}
                                    className="px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition cursor-pointer whitespace-nowrap"
                                >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Apply AI Revision to Quote
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Customer Requested Changes Note (shown just above AI Refine) */}
                    {customerRequestedNote && !aiRevisionProposal && (
                        <div className="mb-2.5 p-2.5 bg-amber-50 border border-amber-300/80 rounded-xl flex items-start gap-2.5 shadow-2xs">
                            <MessageSquare className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <div className="flex-1 text-xs">
                                <span className="font-bold text-amber-900 uppercase tracking-wide mr-1.5">Customer Requested:</span>
                                <span className="italic text-gray-900 font-semibold">&ldquo;{customerRequestedNote}&rdquo;</span>
                            </div>
                        </div>
                    )}

                    {/* AI Refine Quote Panel (just above manual line items refine) */}
                    {lineItems.length > 0 && (
                        <div className="mb-3 p-3 bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 border border-purple-200 rounded-xl space-y-2 shadow-2xs">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-1.5">
                                    <Sparkles className="w-4 h-4 text-purple-700" />
                                    <span className="text-xs font-bold text-purple-950 uppercase tracking-wide">Refine Quote with AI</span>
                                    <span className="text-[11px] text-purple-700 hidden sm:inline">— Type changes or click quick adjustments</span>
                                </div>
                                {aiQuoteHistory.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => handleRevertToPreviousQuote()}
                                        className="flex items-center gap-1 text-[11px] font-semibold text-purple-700 bg-white hover:bg-purple-100 border border-purple-300 rounded-lg px-2.5 py-0.5 transition shadow-2xs cursor-pointer"
                                        title={`Revert back to ${aiQuoteHistory[0].label} ($${aiQuoteHistory[0].total.toFixed(2)})`}
                                    >
                                        <RotateCcw className="w-3 h-3 text-purple-600" />
                                        <span>Revert to Previous (${aiQuoteHistory[0].total.toFixed(2)})</span>
                                    </button>
                                )}
                            </div>

                            <div className="flex flex-col sm:flex-row items-stretch gap-2">
                                <input
                                    type="text"
                                    id="ai-refinement-input"
                                    value={aiModificationNote}
                                    onChange={(e) => setAiModificationNote(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (aiModificationNote.trim()) handleGenerateAIQuote(); } }}
                                    placeholder={customerRequestedNote ? `Type instructions (or use note: "${customerRequestedNote}")...` : "Type what you want to change (e.g. also install 2 new shower heads and toss the old ones)..."}
                                    className="flex-1 px-3 py-2 bg-white border border-purple-300 focus:border-purple-600 rounded-lg text-xs text-gray-900 placeholder:text-gray-400 focus:ring-1 focus:ring-purple-300 shadow-2xs"
                                />
                                <div className="flex items-center gap-1.5 shrink-0">
                                    {customerRequestedNote && (
                                        <button
                                            type="button"
                                            onClick={() => handleApplyQuickAdjustment(customerRequestedNote)}
                                            className="px-2.5 py-2 bg-white border border-amber-300 hover:bg-amber-100/60 text-amber-900 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap shadow-2xs"
                                            title="Apply customer request to quote"
                                        >
                                            Apply Customer Note
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        id="btn-refine-with-ai"
                                        onClick={() => handleGenerateAIQuote()}
                                        disabled={aiLoading || !aiModificationNote.trim()}
                                        className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:from-gray-300 disabled:to-gray-400 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer whitespace-nowrap"
                                    >
                                        {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                        Refine with AI
                                    </button>
                                </div>
                            </div>

                            {/* Quick adjustment chips */}
                            <div className="flex items-center gap-1.5 flex-wrap text-xs pt-0.5">
                                <span className="text-gray-500 font-medium text-[11px]">Quick 1-click adjustments:</span>
                                {[
                                    'also install 2 new shower heads and toss the old ones',
                                    'Make it cheaper / budget option',
                                    'Increase labor to 2 hours',
                                    'Needs larger 12,000 BTU unit',
                                    'Add surge protector & disconnect',
                                    'Remove optional items'
                                ].map((preset) => (
                                    <button
                                        key={preset}
                                        type="button"
                                        onClick={() => handleApplyQuickAdjustment(preset)}
                                        className="px-2 py-0.5 bg-white border border-purple-200 hover:border-purple-400 hover:bg-purple-100/50 text-purple-700 rounded-md text-[11px] font-medium transition shadow-2xs cursor-pointer active:scale-95"
                                        title={`Instantly apply: ${preset}`}
                                    >
                                        + {preset}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Materials Quick Add / Manual Refine & Equipment Policy Selector */}
                    <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => setIsLookupModalOpen(true)}
                            className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                        >
                            <Search className="w-3.5 h-3.5" /> Search & Add Material from Inventory or Catalogs
                        </button>

                        <div className="flex items-center gap-2 text-xs bg-slate-50 border border-slate-200/90 px-3 py-1.5 rounded-lg shadow-2xs">
                            <span className="font-bold text-slate-700 flex items-center gap-1">
                                <Wrench className="w-3.5 h-3.5 text-amber-600" /> Equipment Quoting:
                            </span>
                            <select
                                value={equipmentQuotePolicy}
                                onChange={(e) => {
                                    const newPolicy = e.target.value as 'one_time_only' | 'all' | 'internal_only';
                                    setEquipmentQuotePolicy(newPolicy);
                                    if (lineItems.some(i => i.type === 'equipment')) {
                                        setLineItems(lineItems.map(item => {
                                            if (item.type !== 'equipment') return item;
                                            const usage = item.equipmentUsageType || 'long_term';
                                            const shouldBill = newPolicy === 'all' || (newPolicy === 'one_time_only' && usage === 'one_time');
                                            const markup = item.markupPercentage ?? (organization?.settings?.materialMarkup || 30);
                                            const base = item.baseCost || (item.unitPrice > 0 ? Math.round(item.unitPrice / (1 + markup/100) * 100) / 100 : 35);
                                            const price = shouldBill ? Math.round(base * (1 + markup/100) * 100) / 100 : 0;
                                            return {
                                                ...item,
                                                equipmentBillingType: shouldBill ? 'customer_billed' : 'company_expense',
                                                unitPrice: price,
                                                total: (item.quantity || 1) * price,
                                                taxable: shouldBill,
                                                queuedForProcurement: true
                                            };
                                        }));
                                        toast.success(`Updated equipment line items to: ${
                                            newPolicy === 'one_time_only' ? 'One-Time Rentals Only' :
                                            newPolicy === 'all' ? 'Bill All Equipment' : 'Company Absorbed'
                                        }`);
                                    }
                                }}
                                className="border border-slate-300 rounded px-2 py-0.5 text-xs font-semibold text-slate-800 bg-white focus:ring-1 focus:ring-blue-500 cursor-pointer"
                                title="Controls whether equipment is billed to the customer or treated as an internal company purchase"
                            >
                                <option value="one_time_only">One-Time Rentals Only (Default)</option>
                                <option value="all">Bill All Equipment to Customer</option>
                                <option value="internal_only">Company Absorbs All Equipment ($0.00)</option>
                            </select>
                        </div>
                    </div>


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
                        <div className="space-y-2.5">
                            {lineItems.map((item, index) => {
                                const typeInfo = LINE_ITEM_TYPES.find(t => t.value === item.type);
                                const isSelectedByTag = item.notes?.startsWith('Selected by ');

                                return (
                                    <div 
                                        key={item.id} 
                                        className="p-3 sm:p-3.5 bg-white rounded-xl border border-gray-200/90 hover:border-blue-300 shadow-2xs transition-all space-y-2"
                                    >
                                        {/* Tier 1: Header - Type Badge, Index, Taxable, Priority Strategy Chip, Line Total, Trash */}
                                        <div className="flex items-center justify-between gap-2 flex-wrap">
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

                                        {/* Tier 2: Product Description - Full width without distracting tag input */}
                                        <div>
                                            <input
                                                type="text"
                                                value={item.description}
                                                onChange={(e) => updateLineItem(item.id, { description: e.target.value })}
                                                placeholder="Product or service description..."
                                                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                                                title={item.description}
                                            />
                                        </div>

                                        {/* Equipment Billing & Purchase Management Toolbar */}
                                        {item.type === 'equipment' && (
                                            <div className="p-2 sm:p-2.5 bg-amber-50/70 border border-amber-200/90 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-bold text-amber-900 flex items-center gap-1 shrink-0">
                                                        <Wrench className="w-3.5 h-3.5 text-amber-700" /> Equipment Usage:
                                                    </span>
                                                    <div className="inline-flex rounded-md shadow-2xs border border-amber-300 bg-white p-0.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                updateLineItem(item.id, { equipmentUsageType: 'one_time' });
                                                            }}
                                                            className={`px-2 py-0.5 text-[11px] font-bold rounded transition cursor-pointer ${
                                                                item.equipmentUsageType === 'one_time'
                                                                    ? 'bg-amber-600 text-white shadow-xs'
                                                                    : 'text-amber-900 hover:bg-amber-50'
                                                            }`}
                                                            title="One-time use equipment, site rental, scaffolding, or job-specific gear"
                                                        >
                                                            ⏱️ One-Time / Rental
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                updateLineItem(item.id, { equipmentUsageType: 'long_term' });
                                                            }}
                                                            className={`px-2 py-0.5 text-[11px] font-bold rounded transition cursor-pointer ${
                                                                item.equipmentUsageType !== 'one_time'
                                                                    ? 'bg-amber-600 text-white shadow-xs'
                                                                    : 'text-amber-900 hover:bg-amber-50'
                                                            }`}
                                                            title="Long-term tool or company equipment asset reused across jobs"
                                                        >
                                                            🔧 Long-Term / Shop Asset
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-bold text-slate-700 shrink-0">Customer Charge:</span>
                                                    <div className="inline-flex rounded-md shadow-2xs border border-slate-300 bg-white p-0.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const markup = item.markupPercentage ?? (organization?.settings?.materialMarkup || 30);
                                                                const base = item.baseCost || (item.unitPrice > 0 ? Math.round(item.unitPrice / (1 + markup/100) * 100) / 100 : 35);
                                                                const customerPrice = Math.round(base * (1 + markup / 100) * 100) / 100;
                                                                updateLineItem(item.id, {
                                                                    equipmentBillingType: 'customer_billed',
                                                                    baseCost: base,
                                                                    markupPercentage: markup,
                                                                    unitPrice: customerPrice,
                                                                    total: (item.quantity || 1) * customerPrice,
                                                                    taxable: true
                                                                });
                                                                toast.success(`Equipment "${item.description || 'Item'}" set to Bill Customer ($${customerPrice.toFixed(2)})`);
                                                            }}
                                                            className={`px-2.5 py-0.5 text-[11px] font-bold rounded transition cursor-pointer flex items-center gap-1 ${
                                                                item.equipmentBillingType !== 'company_expense' && item.unitPrice > 0
                                                                    ? 'bg-emerald-600 text-white shadow-xs'
                                                                    : 'text-gray-600 hover:bg-emerald-50'
                                                            }`}
                                                            title="Charge equipment to customer on quote"
                                                        >
                                                            <CheckCircle2 className="w-3 h-3" />
                                                            <span>Bill Customer</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const markup = item.markupPercentage ?? (organization?.settings?.materialMarkup || 30);
                                                                const base = item.baseCost || (item.unitPrice > 0 ? Math.round(item.unitPrice / (1 + markup/100) * 100) / 100 : 35);
                                                                updateLineItem(item.id, {
                                                                    equipmentBillingType: 'company_expense',
                                                                    baseCost: base,
                                                                    markupPercentage: markup,
                                                                    unitPrice: 0,
                                                                    total: 0,
                                                                    taxable: false,
                                                                    queuedForProcurement: true
                                                                });
                                                                toast.success(`Equipment "${item.description || 'Item'}" set to Company Expense ($0.00 to customer, queued for purchase)`);
                                                            }}
                                                            className={`px-2.5 py-0.5 text-[11px] font-bold rounded transition cursor-pointer flex items-center gap-1 ${
                                                                item.equipmentBillingType === 'company_expense' || item.unitPrice === 0
                                                                    ? 'bg-purple-700 text-white shadow-xs'
                                                                    : 'text-gray-600 hover:bg-purple-50'
                                                            }`}
                                                            title="Company absorbs equipment cost ($0.00 to customer) and queues for purchasing"
                                                        >
                                                            <Building2 className="w-3 h-3" />
                                                            <span>Company Expense ($0.00)</span>
                                                        </button>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const nextVal = item.queuedForProcurement === false;
                                                            updateLineItem(item.id, { queuedForProcurement: nextVal });
                                                            toast.success(nextVal ? '🛒 Queued for Procurement Backlog / PO Cart' : 'Removed from PO queue');
                                                        }}
                                                        className={`px-2 py-0.5 text-[11px] font-semibold rounded border transition cursor-pointer flex items-center gap-1 ${
                                                            item.queuedForProcurement !== false
                                                                ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                                                                : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                                                        }`}
                                                        title="Manage equipment purchase order queue"
                                                    >
                                                        <ShoppingCart className="w-3 h-3" />
                                                        <span>{item.queuedForProcurement !== false ? 'Queued for PO' : '+ Queue for PO'}</span>
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Tier 3: Compact Responsive Pricing & Supplier Toolbar */}
                                        <div className="pt-2 border-t border-gray-100 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-2.5 bg-slate-50/80 -mx-3 -mb-3 sm:-mx-3.5 sm:-mb-3.5 px-3 sm:px-3.5 py-2 rounded-b-xl text-xs">
                                            {/* Quantity, Unit & Pricing Parameters */}
                                            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                                                {/* Quantity */}
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[11px] font-bold text-gray-500 uppercase">Qty:</span>
                                                    <input
                                                        type="number"
                                                        value={item.quantity}
                                                        onChange={(e) => updateLineItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                                                        min="0"
                                                        step="0.5"
                                                        className="w-14 sm:w-16 h-7 sm:h-8 border border-gray-300 rounded-md text-xs text-center font-bold bg-white focus:ring-2 focus:ring-blue-500 shadow-2xs"
                                                    />
                                                </div>

                                                {/* Unit */}
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[11px] font-bold text-gray-500 uppercase">Unit:</span>
                                                    <input
                                                        type="text"
                                                        value={item.unit}
                                                        onChange={(e) => updateLineItem(item.id, { unit: e.target.value })}
                                                        className="w-14 sm:w-16 h-7 sm:h-8 border border-gray-300 rounded-md text-xs text-center font-medium bg-white focus:ring-2 focus:ring-blue-500 shadow-2xs"
                                                        placeholder="each"
                                                    />
                                                </div>

                                                {/* Base Cost (Materials & Equipment) */}
                                                {(item.type === 'material' || item.type === 'equipment') && item.baseCost != null && item.baseCost > 0 && (
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-[11px] font-bold text-gray-400 uppercase">Cost:</span>
                                                        <span className="h-7 sm:h-8 px-2 bg-gray-200/80 text-gray-800 rounded-md font-bold flex items-center text-xs">
                                                            ${item.baseCost.toFixed(2)}
                                                        </span>
                                                    </div>
                                                )}

                                                {/* Markup % */}
                                                {(item.type === 'material' || (item.type === 'equipment' && item.equipmentBillingType !== 'company_expense')) && isDispatchOrSolo && (
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[11px] font-bold text-amber-800 uppercase">Markup:</span>
                                                        <div className="flex items-center h-7 sm:h-8 bg-amber-50 border border-amber-300 rounded-md overflow-hidden shadow-2xs">
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
                                                    {item.type === 'equipment' && item.equipmentBillingType === 'company_expense' ? (
                                                        <span className="h-7 sm:h-8 px-2 bg-purple-100 text-purple-900 border border-purple-200 rounded-md font-bold flex items-center text-xs">
                                                            $0.00 (Company Funded)
                                                        </span>
                                                    ) : (
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
                                                                className="w-20 sm:w-24 h-7 sm:h-8 pl-5 pr-2 border border-gray-300 rounded-md text-xs text-right font-bold text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 shadow-2xs"
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Sourcing / Supplier Selection (Materials & Equipment) */}
                                            {(item.type === 'material' || item.type === 'equipment') && (
                                                <div className="flex items-center gap-2 flex-wrap pt-1.5 xl:pt-0 border-t xl:border-t-0 border-gray-200/60">
                                                    <span className="text-gray-500 font-bold text-[11px] uppercase shrink-0">Supplier:</span>
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
                                                            className="text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1 text-[11px] bg-white border border-blue-200 px-2.5 py-1 rounded shadow-2xs hover:bg-blue-50 transition"
                                                            title={`View on ${item.vendorName || 'vendor website'}`}
                                                        >
                                                            View <ExternalLink className="w-2.5 h-2.5" />
                                                        </a>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsLookupModalOpen(true)}
                                                        className="text-[11px] text-blue-700 hover:text-blue-900 font-semibold shrink-0 hover:underline px-1.5 py-1"
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
                        <div className="mt-4 pt-3 border-t">
                            <h3 className="text-sm font-semibold text-gray-900 mb-2.5">Quote Display Settings</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Presentation Mode</label>
                                    <select
                                        value={presentationMode}
                                        onChange={(e) => setPresentationMode(e.target.value as any)}
                                        className="w-full border border-gray-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="detailed">Detailed Line Items</option>
                                        <option value="category_rollup">Roll-up by Category</option>
                                        <option value="single_price">Single Price Summary</option>
                                    </select>
                                    <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={displayTax}
                                            onChange={(e) => setDisplayTax(e.target.checked)}
                                            className="w-3.5 h-3.5 text-blue-600 rounded focus:ring-blue-500"
                                        />
                                        <span className="text-xs text-gray-700">Display tax as separate line</span>
                                    </label>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Discount</label>
                                    <div className="flex items-center gap-2 mb-1.5">
                                        <select
                                            value={discountType}
                                            onChange={(e) => setDiscountType(e.target.value as any)}
                                            className="w-1/3 border border-gray-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500"
                                        >
                                            <option value="fixed">$ Amount</option>
                                            <option value="percentage">% Percent</option>
                                        </select>
                                        <input
                                            type="number"
                                            value={discountValue || ''}
                                            onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                                            placeholder="Amount"
                                            className="flex-1 border border-gray-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <input
                                        type="text"
                                        value={discountReason}
                                        onChange={(e) => setDiscountReason(e.target.value)}
                                        placeholder="Reason (optional, shown to customer)"
                                        className="w-full border border-gray-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Totals */}
                    {lineItems.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t space-y-1.5 text-xs">
                            <div className="flex justify-between">
                                <span className="text-gray-600">Subtotal</span>
                                <span className="font-semibold text-gray-900">${subtotal.toFixed(2)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-gray-600">Tax ({taxRate}%)</span>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        value={taxRate}
                                        onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                                        min="0"
                                        step="0.001"
                                        className="w-16 border border-gray-300 rounded p-1 text-xs text-right"
                                    />
                                    <span className="font-semibold text-gray-900 w-20 text-right">${taxAmount.toFixed(2)}</span>
                                </div>
                            </div>
                            {discountAmount > 0 && (
                                <div className="flex justify-between text-emerald-600 font-medium">
                                    <span>Discount</span>
                                    <span>-${discountAmount.toFixed(2)}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-base font-bold text-gray-900 pt-1.5 border-t">
                                <span>Total</span>
                                <span>${total.toFixed(2)}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Overrun Protection */}
                <div className="bg-white rounded-xl shadow-sm border p-3.5 mb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                            <h2 className="text-sm font-semibold text-gray-900">Overrun Protection</h2>
                            <span className="text-xs text-gray-500 hidden md:inline">
                                — Customer agreement for potential cost increases
                            </span>
                        </div>

                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={overrunSettings.enabled}
                                onChange={(e) => setOverrunSettings({ ...overrunSettings, enabled: e.target.checked })}
                                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                            />
                            <span className="text-xs font-medium text-gray-700">Enable overrun protection</span>
                        </label>
                    </div>

                    {overrunSettings.enabled && (
                        <div className="mt-2.5 pt-2.5 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-2">
                                <span className="text-gray-700 font-medium whitespace-nowrap">Max overrun without re-approval:</span>
                                <div className="flex items-center gap-1.5">
                                    <input
                                        type="number"
                                        value={overrunSettings.maxOverrunPercent}
                                        onChange={(e) => setOverrunSettings({
                                            ...overrunSettings,
                                            maxOverrunPercent: parseInt(e.target.value) || 0
                                        })}
                                        min="0"
                                        max="100"
                                        className="w-16 border border-gray-300 rounded-lg p-1.5 text-center text-xs focus:ring-2 focus:ring-blue-500"
                                    />
                                    <span className="text-gray-600">%</span>
                                    <span className="text-gray-500">
                                        (up to ${((total * overrunSettings.maxOverrunPercent) / 100).toFixed(2)} over quote)
                                    </span>
                                </div>
                            </div>

                            <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                                <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <span>Customer agrees to pay up to {overrunSettings.maxOverrunPercent}% over quote without extra approval.</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Payment Terms & Agreement (Wide & Compact) */}
                <div className="bg-white rounded-xl shadow-sm border p-4 mb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 mb-3 border-b border-gray-100">
                        <h2 className="text-sm font-semibold text-gray-900">Payment Terms & Agreement</h2>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={signatureRequired}
                                onChange={(e) => setSignatureRequired(e.target.checked)}
                                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                            />
                            <span className="text-xs font-semibold text-gray-800">Require customer signature for approval</span>
                        </label>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                        {/* Left Column: Quote Validity & Jurisdiction (5 cols) */}
                        <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    Quote Valid For
                                </label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        value={validDays}
                                        onChange={(e) => setValidDays(parseInt(e.target.value) || 0)}
                                        min="1"
                                        className="w-20 border border-gray-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500"
                                    />
                                    <span className="text-xs text-gray-500">days</span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    Jurisdiction (State / Region)
                                </label>
                                <select
                                    value={jurisdictionState}
                                    onChange={(e) => setJurisdictionState(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500"
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

                        {/* Right Column: Deposit Requirement (7 cols) */}
                        <div className="lg:col-span-7 flex flex-col gap-2">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Deposit Requirement</label>
                                <select
                                    value={depositCondition}
                                    onChange={(e) => setDepositCondition(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500"
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
                                <div className="bg-blue-50/80 px-3 py-2 rounded-lg border border-blue-100 flex flex-wrap items-center justify-between text-xs text-blue-900 gap-2">
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-semibold text-blue-800">Rule:</span>
                                        <span className="capitalize">{evaluatedRule === 'none' ? 'None' : evaluatedRule.replace(/_/g, ' ')}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div>
                                            <span className="text-blue-700 mr-1">Deposit:</span>
                                            <span className="font-bold text-blue-950">${depositAmount.toFixed(2)}</span>
                                        </div>
                                        {requiresDeposit && (
                                            <div className="text-[11px] text-blue-600 border-l border-blue-200 pl-2">
                                                Bal: ${Math.max(0, total - depositAmount).toFixed(2)}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {depositCondition !== 'none' && depositCondition !== 'policy' && (
                                <div className="bg-blue-50/80 px-3 py-2 rounded-lg border border-blue-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                                    <div className="flex items-center gap-2">
                                        <label className="font-semibold text-gray-700 whitespace-nowrap">
                                            {depositCondition === 'paid_estimate' ? 'Fee:' : 'Amount:'}
                                        </label>
                                        <div className="relative w-28">
                                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs">$</span>
                                            <input
                                                type="number"
                                                value={depositAmount}
                                                onChange={(e) => setDepositAmount(parseFloat(e.target.value) || 0)}
                                                disabled={depositCondition !== 'custom' && depositCondition !== 'paid_estimate'}
                                                min="0"
                                                step="0.01"
                                                className="w-full border border-gray-300 rounded-lg py-1 pl-6 pr-2 text-xs focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                                            />
                                        </div>
                                    </div>
                                    <div className="text-[11px] text-gray-600">
                                        {depositCondition === 'paid_estimate'
                                            ? 'Flat fee for evaluation'
                                            : `Bal: $${Math.max(0, total - depositAmount).toFixed(2)}`}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Revision Comment — shown when editing an existing quote */}
                {existingQuote && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3.5 mb-3">
                        <div className="flex items-center gap-2 mb-2">
                            <MessageSquare className="w-4 h-4 text-blue-600" />
                            <h3 className="text-sm font-bold text-gray-900">
                                {existingQuote.status === 'tech_review' ? 'Reply to Customer' : 'Add a Note'}
                            </h3>
                        </div>
                        {existingQuote.status === 'tech_review' && existingQuote.customerNotes?.length ? (() => {
                            const latestCustomerNote = [...existingQuote.customerNotes].reverse().find(n => n.author === 'customer');
                            return latestCustomerNote ? (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-2">
                                    <p className="text-[11px] font-semibold text-amber-700 mb-0.5">Customer requested:</p>
                                    <p className="text-xs text-gray-800">&ldquo;{latestCustomerNote.text}&rdquo;</p>
                                </div>
                            ) : null;
                        })() : null}
                        <textarea
                            value={revisionComment}
                            onChange={(e) => setRevisionComment(e.target.value)}
                            rows={2}
                            className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs"
                            placeholder={existingQuote.status === 'tech_review'
                                ? 'E.g., I\'ve adjusted the quote per your request. Removed the piping work and updated the total...'
                                : 'Optional — add a note about the changes you made to this quote...'
                            }
                        />
                        <p className="text-[11px] text-gray-400 mt-1">
                            This note will be visible to the customer in the communication history.
                        </p>
                    </div>
                )}

                {/* Page Bottom Action & Delivery Bar */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3.5 mb-6 flex flex-col md:flex-row items-center justify-between gap-3">
                    <div className="flex flex-col shrink-0">
                        <span className="text-xs text-gray-500 font-medium">
                            {job?.customer?.name || standaloneCustomerName || 'New Quote'} • {lineItems.length} line item{lineItems.length !== 1 ? 's' : ''}
                            {requiresDeposit && depositAmount > 0 ? ` • Deposit: $${depositAmount.toFixed(2)}` : ''}
                        </span>
                        <span className="text-lg font-black text-gray-900 tracking-tight">
                            Total: ${total.toFixed(2)}
                        </span>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto justify-end flex-wrap">
                        {lineItems.length === 0 && (
                            <button
                                type="button"
                                onClick={() => handleGenerateAIQuote()}
                                disabled={aiLoading}
                                className="px-3.5 py-2 text-xs font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl flex items-center gap-1.5 shadow-sm transition disabled:opacity-50 cursor-pointer"
                            >
                                {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                Generate AI Quote
                            </button>
                        )}

                        {/* Send via Checkboxes */}
                        <div className="flex items-center gap-2.5 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl text-xs shrink-0">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Send via:</span>
                            <label className="flex items-center gap-1 cursor-pointer font-semibold text-slate-700 hover:text-blue-600 transition select-none">
                                <input
                                    type="checkbox"
                                    checked={deliveryChannels.email}
                                    onChange={(e) => setDeliveryChannels(prev => ({ ...prev, email: e.target.checked }))}
                                    className="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                                />
                                <Mail className="w-3.5 h-3.5 text-blue-600" />
                                <span>Email</span>
                            </label>
                            <label className="flex items-center gap-1 cursor-pointer font-semibold text-slate-700 hover:text-emerald-600 transition select-none">
                                <input
                                    type="checkbox"
                                    checked={deliveryChannels.sms}
                                    onChange={(e) => setDeliveryChannels(prev => ({ ...prev, sms: e.target.checked }))}
                                    className="w-3.5 h-3.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                                />
                                <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                                <span>SMS Text</span>
                            </label>
                            <label className="flex items-center gap-1 cursor-pointer font-semibold text-slate-700 hover:text-purple-600 transition select-none">
                                <input
                                    type="checkbox"
                                    checked={deliveryChannels.call}
                                    onChange={(e) => setDeliveryChannels(prev => ({ ...prev, call: e.target.checked }))}
                                    className="w-3.5 h-3.5 text-purple-600 rounded border-slate-300 focus:ring-purple-500 cursor-pointer"
                                />
                                <PhoneCall className="w-3.5 h-3.5 text-purple-600" />
                                <span>AI Call</span>
                            </label>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => navigate(-1)}
                                className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSaveQuote(false)}
                                disabled={saving || lineItems.length === 0}
                                className="px-3.5 py-1.5 text-xs font-semibold border border-blue-600 text-blue-600 hover:bg-blue-50 rounded-xl transition disabled:opacity-50 shrink-0 cursor-pointer"
                            >
                                Save Draft
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSaveQuote(true)}
                                disabled={saving || lineItems.length === 0}
                                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition disabled:opacity-50 shrink-0 cursor-pointer"
                            >
                                <Send className="w-3.5 h-3.5" />
                                {existingQuote?.status === 'tech_review' ? 'Update & Resend' : 'Save & Send Quote'}
                            </button>
                        </div>
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
