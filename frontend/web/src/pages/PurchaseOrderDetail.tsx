import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import { PurchaseOrder } from '../types/Vendor';
import { ArrowLeft, Send, CheckCircle, Package, MapPin, Building, CreditCard, ExternalLink, Calendar, Loader2, Edit2, Check, Eye, EyeOff, Copy } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';

export const PurchaseOrderDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [order, setOrder] = useState<PurchaseOrder | null>(null);
    const [vendorDetails, setVendorDetails] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [dispatching, setDispatching] = useState(false);
    
    // Vendor Credentials editing state
    const [isEditingAccount, setIsEditingAccount] = useState(false);
    const [savingAccount, setSavingAccount] = useState(false);
    const [formAccountNumber, setFormAccountNumber] = useState('');
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
                    
                    // Also grab vendor info
                    if (poData.vendorId) {
                        const vendorRef = doc(db, 'vendors', poData.vendorId);
                        const vendorSnap = await getDoc(vendorRef);
                        if (vendorSnap.exists()) {
                            const vData = vendorSnap.data();
                            setVendorDetails(vData);
                            
                            // Initialize fields
                            setFormAccountNumber(vData.accountNumber || '');
                            setFormCustomerApiId(vData.customerApiId || '');
                            setFormVaultedPaymentId(vData.vaultedPaymentId || '');
                            setFormDiscountCodes(vData.discountCodes || '');
                            setFormOrderInstructions(vData.orderInstructions || '');
                            setFormEmail(vData.email || '');
                            setFormPhone(vData.phone || '');
                            setFormWebUsername(vData.webUsername || '');
                            setFormWebPassword(vData.webPassword || '');
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

    const handleSaveAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!order || !order.vendorId) return;

        setSavingAccount(true);
        try {
            const vendorRef = doc(db, 'vendors', order.vendorId);
            const updates: any = {
                accountNumber: formAccountNumber,
                customerApiId: formCustomerApiId,
                vaultedPaymentId: formVaultedPaymentId,
                discountCodes: formDiscountCodes,
                orderInstructions: formOrderInstructions,
                email: formEmail,
                phone: formPhone,
                webUsername: formWebUsername,
                webPassword: formWebPassword
            };

            await updateDoc(vendorRef, updates);

            // Update local state so UI updates
            setVendorDetails((prev: any) => ({
                ...prev,
                ...updates
            }));

            setIsEditingAccount(false);
            alert("Vendor account settings successfully synced! When placing this order, actual account credentials will be used.");
        } catch (error: any) {
            console.error("Error saving vendor details:", error);
            alert(`Failed to save vendor details: ${error.message}`);
        } finally {
            setSavingAccount(false);
        }
    };

    const handleDispatch = async () => {
        if (!order || !order.id) return;
        
        setDispatching(true);
        try {
            const functions = getFunctions();
            const dispatchPurchaseOrder = httpsCallable(functions, 'dispatchPurchaseOrder');
            
            const result = await dispatchPurchaseOrder({ orderId: order.id });
            const data = result.data as any;
            
            if (data.success) {
                // Pre-emptively update local state before reloading, or just load new
                setOrder(prev => prev ? { ...prev, status: 'sent', sentAt: Timestamp.now() } : null);
                alert(`Order successfully placed via ${data.method === 'dynamic_api' ? 'API Integration' : 'Email/PDF'}.`);
            } else {
                throw new Error(data.message || 'Placement failed');
            }
            
        } catch (error: any) {
            console.error('Placement error:', error);
            alert(`Failed to place order: ${error.message}`);
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
        } catch (err) {
            console.error("Error updating status:", err);
            alert("Failed to update status.");
        }
    };

    if (loading) return <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;
    if (!order) return <div className="p-8 text-center text-gray-500">Order not found.</div>;

    const isDraft = order.status === 'draft';

    return (
        <div className="p-4 md:p-8 max-w-5xl mx-auto">
            {/* Header Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <button
                    onClick={() => navigate('/purchase-orders')}
                    className="flex items-center text-gray-500 hover:text-gray-900 transition-colors w-fit"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Orders
                </button>
                
                <div className="flex flex-wrap items-center gap-3">
                    {isDraft && (
                        <button
                            onClick={handleDispatch}
                            disabled={dispatching}
                            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-75 disabled:cursor-not-allowed shadow-sm transition-all"
                        >
                            {dispatching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                            {dispatching ? 'Placing Order...' : 'Place Order'}
                        </button>
                    )}
                    {order.status === 'sent' && (
                        <button
                            onClick={handleMarkReceived}
                            className="flex items-center gap-2 bg-green-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-green-700 shadow-sm transition-all"
                        >
                            <Package className="w-5 h-5" />
                            Mark Received
                        </button>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Header Banner */}
                <div className="bg-gray-50 border-b border-gray-200 p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h1 className="text-2xl font-bold text-gray-900">Purchase Order</h1>
                            <span className={`px-2.5 py-1 text-xs font-semibold rounded-full uppercase tracking-wider ${
                                order.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                                order.status === 'sent' ? 'bg-blue-100 text-blue-700' :
                                order.status === 'received' ? 'bg-green-100 text-green-700' :
                                'bg-gray-200 text-gray-800'
                            }`}>
                                {order.status}
                            </span>
                        </div>
                        <p className="text-gray-500 font-mono text-sm">ID: {order.id}</p>
                    </div>
                    
                    <div className="text-left md:text-right">
                        <p className="text-sm text-gray-500 mb-1">Total Amount</p>
                        <p className="text-3xl font-bold text-gray-900">${(order.total || 0).toFixed(2)}</p>
                    </div>
                </div>

                {/* Details Grid */}
                <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-8 bg-white">
                    {/* Column 1: Vendor + Accounts */}
                    <div className="space-y-6">
                        {/* Vendor Info */}
                        <div>
                            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <Building className="w-4 h-4" /> Vendor Information
                            </h3>
                            <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                                <p className="font-bold text-lg text-gray-900 mb-1">{order.vendorName}</p>
                                {vendorDetails?.email && <p className="text-gray-600 text-sm mb-1">{vendorDetails.email}</p>}
                                {vendorDetails?.phone && <p className="text-gray-600 text-sm mb-3">{vendorDetails.phone}</p>}
                                
                                <div className="pt-3 border-t border-gray-200 mt-2">
                                    <p className="text-sm font-medium text-gray-700">Integration Method:</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        {vendorDetails?.integrationType === 'dynamic_api' ? (
                                            <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded">
                                                <ExternalLink className="w-3 h-3" /> Dynamic API
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 bg-gray-100 px-2 py-1 rounded">
                                                <Send className="w-3 h-3" /> Email / PDF
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Actual Vendor Account Settings Card */}
                        {order.vendorId && (
                            <div>
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                        <CreditCard className="w-4 h-4" /> Actual Account Credentials
                                    </h3>
                                    {isDraft && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (isEditingAccount) {
                                                    setIsEditingAccount(false);
                                                } else {
                                                    setFormAccountNumber(vendorDetails?.accountNumber || '');
                                                    setFormCustomerApiId(vendorDetails?.customerApiId || '');
                                                    setFormVaultedPaymentId(vendorDetails?.vaultedPaymentId || '');
                                                    setFormDiscountCodes(vendorDetails?.discountCodes || '');
                                                    setFormOrderInstructions(vendorDetails?.orderInstructions || '');
                                                    setFormEmail(vendorDetails?.email || '');
                                                    setFormPhone(vendorDetails?.phone || '');
                                                    setFormWebUsername(vendorDetails?.webUsername || '');
                                                    setFormWebPassword(vendorDetails?.webPassword || '');
                                                    setIsEditingAccount(true);
                                                }
                                            }}
                                            className="text-xs font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
                                        >
                                            {isEditingAccount ? 'Cancel' : (
                                                <>
                                                    <Edit2 className="w-3 h-3" /> Configure Account
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>

                                <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                                    {isEditingAccount ? (
                                        <form onSubmit={handleSaveAccount} className="space-y-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                                    Account Number
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formAccountNumber}
                                                    onChange={(e) => setFormAccountNumber(e.target.value)}
                                                    placeholder="e.g. VEND-10293-A"
                                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                                    Web Portal Username / Email
                                                </label>
                                                <input
                                                    type="text"
                                                    name="vendor_username"
                                                    autoComplete="username"
                                                    value={formWebUsername}
                                                    onChange={(e) => setFormWebUsername(e.target.value)}
                                                    placeholder="Username or email"
                                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                                    Web Portal Password
                                                </label>
                                                <input
                                                    type="password"
                                                    name="vendor_password"
                                                    autoComplete="current-password"
                                                    value={formWebPassword}
                                                    onChange={(e) => setFormWebPassword(e.target.value)}
                                                    placeholder="••••••••••••"
                                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                                    Vendor Notification Email
                                                </label>
                                                <input
                                                    type="email"
                                                    value={formEmail}
                                                    onChange={(e) => setFormEmail(e.target.value)}
                                                    placeholder="orders@vendor.com"
                                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                                    Vendor Contact Phone
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formPhone}
                                                    onChange={(e) => setFormPhone(e.target.value)}
                                                    placeholder="(555) 123-4567"
                                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                                />
                                            </div>

                                            {vendorDetails?.integrationType === 'dynamic_api' && (
                                                <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 space-y-3">
                                                    <span className="text-[10px] uppercase font-bold text-blue-700 tracking-widest block">
                                                        Secure API Credentials
                                                    </span>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                                                            Customer API ID
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={formCustomerApiId}
                                                            onChange={(e) => setFormCustomerApiId(e.target.value)}
                                                            placeholder="API customer token"
                                                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                                                            Vaulted Payment Reference ID
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={formVaultedPaymentId}
                                                            onChange={(e) => setFormVaultedPaymentId(e.target.value)}
                                                            placeholder="vaulted_pay_ref_..."
                                                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                                                    Discount / Promo Codes
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formDiscountCodes}
                                                    onChange={(e) => setFormDiscountCodes(e.target.value)}
                                                    placeholder="e.g. 10PERCENTOFF"
                                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
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
                                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                                />
                                            </div>

                                            <div className="flex gap-2 pt-2">
                                                <button
                                                    type="submit"
                                                    disabled={savingAccount}
                                                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                                                >
                                                    {savingAccount ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : (
                                                        <Check className="w-3.5 h-3.5" />
                                                    )}
                                                    {savingAccount ? 'Saving...' : 'Save & Sync Account'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsEditingAccount(false)}
                                                    className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 py-2 px-3 rounded-lg text-xs font-semibold transition-all"
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
                                                    {vendorDetails?.accountNumber || (
                                                        <span className="text-slate-400 font-normal italic">Default Account</span>
                                                    )}
                                                </span>
                                            </div>

                                            {vendorDetails?.integrationType === 'dynamic_api' && (
                                                <>
                                                    <div className="flex justify-between items-center text-xs pt-2.5 border-t border-slate-200/60">
                                                        <span className="text-slate-500">Customer API ID</span>
                                                        <span className="font-semibold text-slate-900 font-mono">
                                                            {vendorDetails?.customerApiId ? (
                                                                vendorDetails.customerApiId
                                                            ) : (
                                                                <span className="text-amber-600 font-normal italic">Not Configured</span>
                                                            )}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-center text-xs pt-2.5 border-t border-slate-200/60">
                                                        <span className="text-slate-500">Vaulted Payment Reference</span>
                                                        <span className="font-semibold text-slate-900 font-mono">
                                                            {vendorDetails?.vaultedPaymentId ? (
                                                                <span className="text-emerald-700">●●●●●●●● (Configured)</span>
                                                            ) : (
                                                                <span className="text-amber-600 font-normal italic">Not Configured</span>
                                                            )}
                                                        </span>
                                                    </div>
                                                </>
                                            )}

                                            <div className="flex justify-between items-center text-xs pt-2.5 border-t border-slate-200/60">
                                                <span className="text-slate-500">Discount / Promo Codes</span>
                                                <span className="font-semibold text-slate-900 font-mono">
                                                    {vendorDetails?.discountCodes || (
                                                        <span className="text-slate-400 font-normal italic">None</span>
                                                    )}
                                                </span>
                                            </div>

                                            {vendorDetails?.orderInstructions && (
                                                <div className="pt-2.5 border-t border-slate-200/60 text-xs">
                                                    <span className="text-slate-500 block mb-1">Special Instructions</span>
                                                    <p className="text-slate-800 bg-white p-2.5 rounded-lg border border-slate-100 font-sans leading-relaxed">
                                                        {vendorDetails.orderInstructions}
                                                    </p>
                                                </div>
                                            )}

                                            {isDraft && !vendorDetails?.accountNumber && !vendorDetails?.customerApiId && (
                                                <div className="pt-3 border-t border-slate-200/60 text-[11px] text-slate-500 italic leading-snug">
                                                    Tip: Configure your actual accounts or API credentials to checkout directly with this vendor.
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Web Portal Quick Checkout Helper */}
                        {vendorDetails && (vendorDetails.website || vendorDetails.webUsername || vendorDetails.webPassword) && (
                            <div className="mt-6">
                                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <ExternalLink className="w-4 h-4 text-indigo-600" /> Web Portal Quick Order Helper
                                </h3>
                                <div className="bg-indigo-50/50 rounded-xl p-5 border border-indigo-100 space-y-4">
                                    <p className="text-xs text-indigo-900 leading-relaxed">
                                        Use this helper panel to place the order directly on the vendor's website. Open their site, copy your credentials, use any promo codes, and bulk-copy items!
                                    </p>
                                    
                                    {vendorDetails.website && (
                                        <button
                                            type="button"
                                            onClick={() => window.open(vendorDetails.website.startsWith('http') ? vendorDetails.website : `https://${vendorDetails.website}`, '_blank')}
                                            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold shadow-sm transition-all"
                                        >
                                            <ExternalLink className="w-4 h-4" /> Open Vendor Web Portal
                                        </button>
                                    )}

                                    <div className="space-y-3 bg-white p-3 rounded-lg border border-indigo-100/50">
                                        {vendorDetails.webUsername ? (
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Username / Email</span>
                                                <div className="flex items-center justify-between gap-2 bg-slate-50 px-2 py-1.5 rounded border border-slate-100 text-sm">
                                                    <span className="font-mono truncate select-all">{vendorDetails.webUsername}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(vendorDetails.webUsername);
                                                            setCopiedUsername(true);
                                                            setTimeout(() => setCopiedUsername(false), 2000);
                                                        }}
                                                        className="p-1 hover:bg-slate-200 rounded text-slate-500 transition-colors"
                                                        title="Copy Username"
                                                    >
                                                        {copiedUsername ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-xs text-slate-400 italic">No web username saved for this vendor.</div>
                                        )}

                                        {vendorDetails.webPassword ? (
                                            <div className="flex flex-col gap-1">
                                                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Password</span>
                                                <div className="flex items-center justify-between gap-2 bg-slate-50 px-2 py-1.5 rounded border border-slate-100 text-sm">
                                                    <span className="font-mono select-all">
                                                        {showPassword ? vendorDetails.webPassword : '••••••••••••'}
                                                    </span>
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowPassword(!showPassword)}
                                                            className="p-1 hover:bg-slate-200 rounded text-slate-500 transition-colors"
                                                            title={showPassword ? "Hide Password" : "Show Password"}
                                                        >
                                                            {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(vendorDetails.webPassword);
                                                                setCopiedPassword(true);
                                                                setTimeout(() => setCopiedPassword(false), 2000);
                                                            }}
                                                            className="p-1 hover:bg-slate-200 rounded text-slate-500 transition-colors"
                                                            title="Copy Password"
                                                        >
                                                            {copiedPassword ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-xs text-slate-400 italic pt-1 border-t border-slate-50">No web password saved.</div>
                                        )}

                                        {vendorDetails.discountCodes ? (
                                            <div className="flex flex-col gap-1 pt-2 border-t border-slate-100">
                                                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Active Promo / Discount Codes</span>
                                                <div className="flex items-center justify-between gap-2 bg-emerald-50/50 px-2 py-1.5 rounded border border-emerald-100 text-sm">
                                                    <span className="font-mono text-emerald-800 font-semibold">{vendorDetails.discountCodes}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(vendorDetails.discountCodes);
                                                            setCopiedDiscount(true);
                                                            setTimeout(() => setCopiedDiscount(false), 2000);
                                                        }}
                                                        className="p-1 hover:bg-emerald-100 rounded text-emerald-600 transition-colors"
                                                        title="Copy Discount Codes"
                                                    >
                                                        {copiedDiscount ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-xs text-slate-400 italic pt-2 border-t border-slate-100">No active discount codes saved.</div>
                                        )}
                                    </div>

                                    {/* SKU Quick Bulk Entry Copy */}
                                    {order.items && order.items.length > 0 && (
                                        <div className="bg-white p-3 rounded-lg border border-indigo-100/50 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Bulk SKU Copy-Paste</span>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const bulkText = order.items.map(item => `${item.sku}\t${item.quantity}`).join('\n');
                                                        navigator.clipboard.writeText(bulkText);
                                                        setCopiedBulk(true);
                                                        setTimeout(() => setCopiedBulk(false), 2000);
                                                    }}
                                                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors"
                                                >
                                                    {copiedBulk ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                                                    Copy Bulk Grid
                                                </button>
                                            </div>
                                            <textarea
                                                readOnly
                                                value={order.items.map(item => `${item.sku}\t${item.quantity}`).join('\n')}
                                                className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-xs font-mono select-all focus:outline-none focus:ring-1 focus:ring-indigo-400 resize-none h-16"
                                            />
                                            <p className="text-[10px] text-slate-400 leading-snug">
                                                Tip: Copy this TSV (Tab-Separated Values) grid and paste directly into bulk ordering pads on Ferguson, Grainger, etc.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Column 2: Order Details */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <CheckCircle className="w-4 h-4" /> Order Details
                        </h3>
                        <div className="bg-gray-50 rounded-xl p-5 border border-gray-100 space-y-4">
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <Calendar className="w-4 h-4 opacity-70" /> Drafted On
                                </div>
                                <span className="font-medium text-gray-900 text-sm text-right">
                                    {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString() : 'N/A'}
                                </span>
                            </div>
                            
                            {order.sentAt && (
                                <div className="flex justify-between items-start pt-3 border-t border-gray-100">
                                    <div className="flex items-center gap-2 text-sm text-gray-600">
                                        <Send className="w-4 h-4 opacity-70" /> Sent On
                                    </div>
                                    <span className="font-medium text-gray-900 text-sm text-right">
                                        {order.sentAt.toDate().toLocaleString()}
                                    </span>
                                </div>
                            )}
                            
                            {vendorDetails?.billingAddress && (
                                <div className="flex justify-between items-start pt-3 border-t border-gray-100">
                                    <div className="flex items-center gap-2 text-sm text-gray-600">
                                        <CreditCard className="w-4 h-4 opacity-70" /> Bill To
                                    </div>
                                    <span className="font-medium text-gray-900 text-sm text-right max-w-[150px]">
                                        {vendorDetails.billingAddress}
                                    </span>
                                </div>
                            )}
                            
                            {vendorDetails?.shippingAddress && (
                                <div className="flex justify-between items-start pt-3 border-t border-gray-100">
                                    <div className="flex items-center gap-2 text-sm text-gray-600">
                                        <MapPin className="w-4 h-4 opacity-70" /> Ship To
                                    </div>
                                    <span className="font-medium text-gray-900 text-sm text-right max-w-[150px]">
                                        {vendorDetails.shippingAddress}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Line Items */}
                <div className="border-t border-gray-200">
                    <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                        <h3 className="text-sm font-semibold text-gray-700">Line Items</h3>
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-white">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Item</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">SKU</th>
                                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Qty</th>
                                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Unit Price</th>
                                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {order.items?.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50/50">
                                        <td className="px-6 py-4 text-sm font-medium text-gray-900">{item.name}</td>
                                        <td className="px-6 py-4 text-sm text-gray-500 font-mono">{item.sku}</td>
                                        <td className="px-6 py-4 text-sm text-gray-900 text-right">{item.quantity}</td>
                                        <td className="px-6 py-4 text-sm text-gray-500 text-right">${item.unitPrice.toFixed(2)}</td>
                                        <td className="px-6 py-4 text-sm font-medium text-gray-900 text-right">${item.totalPrice.toFixed(2)}</td>
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
                            <span className="font-medium text-gray-900">${(order.subtotal || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-gray-600">
                            <span>Tax</span>
                            <span className="font-medium text-gray-900">${(order.tax || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-gray-600">
                            <span>Shipping</span>
                            <span className="font-medium text-gray-900">${(order.shipping || 0).toFixed(2)}</span>
                        </div>
                        <div className="pt-3 border-t border-gray-200 flex justify-between">
                            <span className="text-base font-bold text-gray-900">Total</span>
                            <span className="text-xl font-bold text-gray-900">${(order.total || 0).toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
