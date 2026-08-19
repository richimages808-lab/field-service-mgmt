import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import { useAuth } from '../../auth/AuthProvider';
import { Vendor, AddressInfo, ShippingLocation, VendorOrderField } from '../../types/Vendor';
import { TradeProgramsHub } from './TradeProgramsHub';
import { 
    X, Plus, Edit2, Trash2, Building2, Mail, Phone, Link as LinkIcon, 
    AlertCircle, CheckCircle, Percent, Zap, Loader2, CreditCard, 
    MapPin, Globe, Sparkles, User, FileText, Check, ChevronDown, ChevronUp, Eye, EyeOff, ShieldCheck, ListChecks, ArrowUpRight
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Props {
    onClose?: () => void;
    isEmbedded?: boolean;
    initialTab?: 'my_vendors' | 'trade_programs';
}

export const ManageVendorsModal: React.FC<Props> = ({ onClose, isEmbedded, initialTab = 'my_vendors' }) => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'my_vendors' | 'trade_programs'>(initialTab);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    const [isLookingUp, setIsLookingUp] = useState(false);
    const [isAnalyzingApi, setIsAnalyzingApi] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // Form state - Basic details & Contacts
    const [name, setName] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [taxId, setTaxId] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [supportEmail, setSupportEmail] = useState('');
    const [supportPhone, setSupportPhone] = useState('');
    const [website, setWebsite] = useState('');
    const [portalUrl, setPortalUrl] = useState('');
    const [contactPerson, setContactPerson] = useState('');
    const [contactPhone, setContactPhone] = useState('');
    const [contactEmail, setContactEmail] = useState('');
    const [paymentTerms, setPaymentTerms] = useState('Net 30');

    // Structured Billing Address
    const [billingStreet1, setBillingStreet1] = useState('');
    const [billingStreet2, setBillingStreet2] = useState('');
    const [billingCity, setBillingCity] = useState('');
    const [billingState, setBillingState] = useState('');
    const [billingZip, setBillingZip] = useState('');
    const [billingCountry, setBillingCountry] = useState('US');

    // Structured Shipping Address & Locations
    const [shippingLocName, setShippingLocName] = useState('Main Warehouse');
    const [shippingStreet1, setShippingStreet1] = useState('');
    const [shippingStreet2, setShippingStreet2] = useState('');
    const [shippingCity, setShippingCity] = useState('');
    const [shippingState, setShippingState] = useState('');
    const [shippingZip, setShippingZip] = useState('');
    const [shippingCountry, setShippingCountry] = useState('US');
    const [savedLocations, setSavedLocations] = useState<ShippingLocation[]>([]);
    
    // New Location sub-form modal/drawer inside modal
    const [isAddingLocation, setIsAddingLocation] = useState(false);
    const [newLocName, setNewLocName] = useState('');
    const [newLocStreet1, setNewLocStreet1] = useState('');
    const [newLocStreet2, setNewLocStreet2] = useState('');
    const [newLocCity, setNewLocCity] = useState('');
    const [newLocState, setNewLocState] = useState('');
    const [newLocZip, setNewLocZip] = useState('');
    const [newLocContact, setNewLocContact] = useState('');
    const [newLocPhone, setNewLocPhone] = useState('');
    const [newLocNotes, setNewLocNotes] = useState('');

    // Vendor Specific Required Order Fields
    const [requiredOrderFields, setRequiredOrderFields] = useState<VendorOrderField[]>([]);

    // Web Portal & Discounts
    const [discountCodes, setDiscountCodes] = useState('');
    const [tradeDiscountPercent, setTradeDiscountPercent] = useState<number | ''>('');
    const [orderInstructions, setOrderInstructions] = useState('');
    const [webUsername, setWebUsername] = useState('');
    const [webPassword, setWebPassword] = useState('');
    const [sourcingStrength, setSourcingStrength] = useState<'local_pickup' | 'commodity_lowest' | 'urgent_callout' | 'specialty_quality' | 'general'>('general');

    // Advanced & API Config
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
            const vendorData = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
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
        setTaxId('');
        setEmail('');
        setPhone('');
        setSupportEmail('');
        setSupportPhone('');
        setWebsite('');
        setPortalUrl('');
        setContactPerson('');
        setContactPhone('');
        setContactEmail('');
        setPaymentTerms('Net 30');
        setBillingStreet1('');
        setBillingStreet2('');
        setBillingCity('');
        setBillingState('');
        setBillingZip('');
        setBillingCountry('US');
        setShippingLocName('Main Warehouse');
        setShippingStreet1('');
        setShippingStreet2('');
        setShippingCity('');
        setShippingState('');
        setShippingZip('');
        setShippingCountry('US');
        setSavedLocations([]);
        setDiscountCodes('');
        setTradeDiscountPercent('');
        setOrderInstructions('');
        setWebUsername('');
        setWebPassword('');
        setCustomerApiId('');
        setVaultedPaymentId('');
        setIntegrationType('email_pdf');
        setApiEndpointUrl('');
        setApiMethod('POST');
        setApiHeaders('');
        setApiBodyTemplate('');
        setSourcingStrength('general');
        setRequiredOrderFields([]);
        setEditingVendor(null);
        setIsAdding(false);
        setIsAddingLocation(false);
    };

    const handleEdit = (vendor: Vendor) => {
        setName(vendor.name);
        setAccountNumber(vendor.accountNumber || '');
        setTaxId(vendor.taxId || '');
        setEmail(vendor.email || '');
        setPhone(vendor.phone || '');
        setSupportEmail(vendor.supportEmail || '');
        setSupportPhone(vendor.supportPhone || '');
        setWebsite(vendor.website || '');
        setPortalUrl(vendor.portalUrl || '');
        setContactPerson(vendor.contactPerson || '');
        setContactPhone(vendor.contactPhone || '');
        setContactEmail(vendor.contactEmail || '');
        setPaymentTerms(vendor.paymentTerms || 'Net 30');

        // Populate Structured Billing
        if (vendor.structuredBillingAddress) {
            setBillingStreet1(vendor.structuredBillingAddress.street1 || '');
            setBillingStreet2(vendor.structuredBillingAddress.street2 || '');
            setBillingCity(vendor.structuredBillingAddress.city || '');
            setBillingState(vendor.structuredBillingAddress.state || '');
            setBillingZip(vendor.structuredBillingAddress.zip || '');
            setBillingCountry(vendor.structuredBillingAddress.country || 'US');
        } else if (vendor.billingAddress) {
            setBillingStreet1(vendor.billingAddress);
            setBillingStreet2('');
            setBillingCity('');
            setBillingState('');
            setBillingZip('');
            setBillingCountry('US');
        } else {
            setBillingStreet1('');
            setBillingStreet2('');
            setBillingCity('');
            setBillingState('');
            setBillingZip('');
            setBillingCountry('US');
        }

        // Populate Structured Shipping
        if (vendor.structuredShippingAddress) {
            setShippingStreet1(vendor.structuredShippingAddress.street1 || '');
            setShippingStreet2(vendor.structuredShippingAddress.street2 || '');
            setShippingCity(vendor.structuredShippingAddress.city || '');
            setShippingState(vendor.structuredShippingAddress.state || '');
            setShippingZip(vendor.structuredShippingAddress.zip || '');
            setShippingCountry(vendor.structuredShippingAddress.country || 'US');
        } else if (vendor.shippingAddress) {
            setShippingStreet1(vendor.shippingAddress);
            setShippingStreet2('');
            setShippingCity('');
            setShippingState('');
            setShippingZip('');
            setShippingCountry('US');
        } else {
            setShippingStreet1('');
            setShippingStreet2('');
            setShippingCity('');
            setShippingState('');
            setShippingZip('');
            setShippingCountry('US');
        }

        setSavedLocations(vendor.savedShippingLocations || []);
        setRequiredOrderFields(vendor.requiredOrderFields || []);
        setDiscountCodes(vendor.discountCodes || '');
        setTradeDiscountPercent(vendor.tradeDiscountPercent !== undefined ? vendor.tradeDiscountPercent : '');
        setOrderInstructions(vendor.orderInstructions || '');
        setWebUsername(vendor.webUsername || '');
        setWebPassword(vendor.webPassword || '');
        setCustomerApiId(vendor.customerApiId || '');
        setVaultedPaymentId(vendor.vaultedPaymentId || '');
        setIntegrationType(vendor.integrationType || 'email_pdf');
        setSourcingStrength(vendor.sourcingStrength || 'general');

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

    const handleAILookup = async () => {
        if (!name.trim()) {
            toast.error('Please enter a Company Name first to look up.');
            return;
        }

        setIsLookingUp(true);
        const toastId = toast.loading(`Looking up ${name} via AI & Google Search...`);

        try {
            const lookupFn = httpsCallable(functions, 'lookupVendorDetails');
            const result = await lookupFn({ vendorName: name.trim(), website: website.trim() });
            const data = (result.data as any)?.vendor;

            if (data) {
                if (data.name && !editingVendor) setName(data.name);
                if (data.website && !website) setWebsite(data.website);
                if (data.portalUrl) setPortalUrl(data.portalUrl);
                if (data.email && !email) setEmail(data.email);
                if (data.phone && !phone) setPhone(data.phone);
                if (data.supportEmail) setSupportEmail(data.supportEmail);
                if (data.supportPhone) setSupportPhone(data.supportPhone);
                if (data.contactPerson) setContactPerson(data.contactPerson);
                if (data.paymentTerms) setPaymentTerms(data.paymentTerms);
                if (data.discountCodes) setDiscountCodes(data.discountCodes);
                if (data.tradeDiscountPercent) setTradeDiscountPercent(data.tradeDiscountPercent);
                if (data.orderInstructions) setOrderInstructions(data.orderInstructions);
                if (data.sourcingStrength) setSourcingStrength(data.sourcingStrength);

                // Billing Address Auto-Fill
                if (data.billingAddress) {
                    if (data.billingAddress.street1) setBillingStreet1(data.billingAddress.street1);
                    if (data.billingAddress.street2) setBillingStreet2(data.billingAddress.street2);
                    if (data.billingAddress.city) setBillingCity(data.billingAddress.city);
                    if (data.billingAddress.state) setBillingState(data.billingAddress.state);
                    if (data.billingAddress.zip) setBillingZip(data.billingAddress.zip);
                    if (data.billingAddress.country) setBillingCountry(data.billingAddress.country);
                }

                // Required Order Fields Auto-Fill from AI
                if (data.requiredOrderFields && Array.isArray(data.requiredOrderFields)) {
                    setRequiredOrderFields(data.requiredOrderFields);
                }

                // API Blueprint Auto-Fill
                if (data.isApiCapable && data.apiConfig) {
                    setIntegrationType('dynamic_api');
                    setApiEndpointUrl(data.apiConfig.endpointUrl || '');
                    setApiMethod(data.apiConfig.method || 'POST');
                    if (data.apiConfig.headersTemplate) {
                        setApiHeaders(JSON.stringify(data.apiConfig.headersTemplate, null, 2));
                    }
                    if (data.apiConfig.bodyTemplate) {
                        setApiBodyTemplate(data.apiConfig.bodyTemplate);
                    }
                }

                toast.success(`Successfully populated details & required fields for ${data.name || name}!`, { id: toastId });
            } else {
                toast.error('Could not find detailed information for this vendor.', { id: toastId });
            }
        } catch (error: any) {
            console.error('Vendor AI Lookup Error:', error);
            toast.error(`AI Lookup failed: ${error.message}`, { id: toastId });
        } finally {
            setIsLookingUp(false);
        }
    };

    const handleCheckApiCapabilities = async () => {
        if (!name.trim()) {
            toast.error('Please enter a Company Name first.');
            return;
        }

        setIsAnalyzingApi(true);
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
                toast.success(`API blueprint generated for ${name}!`);
            } else {
                setIntegrationType('email_pdf');
                setApiEndpointUrl('');
                setApiMethod('POST');
                setApiHeaders('');
                setApiBodyTemplate('');
                toast.success(`Vendor will use Email/PDF order dispatch.`);
            }
        } catch (error: any) {
            console.error('AI API Analysis Error:', error);
            toast.error(`API Check failed: ${error.message}`);
        } finally {
            setIsAnalyzingApi(false);
        }
    };

    const handleAddCustomField = () => {
        const newField: VendorOrderField = {
            id: crypto.randomUUID(),
            key: `customField_${Date.now().toString().slice(-4)}`,
            label: 'New Required Field',
            description: 'Required by vendor when placing orders',
            type: 'text',
            required: true,
            defaultValue: ''
        };
        setRequiredOrderFields(prev => [...prev, newField]);
    };

    const handleRemoveField = (fieldId: string) => {
        setRequiredOrderFields(prev => prev.filter(f => f.id !== fieldId));
    };

    const handleToggleFieldRequired = (fieldId: string) => {
        setRequiredOrderFields(prev => prev.map(f => f.id === fieldId ? { ...f, required: !f.required } : f));
    };

    const handleUpdateField = (fieldId: string, updates: Partial<VendorOrderField>) => {
        setRequiredOrderFields(prev => prev.map(f => f.id === fieldId ? { ...f, ...updates } : f));
    };

    const handleAddCustomLocation = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newLocName.trim() || !newLocStreet1.trim()) {
            toast.error('Location name and street address are required.');
            return;
        }

        const newLoc: ShippingLocation = {
            id: crypto.randomUUID(),
            name: newLocName.trim(),
            address: {
                street1: newLocStreet1.trim(),
                street2: newLocStreet2.trim(),
                city: newLocCity.trim(),
                state: newLocState.trim(),
                zip: newLocZip.trim(),
                country: 'US',
                formattedAddress: `${newLocStreet1.trim()}${newLocStreet2.trim() ? `, ${newLocStreet2.trim()}` : ''}, ${newLocCity.trim()}, ${newLocState.trim()} ${newLocZip.trim()}`
            },
            contactName: newLocContact.trim() || undefined,
            contactPhone: newLocPhone.trim() || undefined,
            deliveryNotes: newLocNotes.trim() || undefined,
            isDefault: savedLocations.length === 0
        };

        setSavedLocations(prev => [...prev, newLoc]);
        setIsAddingLocation(false);
        setNewLocName('');
        setNewLocStreet1('');
        setNewLocStreet2('');
        setNewLocCity('');
        setNewLocState('');
        setNewLocZip('');
        setNewLocContact('');
        setNewLocPhone('');
        setNewLocNotes('');
        toast.success(`Added delivery location "${newLoc.name}"`);
    };

    const handleRemoveLocation = (locId: string) => {
        setSavedLocations(prev => prev.filter(l => l.id !== locId));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.org_id || !name.trim()) return;

        let parsedHeaders = {};
        if (integrationType === 'dynamic_api' && apiHeaders.trim()) {
            try {
                parsedHeaders = JSON.parse(apiHeaders);
            } catch (err) {
                toast.error('Invalid JSON in API Headers template');
                return;
            }
        }

        // Format single-line addresses for backward compatibility
        const formattedBilling = [billingStreet1, billingStreet2, billingCity, billingState, billingZip, billingCountry]
            .filter(Boolean)
            .join(', ');

        const formattedShipping = [shippingStreet1, shippingStreet2, shippingCity, shippingState, shippingZip, shippingCountry]
            .filter(Boolean)
            .join(', ');

        const structuredBilling: AddressInfo = {
            street1: billingStreet1.trim(),
            street2: billingStreet2.trim(),
            city: billingCity.trim(),
            state: billingState.trim(),
            zip: billingZip.trim(),
            country: billingCountry.trim() || 'US',
            formattedAddress: formattedBilling
        };

        const structuredShipping: AddressInfo = {
            street1: shippingStreet1.trim(),
            street2: shippingStreet2.trim(),
            city: shippingCity.trim(),
            state: shippingState.trim(),
            zip: shippingZip.trim(),
            country: shippingCountry.trim() || 'US',
            formattedAddress: formattedShipping
        };

        try {
            const vendorData = {
                organizationId: user.org_id,
                name: name.trim(),
                accountNumber: accountNumber.trim(),
                taxId: taxId.trim(),
                email: email.trim(),
                phone: phone.trim(),
                supportEmail: supportEmail.trim(),
                supportPhone: supportPhone.trim(),
                website: website.trim(),
                portalUrl: portalUrl.trim(),
                contactPerson: contactPerson.trim(),
                contactPhone: contactPhone.trim(),
                contactEmail: contactEmail.trim(),
                paymentTerms: paymentTerms.trim(),
                discountCodes: discountCodes.trim(),
                tradeDiscountPercent: tradeDiscountPercent !== '' ? Number(tradeDiscountPercent) : null,
                orderInstructions: orderInstructions.trim(),
                billingAddress: formattedBilling,
                shippingAddress: formattedShipping,
                structuredBillingAddress: structuredBilling,
                structuredShippingAddress: structuredShipping,
                savedShippingLocations: savedLocations,
                requiredOrderFields,
                webUsername: webUsername.trim(),
                webPassword: webPassword.trim(),
                customerApiId: customerApiId.trim(),
                vaultedPaymentId: vaultedPaymentId.trim(),
                integrationType,
                apiConfig: integrationType === 'dynamic_api' ? {
                    endpointUrl: apiEndpointUrl.trim(),
                    method: apiMethod,
                    headersTemplate: parsedHeaders,
                    bodyTemplate: apiBodyTemplate.trim()
                } : null,
                sourcingStrength,
                active: true,
                updatedAt: serverTimestamp()
            };

            if (editingVendor?.id) {
                await updateDoc(doc(db, 'vendors', editingVendor.id), vendorData);
                toast.success('Vendor details updated successfully!');
            } else {
                await addDoc(collection(db, 'vendors'), {
                    ...vendorData,
                    createdAt: serverTimestamp()
                });
                toast.success(`Vendor "${name}" created successfully!`);
            }

            resetForm();
        } catch (error) {
            console.error('Error saving vendor:', error);
            toast.error('Failed to save vendor');
        }
    };

    const handleDelete = async (vendorId: string, vendorName: string) => {
        if (!window.confirm(`Are you sure you want to remove "${vendorName}"? This will not affect past orders.`)) {
            return;
        }

        try {
            await deleteDoc(doc(db, 'vendors', vendorId));
            toast.success(`Removed ${vendorName}`);
        } catch (error) {
            console.error('Error deleting vendor:', error);
            toast.error('Failed to delete vendor');
        }
    };

    const content = (
        <div className={`bg-white flex flex-col ${isEmbedded ? 'h-full' : 'rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh]'}`}>
            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-6 border-b border-gray-100 flex-none bg-gradient-to-r from-blue-50/50 via-indigo-50/40 to-slate-50 gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-sm">
                        <Building2 className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Manage Material Vendors & Trade Programs</h2>
                        <p className="text-xs text-gray-500 mt-0.5">Configure suppliers, billing & shipping locations, contractor trade discounts, and automated ordering.</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Tab Switcher */}
                    <div className="bg-gray-100/90 p-1 rounded-xl flex border border-gray-200 text-xs font-bold">
                        <button
                            type="button"
                            onClick={() => { setActiveTab('my_vendors'); }}
                            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                                activeTab === 'my_vendors'
                                    ? 'bg-white text-blue-700 shadow-xs'
                                    : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            <Building2 className="w-3.5 h-3.5" />
                            My Suppliers ({vendors.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => { setActiveTab('trade_programs'); setIsAdding(false); }}
                            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                                activeTab === 'trade_programs'
                                    ? 'bg-white text-indigo-700 shadow-xs'
                                    : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            <Percent className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Trade Programs & Discounts</span>
                            <span className="bg-indigo-100 text-indigo-800 text-[10px] px-1.5 py-0.2 rounded-full font-extrabold">5-30%</span>
                        </button>
                    </div>

                    {!isEmbedded && onClose && (
                        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors ml-1">
                            <X className="w-5 h-5 text-gray-500" />
                        </button>
                    )}
                </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-gray-50/60">
                {activeTab === 'trade_programs' ? (
                    <TradeProgramsHub
                        existingVendors={vendors}
                        onVendorImported={() => {
                            setActiveTab('my_vendors');
                        }}
                        onClose={onClose}
                    />
                ) : (
                    <>
                        {/* Add/Edit Form */}
                        {isAdding ? (
                            <div className="bg-white border text-left border-indigo-100 shadow-md rounded-2xl p-6 sm:p-8 mb-6">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-gray-100 mb-6">
                                    <div>
                                        <h3 className="text-xl font-bold text-gray-900">
                                            {editingVendor ? `Edit ${editingVendor.name}` : 'Add New Supplier / Vendor'}
                                        </h3>
                                        <p className="text-xs text-gray-500 mt-0.5">Use AI Auto-Lookup to automatically find company contacts, pro portal links, and billing addresses.</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={handleAILookup}
                                            disabled={!name.trim() || isLookingUp}
                                            className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-xl hover:from-indigo-700 hover:to-blue-700 transition-all shadow-sm disabled:opacity-50 text-sm font-semibold"
                                        >
                                            {isLookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-300" />}
                                            {isLookingUp ? 'Searching Supplier Database...' : 'Auto-Lookup Vendor (AI)'}
                                        </button>
                                    </div>
                                </div>

                        <form onSubmit={handleSubmit} className="space-y-8">
                            {/* Section 1: Company Details & Trade Contacts */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                        <Building2 className="w-4 h-4 text-blue-600" />
                                        1. Company Identity & Contacts
                                    </h4>
                                    <span className="text-[11px] text-gray-400 font-medium">* Required for POs</span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Company / Supplier Name *</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                required
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                                placeholder="e.g. Ferguson, Grainger, Home Depot Pro, HD Supply"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Our Account Number</label>
                                        <input
                                            type="text"
                                            value={accountNumber}
                                            onChange={(e) => setAccountNumber(e.target.value)}
                                            className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                            placeholder="e.g. 10492-ABC"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Ordering Email Address *</label>
                                        <input
                                            type="email"
                                            required
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                            placeholder="orders@vendor.com"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Main Desk Phone</label>
                                        <input
                                            type="tel"
                                            value={phone}
                                            onChange={(e) => setPhone(e.target.value)}
                                            className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                            placeholder="(800) 555-0199"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Payment Terms</label>
                                        <select
                                            value={paymentTerms}
                                            onChange={(e) => setPaymentTerms(e.target.value)}
                                            className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm bg-white"
                                        >
                                            <option value="Net 30">Net 30</option>
                                            <option value="Net 60">Net 60</option>
                                            <option value="Net 15">Net 15</option>
                                            <option value="Due Upon Receipt">Due Upon Receipt</option>
                                            <option value="Credit Card on File">Credit Card on File</option>
                                            <option value="COD">Cash on Delivery (COD)</option>
                                            <option value="Prepaid">Prepaid</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Website URL</label>
                                        <input
                                            type="url"
                                            value={website}
                                            onChange={(e) => setWebsite(e.target.value)}
                                            className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                            placeholder="https://vendor.com"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Pro / B2B Portal URL</label>
                                        <input
                                            type="url"
                                            value={portalUrl}
                                            onChange={(e) => setPortalUrl(e.target.value)}
                                            className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                            placeholder="https://pro.vendor.com/login"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Tax ID / EIN</label>
                                        <input
                                            type="text"
                                            value={taxId}
                                            onChange={(e) => setTaxId(e.target.value)}
                                            className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                            placeholder="e.g. 12-3456789"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Sales Rep / Contact Person</label>
                                        <input
                                            type="text"
                                            value={contactPerson}
                                            onChange={(e) => setContactPerson(e.target.value)}
                                            className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                            placeholder="e.g. John Doe (Account Rep)"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Sales Rep Direct Phone</label>
                                        <input
                                            type="tel"
                                            value={contactPhone}
                                            onChange={(e) => setContactPhone(e.target.value)}
                                            className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                            placeholder="(555) 234-5678"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Sales Rep Email</label>
                                        <input
                                            type="email"
                                            value={contactEmail}
                                            onChange={(e) => setContactEmail(e.target.value)}
                                            className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                            placeholder="johndoe@vendor.com"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Section 2: Structured Corporate Billing Address */}
                            <div className="space-y-4 pt-6 border-t border-gray-100">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                        <CreditCard className="w-4 h-4 text-blue-600" />
                                        2. Corporate Billing Address (Accounts Payable)
                                    </h4>
                                    <span className="text-xs text-gray-400">Printed on official invoices & Purchase Orders</span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-6 gap-3 bg-slate-50/70 p-4 rounded-xl border border-slate-200/80">
                                    <div className="md:col-span-4">
                                        <label className="block text-xs font-semibold text-gray-700 mb-1">Street Address Line 1</label>
                                        <input
                                            type="text"
                                            value={billingStreet1}
                                            onChange={(e) => setBillingStreet1(e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                            placeholder="e.g. 10200 Enterprise Parkway"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-semibold text-gray-700 mb-1">Suite / Apt / Bldg</label>
                                        <input
                                            type="text"
                                            value={billingStreet2}
                                            onChange={(e) => setBillingStreet2(e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                            placeholder="Suite 400"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-semibold text-gray-700 mb-1">City</label>
                                        <input
                                            type="text"
                                            value={billingCity}
                                            onChange={(e) => setBillingCity(e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                            placeholder="Atlanta"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-semibold text-gray-700 mb-1">State / Province</label>
                                        <input
                                            type="text"
                                            value={billingState}
                                            onChange={(e) => setBillingState(e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                            placeholder="GA"
                                        />
                                    </div>
                                    <div className="md:col-span-1">
                                        <label className="block text-xs font-semibold text-gray-700 mb-1">Postal / Zip</label>
                                        <input
                                            type="text"
                                            value={billingZip}
                                            onChange={(e) => setBillingZip(e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 font-mono"
                                            placeholder="30339"
                                        />
                                    </div>
                                    <div className="md:col-span-1">
                                        <label className="block text-xs font-semibold text-gray-700 mb-1">Country</label>
                                        <input
                                            type="text"
                                            value={billingCountry}
                                            onChange={(e) => setBillingCountry(e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                            placeholder="US"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Section 3: Shipping & Delivery Locations */}
                            <div className="space-y-4 pt-6 border-t border-gray-100">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                            <MapPin className="w-4 h-4 text-blue-600" />
                                            3. Shipping & Receiving Destination Locations
                                        </h4>
                                        <p className="text-xs text-gray-500 mt-0.5">Where parts should be delivered by default. Verified before each order dispatch.</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsAddingLocation(true)}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
                                    >
                                        <Plus className="w-3.5 h-3.5" /> Add Warehouse / Location
                                    </button>
                                </div>

                                {/* Default Shipping Location Fields */}
                                <div className="bg-blue-50/40 p-4 rounded-xl border border-blue-100 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                                            <ShieldCheck className="w-4 h-4 text-blue-600" /> Default Receiving Facility
                                        </span>
                                        <span className="text-[11px] bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded-full">Primary</span>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                                        <div className="md:col-span-2">
                                            <label className="block text-xs font-semibold text-gray-700 mb-1">Facility Name / Yard</label>
                                            <input
                                                type="text"
                                                value={shippingLocName}
                                                onChange={(e) => setShippingLocName(e.target.value)}
                                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 font-medium"
                                                placeholder="Main Warehouse, Central Shop"
                                            />
                                        </div>
                                        <div className="md:col-span-4">
                                            <label className="block text-xs font-semibold text-gray-700 mb-1">Delivery Street Address</label>
                                            <input
                                                type="text"
                                                value={shippingStreet1}
                                                onChange={(e) => setShippingStreet1(e.target.value)}
                                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                                placeholder="e.g. 1617 Keeaumoku St."
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-xs font-semibold text-gray-700 mb-1">Unit / Dock #</label>
                                            <input
                                                type="text"
                                                value={shippingStreet2}
                                                onChange={(e) => setShippingStreet2(e.target.value)}
                                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                                placeholder="Dock 2, Suite 1103"
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-xs font-semibold text-gray-700 mb-1">City</label>
                                            <input
                                                type="text"
                                                value={shippingCity}
                                                onChange={(e) => setShippingCity(e.target.value)}
                                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                                placeholder="Honolulu"
                                            />
                                        </div>
                                        <div className="md:col-span-1">
                                            <label className="block text-xs font-semibold text-gray-700 mb-1">State</label>
                                            <input
                                                type="text"
                                                value={shippingState}
                                                onChange={(e) => setShippingState(e.target.value)}
                                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                                                placeholder="HI"
                                            />
                                        </div>
                                        <div className="md:col-span-1">
                                            <label className="block text-xs font-semibold text-gray-700 mb-1">Zip</label>
                                            <input
                                                type="text"
                                                value={shippingZip}
                                                onChange={(e) => setShippingZip(e.target.value)}
                                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 font-mono"
                                                placeholder="96822"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* List of other saved multi-locations */}
                                {savedLocations.length > 0 && (
                                    <div className="space-y-2">
                                        <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider">
                                            Additional Saved Delivery Locations ({savedLocations.length})
                                        </label>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {savedLocations.map(loc => (
                                                <div key={loc.id} className="p-3 bg-white border border-gray-200 rounded-xl flex items-start justify-between gap-2 shadow-sm">
                                                    <div>
                                                        <span className="font-bold text-sm text-gray-900 block">{loc.name}</span>
                                                        <span className="text-xs text-gray-600 block mt-0.5">{loc.address.formattedAddress || `${loc.address.street1}, ${loc.address.city}`}</span>
                                                        {loc.contactName && (
                                                            <span className="text-[11px] text-gray-500 block mt-1">Attn: {loc.contactName} {loc.contactPhone && `(${loc.contactPhone})`}</span>
                                                        )}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveLocation(loc.id)}
                                                        className="text-gray-400 hover:text-red-600 p-1 rounded"
                                                        title="Remove Location"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Inline Add Location Sub-modal */}
                                {isAddingLocation && (
                                    <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl space-y-3">
                                        <div className="flex items-center justify-between">
                                            <h5 className="text-xs font-bold text-amber-900 uppercase tracking-wider">Add Additional Delivery Location</h5>
                                            <button type="button" onClick={() => setIsAddingLocation(false)} className="text-gray-400 hover:text-gray-600">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                                            <div className="md:col-span-3">
                                                <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">Location Name / Yard *</label>
                                                <input
                                                    type="text"
                                                    value={newLocName}
                                                    onChange={e => setNewLocName(e.target.value)}
                                                    className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium"
                                                    placeholder="e.g. North Yard, Satellite Warehouse"
                                                />
                                            </div>
                                            <div className="md:col-span-3">
                                                <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">Street Address Line 1 *</label>
                                                <input
                                                    type="text"
                                                    value={newLocStreet1}
                                                    onChange={e => setNewLocStreet1(e.target.value)}
                                                    className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
                                                    placeholder="123 Industrial Blvd"
                                                />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">Unit / Suite / Dock #</label>
                                                <input
                                                    type="text"
                                                    value={newLocStreet2}
                                                    onChange={e => setNewLocStreet2(e.target.value)}
                                                    className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
                                                    placeholder="Dock 4, Bay B"
                                                />
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">City *</label>
                                                <input
                                                    type="text"
                                                    value={newLocCity}
                                                    onChange={e => setNewLocCity(e.target.value)}
                                                    className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
                                                    placeholder="City"
                                                />
                                            </div>
                                            <div className="md:col-span-1">
                                                <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">State *</label>
                                                <input
                                                    type="text"
                                                    value={newLocState}
                                                    onChange={e => setNewLocState(e.target.value)}
                                                    className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
                                                    placeholder="State"
                                                />
                                            </div>
                                            <div className="md:col-span-1">
                                                <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">Zip *</label>
                                                <input
                                                    type="text"
                                                    value={newLocZip}
                                                    onChange={e => setNewLocZip(e.target.value)}
                                                    className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-mono"
                                                    placeholder="Zip"
                                                />
                                            </div>
                                            <div className="md:col-span-3">
                                                <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">Receiving Contact Name</label>
                                                <input
                                                    type="text"
                                                    value={newLocContact}
                                                    onChange={e => setNewLocContact(e.target.value)}
                                                    className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
                                                    placeholder="e.g. Mike (Warehouse Lead)"
                                                />
                                            </div>
                                            <div className="md:col-span-3">
                                                <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">Receiving Phone Number</label>
                                                <input
                                                    type="tel"
                                                    value={newLocPhone}
                                                    onChange={e => setNewLocPhone(e.target.value)}
                                                    className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
                                                    placeholder="(555) 123-4567"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex justify-end gap-2 pt-2">
                                            <button
                                                type="button"
                                                onClick={() => setIsAddingLocation(false)}
                                                className="px-3 py-1 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleAddCustomLocation}
                                                className="px-4 py-1 text-xs font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700"
                                            >
                                                Save Location
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                        Special Order & Receiving Dock Instructions
                                    </label>
                                    <textarea
                                        value={orderInstructions}
                                        onChange={(e) => setOrderInstructions(e.target.value)}
                                        rows={2}
                                        className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                        placeholder="e.g. Leave package at rear loading dock. Gate code: #4920. Call shop 30 min before arrival."
                                    />
                                </div>
                            </div>

                            {/* Section 4: Vendor Required Order Fields & Checklist */}
                            <div className="space-y-4 pt-6 border-t border-gray-100">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div>
                                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                            <ListChecks className="w-4 h-4 text-blue-600" />
                                            4. Vendor-Required Order Fields & Placement Checklist
                                        </h4>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            Fields strictly required by this vendor when placing an order. Technicians and dispatchers must fill these out before dispatching.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAddCustomField}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors self-start sm:self-auto"
                                    >
                                        <Plus className="w-3.5 h-3.5" /> Add Required Field
                                    </button>
                                </div>

                                {requiredOrderFields.length === 0 ? (
                                    <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-600 flex items-center justify-between">
                                        <span>No custom order fields specified. Standard order details (Account #, Job Reference, Receiving Contact Phone) will be prompted.</span>
                                        <button
                                            type="button"
                                            onClick={handleAddCustomField}
                                            className="text-blue-600 font-semibold hover:underline"
                                        >
                                            + Add First Requirement
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-2.5">
                                        {requiredOrderFields.map((field) => (
                                            <div key={field.id} className="p-3.5 bg-slate-50/70 border border-slate-200/90 rounded-xl space-y-2.5 transition-all">
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${
                                                            field.required ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-gray-200 text-gray-700'
                                                        }`}>
                                                            {field.required ? 'Mandatory' : 'Optional'}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleToggleFieldRequired(field.id)}
                                                            className="text-[11px] text-blue-600 hover:underline"
                                                        >
                                                            Toggle {field.required ? 'Optional' : 'Required'}
                                                        </button>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveField(field.id)}
                                                        className="text-gray-400 hover:text-red-600 p-1 self-end sm:self-auto"
                                                        title="Remove requirement"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                                                    <div className="sm:col-span-5">
                                                        <label className="block text-[10px] font-bold uppercase text-gray-500 mb-0.5">Field Label *</label>
                                                        <input
                                                            type="text"
                                                            value={field.label}
                                                            onChange={e => handleUpdateField(field.id, { label: e.target.value })}
                                                            className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-semibold text-gray-900"
                                                            placeholder="e.g. Account Number, Job Reference"
                                                        />
                                                    </div>
                                                    <div className="sm:col-span-3">
                                                        <label className="block text-[10px] font-bold uppercase text-gray-500 mb-0.5">Field Key / Token</label>
                                                        <input
                                                            type="text"
                                                            value={field.key}
                                                            onChange={e => handleUpdateField(field.id, { key: e.target.value })}
                                                            className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-mono text-gray-700"
                                                            placeholder="accountNumber"
                                                        />
                                                    </div>
                                                    <div className="sm:col-span-4">
                                                        <label className="block text-[10px] font-bold uppercase text-gray-500 mb-0.5">Data Type</label>
                                                        <select
                                                            value={field.type}
                                                            onChange={e => handleUpdateField(field.id, { type: e.target.value as any })}
                                                            className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs"
                                                        >
                                                            <option value="text">Text / Alphanumeric</option>
                                                            <option value="phone">Phone Number</option>
                                                            <option value="email">Email Address</option>
                                                            <option value="number">Numeric</option>
                                                        </select>
                                                    </div>
                                                    <div className="sm:col-span-12">
                                                        <label className="block text-[10px] font-bold uppercase text-gray-500 mb-0.5">Description & Purpose</label>
                                                        <input
                                                            type="text"
                                                            value={field.description || ''}
                                                            onChange={e => handleUpdateField(field.id, { description: e.target.value })}
                                                            className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded-lg text-xs text-gray-600"
                                                            placeholder="Explain why the supplier requires this field when placing the order"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Section 5: Web Portal, Discounts & Sourcing */}
                            <div className="space-y-4 pt-6 border-t border-gray-100">
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                    <Percent className="w-4 h-4 text-blue-600" />
                                    5. Web Portal, Trade Discounts & Sourcing
                                </h4>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Web Portal Username / Email</label>
                                        <input
                                            type="text"
                                            name="vendor_username"
                                            autoComplete="username"
                                            value={webUsername}
                                            onChange={(e) => setWebUsername(e.target.value)}
                                            className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                            placeholder="buyer@mycompany.com"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Web Portal Password</label>
                                        <div className="relative">
                                            <input
                                                type={showPassword ? 'text' : 'password'}
                                                name="vendor_password"
                                                autoComplete="new-password"
                                                value={webPassword}
                                                onChange={(e) => setWebPassword(e.target.value)}
                                                className="w-full px-3.5 py-2 pr-10 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                                                placeholder="••••••••••••"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                            >
                                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Discount Codes / Promo Coupons</label>
                                        <input
                                            type="text"
                                            value={discountCodes}
                                            onChange={(e) => setDiscountCodes(e.target.value)}
                                            className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                            placeholder="e.g. 10PERCENT, PROXTRA, FREESHIP"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Trade Discount Percent (%)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            step="0.1"
                                            value={tradeDiscountPercent}
                                            onChange={(e) => setTradeDiscountPercent(e.target.value ? parseFloat(e.target.value) : '')}
                                            className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                            placeholder="e.g. 15 for 15% contractor discount"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Primary Sourcing Specialty & Strength</label>
                                        <select
                                            value={sourcingStrength}
                                            onChange={(e) => setSourcingStrength(e.target.value as any)}
                                            className="w-full px-3.5 py-2 border border-indigo-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-indigo-50/40 text-sm font-semibold text-indigo-900"
                                        >
                                            <option value="general">⭐ General Vendor (Balanced Sourcing)</option>
                                            <option value="local_pickup">📍 Local Counter Pickup / Supply House (Immediate Availability)</option>
                                            <option value="urgent_callout">🚨 Urgent & Emergency Dispatch Stock (Same-Day Pickup)</option>
                                            <option value="commodity_lowest">💲 Commodity / Bulk Wholesale (Lowest Unit Price)</option>
                                            <option value="specialty_quality">🏆 Specialty / OEM High Quality (Longest Lasting)</option>
                                        </select>
                                        <p className="text-xs text-gray-500 mt-1">Directs the automated AI procurement engine when routing materials across multiple suppliers.</p>
                                    </div>
                                </div>
                            </div>

                            {/* Section 6: Automated Ordering Configuration & Dynamic API */}
                            <div className="space-y-4 pt-6 border-t border-gray-100">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                        <Zap className="w-4 h-4 text-blue-600" />
                                        6. Automated Ordering & Dynamic API Integration
                                    </h4>
                                    <button
                                        type="button"
                                        onClick={handleCheckApiCapabilities}
                                        disabled={!name.trim() || isAnalyzingApi}
                                        className="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
                                    >
                                        {isAnalyzingApi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5 text-indigo-600" />}
                                        {isAnalyzingApi ? 'Checking...' : 'Check API Integration'}
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Customer / API Account ID</label>
                                        <input
                                            type="text"
                                            value={customerApiId}
                                            onChange={(e) => setCustomerApiId(e.target.value)}
                                            className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                            placeholder="e.g. Developer Token or Account ID"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Secure Payment Token / Reference</label>
                                        <input
                                            type="text"
                                            value={vaultedPaymentId}
                                            onChange={(e) => setVaultedPaymentId(e.target.value)}
                                            className="w-full px-3.5 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                            placeholder="e.g. pm_1NXY... or Card Reference string"
                                        />
                                    </div>
                                </div>

                                {/* Dispatch Method Toggle */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Order Dispatch Method</label>
                                    <div className="bg-gray-100/80 p-1 rounded-xl flex border border-gray-200">
                                        <button
                                            type="button"
                                            onClick={() => setIntegrationType('email_pdf')}
                                            className={`flex-1 flex justify-center items-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                                                integrationType === 'email_pdf'
                                                    ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                                                    : 'text-gray-500 hover:text-gray-800'
                                            }`}
                                        >
                                            <FileText className="w-4 h-4 text-gray-600" />
                                            Email / PDF Dispatch
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setIntegrationType('dynamic_api')}
                                            className={`flex-1 flex justify-center items-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                                                integrationType === 'dynamic_api'
                                                    ? 'bg-white text-blue-700 shadow-sm border border-blue-200'
                                                    : 'text-gray-500 hover:text-gray-800'
                                            }`}
                                        >
                                            <Zap className="w-4 h-4 text-blue-600" />
                                            Dynamic API Webhook
                                        </button>
                                    </div>
                                </div>

                                {integrationType === 'dynamic_api' && (
                                    <div className="p-4 border border-blue-100 bg-blue-50/40 rounded-xl space-y-4">
                                        <h5 className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-2">
                                            <Zap className="w-4 h-4 text-blue-600" />
                                            API Webhook Blueprint
                                        </h5>
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                            <div className="md:col-span-1">
                                                <label className="block text-[11px] font-semibold text-gray-700 mb-1">HTTP Method</label>
                                                <select
                                                    value={apiMethod}
                                                    onChange={(e) => setApiMethod(e.target.value as 'POST' | 'PUT')}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm bg-white"
                                                >
                                                    <option value="POST">POST</option>
                                                    <option value="PUT">PUT</option>
                                                </select>
                                            </div>
                                            <div className="md:col-span-3">
                                                <label className="block text-[11px] font-semibold text-gray-700 mb-1">Endpoint URL</label>
                                                <input
                                                    type="url"
                                                    value={apiEndpointUrl}
                                                    onChange={(e) => setApiEndpointUrl(e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm bg-white"
                                                    placeholder="https://api.vendor.com/v1/orders"
                                                />
                                            </div>
                                            <div className="md:col-span-4">
                                                <label className="block text-[11px] font-semibold text-gray-700 mb-1">Headers (JSON)</label>
                                                <textarea
                                                    value={apiHeaders}
                                                    onChange={(e) => setApiHeaders(e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-xs bg-white"
                                                    rows={3}
                                                    placeholder={'{\n  "Authorization": "Bearer {{vaultedPaymentId}}",\n  "Content-Type": "application/json"\n}'}
                                                />
                                            </div>
                                            <div className="md:col-span-4">
                                                <label className="block text-[11px] font-semibold text-gray-700 mb-1">Request Body Template</label>
                                                <textarea
                                                    value={apiBodyTemplate}
                                                    onChange={(e) => setApiBodyTemplate(e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-xs bg-white"
                                                    rows={5}
                                                    placeholder="Use placeholders: {{orderId}}, {{shippingAddress}}, {{billingAddress}}, {{itemsJson}}, {{total}}"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Form Actions */}
                            <div className="flex justify-end gap-3 pt-6 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={resetForm}
                                    className="px-5 py-2.5 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors font-semibold text-sm"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-7 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 focus:ring-4 focus:ring-blue-100 transition-all font-semibold text-sm shadow-md shadow-blue-500/20"
                                >
                                    {editingVendor ? 'Save Vendor Changes' : 'Create Vendor'}
                                </button>
                            </div>
                        </form>
                    </div>
                ) : (
                    <div className="space-y-4 mb-6">
                        {/* Trade Program Discover Banner */}
                        <div className="p-4 bg-gradient-to-r from-indigo-900 to-blue-900 text-white rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm border border-indigo-800/50">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-white/10 rounded-xl text-amber-300">
                                    <Sparkles className="w-5 h-5" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-sm text-white">Unlock Contractor Trade Pricing & Rebates</h4>
                                    <p className="text-xs text-blue-200 mt-0.5">Explore 5% to 30% volume discounts from Home Depot ProXtra, Amazon Business, Lowe's MVP, Ferguson, and state supply houses.</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setActiveTab('trade_programs')}
                                className="px-4 py-2 bg-white text-indigo-950 font-bold rounded-xl text-xs hover:bg-blue-50 transition-all shrink-0 shadow-xs flex items-center gap-1.5"
                            >
                                <span>Explore Trade Programs</span>
                                <ArrowUpRight className="w-3.5 h-3.5 text-indigo-600" />
                            </button>
                        </div>

                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                                <p className="text-gray-600 font-medium">Manage your materials suppliers, account agreements, and delivery locations.</p>
                                <p className="text-xs text-gray-400 mt-0.5">{vendors.length} supplier{vendors.length !== 1 ? 's' : ''} configured</p>
                            </div>
                            <button
                                onClick={() => setIsAdding(true)}
                                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-all shadow-md shadow-blue-500/20 text-sm"
                            >
                                <Plus className="w-4 h-4" />
                                Add Supplier / Vendor
                            </button>
                        </div>
                    </div>
                )}

                {/* Vendors List Cards */}
                {loading ? (
                    <div className="flex items-center justify-center h-48 text-gray-500">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                    </div>
                ) : vendors.length === 0 && !isAdding ? (
                    <div className="text-center py-16 px-4 border-2 border-dashed border-gray-200 rounded-2xl bg-white">
                        <Building2 className="w-14 h-14 text-gray-300 mx-auto mb-3" />
                        <h3 className="text-lg font-bold text-gray-900 mb-1">No Material Vendors Added</h3>
                        <p className="text-gray-500 mb-5 max-w-md mx-auto text-sm leading-relaxed">
                            Setup your trade suppliers here to enable one-click Purchase Orders, verified warehouse delivery destinations, and automated API checkout.
                        </p>
                        <div className="flex items-center justify-center gap-3">
                            <button
                                onClick={() => setIsAdding(true)}
                                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition shadow-md shadow-blue-500/20 text-sm"
                            >
                                <Plus className="w-4 h-4" />
                                Add Custom Vendor
                            </button>
                            <button
                                onClick={() => setActiveTab('trade_programs')}
                                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl font-semibold hover:bg-indigo-100 transition text-sm"
                            >
                                <Percent className="w-4 h-4" />
                                Browse Trade Programs
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                        {vendors.map(vendor => (
                            <div key={vendor.id} className="bg-white border border-gray-200/90 rounded-2xl p-5 hover:border-blue-300 hover:shadow-md transition-all group relative shadow-sm">
                                <div className="absolute top-4 right-4 flex opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        onClick={() => handleEdit(vendor)}
                                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                        title="Edit Vendor"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => vendor.id && handleDelete(vendor.id, vendor.name)}
                                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        title="Remove Vendor"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                                
                                <div className="flex items-start justify-between pr-16 mb-2">
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-900">{vendor.name}</h3>
                                        {vendor.paymentTerms && (
                                            <span className="inline-block mt-0.5 text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                                                Terms: {vendor.paymentTerms}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {vendor.integrationType === 'dynamic_api' ? (
                                            <span className="p-1 bg-green-50 text-green-700 rounded-full" title="Dynamic API Webhook Configured">
                                                <Zap className="w-4 h-4" />
                                            </span>
                                        ) : (
                                            <span className="p-1 bg-gray-100 text-gray-500 rounded-full" title="Email / PDF Fallback">
                                                <FileText className="w-4 h-4" />
                                            </span>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="flex flex-col gap-1.5 mt-3 text-xs text-gray-600">
                                    <div className="flex items-center gap-2">
                                        <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                        <span className="truncate">{vendor.email}</span>
                                    </div>
                                    {vendor.phone && (
                                        <div className="flex items-center gap-2">
                                            <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                            <span>{vendor.phone}</span>
                                        </div>
                                    )}
                                    {vendor.accountNumber && (
                                        <div className="flex items-center gap-2">
                                            <AlertCircle className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                            <span>Acct: <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-800 font-semibold">{vendor.accountNumber}</span></span>
                                        </div>
                                    )}
                                    {vendor.discountCodes && (
                                        <div className="flex items-center gap-2">
                                            <Percent className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                            <span>Promo: <span className="font-mono bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-bold">{vendor.discountCodes}</span></span>
                                        </div>
                                    )}
                                    {(vendor.shippingAddress || vendor.structuredShippingAddress) && (
                                        <div className="flex items-start gap-2 pt-1 border-t border-gray-100">
                                            <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                                            <span className="text-gray-500 truncate">
                                                Ship: {vendor.structuredShippingAddress?.formattedAddress || vendor.shippingAddress}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                    </>
                )}
            </div>
        </div>
    );

    if (isEmbedded) {
        return content;
    }

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center p-4 z-50 overflow-hidden">
            {content}
        </div>
    );
};

