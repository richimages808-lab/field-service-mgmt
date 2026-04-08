import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import { PurchaseOrder } from '../types/Vendor';
import { ArrowLeft, Send, CheckCircle, Package, MapPin, Building, CreditCard, ExternalLink, Calendar, Loader2 } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';

export const PurchaseOrderDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [order, setOrder] = useState<PurchaseOrder | null>(null);
    const [vendorDetails, setVendorDetails] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [dispatching, setDispatching] = useState(false);
    
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
                            setVendorDetails(vendorSnap.data());
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
                alert(`Order successfully dispatched via ${data.method === 'dynamic_api' ? 'API Integration' : 'Email/PDF'}.`);
            } else {
                throw new Error(data.message || 'Dispatch failed');
            }
            
        } catch (error: any) {
            console.error('Dispatch error:', error);
            alert(`Failed to dispatch order: ${error.message}`);
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
                            {dispatching ? 'Dispatching...' : 'Dispatch Order'}
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

                    {/* Order Meta */}
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
