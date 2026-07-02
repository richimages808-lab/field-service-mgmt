import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, Timestamp, collection, query, where, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import { MasterPurchaseOrder, MasterPOItem, PurchaseOrder, SourcingStrategy } from '../types/Vendor';
import {
    ArrowLeft, Package, ShoppingCart, CheckCircle2, AlertTriangle, Send, ExternalLink,
    ChevronDown, ChevronUp, Layers, Truck, Clock, DollarSign, Edit2, Eye, Check,
    X, RefreshCw, Star, Globe, FileText, ArrowRight, ChevronRight, ShieldCheck
} from 'lucide-react';
import toast from 'react-hot-toast';

const STRATEGY_LABELS: Record<SourcingStrategy, string> = {
    optimal: 'Optimal (Balanced)',
    lowest_cost: 'Lowest Cost',
    fastest_shipping: 'Fastest Shipping',
    highest_quality: 'Highest Quality',
    preferred_vendor: 'Preferred Vendor',
    item_default: 'Item Default Vendor'
};

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
    draft: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Draft' },
    review: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'In Review' },
    approved: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Approved' },
    partially_sent: { bg: 'bg-indigo-100', text: 'text-indigo-800', label: 'Partially Sent' },
    sent: { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Sent' },
    completed: { bg: 'bg-green-100', text: 'text-green-800', label: 'Completed' },
};

const ROUTING_COLORS: Record<string, string> = {
    'Lowest Cost': 'bg-green-100 text-green-700',
    'Fastest Shipping': 'bg-blue-100 text-blue-700',
    'Highest Quality': 'bg-purple-100 text-purple-700',
    'Preferred Vendor': 'bg-amber-100 text-amber-700',
    'Optimal Sourcing': 'bg-indigo-100 text-indigo-700',
    'Item Default': 'bg-teal-100 text-teal-700',
    'Default Vendor': 'bg-orange-100 text-orange-700',
};

export const MasterOrderReview: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [masterOrder, setMasterOrder] = useState<MasterPurchaseOrder | null>(null);
    const [subOrders, setSubOrders] = useState<PurchaseOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedVendor, setExpandedVendor] = useState<string | null>(null);
    const [changingVendorIdx, setChangingVendorIdx] = useState<number | null>(null);
    const [sendingAll, setSendingAll] = useState(false);
    const [approvingAll, setApprovingAll] = useState(false);

    // Load master order
    useEffect(() => {
        if (!id || !user?.org_id) return;
        const loadMaster = async () => {
            try {
                const snap = await getDoc(doc(db, 'masterPurchaseOrders', id));
                if (snap.exists() && snap.data().organizationId === user.org_id) {
                    setMasterOrder({ id: snap.id, ...snap.data() } as MasterPurchaseOrder);
                }
            } catch (err) {
                console.error('[MasterOrderReview] Failed to load:', err);
                toast.error('Failed to load master order');
            } finally {
                setLoading(false);
            }
        };
        loadMaster();
    }, [id, user?.org_id]);

    // Subscribe to sub-orders
    useEffect(() => {
        if (!id || !user?.org_id) return;
        const q = query(
            collection(db, 'purchaseOrders'),
            where('organizationId', '==', user.org_id),
            where('masterOrderId', '==', id)
        );
        const unsub = onSnapshot(q, (snapshot) => {
            setSubOrders(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PurchaseOrder)));
        });
        return unsub;
    }, [id, user?.org_id]);

    // Group items by vendor
    const vendorGrouped = React.useMemo(() => {
        if (!masterOrder) return {};
        const groups: Record<string, { vendorName: string; items: Array<MasterPOItem & { idx: number }>; subtotal: number; subOrder?: PurchaseOrder }> = {};
        masterOrder.items.forEach((item, idx) => {
            const key = item.vendorId;
            if (!groups[key]) {
                groups[key] = { vendorName: item.vendorName, items: [], subtotal: 0 };
            }
            groups[key].items.push({ ...item, idx });
            groups[key].subtotal += item.totalPrice;
        });
        // Link sub-orders
        for (const so of subOrders) {
            const key = so.vendorId || '__unassigned__';
            if (groups[key]) {
                groups[key].subOrder = so;
            }
        }
        return groups;
    }, [masterOrder, subOrders]);

    const handleChangeVendor = async (itemIdx: number, altVendorId: string) => {
        if (!masterOrder || !id) return;
        const item = masterOrder.items[itemIdx];
        const alt = item.alternativeVendors?.find(v => v.vendorId === altVendorId);
        if (!alt) return;

        const updatedItems = [...masterOrder.items];
        updatedItems[itemIdx] = {
            ...updatedItems[itemIdx],
            vendorId: alt.vendorId,
            vendorName: alt.vendorName,
            unitPrice: alt.unitCost,
            totalPrice: alt.unitCost * updatedItems[itemIdx].quantity,
            vendorProductUrl: alt.vendorProductUrl,
            estimatedDeliveryDays: alt.estimatedDeliveryDays,
            reviewStatus: 'changed',
            routingMethod: 'Manual Override',
            // Move the old vendor into alternatives
            alternativeVendors: [
                ...(updatedItems[itemIdx].alternativeVendors || []).filter(v => v.vendorId !== alt.vendorId),
                {
                    vendorId: item.vendorId,
                    vendorName: item.vendorName,
                    unitCost: item.unitPrice,
                    estimatedDeliveryDays: item.estimatedDeliveryDays,
                    vendorProductUrl: item.vendorProductUrl
                }
            ]
        };

        const newSubtotal = updatedItems.reduce((s, i) => s + i.totalPrice, 0);

        await updateDoc(doc(db, 'masterPurchaseOrders', id), {
            items: updatedItems,
            subtotal: newSubtotal,
            total: newSubtotal
        });

        setMasterOrder(prev => prev ? { ...prev, items: updatedItems, subtotal: newSubtotal, total: newSubtotal } : null);
        setChangingVendorIdx(null);
        toast.success(`Switched ${item.name} to ${alt.vendorName}`);
    };

    const handleApproveItem = async (itemIdx: number) => {
        if (!masterOrder || !id) return;
        const updatedItems = [...masterOrder.items];
        updatedItems[itemIdx] = { ...updatedItems[itemIdx], reviewStatus: 'approved' };
        await updateDoc(doc(db, 'masterPurchaseOrders', id), { items: updatedItems });
        setMasterOrder(prev => prev ? { ...prev, items: updatedItems } : null);
    };

    const handleApproveAll = async () => {
        if (!masterOrder || !id) return;
        setApprovingAll(true);
        const updatedItems = masterOrder.items.map(i => ({ ...i, reviewStatus: 'approved' as const }));
        await updateDoc(doc(db, 'masterPurchaseOrders', id), {
            items: updatedItems,
            status: 'approved',
            approvedAt: Timestamp.now(),
            approvedBy: user?.uid
        });
        setMasterOrder(prev => prev ? { ...prev, items: updatedItems, status: 'approved' } : null);
        setApprovingAll(false);
        toast.success('All items approved!');
    };

    const handleSendAll = async () => {
        if (!masterOrder || !id) return;
        setSendingAll(true);
        try {
            // Mark all sub-orders as sent
            for (const so of subOrders) {
                if (so.status === 'draft' && so.id) {
                    await updateDoc(doc(db, 'purchaseOrders', so.id), {
                        status: 'sent',
                        sentAt: Timestamp.now()
                    });
                }
            }
            // Update master status
            await updateDoc(doc(db, 'masterPurchaseOrders', id), { status: 'sent' });
            setMasterOrder(prev => prev ? { ...prev, status: 'sent' } : null);
            toast.success(`Dispatched ${subOrders.length} sub-orders to vendors!`);
        } catch (err: any) {
            toast.error(`Failed to send: ${err.message}`);
        } finally {
            setSendingAll(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="flex items-center gap-3 text-gray-500">
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span className="text-lg">Loading master order...</span>
                </div>
            </div>
        );
    }

    if (!masterOrder) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
                    <h2 className="text-xl font-bold text-gray-800">Master Order Not Found</h2>
                    <Link to="/purchase-orders" className="text-blue-600 hover:underline mt-2 block">← Back to Purchase Orders</Link>
                </div>
            </div>
        );
    }

    const statusCfg = STATUS_CONFIG[masterOrder.status] || STATUS_CONFIG.draft;
    const approvedCount = masterOrder.items.filter(i => i.reviewStatus === 'approved').length;
    const vendorCount = Object.keys(vendorGrouped).length;
    const allApproved = approvedCount === masterOrder.items.length;
    const canSendAll = allApproved || masterOrder.status === 'approved';

    return (
        <div className="min-h-screen bg-gray-50">
            {/* ── Header ── */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => navigate('/purchase-orders')}
                                className="text-gray-500 hover:text-gray-700 transition-colors"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <div>
                                <div className="flex items-center gap-3">
                                    <h1 className="text-xl font-bold text-gray-900">Master Order</h1>
                                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${statusCfg.bg} ${statusCfg.text}`}>
                                        {statusCfg.label}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <p className="text-sm text-gray-500">
                                        {masterOrder.items.length} items · {vendorCount} vendor{vendorCount !== 1 ? 's' : ''} · Strategy:
                                    </p>
                                    <select
                                        value={masterOrder.sourcingStrategy}
                                        onChange={async (e) => {
                                            if (!id) return;
                                            const newStrategy = e.target.value as SourcingStrategy;
                                            await updateDoc(doc(db, 'masterPurchaseOrders', id), { sourcingStrategy: newStrategy });
                                            setMasterOrder(prev => prev ? { ...prev, sourcingStrategy: newStrategy } : null);
                                            toast.success(`Strategy changed to ${STRATEGY_LABELS[newStrategy]}`);
                                        }}
                                        className="text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md px-2 py-0.5 cursor-pointer hover:bg-indigo-100 transition-colors"
                                    >
                                        {Object.entries(STRATEGY_LABELS).map(([key, label]) => (
                                            <option key={key} value={key}>{label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            {!allApproved && masterOrder.status === 'review' && (
                                <button
                                    onClick={handleApproveAll}
                                    disabled={approvingAll}
                                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
                                >
                                    <ShieldCheck className="w-4 h-4" />
                                    {approvingAll ? 'Approving...' : `Approve All (${masterOrder.items.length})`}
                                </button>
                            )}
                            {canSendAll && masterOrder.status !== 'sent' && masterOrder.status !== 'completed' && (
                                <button
                                    onClick={handleSendAll}
                                    disabled={sendingAll}
                                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
                                >
                                    <Send className="w-4 h-4" />
                                    {sendingAll ? 'Sending...' : `Send All Sub-Orders (${vendorCount})`}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 py-6">
                {/* ── Stats Row ── */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                            <Package className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-gray-900">{masterOrder.items.length}</p>
                            <p className="text-xs text-gray-500">Total Items</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                            <DollarSign className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-gray-900">${masterOrder.total.toFixed(2)}</p>
                            <p className="text-xs text-gray-500">Total Cost</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                            <Layers className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-gray-900">{vendorCount}</p>
                            <p className="text-xs text-gray-500">Vendors</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                            <CheckCircle2 className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-gray-900">{approvedCount}/{masterOrder.items.length}</p>
                            <p className="text-xs text-gray-500">Items Reviewed</p>
                        </div>
                    </div>
                </div>

                {/* ── Items by Vendor ── */}
                <div className="space-y-4">
                    {Object.entries(vendorGrouped).map(([vendorId, group]) => {
                        const isExpanded = expandedVendor === vendorId || expandedVendor === null;
                        const subOrder = group.subOrder;
                        const subStatus = subOrder?.status || 'draft';
                        const subStatusCfg = subStatus === 'sent'
                            ? { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Sent' }
                            : subStatus === 'draft'
                            ? { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Draft' }
                            : { bg: 'bg-blue-100', text: 'text-blue-700', label: subStatus.replace(/_/g, ' ') };

                        return (
                            <div key={vendorId} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                {/* Vendor Header */}
                                <div
                                    className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                                    onClick={() => setExpandedVendor(isExpanded && expandedVendor !== null ? vendorId : (expandedVendor === vendorId ? null : vendorId))}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                                            {group.vendorName.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-base font-bold text-gray-900">{group.vendorName}</h3>
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${subStatusCfg.bg} ${subStatusCfg.text}`}>
                                                    {subStatusCfg.label}
                                                </span>
                                                {subOrder?.id && (
                                                    <Link
                                                        to={`/purchase-orders/${subOrder.id}`}
                                                        className="text-[10px] text-blue-600 hover:text-blue-800 flex items-center gap-0.5"
                                                        onClick={e => e.stopPropagation()}
                                                    >
                                                        View PO <ExternalLink className="w-2.5 h-2.5" />
                                                    </Link>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-500">{group.items.length} item{group.items.length !== 1 ? 's' : ''}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="text-lg font-bold text-gray-900">${group.subtotal.toFixed(2)}</span>
                                        {isExpanded && expandedVendor !== null ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                                    </div>
                                </div>

                                {/* Items Table */}
                                {isExpanded && (
                                    <div className="border-t border-gray-100">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
                                                    <th className="text-left px-5 py-2.5">Item</th>
                                                    <th className="text-left px-3 py-2.5">SKU</th>
                                                    <th className="text-center px-3 py-2.5">Qty</th>
                                                    <th className="text-right px-3 py-2.5">Unit $</th>
                                                    <th className="text-right px-3 py-2.5">Total</th>
                                                    <th className="text-center px-3 py-2.5">Routing</th>
                                                    <th className="text-center px-3 py-2.5">Delivery</th>
                                                    <th className="text-center px-3 py-2.5">Review</th>
                                                    <th className="text-center px-3 py-2.5 w-24">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {group.items.map((item) => {
                                                    const routingColor = ROUTING_COLORS[item.routingMethod] || 'bg-gray-100 text-gray-600';
                                                    const isChanging = changingVendorIdx === item.idx;
                                                    const reviewIcon = item.reviewStatus === 'approved'
                                                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                                        : item.reviewStatus === 'changed'
                                                        ? <Edit2 className="w-4 h-4 text-amber-500" />
                                                        : <Clock className="w-4 h-4 text-gray-400" />;

                                                    return (
                                                        <React.Fragment key={item.idx}>
                                                            <tr className="hover:bg-gray-50/50 transition-colors">
                                                                <td className="px-5 py-3">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-sm font-medium text-gray-900">{item.name}</span>
                                                                        {item.vendorProductUrl && (
                                                                            <a
                                                                                href={item.vendorProductUrl}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                className="text-blue-600 hover:text-blue-800 flex items-center gap-0.5 text-[10px] font-medium"
                                                                                onClick={e => e.stopPropagation()}
                                                                            >
                                                                                View <ExternalLink className="w-2.5 h-2.5" />
                                                                            </a>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="px-3 py-3 text-xs text-gray-500 font-mono">{item.sku}</td>
                                                                <td className="px-3 py-3 text-center text-sm font-semibold text-gray-800">{item.quantity}</td>
                                                                <td className="px-3 py-3 text-right text-sm text-gray-700">${item.unitPrice.toFixed(2)}</td>
                                                                <td className="px-3 py-3 text-right text-sm font-semibold text-gray-900">${item.totalPrice.toFixed(2)}</td>
                                                                <td className="px-3 py-3 text-center">
                                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${routingColor}`}>
                                                                        {item.routingMethod}
                                                                    </span>
                                                                </td>
                                                                <td className="px-3 py-3 text-center">
                                                                    <span className="text-xs text-gray-600 flex items-center justify-center gap-1">
                                                                        <Truck className="w-3 h-3" />
                                                                        {item.estimatedDeliveryDays || '?'}d
                                                                    </span>
                                                                </td>
                                                                <td className="px-3 py-3 text-center">{reviewIcon}</td>
                                                                <td className="px-3 py-3 text-center">
                                                                    <div className="flex items-center justify-center gap-1">
                                                                        {item.reviewStatus !== 'approved' && (
                                                                            <button
                                                                                onClick={() => handleApproveItem(item.idx)}
                                                                                className="p-1 hover:bg-emerald-50 text-emerald-600 rounded transition-colors"
                                                                                title="Approve item"
                                                                            >
                                                                                <Check className="w-3.5 h-3.5" />
                                                                            </button>
                                                                        )}
                                                                        {item.alternativeVendors && item.alternativeVendors.length > 0 && (
                                                                            <button
                                                                                onClick={() => setChangingVendorIdx(isChanging ? null : item.idx)}
                                                                                className="p-1 hover:bg-blue-50 text-blue-600 rounded transition-colors"
                                                                                title="Change vendor"
                                                                            >
                                                                                <RefreshCw className="w-3.5 h-3.5" />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            </tr>

                                                            {/* Vendor change dropdown */}
                                                            {isChanging && item.alternativeVendors && (
                                                                <tr>
                                                                    <td colSpan={9} className="px-5 py-3 bg-blue-50/50">
                                                                        <div className="flex items-center gap-2 mb-2">
                                                                            <RefreshCw className="w-3.5 h-3.5 text-blue-600" />
                                                                            <span className="text-xs font-bold text-blue-800">Alternative Vendors for {item.name}</span>
                                                                        </div>
                                                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                                                            {item.alternativeVendors.map(alt => (
                                                                                <button
                                                                                    key={alt.vendorId}
                                                                                    onClick={() => handleChangeVendor(item.idx, alt.vendorId)}
                                                                                    className="flex items-center justify-between bg-white rounded-lg border border-blue-200 px-3 py-2 hover:bg-blue-50 hover:border-blue-400 transition-all text-left"
                                                                                >
                                                                                    <div>
                                                                                        <div className="text-sm font-medium text-gray-900">{alt.vendorName}</div>
                                                                                        <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
                                                                                            <span>${alt.unitCost.toFixed(2)}/unit</span>
                                                                                            {alt.estimatedDeliveryDays && (
                                                                                                <span className="flex items-center gap-0.5">
                                                                                                    <Truck className="w-2.5 h-2.5" />
                                                                                                    {alt.estimatedDeliveryDays}d
                                                                                                </span>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                    {alt.vendorProductUrl && (
                                                                                        <a
                                                                                            href={alt.vendorProductUrl}
                                                                                            target="_blank"
                                                                                            rel="noopener noreferrer"
                                                                                            className="text-blue-600 hover:text-blue-800"
                                                                                            onClick={e => e.stopPropagation()}
                                                                                        >
                                                                                            <ExternalLink className="w-3.5 h-3.5" />
                                                                                        </a>
                                                                                    )}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                        <button
                                                                            onClick={() => setChangingVendorIdx(null)}
                                                                            className="mt-2 text-xs text-gray-500 hover:text-gray-700"
                                                                        >
                                                                            Cancel
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </tbody>
                                            <tfoot>
                                                <tr className="bg-gray-50 font-semibold">
                                                    <td colSpan={4} className="px-5 py-3 text-sm text-gray-700 text-right">Vendor Subtotal:</td>
                                                    <td className="px-3 py-3 text-right text-sm text-gray-900">${group.subtotal.toFixed(2)}</td>
                                                    <td colSpan={4}></td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* ── Master Order Footer ── */}
                <div className="mt-6 bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="text-sm text-gray-500">
                            Created {masterOrder.createdAt?.toDate?.() ? masterOrder.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </div>
                        {masterOrder.notes && (
                            <div className="text-xs text-gray-400 italic max-w-md truncate">
                                {masterOrder.notes}
                            </div>
                        )}
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Master Order Total</p>
                        <p className="text-2xl font-bold text-gray-900">${masterOrder.total.toFixed(2)}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
