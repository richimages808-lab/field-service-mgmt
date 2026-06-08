import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, query, where, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import { Job, Quote, QuoteLineItem, MaterialItem, DEFAULT_OVERRUN_PROTECTION, Customer, RateCardMatrix } from '../types';
import { ALL_JURISDICTIONS } from '../lib/quoteTerms';
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
    MessageSquare,
    Sparkles
} from 'lucide-react';
import { InlineAIQuotePanel } from '../components/InlineAIQuotePanel';
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
    const navigate = useNavigate();
    const { user } = useAuth();

    const [job, setJob] = useState<Job | null>(null);
    const [customerData, setCustomerData] = useState<Customer | null>(null);
    const [rateCard, setRateCard] = useState<RateCardMatrix | null>(null);
    const [materials, setMaterials] = useState<MaterialItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

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



    useEffect(() => {
        const loadData = async () => {
            if (!user?.uid) {
                setLoading(false);
                return;
            }

            try {
                const orgId = (user as any).org_id || (user as any).organization?.id || 'demo-org';
                let currentJobId = jobId;

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
                            const diffTime = Math.abs(validUntilDate.getTime() - today.getTime());
                            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            setValidDays(diffDays);
                        }
                        setLineItems(quoteData.lineItems || []);
                        if (quoteData.taxRate !== undefined) {
                            setTaxRate(quoteData.taxRate);
                        }
                        setPresentationMode(quoteData.presentationMode || 'detailed');
                        setDisplayTax(quoteData.displayTax !== false); // Default to true
                        setDiscountType(quoteData.discountType || 'fixed');
                        setDiscountValue(quoteData.discountValue || quoteData.discount || 0);
                        if (quoteData.agreement) {
                            setRequiresDeposit(quoteData.agreement.requiresDeposit || false);
                            if (quoteData.agreement.depositAmount) {
                                setDepositAmount(quoteData.agreement.depositAmount);
                                setDepositCondition('custom');
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

                // Load materials for dropdown
                if (orgId) {
                    const materialsQuery = query(
                        collection(db, 'materials'),
                        where('org_id', '==', orgId)
                    );
                    const materialsSnapshot = await getDocs(materialsQuery);
                    const materialsData = materialsSnapshot.docs.map(d => ({
                        id: d.id,
                        ...d.data()
                    })) as MaterialItem[];
                    setMaterials(materialsData);

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
        const newItem: QuoteLineItem = {
            id: crypto.randomUUID(),
            type: 'material',
            description: material.name,
            quantity: 1,
            unit: material.unit,
            unitPrice: material.unitPrice,
            total: material.unitPrice,
            taxable: material.taxable,
            materialId: material.id,
            isOptional: false
        };
        setLineItems([...lineItems, newItem]);
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
        if (depositCondition === 'none') {
            setRequiresDeposit(false);
            setDepositAmount(0);
            setEvaluatedRule('none');
        } else if (depositCondition === 'custom') {
            setRequiresDeposit(true);
            setEvaluatedRule('none');
        } else if (depositCondition === 'policy') {
            if (!upfrontPolicy || !upfrontPolicy.enabled) {
                setRequiresDeposit(false);
                setDepositAmount(0);
                setEvaluatedRule('none');
                return;
            }

            const rules = upfrontPolicy.defaultRules || (upfrontPolicy.defaultRule && upfrontPolicy.defaultRule !== 'none' ? [upfrontPolicy.defaultRule] : []);
            if (rules.length === 0) {
                setRequiresDeposit(false);
                setDepositAmount(0);
                setEvaluatedRule('none');
                return;
            }

            let highestAmount = 0;
            let highestRule = 'none';

            const depositPercent = upfrontPolicy.depositPercent ?? 50;
            const threshold = upfrontPolicy.overThreshold ?? 500;
            const paidEstimateAmount = upfrontPolicy.paidEstimateAmount ?? 75;

            rules.forEach((rule: string) => {
                let amount = 0;
                if (rule === 'always') {
                    amount = total * (depositPercent / 100);
                } else if (rule === 'new_customers_only') {
                    const isNewCustomer = !customerData || !customerData.stats || !customerData.stats.totalSpent || customerData.stats.totalSpent === 0;
                    if (isNewCustomer) {
                        amount = total * (depositPercent / 100);
                    }
                } else if (rule === 'over_threshold') {
                    if (total > threshold) {
                        amount = total * (depositPercent / 100);
                    }
                } else if (rule === 'materials_only' || rule === '100_percent_materials') {
                    amount = lineItems.filter(i => i.type === 'material').reduce((sum, item) => sum + item.total, 0);
                } else if (rule === 'paid_estimate') {
                    amount = paidEstimateAmount;
                }

                if (amount > highestAmount) {
                    highestAmount = amount;
                    highestRule = rule;
                }
            });

            if (highestAmount > 0) {
                setRequiresDeposit(true);
                setDepositAmount(highestAmount);
                setEvaluatedRule(highestRule);
            } else {
                setRequiresDeposit(false);
                setDepositAmount(0);
                setEvaluatedRule('none');
            }
        } else {
            // Manual specific rule override
            const depositPercent = upfrontPolicy?.depositPercent ?? 50;
            const threshold = upfrontPolicy?.overThreshold ?? 500;
            const paidEstimateAmount = upfrontPolicy?.paidEstimateAmount ?? 75;

            if (depositCondition === '50_percent' || depositCondition === 'always') {
                setRequiresDeposit(true);
                setDepositAmount(total * (depositPercent / 100));
            } else if (depositCondition === '100_percent_materials' || depositCondition === 'materials_only') {
                const materialsTotal = lineItems.filter(i => i.type === 'material').reduce((sum, item) => sum + item.total, 0);
                setRequiresDeposit(true);
                setDepositAmount(materialsTotal);
            } else if (depositCondition === '50_percent_if_over_500' || depositCondition === 'over_threshold') {
                if (total > threshold) {
                    setRequiresDeposit(true);
                    setDepositAmount(total * (depositPercent / 100));
                } else {
                    setRequiresDeposit(false);
                    setDepositAmount(0);
                }
            } else if (depositCondition === 'new_customers_only') {
                const isNewCustomer = !customerData || !customerData.stats || !customerData.stats.totalSpent || customerData.stats.totalSpent === 0;
                if (isNewCustomer) {
                    setRequiresDeposit(true);
                    setDepositAmount(total * (depositPercent / 100));
                } else {
                    setRequiresDeposit(false);
                    setDepositAmount(0);
                }
            } else if (depositCondition === 'paid_estimate') {
                setRequiresDeposit(true);
                setDepositAmount(paidEstimateAmount);
            }
            setEvaluatedRule('none');
        }
    }, [depositCondition, total, lineItems, upfrontPolicy, customerData]);

    const handleSaveQuote = async (sendToCustomer: boolean = false) => {
        if (!user?.uid || !job) return;

        setSaving(true);
        try {
            const orgId = (user as any).org_id;
            const now = new Date();
            const validUntil = new Date(now.getTime() + validDays * 24 * 60 * 60 * 1000);

            const quoteData: Omit<Quote, 'id'> = {
                org_id: orgId,
                job_id: job.id,
                customer_id: job.customer_id || '',
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
                    requiresDeposit: requiresDeposit,
                    depositAmount: requiresDeposit ? depositAmount : 0,
                    signatureRequired: signatureRequired
                },
                status: sendToCustomer ? 'sent' : 'draft',
                depositCondition: depositCondition === 'policy' ? evaluatedRule : depositCondition,
                createdAt: existingQuote?.createdAt || serverTimestamp(),
                updatedAt: serverTimestamp(),
                createdBy: existingQuote?.createdBy || user.uid,
                sentAt: sendToCustomer ? serverTimestamp() : undefined,
                sentVia: sendToCustomer ? 'link' : undefined,
                customerNotes: existingQuote?.customerNotes || [],
                customer: existingQuote?.customer
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

                    await updateDoc(quoteRef, updateData);
                }
            } else {
                const docRef = await addDoc(collection(db, 'quotes'), quoteData);
                docId = docRef.id;
            }

            if (sendToCustomer && !existingQuote?.status) {
                // Use quote service to send NEW quote
                const { sendQuoteToCustomer } = await import('../lib/quoteService');
                const quoteLink = await sendQuoteToCustomer({
                    quoteId: docId,
                    customerEmail: job.customer.email,
                    customerName: job.customer.name,
                    techName: (user as any).name || 'Technician',
                    sentBy: user.uid
                });

                alert(`Quote emailed to ${job.customer.email}!\n\nDirect link:\n${quoteLink}`);
            } else if (sendToCustomer && existingQuote?.status === 'tech_review') {
                 alert(`Quote revised and emailed back to customer!`);
            } else if (sendToCustomer && existingQuote?.status !== 'tech_review') {
                 // re-sending existing quote that wasn't in tech_review
                 const { sendQuoteToCustomer } = await import('../lib/quoteService');
                 await sendQuoteToCustomer({
                     quoteId: docId,
                     customerEmail: job.customer.email,
                     customerName: job.customer.name,
                     techName: (user as any).name || 'Technician',
                     sentBy: user.uid
                 });
                 alert(`Quote emailed to ${job.customer.email}!`);
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

    if (!job) {
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
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
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
                                For Job #{job.id.slice(0, 8)} - {job.customer.name}
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
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
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
                            {existingQuote ? 'Edit Quote' : 'Create Quote'}
                        </h1>
                        <p className="text-gray-500 mb-1">For Job #{job.id.slice(0, 8)} - {job.customer.name}</p>
                        {existingQuote?.previousVersions && existingQuote.previousVersions.length > 0 && (
                            <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                Version {existingQuote.version} • {existingQuote.previousVersions.length} previous version{existingQuote.previousVersions.length !== 1 ? 's' : ''}
                            </div>
                        )}
                    </div>
                </div>

                {/* Customer Proposed Changes */}
                {existingQuote?.customerNotes && existingQuote.customerNotes.length > 0 && (
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

                {/* Job Info Summary */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                    <div className="flex items-start gap-3">
                        <FileText className="w-5 h-5 text-blue-600 mt-0.5" />
                        <div>
                            <h3 className="font-medium text-blue-900">Job Request</h3>
                            <p className="text-blue-800 text-sm mt-1">{(job.request?.description || 'No description')}</p>
                        </div>
                    </div>
                </div>

                {/* Scope of Work */}
                <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Scope of Work</h2>
                    <textarea
                        value={scopeOfWork}
                        onChange={(e) => setScopeOfWork(e.target.value)}
                        rows={4}
                        className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Describe the work to be performed..."
                    />
                </div>

                {/* Line Items */}
                <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-gray-900">Line Items</h2>
                        <div className="flex gap-2">
                            {LINE_ITEM_TYPES.map(type => (
                                <button
                                    key={type.value}
                                    onClick={() => addLineItem(type.value as QuoteLineItem['type'])}
                                    className="inline-flex items-center px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                                >
                                    <type.icon className="w-4 h-4 mr-1.5" />
                                    {type.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Materials Quick Add */}
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
                            <p className="text-gray-500">No line items yet</p>
                            <p className="text-sm text-gray-400">Click the buttons above to add items</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {lineItems.map((item, index) => {
                                const typeInfo = LINE_ITEM_TYPES.find(t => t.value === item.type);
                                return (
                                    <div key={item.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                                        <div className="pt-2">
                                            {typeInfo && <typeInfo.icon className="w-4 h-4 text-gray-400" />}
                                        </div>
                                        <div className="flex-1 grid grid-cols-12 gap-3">
                                            <div className="col-span-5">
                                                <input
                                                    type="text"
                                                    value={item.description}
                                                    onChange={(e) => updateLineItem(item.id, { description: e.target.value })}
                                                    placeholder="Description"
                                                    className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <input
                                                    type="number"
                                                    value={item.quantity}
                                                    onChange={(e) => updateLineItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                                                    min="0"
                                                    step="0.5"
                                                    className="w-full border border-gray-300 rounded-lg p-2 text-sm text-center focus:ring-2 focus:ring-blue-500"
                                                />
                                                <input
                                                    type="text"
                                                    value={item.unit}
                                                    onChange={(e) => updateLineItem(item.id, { unit: e.target.value })}
                                                    className="w-full border border-gray-300 rounded-lg p-1 text-xs text-center mt-1 focus:ring-2 focus:ring-blue-500"
                                                    placeholder="unit"
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <div className="relative">
                                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                                                    <input
                                                        type="number"
                                                        value={item.unitPrice}
                                                        onChange={(e) => {
                                                            const newPrice = parseFloat(e.target.value) || 0;
                                                            // If price changes manually, reset baseCost assumption or recalculate
                                                            const markup = item.markupPercentage || 0;
                                                            const newBase = markup > 0 ? newPrice / (1 + markup/100) : newPrice;
                                                            updateLineItem(item.id, { unitPrice: newPrice, baseCost: newBase });
                                                        }}
                                                        min="0"
                                                        step="0.01"
                                                        className="w-full border border-gray-300 rounded-lg p-2 pl-5 text-sm text-right focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                                {item.type === 'material' && isDispatchOrSolo && (
                                                    <div className="mt-1 flex items-center justify-end gap-1 text-xs">
                                                        <span className="text-gray-500">Markup:</span>
                                                        <input 
                                                            type="number" 
                                                            value={item.markupPercentage || 0}
                                                            onChange={(e) => {
                                                                const markup = parseFloat(e.target.value) || 0;
                                                                const baseCost = item.baseCost || (item.unitPrice / (1 + (item.markupPercentage || 0)/100));
                                                                const newPrice = baseCost * (1 + markup / 100);
                                                                updateLineItem(item.id, { 
                                                                    markupPercentage: markup,
                                                                    baseCost: baseCost,
                                                                    unitPrice: newPrice 
                                                                });
                                                            }}
                                                            className="w-16 border border-amber-300 rounded p-0.5 text-right bg-amber-50 text-amber-900 focus:ring-1 focus:ring-amber-500"
                                                        />
                                                        <span className="text-gray-500">%</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="col-span-2 flex items-center justify-end">
                                                <span className={`font-medium ${item.type === 'discount' ? 'text-green-600' : 'text-gray-900'}`}>
                                                    {item.type === 'discount' ? '-' : ''}${Math.abs(item.total).toFixed(2)}
                                                </span>
                                            </div>
                                            <div className="col-span-1 flex items-center">
                                                <button
                                                    onClick={() => removeLineItem(item.id)}
                                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
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

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 justify-end">
                    <button
                        onClick={() => navigate(-1)}
                        className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => handleSaveQuote(false)}
                        disabled={saving || lineItems.length === 0}
                        className="inline-flex items-center px-6 py-2.5 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 font-medium disabled:opacity-50"
                    >
                        <Save className="w-4 h-4 mr-2" />
                        Save Draft
                    </button>
                    <button
                        onClick={() => handleSaveQuote(true)}
                        disabled={saving || lineItems.length === 0}
                        className="inline-flex items-center px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
                    >
                        <Send className="w-4 h-4 mr-2" />
                        {existingQuote?.status === 'tech_review' ? 'Update & Resend to Customer' : 'Save & Send to Customer'}
                    </button>
                </div>
            </div>
        </div>
    );
};
