import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import { PurchaseOrder, AddressInfo, ShippingLocation, VendorOrderField } from '../types/Vendor';
import { 
    ArrowLeft, Send, CheckCircle, Package, MapPin, Building, CreditCard, 
    ExternalLink, Calendar, Loader2, Edit2, Check, Eye, EyeOff, Copy, 
    Layers, Trash2, ShieldCheck, AlertCircle, RefreshCw, ChevronDown, ListChecks, FileCheck
} from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import toast from 'react-hot-toast';

export const PurchaseOrderDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [order, setOrder] = useState<PurchaseOrder | null>(null);
    const [vendorDetails, setVendorDetails] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [dispatching, setDispatching] = useState(false);
    
    // Shipping Address Verification State
    const [isSelectingLocation, setIsSelectingLocation] = useState(false);
    const [selectedLocationId, setSelectedLocationId] = useState<string>('default');
    const [customStreet1, setCustomStreet1] = useState('');
    const [customStreet2, setCustomStreet2] = useState('');
    const [customCity, setCustomCity] = useState('');
    const [customState, setCustomState] = useState('');
    const [customZip, setCustomZip] = useState('');
    const [savingShipping, setSavingShipping] = useState(false);

    // Vendor Required Order Fields & Verification Checklist
    const [orderFieldValues, setOrderFieldValues] = useState<Record<string, any>>({});
    const [missingFieldKeys, setMissingFieldKeys] = useState<string[]>([]);
    const [savingFieldValues, setSavingFieldValues] = useState(false);

    // Vendor Credentials editing state
    const [isEditingAccount, setIsEditingAccount] = useState(false);
    const [savingAccount, setSavingAccount] = useState(false);
    const [formAccountNumber, setFormAccountNumber] = useState('');
    const [formTaxId, setFormTaxId] = useState('');
    const [formPaymentTerms, setFormPaymentTerms] = useState('Net 30');
    const [formCustomerApiId, setFormCustomerApiId] = useState('');
    const [formVaultedPaymentId, setFormVaultedPaymentId] = useState('');
    const [formDiscountCodes, setFormDiscountCodes] = useState('');
    const [formOrderInstructions, setFormOrderInstructions] = useState('');
    const [formEmail, setFormEmail] = useState('');
    const [formPhone, setFormPhone] = useState('');
    const [formWebUsername, setFormWebUsername] = useState('');
    const [formWebPassword, setFormWebPassword] = useState('');

    // Portal Helper state
    const [showPassword, setShowPassword] = useState(false);
    const [copiedUsername, setCopiedUsername] = useState(false);
    const [copiedPassword, setCopiedPassword] = useState(false);
    const [copiedDiscount, setCopiedDiscount] = useState(false);
    const [copiedBulk, setCopiedBulk] = useState(false);

    useEffect(() => {
        if (!id || !user?.org_id) return;

        const loadContent = async () => {
            try {
                const docRef = doc(db, 'purchaseOrders', id);
                const docSnap = await getDoc(docRef);
                
                if (docSnap.exists() && docSnap.data().organizationId === user.org_id) {
                    const poData = { id: docSnap.id, ...docSnap.data() } as PurchaseOrder;
                    setOrder(poData);
                    
                    // Grab vendor info
                    if (poData.vendorId) {
                        const vendorRef = doc(db, 'vendors', poData.vendorId);
                        const vendorSnap = await getDoc(vendorRef);
                        if (vendorSnap.exists()) {
                            const vData = vendorSnap.data();
                            setVendorDetails(vData);
                            
                            // Initialize credentials fields
                            setFormAccountNumber(vData.accountNumber || '');
                            setFormTaxId(vData.taxId || '');
                            setFormPaymentTerms(vData.paymentTerms || 'Net 30');
                            setFormCustomerApiId(vData.customerApiId || '');
                            setFormVaultedPaymentId(vData.vaultedPaymentId || '');
                            setFormDiscountCodes(vData.discountCodes || '');
                            setFormOrderInstructions(vData.orderInstructions || '');
                            setFormEmail(vData.email || '');
                            setFormPhone(vData.phone || '');
                            setFormWebUsername(vData.webUsername || '');
                            setFormWebPassword(vData.webPassword || '');

                            // Initialize orderFieldValues from PO or vendor defaults
                            const initialFields: Record<string, any> = {
                                accountNumber: poData.orderFieldValues?.accountNumber || vData.accountNumber || '',
                                jobReference: poData.orderFieldValues?.jobReference || poData.jobTitle || poData.jobId || 'General Inventory Restock',
                                deliveryContactPhone: poData.orderFieldValues?.deliveryContactPhone || vData.contactPhone || vData.phone || '',
                                dockInstructions: poData.orderFieldValues?.dockInstructions || vData.orderInstructions || '',
                                ...(poData.orderFieldValues || {})
                            };
                            setOrderFieldValues(initialFields);

                            // Initialize shipping fields if PO doesn't have explicit shipping yet
                            if (!poData.shippingAddress && vData.shippingAddress) {
                                const defaultShip = vData.structuredShippingAddress?.formattedAddress || vData.shippingAddress;
                                await updateDoc(docRef, {
                                    shippingAddress: defaultShip,
                                    shippingLocationName: 'Default Warehouse',
                                    structuredShippingAddress: vData.structuredShippingAddress || null,
                                    billingAddress: vData.structuredBillingAddress?.formattedAddress || vData.billingAddress || null,
                                    structuredBillingAddress: vData.structuredBillingAddress || null
                                });
                                setOrder(prev => prev ? {
                                    ...prev,
                                    shippingAddress: defaultShip,
                                    shippingLocationName: 'Default Warehouse'
                                } : null);
                            }
                        }
                    }
                } else {
                    navigate('/purchase-orders');
                }
            } catch (err) {
                console.error("Error loading PO:", err);
            } finally {
                setLoading(false);
            }
        };

        loadContent();
    }, [id, user?.org_id, navigate]);

    const handleVerifyShipping = async (locName: string, addressStr: string, structured?: AddressInfo) => {
        if (!order || !order.id) return;
        setSavingShipping(true);
        try {
            await updateDoc(doc(db, 'purchaseOrders', order.id), {
                shippingAddress: addressStr,
                shippingLocationName: locName,
                structuredShippingAddress: structured || null,
                shippingVerified: true
            });
            setOrder(prev => prev ? {
                ...prev,
                shippingAddress: addressStr,
                shippingLocationName: locName,
                structuredShippingAddress: structured,
                shippingVerified: true
            } : null);
            setIsSelectingLocation(false);
            toast.success(`Destination verified for ${locName}!`);
        } catch (err: any) {
            console.error("Error updating shipping address:", err);
            toast.error(`Failed to verify address: ${err.message}`);
        } finally {
            setSavingShipping(false);
        }
    };

    const handleApplyCustomAddress = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!customStreet1.trim() || !customCity.trim()) {
            toast.error("Street address and city are required.");
            return;
        }

        const formatted = `${customStreet1.trim()}${customStreet2.trim() ? `, ${customStreet2.trim()}` : ''}, ${customCity.trim()}, ${customState.trim()} ${customZip.trim()}`;
        const structured: AddressInfo = {
            street1: customStreet1.trim(),
            street2: customStreet2.trim(),
            city: customCity.trim(),
            state: customState.trim(),
            zip: customZip.trim(),
            country: 'US',
            formattedAddress: formatted
        };

        await handleVerifyShipping("Custom Job Site / Delivery Location", formatted, structured);
    };

    const handleSaveAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!order || !order.vendorId) return;

        setSavingAccount(true);
        try {
            const vendorRef = doc(db, 'vendors', order.vendorId);
            const updates: any = {
                accountNumber: formAccountNumber.trim(),
                taxId: formTaxId.trim(),
                paymentTerms: formPaymentTerms.trim(),
                customerApiId: formCustomerApiId.trim(),
                vaultedPaymentId: formVaultedPaymentId.trim(),
                discountCodes: formDiscountCodes.trim(),
                orderInstructions: formOrderInstructions.trim(),
                email: formEmail.trim(),
                phone: formPhone.trim(),
                webUsername: formWebUsername.trim(),
                webPassword: formWebPassword.trim()
            };

            await updateDoc(vendorRef, updates);

            setVendorDetails((prev: any) => ({
                ...prev,
                ...updates
            }));

            setIsEditingAccount(false);
            toast.success("Vendor account details saved & synced!");
        } catch (error: any) {
            console.error("Error saving vendor details:", error);
            toast.error(`Failed to save: ${error.message}`);
        } finally {
            setSavingAccount(false);
        }
    };

    const effectiveRequiredFields: VendorOrderField[] = (vendorDetails?.requiredOrderFields && vendorDetails.requiredOrderFields.length > 0)
        ? vendorDetails.requiredOrderFields
        : [
            {
                id: 'field_acct_num',
                key: 'accountNumber',
                label: 'Vendor Account Number',
                description: 'Contractor account identifier required for billing and negotiated pricing',
                type: 'text',
                required: true,
                defaultValue: vendorDetails?.accountNumber || ''
            },
            {
                id: 'field_job_ref',
                key: 'jobReference',
                label: 'Job Site / PO Reference',
                description: 'Work order or job name for delivery tracking and job costing',
                type: 'text',
                required: true,
                defaultValue: order?.jobTitle || order?.jobId || ''
            },
            {
                id: 'field_contact_phone',
                key: 'deliveryContactPhone',
                label: 'Receiving Contact Phone',
                description: 'Direct phone number for courier driver upon delivery arrival',
                type: 'phone',
                required: true,
                defaultValue: vendorDetails?.contactPhone || vendorDetails?.phone || ''
            },
            {
                id: 'field_dock_notes',
                key: 'dockInstructions',
                label: 'Receiving Dock & Gate Notes',
                description: 'Gate codes, loading bay #, or after-hours receiving notes',
                type: 'text',
                required: false,
                defaultValue: vendorDetails?.orderInstructions || ''
            }
        ];

    const handleSaveOrderFields = async () => {
        if (!order || !order.id) return;
        setSavingFieldValues(true);
        try {
            await updateDoc(doc(db, 'purchaseOrders', order.id), {
                orderFieldValues
            });
            setOrder(prev => prev ? { ...prev, orderFieldValues } : null);
            toast.success("Order placement details saved!");
        } catch (err: any) {
            console.error("Error saving order fields:", err);
            toast.error(`Failed to save: ${err.message}`);
        } finally {
            setSavingFieldValues(false);
        }
    };

    const handleDispatch = async () => {
        if (!order || !order.id) return;
        
        if (!order.shippingAddress && !vendorDetails?.shippingAddress) {
            toast.error("Please verify a delivery shipping address before placing order.");
            setIsSelectingLocation(true);
            return;
        }

        // Validate mandatory vendor required fields
        const missing: string[] = [];
        for (const field of effectiveRequiredFields) {
            if (field.required) {
                const val = orderFieldValues[field.key];
                if (!val || !String(val).trim()) {
                    missing.push(field.key);
                }
            }
        }

        if (missing.length > 0) {
            setMissingFieldKeys(missing);
            const firstMissing = effectiveRequiredFields.find(f => f.key === missing[0]);
            toast.error(`Please fill out "${firstMissing?.label || missing[0]}" required by ${order.vendorName} before placing this order.`);
            return;
        }

        setMissingFieldKeys([]);

        const confirmMsg = `Place Purchase Order ${order.id} for $${(order.total || 0).toFixed(2)}?\n\nDelivering to:\n${order.shippingAddress || vendorDetails?.shippingAddress || 'Main Facility'}`;
        if (!window.confirm(confirmMsg)) return;

        setDispatching(true);
        try {
            // Save current orderFieldValues to Firestore before dispatching
            await updateDoc(doc(db, 'purchaseOrders', order.id), {
                orderFieldValues
            });

            const functions = getFunctions();
            const dispatchPurchaseOrder = httpsCallable(functions, 'dispatchPurchaseOrder');
            
            const result = await dispatchPurchaseOrder({ orderId: order.id });
            const data = result.data as any;
            
            if (data.success) {
                setOrder(prev => prev ? { ...prev, status: 'sent', sentAt: Timestamp.now(), orderFieldValues } : null);
                toast.success(`Order successfully placed via ${data.method === 'dynamic_api' ? 'API Integration' : 'Email/PDF'}!`);
            } else {
                throw new Error(data.message || 'Placement failed');
            }
            
        } catch (error: any) {
            console.error('Placement error:', error);
            toast.error(`Failed to place order: ${error.message}`);
        } finally {
            setDispatching(false);
        }
    };

    const handleMarkReceived = async () => {
        if (!order || !order.id) return;
        if (!window.confirm("Mark this entire order as fully received? Items will be added to inventory.")) return;
        
        try {
            await updateDoc(doc(db, 'purchaseOrders', order.id), {
                status: 'received',
                receivedAt: new Date()
            });
            setOrder(prev => prev ? { ...prev, status: 'received' } : null);
            toast.success("Order marked as received!");
        } catch (err) {
            console.error("Error updating status:", err);
            toast.error("Failed to update status.");
        }
    };

    if (loading) return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;
    if (!order) return <div className="p-8 text-center text-gray-500">Order not found.</div>;

    const isDraft = order.status === 'draft';
    const currentShippingAddr = order.shippingAddress || vendorDetails?.structuredShippingAddress?.formattedAddress || vendorDetails?.shippingAddress;
    const currentBillingAddr = order.billingAddress || vendorDetails?.structuredBillingAddress?.formattedAddress || vendorDetails?.billingAddress;
    const savedLocations: ShippingLocation[] = vendorDetails?.savedShippingLocations || [];

    // Calculate completed vs required count
    const mandatoryCount = effectiveRequiredFields.filter(f => f.required).length;
    const satisfiedCount = effectiveRequiredFields.filter(f => f.required && orderFieldValues[f.key] && String(orderFieldValues[f.key]).trim().length > 0).length;
    const allMandatorySatisfied = satisfiedCount >= mandatoryCount;

    return (
        <div className="p-4 md:p-8 max-w-5xl mx-auto">
            {/* Header Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex flex-col gap-1">
                    <button
                        onClick={() => navigate('/purchase-orders')}
                        className="flex items-center text-gray-500 hover:text-gray-900 transition-colors w-fit font-medium text-sm"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Purchase Orders
                    </button>
                    {(order as any).masterOrderId && (
                        <button
                            onClick={() => navigate(`/purchase-orders/master/${(order as any).masterOrderId}`)}
                            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 ml-6 w-fit transition-colors font-semibold"
                        >
                            <Layers className="w-3.5 h-3.5" />
                            Part of Master Order — View Master
                        </button>
                    )}
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                    {isDraft && (
                        <button
                            onClick={handleDispatch}
                            disabled={dispatching}
                            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 disabled:opacity-75 shadow-md shadow-blue-500/20 transition-all text-sm"
                        >
                            {dispatching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            {dispatching ? 'Dispatching Order...' : 'Place / Dispatch Order'}
                        </button>
                    )}
                    {order.status === 'sent' && (
                        <button
                            onClick={handleMarkReceived}
                            className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-emerald-700 shadow-md shadow-emerald-500/20 transition-all text-sm"
                        >
                            <Package className="w-4 h-4" />
                            Mark Received
                        </button>
                    )}
                    <button
                        onClick={async () => {
                            if (!window.confirm(`Delete this purchase order for ${order.vendorName}? This cannot be undone.`)) return;
                            try {
                                await deleteDoc(doc(db, 'purchaseOrders', id!));
                                toast.success("Purchase order deleted");
                                navigate('/purchase-orders');
                            } catch (err: any) {
                                toast.error(`Delete failed: ${err.message}`);
                            }
                        }}
                        className="flex items-center gap-2 bg-rose-50 text-rose-600 px-4 py-2.5 rounded-xl font-semibold hover:bg-rose-100 border border-rose-200 shadow-xs transition-all text-sm"
                    >
                        <Trash2 className="w-4 h-4" />
                        Delete
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Header Banner */}
                <div className="bg-gradient-to-r from-slate-50 to-blue-50/40 border-b border-gray-200 p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-1.5">
                            <h1 className="text-2xl font-bold text-gray-900">Purchase Order</h1>
                            <span className={`px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wider ${
                                order.status === 'draft' ? 'bg-amber-100 text-amber-800' :
                                order.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                                order.status === 'received' ? 'bg-emerald-100 text-emerald-800' :
                                'bg-gray-200 text-gray-800'
                            }`}>
                                {order.status}
                            </span>
                        </div>
                        <p className="text-gray-500 font-mono text-xs">PO #: {order.id}</p>
                    </div>
                    
                    <div className="text-left md:text-right">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-0.5">Order Total</p>
                        <p className="text-3xl font-extrabold text-gray-900">${(order.total || 0).toFixed(2)}</p>
                    </div>
                </div>

                {/* Destination Shipping Address Verification Card (Prominent for Orders) */}
                <div className="p-6 bg-blue-50/60 border-b border-blue-100">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <div className={`p-2.5 rounded-xl text-white ${order.shippingVerified ? 'bg-emerald-600' : 'bg-blue-600'} shadow-sm`}>
                                <MapPin className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                                        Ship To Delivery Destination: {order.shippingLocationName || 'Primary Facility'}
                                    </h3>
                                    {order.shippingVerified ? (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                                            <ShieldCheck className="w-3.5 h-3.5" /> Verified
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                                            <AlertCircle className="w-3.5 h-3.5" /> Verification Recommended
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm text-gray-700 mt-1 font-medium">
                                    {currentShippingAddr || <span className="text-amber-700 italic">No delivery address set. Click below to verify delivery destination.</span>}
                                </p>
                            </div>
                        </div>

                        {isDraft && (
                            <div className="flex items-center gap-2">
                                {!order.shippingVerified && currentShippingAddr && (
                                    <button
                                        type="button"
                                        onClick={() => handleVerifyShipping(order.shippingLocationName || "Default Facility", currentShippingAddr, order.structuredShippingAddress)}
                                        disabled={savingShipping}
                                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                                    >
                                        <ShieldCheck className="w-3.5 h-3.5" /> Confirm Address
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setIsSelectingLocation(!isSelectingLocation)}
                                    className="px-3.5 py-2 bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                                >
                                    <Edit2 className="w-3.5 h-3.5" /> Change Location
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Change Destination Drawer */}
                    {isSelectingLocation && (
                        <div className="mt-4 pt-4 border-t border-blue-200/60 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                                    Select Saved Receiving Location
                                </label>
                                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                    {/* Default Vendor Address */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const addr = vendorDetails?.structuredShippingAddress?.formattedAddress || vendorDetails?.shippingAddress || "Main Receiving Warehouse";
                                            handleVerifyShipping("Main Facility", addr, vendorDetails?.structuredShippingAddress);
                                        }}
                                        className="w-full text-left p-2.5 bg-white border border-blue-200 rounded-xl hover:border-blue-500 hover:bg-blue-50/50 transition-all text-xs flex justify-between items-center"
                                    >
                                        <div>
                                            <span className="font-bold text-gray-900 block">Default Receiving Facility</span>
                                            <span className="text-gray-600 truncate block mt-0.5">
                                                {vendorDetails?.structuredShippingAddress?.formattedAddress || vendorDetails?.shippingAddress || "Primary Warehouse"}
                                            </span>
                                        </div>
                                        <Check className="w-4 h-4 text-blue-600" />
                                    </button>

                                    {/* Saved Multi Locations */}
                                    {savedLocations.map(loc => (
                                        <button
                                            key={loc.id}
                                            type="button"
                                            onClick={() => handleVerifyShipping(loc.name, loc.address.formattedAddress || `${loc.address.street1}, ${loc.address.city}`, loc.address)}
                                            className="w-full text-left p-2.5 bg-white border border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50/50 transition-all text-xs flex justify-between items-center"
                                        >
                                            <div>
                                                <span className="font-bold text-gray-900 block">{loc.name}</span>
                                                <span className="text-gray-600 truncate block mt-0.5">{loc.address.formattedAddress || `${loc.address.street1}, ${loc.address.city}`}</span>
                                            </div>
                                            <Check className="w-4 h-4 text-gray-400" />
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Or Custom / Job Site Address */}
                            <form onSubmit={handleApplyCustomAddress} className="bg-white p-3.5 rounded-xl border border-gray-200 space-y-2.5">
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                                    Or Deliver to Specific Job Site / Custom Address
                                </label>
                                <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                                    <div className="md:col-span-4">
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">Street Address Line 1 *</label>
                                        <input
                                            type="text"
                                            required
                                            value={customStreet1}
                                            onChange={e => setCustomStreet1(e.target.value)}
                                            placeholder="123 Job Site Road"
                                            className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">Unit / Dock / Bay #</label>
                                        <input
                                            type="text"
                                            value={customStreet2}
                                            onChange={e => setCustomStreet2(e.target.value)}
                                            placeholder="Suite 200, Dock 1"
                                            className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
                                        />
                                    </div>
                                    <div className="md:col-span-3">
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">City *</label>
                                        <input
                                            type="text"
                                            required
                                            value={customCity}
                                            onChange={e => setCustomCity(e.target.value)}
                                            placeholder="City"
                                            className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
                                        />
                                    </div>
                                    <div className="md:col-span-1">
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">State *</label>
                                        <input
                                            type="text"
                                            required
                                            value={customState}
                                            onChange={e => setCustomState(e.target.value)}
                                            placeholder="HI"
                                            className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg bg-white"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-0.5">Zip Code *</label>
                                        <input
                                            type="text"
                                            required
                                            value={customZip}
                                            onChange={e => setCustomZip(e.target.value)}
                                            placeholder="96813"
                                            className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg bg-white font-mono"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => setIsSelectingLocation(false)}
                                        className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={savingShipping}
                                        className="px-4 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors"
                                    >
                                        {savingShipping ? 'Saving...' : 'Set Job Site Address'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>

                {/* Details Grid */}
                <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-8 bg-white">
                    {/* Column 1: Vendor + Accounts */}
                    <div className="space-y-6">
                        {/* Vendor Info */}
                        <div>
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                <Building className="w-4 h-4 text-blue-600" /> Vendor / Supplier
                            </h3>
                            <div className="bg-slate-50/70 rounded-xl p-5 border border-slate-200">
                                <p className="font-bold text-lg text-gray-900 mb-1">{order.vendorName}</p>
                                {vendorDetails?.email && <p className="text-gray-600 text-xs mb-1">Orders: <span className="font-medium text-gray-800">{vendorDetails.email}</span></p>}
                                {vendorDetails?.phone && <p className="text-gray-600 text-xs mb-3">Phone: <span className="font-medium text-gray-800">{vendorDetails.phone}</span></p>}
                                
                                <div className="pt-3 border-t border-slate-200/80 mt-2 flex items-center justify-between">
                                    <div>
                                        <span className="text-xs text-gray-500 block">Dispatch Channel</span>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            {vendorDetails?.integrationType === 'dynamic_api' ? (
                                                <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                                                    <ExternalLink className="w-3 h-3" /> Dynamic API
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-700 bg-gray-100 px-2.5 py-0.5 rounded-full border border-gray-200">
                                                    <Send className="w-3 h-3" /> Email / PDF
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {vendorDetails?.paymentTerms && (
                                        <div className="text-right">
                                            <span className="text-xs text-gray-500 block">Payment Terms</span>
                                            <span className="text-xs font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200 inline-block mt-0.5">
                                                {vendorDetails.paymentTerms}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Actual Vendor Account Settings Card */}
                        {order.vendorId && (
                            <div>
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                        <CreditCard className="w-4 h-4 text-blue-600" /> Account Agreement & Credentials
                                    </h3>
                                    {isDraft && (
                                        <button
                                            type="button"
                                            onClick={() => setIsEditingAccount(!isEditingAccount)}
                                            className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
                                        >
                                            {isEditingAccount ? 'Cancel' : (
                                                <>
                                                    <Edit2 className="w-3 h-3" /> Configure Account
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>

                                <div className="bg-slate-50/70 rounded-xl p-5 border border-slate-200">
                                    {isEditingAccount ? (
                                        <form onSubmit={handleSaveAccount} className="space-y-4">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                                        Account Number
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={formAccountNumber}
                                                        onChange={(e) => setFormAccountNumber(e.target.value)}
                                                        placeholder="e.g. VEND-10293-A"
                                                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 font-mono"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                                        Payment Terms
                                                    </label>
                                                    <select
                                                        value={formPaymentTerms}
                                                        onChange={(e) => setFormPaymentTerms(e.target.value)}
                                                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500"
                                                    >
                                                        <option value="Net 30">Net 30</option>
                                                        <option value="Net 60">Net 60</option>
                                                        <option value="Net 15">Net 15</option>
                                                        <option value="Due Upon Receipt">Due Upon Receipt</option>
                                                        <option value="Credit Card on File">Credit Card on File</option>
                                                        <option value="Prepaid">Prepaid</option>
                                                    </select>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                                        Portal Username
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={formWebUsername}
                                                        onChange={(e) => setFormWebUsername(e.target.value)}
                                                        placeholder="buyer@domain.com"
                                                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                                        Portal Password
                                                    </label>
                                                    <input
                                                        type="password"
                                                        value={formWebPassword}
                                                        onChange={(e) => setFormWebPassword(e.target.value)}
                                                        placeholder="••••••••••••"
                                                        className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                                    Discount / Promo Codes
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formDiscountCodes}
                                                    onChange={(e) => setFormDiscountCodes(e.target.value)}
                                                    placeholder="e.g. 10PERCENTOFF"
                                                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 font-mono"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                                    Special Order Instructions
                                                </label>
                                                <textarea
                                                    value={formOrderInstructions}
                                                    onChange={(e) => setFormOrderInstructions(e.target.value)}
                                                    placeholder="Deliver to rear loading dock..."
                                                    rows={2}
                                                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>

                                            <div className="flex gap-2 pt-2">
                                                <button
                                                    type="submit"
                                                    disabled={savingAccount}
                                                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs"
                                                >
                                                    {savingAccount ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                                    {savingAccount ? 'Saving...' : 'Save & Sync'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsEditingAccount(false)}
                                                    className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 py-2 px-3 rounded-xl text-xs font-semibold"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </form>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-slate-500">Account Number</span>
                                                <span className="font-semibold text-slate-900 font-mono">
                                                    {vendorDetails?.accountNumber || <span className="text-slate-400 font-normal italic">Default Account</span>}
                                                </span>
                                            </div>

                                            {vendorDetails?.taxId && (
                                                <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-200/60">
                                                    <span className="text-slate-500">Tax ID / EIN</span>
                                                    <span className="font-semibold text-slate-900 font-mono">{vendorDetails.taxId}</span>
                                                </div>
                                            )}

                                            <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-200/60">
                                                <span className="text-slate-500">Discount / Promo Codes</span>
                                                <span className="font-semibold text-emerald-700 font-mono">
                                                    {vendorDetails?.discountCodes || <span className="text-slate-400 font-normal italic">None</span>}
                                                </span>
                                            </div>

                                            {vendorDetails?.orderInstructions && (
                                                <div className="pt-2 border-t border-slate-200/60 text-xs">
                                                    <span className="text-slate-500 block mb-1">Special Instructions</span>
                                                    <p className="text-slate-800 bg-white p-2 rounded-lg border border-slate-200 font-sans text-xs leading-relaxed">
                                                        {vendorDetails.orderInstructions}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Column 2: Bill To, Ship To & Order Dates */}
                    <div className="space-y-6">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-blue-600" /> Order & Billing Details
                        </h3>
                        
                        <div className="bg-slate-50/70 rounded-xl p-5 border border-slate-200 space-y-4">
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-2 text-xs text-gray-600">
                                    <Calendar className="w-4 h-4 text-gray-400" /> Created On
                                </div>
                                <span className="font-semibold text-gray-900 text-xs text-right">
                                    {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString() : 'N/A'}
                                </span>
                            </div>
                            
                            {order.sentAt && (
                                <div className="flex justify-between items-start pt-3 border-t border-slate-200/60">
                                    <div className="flex items-center gap-2 text-xs text-gray-600">
                                        <Send className="w-4 h-4 text-gray-400" /> Sent On
                                    </div>
                                    <span className="font-semibold text-gray-900 text-xs text-right">
                                        {order.sentAt.toDate().toLocaleString()}
                                    </span>
                                </div>
                            )}
                            
                            {/* Bill To Address */}
                            <div className="pt-3 border-t border-slate-200/60">
                                <div className="flex items-center gap-2 text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                                    <CreditCard className="w-3.5 h-3.5 text-blue-600" /> Bill To (Accounts Payable)
                                </div>
                                <p className="text-xs text-gray-700 font-medium bg-white p-2.5 rounded-lg border border-slate-200 leading-relaxed">
                                    {currentBillingAddr || "Corporate Headquarters (On File)"}
                                </p>
                            </div>

                            {/* Ship To Address Summary */}
                            <div className="pt-3 border-t border-slate-200/60">
                                <div className="flex items-center gap-2 text-xs font-bold text-blue-900 uppercase tracking-wider mb-1">
                                    <MapPin className="w-3.5 h-3.5 text-blue-600" /> Ship To ({order.shippingLocationName || 'Receiving Facility'})
                                </div>
                                <p className="text-xs text-blue-950 font-medium bg-blue-50/70 p-2.5 rounded-lg border border-blue-200/70 leading-relaxed">
                                    {currentShippingAddr || "Default Warehouse"}
                                </p>
                            </div>
                        </div>

                        {/* Web Portal Quick Helper */}
                        {vendorDetails && (vendorDetails.website || vendorDetails.webUsername) && (
                            <div className="bg-indigo-50/50 rounded-xl p-5 border border-indigo-100 space-y-3">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                                        <ExternalLink className="w-3.5 h-3.5 text-indigo-600" /> Web Portal Quick Helper
                                    </h4>
                                    {vendorDetails.website && (
                                        <a
                                            href={vendorDetails.website.startsWith('http') ? vendorDetails.website : `https://${vendorDetails.website}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                                        >
                                            Open Portal <ExternalLink className="w-3 h-3" />
                                        </a>
                                    )}
                                </div>
                                
                                {order.items && order.items.length > 0 && (
                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-[11px] font-semibold text-indigo-900">Bulk TSV SKU Grid:</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const bulkText = order.items.map(item => `${item.sku}\t${item.quantity}`).join('\n');
                                                    navigator.clipboard.writeText(bulkText);
                                                    setCopiedBulk(true);
                                                    setTimeout(() => setCopiedBulk(false), 2000);
                                                }}
                                                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                                            >
                                                {copiedBulk ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                                {copiedBulk ? 'Copied!' : 'Copy SKU Grid'}
                                            </button>
                                        </div>
                                        <textarea
                                            readOnly
                                            value={order.items.map(item => `${item.sku}\t${item.quantity}`).join('\n')}
                                            className="w-full bg-white border border-indigo-200 rounded-lg p-2 text-[11px] font-mono select-all focus:outline-none resize-none h-14"
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Vendor-Required Order Information & Placement Checklist Card */}
                <div className="p-6 md:p-8 bg-slate-50/70 border-t border-b border-gray-200">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                        <div>
                            <div className="flex items-center gap-2.5">
                                <div className={`p-2 rounded-xl text-white ${allMandatorySatisfied ? 'bg-emerald-600' : 'bg-indigo-600'} shadow-sm`}>
                                    <ListChecks className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                        Vendor-Required Order Information & Placement Checklist
                                    </h3>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        Mandatory fields verified by {order.vendorName} to ensure order acceptance and delivery tracking.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {allMandatorySatisfied ? (
                                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    <ShieldCheck className="w-3.5 h-3.5" /> All Requirements Satisfied ({satisfiedCount}/{mandatoryCount})
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200">
                                    <AlertCircle className="w-3.5 h-3.5" /> Action Required: {mandatoryCount - satisfiedCount} Incomplete Field{mandatoryCount - satisfiedCount !== 1 ? 's' : ''}
                                </span>
                            )}

                            {isDraft && (
                                <button
                                    type="button"
                                    onClick={handleSaveOrderFields}
                                    disabled={savingFieldValues}
                                    className="px-3.5 py-1.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
                                >
                                    {savingFieldValues ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileCheck className="w-3.5 h-3.5 text-blue-600" />}
                                    {savingFieldValues ? 'Saving...' : 'Save Checklist'}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Dynamic Fields Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {effectiveRequiredFields.map((field) => {
                            const val = orderFieldValues[field.key] ?? field.defaultValue ?? '';
                            const isMissing = missingFieldKeys.includes(field.key);
                            const isFieldSatisfied = !field.required || (val && String(val).trim().length > 0);

                            return (
                                <div 
                                    key={field.id || field.key} 
                                    className={`p-4 rounded-xl border transition-all ${
                                        isMissing
                                            ? 'bg-red-50/50 border-red-300 ring-2 ring-red-400/20'
                                            : isFieldSatisfied && field.required
                                            ? 'bg-white border-emerald-200/80 shadow-xs'
                                            : 'bg-white border-gray-200 shadow-xs'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-2 mb-1.5">
                                        <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider">
                                            {field.label}
                                        </label>
                                        <div className="flex items-center gap-1 shrink-0">
                                            {field.required ? (
                                                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                                                    isMissing ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                                                }`}>
                                                    * Required
                                                </span>
                                            ) : (
                                                <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">
                                                    Optional
                                                </span>
                                            )}
                                            {field.required && (
                                                isFieldSatisfied ? (
                                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                                ) : (
                                                    <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                                                )
                                            )}
                                        </div>
                                    </div>

                                    {field.description && (
                                        <p className="text-[11px] text-gray-500 mb-2 leading-tight">
                                            {field.description}
                                        </p>
                                    )}

                                    {isDraft ? (
                                        <div>
                                            {field.type === 'select' && field.options && field.options.length > 0 ? (
                                                <select
                                                    value={val}
                                                    onChange={(e) => {
                                                        const newVal = e.target.value;
                                                        setOrderFieldValues(prev => ({ ...prev, [field.key]: newVal }));
                                                        if (missingFieldKeys.includes(field.key) && newVal.trim()) {
                                                            setMissingFieldKeys(prev => prev.filter(k => k !== field.key));
                                                        }
                                                    }}
                                                    className={`w-full px-3 py-2 border rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 bg-white ${
                                                        isMissing ? 'border-red-400 text-red-900' : 'border-gray-300 text-gray-900'
                                                    }`}
                                                >
                                                    <option value="">-- Select {field.label} --</option>
                                                    {field.options.map((opt, oIdx) => (
                                                        <option key={oIdx} value={opt}>{opt}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <input
                                                    type={field.type === 'number' ? 'number' : field.type === 'phone' ? 'tel' : field.type === 'email' ? 'email' : 'text'}
                                                    value={val}
                                                    onChange={(e) => {
                                                        const newVal = e.target.value;
                                                        setOrderFieldValues(prev => ({ ...prev, [field.key]: newVal }));
                                                        if (missingFieldKeys.includes(field.key) && newVal.trim()) {
                                                            setMissingFieldKeys(prev => prev.filter(k => k !== field.key));
                                                        }
                                                    }}
                                                    placeholder={`Enter ${field.label}...`}
                                                    className={`w-full px-3 py-2 border rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 bg-white ${
                                                        isMissing 
                                                            ? 'border-red-400 text-red-900 placeholder:text-red-300' 
                                                            : 'border-gray-300 text-gray-900'
                                                    }`}
                                                />
                                            )}

                                            {isMissing && (
                                                <p className="text-[11px] font-bold text-red-600 mt-1 flex items-center gap-1">
                                                    <AlertCircle className="w-3 h-3" /> Mandatory field required by {order.vendorName}
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="bg-gray-100 px-3 py-2 rounded-xl text-xs font-semibold text-gray-800 font-mono">
                                            {val || <span className="text-gray-400 italic font-sans font-normal">Not specified</span>}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Line Items */}
                <div className="border-t border-gray-200">
                    <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                        <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Line Items ({order.items?.length || 0})</h3>
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-white">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Item Description</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">SKU / Part #</th>
                                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Qty</th>
                                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Unit Price</th>
                                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {order.items?.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-4 text-sm font-semibold text-gray-900">{item.name}</td>
                                        <td className="px-6 py-4 text-xs text-gray-500 font-mono">{item.sku}</td>
                                        <td className="px-6 py-4 text-sm text-gray-900 text-right font-bold">{item.quantity}</td>
                                        <td className="px-6 py-4 text-sm text-gray-600 text-right">${item.unitPrice.toFixed(2)}</td>
                                        <td className="px-6 py-4 text-sm font-bold text-gray-900 text-right">${item.totalPrice.toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Summary Box */}
                <div className="bg-gray-50 p-6 md:p-8 flex justify-end border-t border-gray-200">
                    <div className="w-full sm:w-80 space-y-3">
                        <div className="flex justify-between text-sm text-gray-600">
                            <span>Subtotal</span>
                            <span className="font-semibold text-gray-900">${(order.subtotal || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-gray-600">
                            <span>Tax</span>
                            <span className="font-semibold text-gray-900">${(order.tax || 0).toFixed(2)}</span>
                        </div>
                        {order.shipping ? (
                            <div className="flex justify-between text-sm text-gray-600">
                                <span>Shipping & Handling</span>
                                <span className="font-semibold text-gray-900">${(order.shipping || 0).toFixed(2)}</span>
                            </div>
                        ) : null}
                        <div className="pt-3 border-t border-gray-200 flex justify-between items-center">
                            <span className="text-base font-bold text-gray-900">Total</span>
                            <span className="text-2xl font-extrabold text-gray-900">${(order.total || 0).toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

