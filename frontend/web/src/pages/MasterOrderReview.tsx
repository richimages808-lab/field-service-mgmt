import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, Timestamp, collection, query, where, onSnapshot, addDoc, deleteDoc } from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import { MasterPurchaseOrder, MasterPOItem, PurchaseOrder, SourcingStrategy, Vendor } from '../types/Vendor';
import {
    buildAllVendorPricing,
    selectVendorByOrgPriorities,
    estimateMaterialBaseCost,
    AlternateVendorItem
} from '../utils/procurementLogic';
import {
    ArrowLeft, Package, ShoppingCart, CheckCircle2, AlertTriangle, Send, ExternalLink,
    ChevronDown, ChevronUp, Layers, Truck, Clock, DollarSign, Edit2, Check,
    X, RefreshCw, Star, Globe, FileText, ArrowRight, ChevronRight, ShieldCheck,
    Store, MapPin, Sparkles, CheckSquare
} from 'lucide-react';
import toast from 'react-hot-toast';

const STRATEGY_LABELS: Record<SourcingStrategy, string> = {
    optimal: 'Optimal (Balanced)',
    lowest_cost: 'Lowest Cost',
    total_visit_cost: 'Total Visit Cost',
    local_availability: 'Local Parts Availability',
    urgent_local_availability: 'Urgent Local Stock',
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
    'Total Visit Cost': 'bg-indigo-100 text-indigo-700',
    'Local Availability': 'bg-emerald-100 text-emerald-700',
    'Urgent Local Stock': 'bg-red-100 text-red-700',
    'Fastest Shipping': 'bg-blue-100 text-blue-700',
    'Highest Quality': 'bg-purple-100 text-purple-700',
    'Preferred Vendor': 'bg-amber-100 text-amber-700',
    'Optimal Sourcing': 'bg-indigo-100 text-indigo-700',
    'Item Default': 'bg-teal-100 text-teal-700',
    'Default Vendor': 'bg-orange-100 text-orange-700',
    'Manual Override': 'bg-yellow-100 text-yellow-800',
};

function sanitizeForFirestore<T>(obj: T): T {
    if (obj === undefined) return null as any;
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Timestamp) return obj;
    if (Array.isArray(obj)) {
        return obj.map(sanitizeForFirestore) as any;
    }
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined) {
            clean[k] = sanitizeForFirestore(v);
        }
    }
    return clean as T;
}

export const MasterOrderReview: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [masterOrder, setMasterOrder] = useState<MasterPurchaseOrder | null>(null);
    const [subOrders, setSubOrders] = useState<PurchaseOrder[]>([]);
    const [orgVendors, setOrgVendors] = useState<Vendor[]>([]);
    const [loading, setLoading] = useState(true);
    const [autoHealing, setAutoHealing] = useState(false);
    const [expandedVendor, setExpandedVendor] = useState<string | null>(null);
    const [changingVendorIdx, setChangingVendorIdx] = useState<number | null>(null);
    const [sendingAll, setSendingAll] = useState(false);
    const [approvingAll, setApprovingAll] = useState(false);
    const [reEvaluating, setReEvaluating] = useState(false);

    // Modal state for recording external order confirmation numbers
    const [orderModal, setOrderModal] = useState<{
        isOpen: boolean;
        subOrderId?: string;
        vendorName: string;
        orderNumber: string;
    }>({
        isOpen: false,
        vendorName: '',
        orderNumber: ''
    });

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

    // Subscribe to organization vendors
    useEffect(() => {
        if (!user?.org_id) return;
        const q = query(
            collection(db, 'vendors'),
            where('organizationId', '==', user.org_id)
        );
        const unsub = onSnapshot(q, (snapshot) => {
            setOrgVendors(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Vendor)));
        });
        return unsub;
    }, [user?.org_id]);

    // Re-evaluate strategy or auto-heal items with missing vendors/pricing
    const reEvaluateAllItems = async (targetStrategy?: SourcingStrategy) => {
        if (!masterOrder || !id || !user?.org_id) return;
        setReEvaluating(true);
        try {
            const strat = targetStrategy || masterOrder.sourcingStrategy || 'optimal';
            const updatedItems: MasterPOItem[] = masterOrder.items.map(item => {
                let baseCost = item.unitPrice > 0 ? item.unitPrice : estimateMaterialBaseCost(item.name);

                let existingAlternates: AlternateVendorItem[] = (item.alternativeVendors || []).map(a => ({
                    vendorId: a.vendorId,
                    vendorName: a.vendorName,
                    unitCost: a.unitCost > 0 ? a.unitCost : baseCost,
                    estimatedDeliveryDays: a.estimatedDeliveryDays,
                    vendorProductUrl: a.vendorProductUrl,
                    isLocalVendor: a.isLocalVendor,
                    pickupAvailable: a.pickupAvailable,
                    localStoreName: a.localStoreName
                }));

                const allVendorOptions = buildAllVendorPricing(item.name, baseCost, existingAlternates, orgVendors);
                const { selectedVendor, priorityReason } = selectVendorByOrgPriorities(allVendorOptions, {
                    defaultSourcingStrategy: strat
                });

                const winner = selectedVendor || allVendorOptions[0];
                const matchedOrgV = orgVendors.find(v => v.id === winner.vendorId || v.name.toLowerCase() === winner.vendorName.toLowerCase());
                const vendorId = matchedOrgV?.id || winner.vendorId || winner.vendorName.toLowerCase().replace(/[^a-z0-9]/g, '-');
                const vendorName = matchedOrgV?.name || winner.vendorName;
                const unitPrice = winner.unitCost > 0 ? winner.unitCost : baseCost;
                const isLocal = Boolean(winner.isLocalVendor);

                const alternativeVendors = allVendorOptions
                    .filter(v => v.vendorId !== winner.vendorId && v.vendorName !== winner.vendorName)
                    .map(v => ({
                        vendorId: v.vendorId || '',
                        vendorName: v.vendorName || '',
                        unitCost: v.unitCost || 0,
                        estimatedDeliveryDays: v.estimatedDeliveryDays ?? 2,
                        vendorProductUrl: v.vendorProductUrl || '',
                        isLocalVendor: Boolean(v.isLocalVendor),
                        pickupAvailable: Boolean(v.pickupAvailable),
                        localStoreName: v.localStoreName || ''
                    }));

                return {
                    ...item,
                    vendorId,
                    vendorName,
                    unitPrice,
                    totalPrice: Math.round(unitPrice * item.quantity * 100) / 100,
                    vendorProductUrl: winner.vendorProductUrl || item.vendorProductUrl || '',
                    routingMethod: priorityReason || (isLocal ? 'Local Availability' : 'Optimal Sourcing'),
                    estimatedDeliveryDays: winner.estimatedDeliveryDays ?? (isLocal ? 0 : 2),
                    alternativeVendors,
                    deliveryMethod: item.deliveryMethod || (isLocal ? 'pickup' : 'delivery'),
                    isLocalVendor: isLocal,
                    pickupAvailable: winner.pickupAvailable ?? isLocal,
                    localStoreName: winner.localStoreName || ''
                };
            });

            const newTotal = Math.round(updatedItems.reduce((sum, i) => sum + i.totalPrice, 0) * 100) / 100;

            // Rebuild vendor sub-orders
            const vendorGroups: Record<string, { vendorName: string; items: MasterPOItem[] }> = {};
            updatedItems.forEach(item => {
                if (!vendorGroups[item.vendorId]) {
                    vendorGroups[item.vendorId] = { vendorName: item.vendorName, items: [] };
                }
                vendorGroups[item.vendorId].items.push(item);
            });

            // Update sub-orders in Firestore
            for (const [vId, grp] of Object.entries(vendorGroups)) {
                const existingSO = subOrders.find(so => so.vendorId === vId || so.vendorName === grp.vendorName);
                const isPickup = grp.items.some(i => i.deliveryMethod === 'pickup');
                const grpTotal = Math.round(grp.items.reduce((s, i) => s + i.totalPrice, 0) * 100) / 100;
                const poItems = grp.items.map(gi => ({
                    materialId: gi.materialId || '',
                    name: gi.name,
                    sku: gi.sku || 'N/A',
                    quantity: gi.quantity,
                    unitPrice: gi.unitPrice,
                    totalPrice: gi.totalPrice
                }));

                if (existingSO?.id) {
                    await updateDoc(doc(db, 'purchaseOrders', existingSO.id), sanitizeForFirestore({
                        vendorId: vId,
                        vendorName: grp.vendorName,
                        items: poItems,
                        subtotal: grpTotal,
                        total: grpTotal,
                        deliveryMethod: isPickup ? 'pickup' : 'delivery',
                        pickupLocationName: isPickup ? `${grp.vendorName} (Local Branch)` : '',
                        notes: `Auto-updated sub-order from Master PO — ${isPickup ? 'Hold for Local Pickup' : 'Standard Delivery'}`
                    }));
                } else {
                    await addDoc(collection(db, 'purchaseOrders'), sanitizeForFirestore({
                        organizationId: user.org_id,
                        vendorId: vId,
                        vendorName: grp.vendorName,
                        status: 'draft',
                        items: poItems,
                        subtotal: grpTotal,
                        tax: 0,
                        shipping: 0,
                        total: grpTotal,
                        sentAt: null,
                        createdAt: Timestamp.now(),
                        createdBy: user.uid,
                        masterOrderId: id,
                        deliveryMethod: isPickup ? 'pickup' : 'delivery',
                        pickupLocationName: isPickup ? `${grp.vendorName} (Local Branch)` : '',
                        notes: `Auto-created sub-order from Master PO — ${isPickup ? 'Hold for Local Pickup' : 'Standard Delivery'}`
                    }));
                }
            }

            // Remove obsolete unassigned draft sub-orders
            for (const so of subOrders) {
                if (so.vendorId === '__unassigned__' || so.vendorName === 'Unassigned Vendor') {
                    if (so.id) {
                        await deleteDoc(doc(db, 'purchaseOrders', so.id)).catch(() => {});
                    }
                }
            }

            // Update Master PO doc
            await updateDoc(doc(db, 'masterPurchaseOrders', id), sanitizeForFirestore({
                items: updatedItems,
                subtotal: newTotal,
                total: newTotal,
                sourcingStrategy: strat
            }));

            setMasterOrder(prev => prev ? {
                ...prev,
                items: updatedItems,
                subtotal: newTotal,
                total: newTotal,
                sourcingStrategy: strat
            } : null);

            toast.success('Vendors, prices & fulfillment options auto-populated!');
        } catch (err: any) {
            console.error('Failed to auto-heal master order:', err);
            toast.error('Failed to update vendor routing');
        } finally {
            setReEvaluating(false);
            setAutoHealing(false);
        }
    };

    // Auto-heal on load if unassigned or 0 prices
    useEffect(() => {
        if (!masterOrder || !id || loading || autoHealing) return;
        const needsHealing = masterOrder.items.some(
            i => i.vendorId === '__unassigned__' || !i.unitPrice || i.unitPrice === 0 || !i.alternativeVendors?.length
        );
        if (needsHealing) {
            setAutoHealing(true);
            reEvaluateAllItems();
        }
    }, [masterOrder?.id, loading, orgVendors.length]);

    // Group items by vendor
    const vendorGrouped = useMemo(() => {
        if (!masterOrder) return {};
        const groups: Record<string, {
            vendorName: string;
            items: Array<MasterPOItem & { idx: number }>;
            subtotal: number;
            subOrder?: PurchaseOrder;
            isLocal: boolean;
            deliveryMethod: 'delivery' | 'pickup';
        }> = {};

        masterOrder.items.forEach((item, idx) => {
            const key = item.vendorId;
            if (!groups[key]) {
                const isLoc = item.isLocalVendor ?? (
                    item.vendorName.includes('Home Depot') ||
                    item.vendorName.includes('Ferguson') ||
                    item.vendorName.includes("Lowe's") ||
                    item.vendorName.includes('Johnstone')
                );
                groups[key] = {
                    vendorName: item.vendorName,
                    items: [],
                    subtotal: 0,
                    isLocal: Boolean(isLoc),
                    deliveryMethod: item.deliveryMethod || (isLoc ? 'pickup' : 'delivery')
                };
            }
            groups[key].items.push({ ...item, idx });
            groups[key].subtotal += item.totalPrice;
        });

        // Link sub-orders and check for deliveryMethod overrides
        for (const so of subOrders) {
            const key = so.vendorId || '__unassigned__';
            if (groups[key]) {
                groups[key].subOrder = so;
                if (so.deliveryMethod) {
                    groups[key].deliveryMethod = so.deliveryMethod;
                }
            }
        }
        return groups;
    }, [masterOrder, subOrders]);

    // Toggle Delivery vs Local Pickup for an entire vendor group
    const handleToggleVendorFulfillment = async (vendorId: string, method: 'delivery' | 'pickup') => {
        if (!masterOrder || !id) return;
        const updatedItems = masterOrder.items.map(i => {
            if (i.vendorId === vendorId) {
                return { ...i, deliveryMethod: method };
            }
            return i;
        });

        setMasterOrder(prev => prev ? { ...prev, items: updatedItems } : null);
        await updateDoc(doc(db, 'masterPurchaseOrders', id), sanitizeForFirestore({ items: updatedItems }));

        const group = vendorGrouped[vendorId];
        const so = group?.subOrder || subOrders.find(s => s.vendorId === vendorId || s.vendorName === group?.vendorName);
        if (so?.id) {
            await updateDoc(doc(db, 'purchaseOrders', so.id), sanitizeForFirestore({
                deliveryMethod: method,
                pickupLocationName: method === 'pickup' ? `${group?.vendorName || so.vendorName} (Local Branch)` : '',
                pickupInstructions: method === 'pickup' ? 'Hold for tech will-call pickup at store counter' : ''
            }));
        }
        toast.success(`Fulfillment set to ${method === 'pickup' ? '🏬 Local Pickup (Hold for Tech)' : '🚚 Delivery'} for ${group?.vendorName}`);
    };

    // Toggle Delivery vs Local Pickup for a single item
    const handleToggleItemFulfillment = async (itemIdx: number, method: 'delivery' | 'pickup') => {
        if (!masterOrder || !id) return;
        const updatedItems = [...masterOrder.items];
        updatedItems[itemIdx] = { ...updatedItems[itemIdx], deliveryMethod: method };
        setMasterOrder(prev => prev ? { ...prev, items: updatedItems } : null);
        await updateDoc(doc(db, 'masterPurchaseOrders', id), sanitizeForFirestore({ items: updatedItems }));
        toast.success(`Item set to ${method === 'pickup' ? '🏬 Local Pickup' : '🚚 Delivery'}`);
    };

    const handleChangeVendor = async (itemIdx: number, altVendorId: string) => {
        if (!masterOrder || !id) return;
        const item = masterOrder.items[itemIdx];
        const alt = item.alternativeVendors?.find(v => v.vendorId === altVendorId);
        if (!alt) return;

        const isLocal = Boolean(alt.isLocalVendor ?? (alt.vendorName.includes('Home Depot') || alt.vendorName.includes('Ferguson') || alt.vendorName.includes("Lowe's")));
        const updatedItems = [...masterOrder.items];
        updatedItems[itemIdx] = {
            ...updatedItems[itemIdx],
            vendorId: alt.vendorId,
            vendorName: alt.vendorName,
            unitPrice: alt.unitCost,
            totalPrice: Math.round(alt.unitCost * updatedItems[itemIdx].quantity * 100) / 100,
            vendorProductUrl: alt.vendorProductUrl || '',
            estimatedDeliveryDays: alt.estimatedDeliveryDays ?? (isLocal ? 0 : 2),
            reviewStatus: 'changed',
            routingMethod: 'Manual Override',
            deliveryMethod: isLocal ? 'pickup' : 'delivery',
            isLocalVendor: isLocal,
            pickupAvailable: alt.pickupAvailable ?? isLocal,
            localStoreName: alt.localStoreName || '',
            // Move previous vendor into alternatives
            alternativeVendors: [
                ...(updatedItems[itemIdx].alternativeVendors || []).filter(v => v.vendorId !== alt.vendorId),
                {
                    vendorId: item.vendorId,
                    vendorName: item.vendorName,
                    unitCost: item.unitPrice,
                    estimatedDeliveryDays: item.estimatedDeliveryDays,
                    vendorProductUrl: item.vendorProductUrl || '',
                    isLocalVendor: item.isLocalVendor,
                    pickupAvailable: item.pickupAvailable,
                    localStoreName: item.localStoreName || ''
                }
            ]
        };

        const newSubtotal = Math.round(updatedItems.reduce((s, i) => s + i.totalPrice, 0) * 100) / 100;

        await updateDoc(doc(db, 'masterPurchaseOrders', id), sanitizeForFirestore({
            items: updatedItems,
            subtotal: newSubtotal,
            total: newSubtotal
        }));

        setMasterOrder(prev => prev ? { ...prev, items: updatedItems, subtotal: newSubtotal, total: newSubtotal } : null);
        setChangingVendorIdx(null);
        toast.success(`Switched ${item.name} to ${alt.vendorName}`);
    };

    const handleApproveItem = async (itemIdx: number) => {
        if (!masterOrder || !id) return;
        const updatedItems = [...masterOrder.items];
        updatedItems[itemIdx] = { ...updatedItems[itemIdx], reviewStatus: 'approved' };
        await updateDoc(doc(db, 'masterPurchaseOrders', id), sanitizeForFirestore({ items: updatedItems }));
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
            toast.success(`Dispatched ${subOrders.length} sub-orders across all suppliers!`);
        } catch (err: any) {
            toast.error(`Failed to send: ${err.message}`);
        } finally {
            setSendingAll(false);
        }
    };

    // Save external order number (e.g. from Home Depot online or Ferguson call-in)
    const handleSaveOrderNumber = async () => {
        if (!orderModal.subOrderId) return;
        try {
            await updateDoc(doc(db, 'purchaseOrders', orderModal.subOrderId), {
                externalOrderNumber: orderModal.orderNumber,
                status: 'sent',
                sentAt: Timestamp.now(),
                notes: `Ordered on ${orderModal.vendorName}. Confirmation: ${orderModal.orderNumber}`
            });
            toast.success(`Recorded order #${orderModal.orderNumber} for ${orderModal.vendorName}`);
            setOrderModal({ isOpen: false, vendorName: '', orderNumber: '' });
        } catch (err: any) {
            toast.error(`Failed to save order number: ${err.message}`);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="flex items-center gap-3 text-gray-500">
                    <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
                    <span className="text-lg font-medium">Loading and optimizing master order...</span>
                </div>
            </div>
        );
    }

    if (!masterOrder) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center bg-white p-8 rounded-2xl shadow-sm border border-gray-200 max-w-md">
                    <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
                    <h2 className="text-xl font-bold text-gray-800">Master Order Not Found</h2>
                    <p className="text-sm text-gray-500 mt-1">This order may have been removed or belongs to another organization.</p>
                    <Link to="/purchase-orders" className="text-blue-600 font-semibold hover:underline mt-4 block">← Back to Purchase Orders</Link>
                </div>
            </div>
        );
    }

    const statusCfg = STATUS_CONFIG[masterOrder.status] || STATUS_CONFIG.draft;
    const approvedCount = masterOrder.items.filter(i => i.reviewStatus === 'approved').length;
    const vendorCount = Object.keys(vendorGrouped).length;
    const allApproved = approvedCount === masterOrder.items.length;
    const canSendAll = allApproved || masterOrder.status === 'approved';

    // Count local pickups vs deliveries
    const localPickupCount = Object.values(vendorGrouped).filter(g => g.deliveryMethod === 'pickup').length;
    const deliveryCount = vendorCount - localPickupCount;

    return (
        <div className="min-h-screen bg-gray-50">
            {/* ── Top Header ── */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
                <div className="max-w-7xl mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => navigate('/purchase-orders')}
                                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700 transition-colors"
                                title="Back to Purchase Orders"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <div>
                                <div className="flex items-center gap-3">
                                    <h1 className="text-xl font-bold text-gray-900">Master Order Review</h1>
                                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${statusCfg.bg} ${statusCfg.text}`}>
                                        {statusCfg.label}
                                    </span>
                                    {autoHealing && (
                                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 flex items-center gap-1 animate-pulse">
                                            <Sparkles className="w-3 h-3 text-blue-600" /> Auto-optimizing items...
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                    <p className="text-sm text-gray-500">
                                        {masterOrder.items.length} items · {vendorCount} vendor{vendorCount !== 1 ? 's' : ''} · Strategy:
                                    </p>
                                    <select
                                        value={masterOrder.sourcingStrategy}
                                        onChange={async (e) => {
                                            const newStrategy = e.target.value as SourcingStrategy;
                                            reEvaluateAllItems(newStrategy);
                                        }}
                                        className="text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md px-2 py-1 cursor-pointer hover:bg-indigo-100 transition-colors"
                                    >
                                        {Object.entries(STRATEGY_LABELS).map(([key, label]) => (
                                            <option key={key} value={key}>{label}</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => reEvaluateAllItems()}
                                        disabled={reEvaluating}
                                        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-0.5 rounded hover:bg-indigo-50 transition-colors"
                                        title="Re-run vendor procurement logic to get the freshest supplier prices and stock"
                                    >
                                        <RefreshCw className={`w-3 h-3 ${reEvaluating ? 'animate-spin' : ''}`} />
                                        Re-evaluate
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Top Action Buttons */}
                        <div className="flex items-center gap-3">
                            {!allApproved && masterOrder.status === 'review' && (
                                <button
                                    onClick={handleApproveAll}
                                    disabled={approvingAll}
                                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 shadow-sm"
                                >
                                    <ShieldCheck className="w-4 h-4" />
                                    {approvingAll ? 'Approving...' : `Approve All (${masterOrder.items.length})`}
                                </button>
                            )}
                            {canSendAll && masterOrder.status !== 'sent' && masterOrder.status !== 'completed' && (
                                <button
                                    onClick={handleSendAll}
                                    disabled={sendingAll}
                                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 shadow-sm"
                                >
                                    <Send className="w-4 h-4" />
                                    {sendingAll ? 'Dispatching...' : `Order All from Multiple Sites (${vendorCount})`}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 py-6">
                {/* ── Stats Summary ── */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3.5 shadow-sm">
                        <div className="w-11 h-11 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                            <Package className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-gray-900">{masterOrder.items.length}</p>
                            <p className="text-xs text-gray-500 font-medium">Total Items</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3.5 shadow-sm">
                        <div className="w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                            <DollarSign className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-emerald-700">${masterOrder.total.toFixed(2)}</p>
                            <p className="text-xs text-gray-500 font-medium">Total Estimated Cost</p>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3.5 shadow-sm">
                        <div className="w-11 h-11 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                            <Store className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-gray-900">{vendorCount}</p>
                            <p className="text-xs text-gray-500 font-medium">
                                {localPickupCount > 0 ? `${localPickupCount} Local Pickup · ` : ''}{deliveryCount} Delivery
                            </p>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3.5 shadow-sm">
                        <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-gray-900">{approvedCount}/{masterOrder.items.length}</p>
                            <p className="text-xs text-gray-500 font-medium">Items Reviewed</p>
                        </div>
                    </div>
                </div>

                {/* ── Sub-Orders Grouped by Vendor ── */}
                <div className="space-y-5">
                    {Object.entries(vendorGrouped).map(([vendorId, group]) => {
                        const isExpanded = expandedVendor === vendorId || expandedVendor === null;
                        const subOrder = group.subOrder;
                        const subStatus = subOrder?.status || 'draft';
                        const subStatusCfg = subStatus === 'sent'
                            ? { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Ordered / Sent' }
                            : subStatus === 'draft'
                            ? { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Draft Sub-Order' }
                            : { bg: 'bg-blue-100', text: 'text-blue-700', label: subStatus.replace(/_/g, ' ') };

                        const isLocal = group.isLocal;
                        const fulfillment = group.deliveryMethod;

                        // Find first item URL or generate search query for vendor button
                        const vendorSiteUrl = group.items[0]?.vendorProductUrl || '';

                        return (
                            <div key={vendorId} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-all">
                                {/* Vendor Card Header */}
                                <div
                                    className="px-5 py-4 flex flex-wrap items-center justify-between gap-4 cursor-pointer hover:bg-gray-50/75 transition-colors border-b border-gray-100"
                                    onClick={() => setExpandedVendor(isExpanded && expandedVendor !== null ? vendorId : (expandedVendor === vendorId ? null : vendorId))}
                                >
                                    <div className="flex items-center gap-3.5">
                                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white font-bold text-base shadow-sm">
                                            {group.vendorName.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-base font-bold text-gray-900">{group.vendorName}</h3>
                                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${subStatusCfg.bg} ${subStatusCfg.text}`}>
                                                    {subStatusCfg.label}
                                                </span>
                                                {isLocal && (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-0.5">
                                                        <Store className="w-2.5 h-2.5" /> Local Branch
                                                    </span>
                                                )}
                                                {subOrder?.id && (
                                                    <Link
                                                        to={`/purchase-orders/${subOrder.id}`}
                                                        className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-0.5 ml-1 font-medium"
                                                        onClick={e => e.stopPropagation()}
                                                    >
                                                        PO #{subOrder.id.slice(0, 6)} <ExternalLink className="w-2.5 h-2.5" />
                                                    </Link>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                {group.items.length} item{group.items.length !== 1 ? 's' : ''} to purchase
                                                {subOrder?.externalOrderNumber && (
                                                    <span className="text-emerald-700 font-semibold ml-2">
                                                        • Order Ref: {subOrder.externalOrderNumber}
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Middle: Fulfillment Toggle (Delivery vs Local Pickup) */}
                                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                        <div className="inline-flex p-1 bg-gray-100 rounded-lg border border-gray-200 text-xs font-semibold">
                                            <button
                                                type="button"
                                                onClick={() => handleToggleVendorFulfillment(vendorId, 'delivery')}
                                                className={`px-3 py-1 rounded-md flex items-center gap-1.5 transition-all ${
                                                    fulfillment === 'delivery'
                                                        ? 'bg-white text-gray-900 shadow-xs'
                                                        : 'text-gray-500 hover:text-gray-700'
                                                }`}
                                            >
                                                <Truck className="w-3.5 h-3.5 text-blue-600" />
                                                <span>Delivery</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleToggleVendorFulfillment(vendorId, 'pickup')}
                                                className={`px-3 py-1 rounded-md flex items-center gap-1.5 transition-all ${
                                                    fulfillment === 'pickup'
                                                        ? 'bg-emerald-600 text-white shadow-xs'
                                                        : 'text-gray-500 hover:text-gray-700'
                                                }`}
                                            >
                                                <Store className="w-3.5 h-3.5" />
                                                <span>Local Pickup</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Right side: Subtotal & Quick Actions */}
                                    <div className="flex items-center gap-4" onClick={e => e.stopPropagation()}>
                                        <div className="text-right">
                                            <span className="text-xs text-gray-400 block font-medium">Subtotal</span>
                                            <span className="text-lg font-bold text-gray-900">${group.subtotal.toFixed(2)}</span>
                                        </div>

                                        {/* Multi-site ordering button */}
                                        {vendorSiteUrl && (
                                            <a
                                                href={vendorSiteUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold transition-colors"
                                                title={`Open ${group.vendorName} site to order`}
                                            >
                                                <span>Order on {group.vendorName.split(' ')[0]}</span>
                                                <ExternalLink className="w-3 h-3" />
                                            </a>
                                        )}

                                        {/* Record External Order Number button */}
                                        <button
                                            onClick={() => setOrderModal({
                                                isOpen: true,
                                                subOrderId: subOrder?.id,
                                                vendorName: group.vendorName,
                                                orderNumber: subOrder?.externalOrderNumber || ''
                                            })}
                                            className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-colors"
                                            title="Record external confirmation #"
                                        >
                                            {subOrder?.externalOrderNumber ? 'Edit Ref #' : 'Mark Ordered'}
                                        </button>

                                        <div onClick={() => setExpandedVendor(isExpanded && expandedVendor !== null ? vendorId : (expandedVendor === vendorId ? null : vendorId))}>
                                            {isExpanded && expandedVendor !== null ? (
                                                <ChevronUp className="w-5 h-5 text-gray-400" />
                                            ) : (
                                                <ChevronDown className="w-5 h-5 text-gray-400" />
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Local Pickup Banner if selected */}
                                {fulfillment === 'pickup' && (
                                    <div className="bg-emerald-50/70 border-b border-emerald-100 px-5 py-2.5 flex items-center justify-between text-xs text-emerald-800">
                                        <div className="flex items-center gap-2 font-medium">
                                            <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                                            <span>
                                                <strong>Store Will-Call Pickup:</strong> Technician can pick up items at local branch counter once ordered.
                                            </span>
                                        </div>
                                        <span className="text-[11px] bg-emerald-200/60 text-emerald-900 px-2 py-0.5 rounded font-semibold">
                                            Ready for pickup in ~2 hrs
                                        </span>
                                    </div>
                                )}

                                {/* Items Table */}
                                {isExpanded && (
                                    <div>
                                        <table className="w-full">
                                            <thead>
                                                <tr className="bg-gray-50/80 text-[11px] uppercase tracking-wider text-gray-500 font-semibold border-b border-gray-100">
                                                    <th className="text-left px-5 py-3">Item / Description</th>
                                                    <th className="text-left px-3 py-3">SKU</th>
                                                    <th className="text-center px-3 py-3">Qty</th>
                                                    <th className="text-right px-3 py-3">Unit Price</th>
                                                    <th className="text-right px-3 py-3">Total</th>
                                                    <th className="text-center px-3 py-3">Sourcing Rule</th>
                                                    <th className="text-center px-3 py-3">Fulfillment</th>
                                                    <th className="text-center px-3 py-3">Status</th>
                                                    <th className="text-center px-3 py-3 w-28">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {group.items.map((item) => {
                                                    const routingColor = ROUTING_COLORS[item.routingMethod] || 'bg-gray-100 text-gray-600';
                                                    const isChanging = changingVendorIdx === item.idx;
                                                    const itemFulfillment = item.deliveryMethod || fulfillment;

                                                    return (
                                                        <React.Fragment key={item.idx}>
                                                            <tr className="hover:bg-gray-50/60 transition-colors">
                                                                <td className="px-5 py-3">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-sm font-semibold text-gray-900">{item.name}</span>
                                                                        {item.vendorProductUrl && (
                                                                            <a
                                                                                href={item.vendorProductUrl}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                className="text-blue-600 hover:text-blue-800 flex items-center gap-0.5 text-xs font-medium ml-1 shrink-0"
                                                                                title="View item on supplier website"
                                                                            >
                                                                                Search <ExternalLink className="w-3 h-3" />
                                                                            </a>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="px-3 py-3 text-xs text-gray-500 font-mono">{item.sku}</td>
                                                                <td className="px-3 py-3 text-center text-sm font-bold text-gray-800">{item.quantity}</td>
                                                                <td className="px-3 py-3 text-right text-sm text-gray-700 font-medium">
                                                                    ${item.unitPrice.toFixed(2)}
                                                                </td>
                                                                <td className="px-3 py-3 text-right text-sm font-bold text-gray-900">
                                                                    ${item.totalPrice.toFixed(2)}
                                                                </td>
                                                                <td className="px-3 py-3 text-center">
                                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${routingColor}`}>
                                                                        {item.routingMethod}
                                                                    </span>
                                                                </td>
                                                                <td className="px-3 py-3 text-center">
                                                                    {itemFulfillment === 'pickup' ? (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleToggleItemFulfillment(item.idx, 'delivery')}
                                                                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded transition-colors"
                                                                            title="Click to switch to delivery"
                                                                        >
                                                                            <Store className="w-3 h-3" /> Will-Call Pickup
                                                                        </button>
                                                                    ) : (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleToggleItemFulfillment(item.idx, 'pickup')}
                                                                            className="inline-flex items-center gap-1 text-[11px] text-gray-600 bg-gray-50 hover:bg-gray-100 px-2 py-0.5 rounded transition-colors"
                                                                            title="Click to switch to local pickup"
                                                                        >
                                                                            <Truck className="w-3 h-3 text-blue-500" />
                                                                            {item.estimatedDeliveryDays || 2}d Delivery
                                                                        </button>
                                                                    )}
                                                                </td>
                                                                <td className="px-3 py-3 text-center">
                                                                    {item.reviewStatus === 'approved' ? (
                                                                        <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-semibold">
                                                                            <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                                                                        </span>
                                                                    ) : item.reviewStatus === 'changed' ? (
                                                                        <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-medium">
                                                                            <Edit2 className="w-3.5 h-3.5" /> Modified
                                                                        </span>
                                                                    ) : (
                                                                        <span className="inline-flex items-center gap-1 text-gray-400 text-xs">
                                                                            <Clock className="w-3.5 h-3.5" /> Pending
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className="px-3 py-3 text-center">
                                                                    <div className="flex items-center justify-center gap-1.5">
                                                                        {item.reviewStatus !== 'approved' && (
                                                                            <button
                                                                                onClick={() => handleApproveItem(item.idx)}
                                                                                className="p-1.5 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-colors"
                                                                                title="Approve item"
                                                                            >
                                                                                <Check className="w-4 h-4" />
                                                                            </button>
                                                                        )}
                                                                        <button
                                                                            onClick={() => setChangingVendorIdx(isChanging ? null : item.idx)}
                                                                            className={`p-1.5 rounded-lg transition-colors ${
                                                                                isChanging ? 'bg-blue-100 text-blue-800' : 'hover:bg-blue-50 text-blue-600'
                                                                            }`}
                                                                            title="Change vendor or view alternative prices"
                                                                        >
                                                                            <RefreshCw className="w-4 h-4" />
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>

                                                            {/* Alternative Vendors Selection Tray */}
                                                            {isChanging && (
                                                                <tr>
                                                                    <td colSpan={9} className="px-5 py-4 bg-gradient-to-r from-blue-50/60 to-indigo-50/60 border-y border-blue-100">
                                                                        <div className="flex items-center justify-between mb-3">
                                                                            <div className="flex items-center gap-2">
                                                                                <RefreshCw className="w-4 h-4 text-blue-600" />
                                                                                <span className="text-xs font-bold text-blue-900">
                                                                                    Select Vendor / Price for: {item.name}
                                                                                </span>
                                                                            </div>
                                                                            <button
                                                                                onClick={() => setChangingVendorIdx(null)}
                                                                                className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                                                                            >
                                                                                Close
                                                                            </button>
                                                                        </div>

                                                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                                            {(item.alternativeVendors || []).map(alt => (
                                                                                <div
                                                                                    key={alt.vendorId}
                                                                                    className="bg-white rounded-xl border border-blue-200/80 p-3 hover:border-blue-400 hover:shadow-xs transition-all flex flex-col justify-between"
                                                                                >
                                                                                    <div>
                                                                                        <div className="flex items-center justify-between">
                                                                                            <span className="text-sm font-bold text-gray-900 truncate">
                                                                                                {alt.vendorName}
                                                                                            </span>
                                                                                            {alt.isLocalVendor && (
                                                                                                <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                                                                                    <Store className="w-2.5 h-2.5" /> Pickup
                                                                                                </span>
                                                                                            )}
                                                                                        </div>
                                                                                        <div className="text-xs text-gray-500 flex items-center gap-2 mt-1">
                                                                                            <span className="text-sm font-extrabold text-gray-900">
                                                                                                ${alt.unitCost.toFixed(2)}
                                                                                            </span>
                                                                                            <span className="text-gray-400">/unit</span>
                                                                                            <span>•</span>
                                                                                            <span className="text-gray-600">
                                                                                                {alt.estimatedDeliveryDays === 0 ? 'Same day pickup' : `${alt.estimatedDeliveryDays || 2}d delivery`}
                                                                                            </span>
                                                                                        </div>
                                                                                    </div>

                                                                                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
                                                                                        {alt.vendorProductUrl ? (
                                                                                            <a
                                                                                                href={alt.vendorProductUrl}
                                                                                                target="_blank"
                                                                                                rel="noopener noreferrer"
                                                                                                className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"
                                                                                            >
                                                                                                View product <ExternalLink className="w-2.5 h-2.5" />
                                                                                            </a>
                                                                                        ) : <div />}
                                                                                        <button
                                                                                            onClick={() => handleChangeVendor(item.idx, alt.vendorId)}
                                                                                            className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold transition-colors"
                                                                                        >
                                                                                            Switch to this
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </tbody>
                                            <tfoot>
                                                <tr className="bg-gray-50/80 font-bold border-t border-gray-200">
                                                    <td colSpan={4} className="px-5 py-3 text-sm text-gray-700 text-right">
                                                        Subtotal for {group.vendorName}:
                                                    </td>
                                                    <td className="px-3 py-3 text-right text-base text-gray-900">
                                                        ${group.subtotal.toFixed(2)}
                                                    </td>
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
                <div className="mt-8 bg-white rounded-xl border border-gray-200 p-6 flex flex-wrap items-center justify-between gap-4 shadow-sm">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-base font-bold text-gray-900">Master Order Summary</span>
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">
                                ID: {id?.slice(0, 10)}
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                            {masterOrder.notes || `Created on ${masterOrder.createdAt?.toDate?.() ? masterOrder.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'today'}`}
                        </p>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="text-right">
                            <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Total across all vendors</p>
                            <p className="text-3xl font-extrabold text-gray-900">${masterOrder.total.toFixed(2)}</p>
                        </div>

                        {canSendAll && masterOrder.status !== 'sent' && (
                            <button
                                onClick={handleSendAll}
                                disabled={sendingAll}
                                className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-base transition-colors shadow-md disabled:opacity-50 cursor-pointer"
                            >
                                <Send className="w-5 h-5" />
                                {sendingAll ? 'Processing Orders...' : 'Place All Orders Now'}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Modal to record external order confirmation number ── */}
            {orderModal.isOpen && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-gray-900">Record External Order</h3>
                            <button
                                onClick={() => setOrderModal({ isOpen: false, vendorName: '', orderNumber: '' })}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <p className="text-sm text-gray-600 mb-4">
                            If you placed this order directly on <strong>{orderModal.vendorName}</strong>'s website or over the phone, enter the confirmation/order reference number below:
                        </p>
                        <input
                            type="text"
                            value={orderModal.orderNumber}
                            onChange={e => setOrderModal(prev => ({ ...prev, orderNumber: e.target.value }))}
                            placeholder="e.g. HD-9812458 or PO-FERG-882"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none mb-4 font-mono"
                            autoFocus
                        />
                        <div className="flex items-center justify-end gap-2">
                            <button
                                onClick={() => setOrderModal({ isOpen: false, vendorName: '', orderNumber: '' })}
                                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveOrderNumber}
                                disabled={!orderModal.orderNumber.trim()}
                                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold disabled:opacity-50"
                            >
                                Save & Mark Ordered
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
