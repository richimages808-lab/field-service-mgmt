import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import { Job, Quote, QuoteLineItem, MaterialItem, DEFAULT_OVERRUN_PROTECTION } from '../types';
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
    CheckCircle
} from 'lucide-react';

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

export const CreateQuote: React.FC = () => {
    const { jobId } = useParams<{ jobId: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [job, setJob] = useState<Job | null>(null);
    const [materials, setMaterials] = useState<MaterialItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Quote state
    const [scopeOfWork, setScopeOfWork] = useState('');
    const [lineItems, setLineItems] = useState<QuoteLineItem[]>([]);
    const [taxRate, setTaxRate] = useState(4.712); // Hawaii GET rate default
    const [discount, setDiscount] = useState(0);
    const [discountReason, setDiscountReason] = useState('');
    const [estimatedDuration, setEstimatedDuration] = useState(60);
    const [validDays, setValidDays] = useState(30);
    const [overrunSettings, setOverrunSettings] = useState(DEFAULT_OVERRUN_PROTECTION);
    const [jurisdictionState, setJurisdictionState] = useState('HI');
    const [depositRequired, setDepositRequired] = useState(false);
    const [depositAmount, setDepositAmount] = useState(0);

    // Load default tax rate from user org settings
    useEffect(() => {
        if (user && (user as any).organization?.settings?.defaultTaxRate) {
            setTaxRate((user as any).organization.settings.defaultTaxRate);
        }
    }, [user]);

    useEffect(() => {
        const loadData = async () => {
            if (!jobId || !user?.uid) {
                setLoading(false);
                return;
            }

            try {
                // Load job
                const jobDoc = await getDoc(doc(db, 'jobs', jobId));
                if (jobDoc.exists()) {
                    const jobData = { id: jobDoc.id, ...jobDoc.data() } as Job;
                    setJob(jobData);
                    setScopeOfWork(jobData.request?.description || '');
                    if (jobData.estimated_duration) {
                        setEstimatedDuration(jobData.estimated_duration);
                    }
                }

                // Load materials for dropdown
                const orgId = (user as any).org_id;
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

            } catch (error) {
                console.error('Error loading data:', error);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [jobId, user?.uid]);

    const addLineItem = (type: QuoteLineItem['type']) => {
        const newItem: QuoteLineItem = {
            id: crypto.randomUUID(),
            type,
            description: '',
            quantity: 1,
            unit: type === 'labor' ? 'hour' : 'each',
            unitPrice: 0,
            total: 0,
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
    const taxAmount = (taxableAmount * taxRate) / 100;
    const total = subtotal + taxAmount - discount;

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
                quoteNumber: generateQuoteNumber(),
                version: 1,
                scopeOfWork,
                lineItems,
                subtotal,
                taxRate,
                taxAmount,
                discount,
                discountReason: discount > 0 ? discountReason : undefined,
                total,
                overrunProtection: overrunSettings,
                estimatedDuration,
                validUntil: validUntil,
                agreement: {
                    termsVersion: '1.0',
                    jurisdictionState,
                    requiresDeposit: depositRequired,
                    depositAmount: depositRequired ? depositAmount : 0,
                    signatureRequired: true
                },
                status: sendToCustomer ? 'sent' : 'draft',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                createdBy: user.uid,
                sentAt: sendToCustomer ? serverTimestamp() : undefined,
                sentVia: sendToCustomer ? 'link' : undefined
            };

            const docRef = await addDoc(collection(db, 'quotes'), quoteData);

            if (sendToCustomer) {
                // Use quote service to send quote (handles job status update and communication logging)
                const { sendQuoteToCustomer } = await import('../lib/quoteService');
                const quoteLink = await sendQuoteToCustomer({
                    quoteId: docRef.id,
                    customerEmail: job.customer.email,
                    customerName: job.customer.name,
                    techName: (user as any).name || 'Technician',
                    sentBy: user.uid
                });

                alert(`Quote created! Share this link with customer:\n\n${quoteLink}`);
            }

            navigate(`/jobs/${job.id}`);

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
                        <h1 className="text-2xl font-bold text-gray-900">Create Quote</h1>
                        <p className="text-gray-500">
                            For: {job.customer.name} • {job.customer.address}
                        </p>
                    </div>
                </div>

                {/* Job Reference Card */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                    <div className="flex items-start gap-3">
                        <FileText className="w-5 h-5 text-blue-600 mt-0.5" />
                        <div>
                            <h3 className="font-medium text-blue-900">Job Request</h3>
                            <p className="text-blue-800 text-sm mt-1">{job.request.description}</p>
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
                                                        onChange={(e) => updateLineItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                                                        min="0"
                                                        step="0.01"
                                                        className="w-full border border-gray-300 rounded-lg p-2 pl-5 text-sm text-right focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
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
                            {discount > 0 && (
                                <div className="flex justify-between text-sm text-green-600">
                                    <span>Discount</span>
                                    <span>-${discount.toFixed(2)}</span>
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
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment Terms</h2>
                    <div className="flex flex-col gap-4">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={depositRequired}
                                onChange={(e) => setDepositRequired(e.target.checked)}
                                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                            />
                            <span className="text-gray-700">Require upfront deposit</span>
                        </label>

                        {depositRequired && (
                            <div className="ml-7">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Deposit Amount
                                </label>
                                <div className="relative max-w-xs">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                                    <input
                                        type="number"
                                        value={depositAmount}
                                        onChange={(e) => setDepositAmount(parseFloat(e.target.value) || 0)}
                                        min="0"
                                        step="0.01"
                                        className="w-full border border-gray-300 rounded-lg p-2.5 pl-7 focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <p className="text-sm text-gray-500 mt-1">
                                    Remaining balance due upon completion: <span className="font-medium text-gray-900">${(total - depositAmount).toFixed(2)}</span>
                                </p>
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
                                <option value="HI">Hawaii</option>
                                <option value="CA">California</option>
                                <option value="TX">Texas</option>
                                <option value="FL">Florida</option>
                                <option value="NY">New York</option>
                            </select>
                        </div>
                    </div>
                </div>

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
                        Save & Send to Customer
                    </button>
                </div>
            </div>
        </div>
    );
};
