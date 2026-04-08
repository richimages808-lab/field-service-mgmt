import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import { useAuth } from '../../auth/AuthProvider';
import { Vendor } from '../../types/Vendor';
import { X, Plus, Edit2, Trash2, Building2, Mail, Phone, Link as LinkIcon, AlertCircle, CheckCircle, Percent, Zap, Loader2, CreditCard, Box, FileText } from 'lucide-react';

interface Props {
    onClose?: () => void;
    isEmbedded?: boolean;
}

export const ManageVendorsModal: React.FC<Props> = ({ onClose, isEmbedded }) => {
    const { user } = useAuth();
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Form state
    const [name, setName] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [website, setWebsite] = useState('');
    const [discountCodes, setDiscountCodes] = useState('');
    const [orderInstructions, setOrderInstructions] = useState('');
    
    // New Advanced Config
    const [shippingAddress, setShippingAddress] = useState('');
    const [billingAddress, setBillingAddress] = useState('');
    const [customerApiId, setCustomerApiId] = useState('');
    const [vaultedPaymentId, setVaultedPaymentId] = useState('');
    const [integrationType, setIntegrationType] = useState<'email_pdf' | 'dynamic_api'>('email_pdf');
    const [apiEndpointUrl, setApiEndpointUrl] = useState('');
    const [apiMethod, setApiMethod] = useState<'POST' | 'PUT'>('POST');
    const [apiHeaders, setApiHeaders] = useState('');
    const [apiBodyTemplate, setApiBodyTemplate] = useState('');

    useEffect(() => {
        if (!user?.org_id) return;

        const q = query(
            collection(db, 'vendors'),
            where('organizationId', '==', user.org_id)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const vendorData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Vendor[];
            
            // Sort alphabetically by name
            vendorData.sort((a, b) => a.name.localeCompare(b.name));
            setVendors(vendorData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user?.org_id]);

    const resetForm = () => {
        setName('');
        setAccountNumber('');
        setEmail('');
        setPhone('');
        setWebsite('');
        setDiscountCodes('');
        setOrderInstructions('');
        setShippingAddress('');
        setBillingAddress('');
        setCustomerApiId('');
        setVaultedPaymentId('');
        setIntegrationType('email_pdf');
        setApiEndpointUrl('');
        setApiMethod('POST');
        setApiHeaders('');
        setApiBodyTemplate('');
        setEditingVendor(null);
        setIsAdding(false);
    };

    const handleEdit = (vendor: Vendor) => {
        setName(vendor.name);
        setAccountNumber(vendor.accountNumber || '');
        setEmail(vendor.email || '');
        setPhone(vendor.phone || '');
        setWebsite(vendor.website || '');
        setDiscountCodes(vendor.discountCodes || '');
        setOrderInstructions(vendor.orderInstructions || '');
        setShippingAddress(vendor.shippingAddress || '');
        setBillingAddress(vendor.billingAddress || '');
        setCustomerApiId(vendor.customerApiId || '');
        setVaultedPaymentId(vendor.vaultedPaymentId || '');
        setIntegrationType(vendor.integrationType || 'email_pdf');
        if (vendor.apiConfig) {
            setApiEndpointUrl(vendor.apiConfig.endpointUrl || '');
            setApiMethod(vendor.apiConfig.method || 'POST');
            setApiHeaders(vendor.apiConfig.headersTemplate ? JSON.stringify(vendor.apiConfig.headersTemplate, null, 2) : '');
            setApiBodyTemplate(vendor.apiConfig.bodyTemplate || '');
        } else {
            setApiEndpointUrl('');
            setApiMethod('POST');
            setApiHeaders('');
            setApiBodyTemplate('');
        }
        setEditingVendor(vendor);
        setIsAdding(true);
    };

    const handleAIAnalysis = async () => {
        if (!name) {
            alert('Please enter a Company Name first.');
            return;
        }

        setIsAnalyzing(true);
        try {
            const analyzeVendorCapabilities = httpsCallable(functions, 'analyzeVendorCapabilities');
            const result = await analyzeVendorCapabilities({ vendorName: name, website });
            const data = (result.data as any).capabilities;

            if (data.isApiCapable) {
                setIntegrationType('dynamic_api');
                setApiEndpointUrl(data.apiConfig?.endpointUrl || '');
                setApiMethod(data.apiConfig?.method || 'POST');
                typeof data.apiConfig?.headersTemplate === 'object' 
                    ? setApiHeaders(JSON.stringify(data.apiConfig.headersTemplate, null, 2))
                    : setApiHeaders('');
                setApiBodyTemplate(data.apiConfig?.bodyTemplate || '');
                alert(`AI successfully generated an API integration blueprint for ${name}! Please configure your billing details below.`);
            } else {
                setIntegrationType('email_pdf');
                setApiEndpointUrl('');
                setApiMethod('POST');
                setApiHeaders('');
                setApiBodyTemplate('');
                alert(`AI could not locate an accessible API for ${name}. Order dispatches will default to Email/PDF.`);
            }
        } catch (error: any) {
            console.error('AI Analysis Error:', error);
            alert(`AI Analysis failed: ${error.message}`);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.org_id || !name.trim()) return;

        let parsedHeaders = {};
        if (integrationType === 'dynamic_api' && apiHeaders.trim()) {
            try {
                parsedHeaders = JSON.parse(apiHeaders);
            } catch (err) {
                alert('Invalid JSON in API Headers template');
                return;
            }
        }

        try {
            const vendorData = {
                organizationId: user.org_id,
                name: name.trim(),
                accountNumber: accountNumber.trim(),
                email: email.trim(),
                phone: phone.trim(),
                website: website.trim(),
                discountCodes: discountCodes.trim(),
                orderInstructions: orderInstructions.trim(),
                shippingAddress: shippingAddress.trim(),
                billingAddress: billingAddress.trim(),
                customerApiId: customerApiId.trim(),
                vaultedPaymentId: vaultedPaymentId.trim(),
                integrationType,
                apiConfig: integrationType === 'dynamic_api' ? {
                    endpointUrl: apiEndpointUrl.trim(),
                    method: apiMethod,
                    headersTemplate: parsedHeaders,
                    bodyTemplate: apiBodyTemplate.trim()
                } : null,
                active: true,
                updatedAt: serverTimestamp()
            };

            if (editingVendor?.id) {
                await updateDoc(doc(db, 'vendors', editingVendor.id), vendorData);
            } else {
                await addDoc(collection(db, 'vendors'), {
                    ...vendorData,
                    createdAt: serverTimestamp()
                });
            }

            resetForm();
        } catch (error) {
            console.error('Error saving vendor:', error);
            alert('Failed to save vendor');
        }
    };

    const handleDelete = async (vendorId: string) => {
        if (!window.confirm('Are you sure you want to remove this vendor? This will not affect past orders.')) {
            return;
        }

        try {
            await deleteDoc(doc(db, 'vendors', vendorId));
        } catch (error) {
            console.error('Error deleting vendor:', error);
            alert('Failed to delete vendor');
        }
    };

    const content = (
        <div className={`bg-white flex flex-col ${isEmbedded ? 'h-full' : 'rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh]'}`}>
            <div className="flex items-center justify-between p-6 border-b border-gray-100 flex-none">
                <div className="flex items-center gap-2">
                    <Building2 className="w-6 h-6 text-blue-600" />
                    <h2 className="text-xl font-semibold text-gray-900">Manage Material Vendors</h2>
                </div>
                {!isEmbedded && onClose && (
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                )}
            </div>

                <div className="p-6 overflow-y-auto flex-1 bg-gray-50/50">
                    {/* Add/Edit Form */}
                    {isAdding ? (
                        <div className="bg-white border text-left border-blue-100 shadow-sm rounded-xl p-6 mb-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-medium text-gray-900">
                                    {editingVendor ? 'Edit Vendor Details' : 'Add New Vendor'}
                                </h3>
                                <button
                                    type="button"
                                    onClick={handleAIAnalysis}
                                    disabled={!name || isAnalyzing}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50 text-sm font-medium"
                                >
                                    {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                    {isAnalyzing ? 'Analyzing API...' : 'Check API Integration'}
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-6">
                                {/* Basic Info Section */}
                                <div className="space-y-4">
                                    <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Basic Details</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
                                            <input
                                                type="text"
                                                required
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                placeholder="e.g. Ferguson, Grainger..."
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Our Account Number</label>
                                            <input
                                                type="text"
                                                value={accountNumber}
                                                onChange={(e) => setAccountNumber(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                placeholder="e.g. 12345-ABC"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Ordering Email Address *</label>
                                            <input
                                                type="email"
                                                required
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                placeholder="orders@vendor.com"
                                            />
                                            {integrationType === 'email_pdf' && (
                                                <p className="text-xs text-gray-500 mt-1">Orders will be emailed here as a PDF.</p>
                                            )}
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Website URL</label>
                                            <input
                                                type="url"
                                                value={website}
                                                onChange={(e) => setWebsite(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                placeholder="https://vendor.com"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Advanced Config Section */}
                                <div className="space-y-4 pt-4 border-t border-gray-100">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Automated Ordering Configuration</h4>
                                        {integrationType === 'dynamic_api' ? (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                <CheckCircle className="w-3.5 h-3.5" />
                                                API Active
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                                <FileText className="w-3.5 h-3.5 text-gray-500" />
                                                Email/PDF Fallback
                                            </span>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Address</label>
                                            <input
                                                type="text"
                                                value={shippingAddress}
                                                onChange={(e) => setShippingAddress(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                placeholder="Where should parts be delivered?"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Billing Address</label>
                                            <input
                                                type="text"
                                                value={billingAddress}
                                                onChange={(e) => setBillingAddress(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                placeholder="Corporate Billing Address"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Customer / API ID</label>
                                            <input
                                                type="text"
                                                value={customerApiId}
                                                onChange={(e) => setCustomerApiId(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                placeholder="e.g. Developer Token or Account ID"
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                                                <CreditCard className="w-4 h-4 text-gray-400" /> 
                                                Secure Payment Token or Reference
                                            </label>
                                            <input
                                                type="text"
                                                value={vaultedPaymentId}
                                                onChange={(e) => setVaultedPaymentId(e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                                placeholder="e.g. pm_1NXY... or Card Reference string (Do NOT enter raw credit card numbers here)"
                                            />
                                            <p className="text-xs text-amber-600 mt-1">PCI Warning: Do not input raw CC data. Only use vaulted tokens (like from Stripe) or internal gateway references.</p>
                                        </div>
                                    </div>

                                    {/* Integration Type Toggle */}
                                    <div className="mt-6">
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Order Dispatch Method</label>
                                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-1 flex">
                                            <button
                                                type="button"
                                                onClick={() => setIntegrationType('email_pdf')}
                                                className={`flex-1 flex justify-center items-center gap-2 py-2 text-sm font-medium rounded-md transition-colors ${
                                                    integrationType === 'email_pdf'
                                                        ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                                                        : 'text-gray-500 hover:text-gray-700'
                                                }`}
                                            >
                                                <FileText className="w-4 h-4" />
                                                Email/PDF
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setIntegrationType('dynamic_api')}
                                                className={`flex-1 flex justify-center items-center gap-2 py-2 text-sm font-medium rounded-md transition-colors ${
                                                    integrationType === 'dynamic_api'
                                                        ? 'bg-white text-blue-700 shadow-sm border border-blue-200'
                                                        : 'text-gray-500 hover:text-gray-700'
                                                }`}
                                            >
                                                <Zap className="w-4 h-4" />
                                                Dynamic API
                                            </button>
                                        </div>
                                    </div>

                                    {/* API Configuration */}
                                    {integrationType === 'dynamic_api' && (
                                        <div className="mt-4 p-4 border border-blue-100 bg-blue-50/50 rounded-lg space-y-4">
                                            <h5 className="text-sm font-medium text-blue-900 flex items-center gap-2">
                                                <Zap className="w-4 h-4" />
                                                API Webhook Configuration
                                            </h5>
                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                                <div className="md:col-span-1">
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">Method</label>
                                                    <select
                                                        value={apiMethod}
                                                        onChange={(e) => setApiMethod(e.target.value as 'POST' | 'PUT')}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                                    >
                                                        <option value="POST">POST</option>
                                                        <option value="PUT">PUT</option>
                                                    </select>
                                                </div>
                                                <div className="md:col-span-3">
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">Endpoint URL</label>
                                                    <input
                                                        type="url"
                                                        value={apiEndpointUrl}
                                                        onChange={(e) => setApiEndpointUrl(e.target.value)}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                                        placeholder="https://api.vendor.com/v1/orders"
                                                    />
                                                </div>
                                                <div className="md:col-span-4">
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">Headers (JSON)</label>
                                                    <textarea
                                                        value={apiHeaders}
                                                        onChange={(e) => setApiHeaders(e.target.value)}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                                        rows={3}
                                                        placeholder={'{\n  "Authorization": "Bearer {{developerToken}}",\n  "Content-Type": "application/json"\n}'}
                                                    />
                                                </div>
                                                <div className="md:col-span-4">
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">Request Body Template</label>
                                                    <textarea
                                                        value={apiBodyTemplate}
                                                        onChange={(e) => setApiBodyTemplate(e.target.value)}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                                        rows={6}
                                                        placeholder="Use {{variables}} for injection: {{orderId}}, {{items}}, etc."
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                                    <button
                                        type="button"
                                        onClick={resetForm}
                                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors font-medium"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-100 transition-all font-medium"
                                    >
                                        {editingVendor ? 'Save Changes' : 'Add Vendor'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    ) : (
                        <div className="flex justify-between items-center mb-6">
                            <p className="text-gray-600">Manage your suppliers and their account info for automated purchasing.</p>
                            <button
                                onClick={() => setIsAdding(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg font-medium hover:bg-blue-100 transition-colors"
                            >
                                <Plus className="w-5 h-5" />
                                Add Vendor
                            </button>
                        </div>
                    )}

                    {/* Vendors List */}
                    {loading ? (
                        <div className="flex items-center justify-center h-32 text-gray-500">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                        </div>
                    ) : vendors.length === 0 && !isAdding ? (
                        <div className="text-center py-12 px-4 border-2 border-dashed border-gray-200 rounded-xl bg-white">
                            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <h3 className="text-lg font-medium text-gray-900 mb-1">No Vendors Added</h3>
                            <p className="text-gray-500 mb-4 max-w-sm mx-auto text-sm">
                                Setup your material suppliers here to enable one-click Purchase Order generation and API integrations.
                            </p>
                            <button
                                onClick={() => setIsAdding(true)}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
                            >
                                <Plus className="w-5 h-5" />
                                Add First Vendor
                            </button>
                        </div>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2">
                            {vendors.map(vendor => (
                                <div key={vendor.id} className="bg-white border border-gray-200 rounded-xl p-5 hover:border-blue-300 transition-colors group relative shadow-sm">
                                    <div className="absolute top-4 right-4 flex opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                            onClick={() => handleEdit(vendor)}
                                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                            title="Edit Vendor"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={() => vendor.id && handleDelete(vendor.id)}
                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                                            title="Remove Vendor"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                    
                                    <div className="flex items-start justify-between pr-16 mb-2">
                                        <h3 className="text-lg font-bold text-gray-900">{vendor.name}</h3>
                                        {vendor.integrationType === 'dynamic_api' && (
                                            <span className="p-1 bg-green-50 text-green-700 rounded-full" title="Automated API Connection Ready">
                                                <Zap className="w-4 h-4" />
                                            </span>
                                        )}
                                    </div>
                                    
                                    <div className="flex flex-col gap-2 mt-3 pl-1 border-l-2 border-transparent">
                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                            <Mail className="w-4 h-4 text-gray-400" />
                                            <span className="truncate">{vendor.email}</span>
                                        </div>
                                        {vendor.accountNumber && (
                                            <div className="flex items-center gap-2 text-sm text-gray-600">
                                                <AlertCircle className="w-4 h-4 text-gray-400" />
                                                <span>Acct: <span className="font-mono bg-gray-100 px-1 py-0.5 rounded text-gray-800">{vendor.accountNumber}</span></span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
        </div>
    );

    if (isEmbedded) {
        return content;
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex flex-col items-center justify-center p-4 z-50 overflow-hidden">
            {content}
        </div>
    );
};
