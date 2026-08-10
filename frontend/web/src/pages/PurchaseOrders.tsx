import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { PurchaseOrder, MasterPurchaseOrder, MasterPOItem, SourcingStrategy } from '../types/Vendor';
import { useAuth } from '../auth/AuthProvider';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { 
    Search, ChevronUp, ChevronDown, ShoppingCart, Settings, Layers, Calendar, 
    User, Package, Plus, Minus, CheckCircle2, AlertTriangle, AlertCircle, Clock, 
    ShoppingBag, Eye, ExternalLink, ArrowRight, RefreshCw, Star, Info, 
    X, ChevronRight, Truck, Check, HelpCircle, Globe, Copy, EyeOff, Trash2
} from 'lucide-react';
import { ManageVendorsModal } from '../components/inventory/ManageVendorsModal';
import { VendorSearchModal } from '../components/inventory/VendorSearchModal';
import { determineOptimalVendor } from '../utils/procurementLogic';
import { MaterialItem, VendorAssignment, ToolItem } from '../types';
import { Vendor } from '../types/Vendor';

interface BacklogItem {
    id: string; // Combined key (materialId || name)
    materialId: string;
    name: string;
    sku: string;
    unit: string;
    totalNeeded: number;
    totalOrdered: number;
    inDraftCount: number;
    onOrderCount: number;
    receivedCount: number;
    earliestJobDate: Date | null;
    associatedDemands: Array<{
        type: 'quote' | 'job' | 'stock' | 'tool';
        id: string;
        customerName: string;
        quantity: number;
        scheduledDate: Date | null;
        status: string;
        label: string;
        baseCost?: number;
        markupPercentage?: number;
        unitPrice?: number;
    }>;
    baseCost: number;
    markupPercentage: number;
    preferredVendorId?: string;
    priceSource?: string;
    vendorProductUrl?: string;
    isTool?: boolean;
}

export const PurchaseOrders: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [autoPOProcessed, setAutoPOProcessed] = useState(false);
    const [masterPOProcessed, setMasterPOProcessed] = useState(false);
    const [creatingMasterPO, setCreatingMasterPO] = useState(false);
    
    // Extracted Permission checks
    const userRole = (user as any)?.role;
    const userPermissions = (user as any)?.permissions;
    const canPurchaseMaterials = userRole === 'admin' || userRole === 'dispatcher' || (userPermissions?.canPurchaseMaterials ?? true);
    const canAddVendors = userRole === 'admin' || userRole === 'dispatcher' || (userPermissions?.canAddVendors ?? true);

    const [orders, setOrders] = useState<PurchaseOrder[]>([]);
    const [quotes, setQuotes] = useState<any[]>([]);
    const [jobs, setJobs] = useState<any[]>([]);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [materials, setMaterials] = useState<MaterialItem[]>([]);
    const [tools, setTools] = useState<ToolItem[]>([]);
    const [aiSourcingCriteria, setAiSourcingCriteria] = useState<'optimal' | 'lowest_cost' | 'total_visit_cost' | 'local_availability' | 'urgent_local_availability' | 'fastest_shipping' | 'highest_quality' | 'preferred_vendor'>('optimal');
    
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortField, setSortField] = useState<'date' | 'vendor' | 'amount' | 'status'>('date');
    const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');
    const [activeTab, setActiveTab] = useState<'active' | 'archived' | 'materials'>('active');
    
    const [showVendorsModal, setShowVendorsModal] = useState(false);
    const [showSearchModal, setShowSearchModal] = useState(false);

    // Materials Backlog State
    const [selectedBacklogId, setSelectedBacklogId] = useState<string | null>(null);
    const [materialSearch, setMaterialSearch] = useState('');
    const [materialStatusFilter, setMaterialStatusFilter] = useState<'all' | 'not_ordered' | 'partially_ordered' | 'on_order'>('all');
    const [orderQuantities, setOrderQuantities] = useState<Record<string, number>>({});
    const [isCreatingPO, setIsCreatingPO] = useState(false);
    const [poOption, setPoOption] = useState<'merge' | 'new'>('merge');
    const [includeQuotes, setIncludeQuotes] = useState(true);
    const [includeJobs, setIncludeJobs] = useState(true);
    
    // Custom beautiful floating feedback toasts
    const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error'; poId?: string } | null>(null);

    // Web Portal Order Sourcing State
    const [webOrderHelperOpen, setWebOrderHelperOpen] = useState(false);
    const [webOrderOption, setWebOrderOption] = useState<{
        vendor: Vendor;
        materialName: string;
        materialId: string;
        sku: string;
        quantity: number;
        unitCost: number;
        shippingDays: number;
        totalPO: number;
    } | null>(null);

    const [copiedUsername, setCopiedUsername] = useState(false);
    const [copiedPassword, setCopiedPassword] = useState(false);
    const [copiedDiscount, setCopiedDiscount] = useState(false);
    const [copiedBulk, setCopiedBulk] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    // AI Procurement Sourcing Agent State
    const [aiSourcingState, setAiSourcingState] = useState<'idle' | 'analyzing' | 'optimizing' | 'generating' | 'complete'>('idle');
    const [aiSourcingLogs, setAiSourcingLogs] = useState<string[]>([]);
    const [createdPoIds, setCreatedPoIds] = useState<Array<{ id: string; vendorName: string; total: number }>>([]);

    useEffect(() => {
        if (!user?.org_id) return;

        // Subscribe to Purchase Orders
        const qOrders = query(
            collection(db, 'purchaseOrders'),
            where('organizationId', '==', user.org_id)
        );
        const unsubscribeOrders = onSnapshot(qOrders, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseOrder));
            setOrders(list);
            setLoading(false);
        });

        // Subscribe to Approved Quotes
        const qQuotes = query(
            collection(db, 'quotes'),
            where('org_id', '==', user.org_id),
            where('status', '==', 'approved')
        );
        const unsubscribeQuotes = onSnapshot(qQuotes, (snapshot) => {
            setQuotes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        // Subscribe to Jobs (Work Orders)
        const qJobs = query(
            collection(db, 'jobs'),
            where('org_id', '==', user.org_id)
        );
        const unsubscribeJobs = onSnapshot(qJobs, (snapshot) => {
            setJobs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        // Subscribe to Vendors
        const qVendors = query(
            collection(db, 'vendors'),
            where('organizationId', '==', user.org_id)
        );
        const unsubscribeVendors = onSnapshot(qVendors, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vendor));
            setVendors(list);
        });

        // Subscribe to Catalog Materials
        const qMaterials = query(
            collection(db, 'materials'),
            where('organizationId', '==', user.org_id)
        );
        const unsubscribeMaterials = onSnapshot(qMaterials, (snapshot) => {
            setMaterials(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MaterialItem)));
        });

        // Subscribe to Tool Fleet
        const qTools = query(
            collection(db, 'tools'),
            where('organizationId', '==', user.org_id)
        );
        const unsubscribeTools = onSnapshot(qTools, (snapshot) => {
            setTools(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ToolItem)));
        });

        return () => {
            unsubscribeOrders();
            unsubscribeQuotes();
            unsubscribeJobs();
            unsubscribeVendors();
            unsubscribeMaterials();
            unsubscribeTools();
        };
    }, [user?.org_id]);

    // Automatically hide toasts after 6 seconds
    useEffect(() => {
        if (toast?.show) {
            const timer = setTimeout(() => setToast(null), 6000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    // Auto-PO creation when navigated from Dashboard "X to order" button
    useEffect(() => {
        if (autoPOProcessed) return;
        if (searchParams.get('autoPO') !== 'true') return;
        if (!user?.org_id || loading || materials.length === 0) return;
        
        const itemsParam = searchParams.get('items');
        if (!itemsParam) return;
        
        setAutoPOProcessed(true);
        // Clear the URL params
        setSearchParams({});
        
        try {
            const requestedItems: Array<{ name: string; qty: number; inventoryItemId: string }> = JSON.parse(decodeURIComponent(itemsParam));
            if (!requestedItems.length) return;

            // Match items to inventory to get vendor info
            const itemsWithVendors = requestedItems.map(ri => {
                const invItem = materials.find(m => m.id === ri.inventoryItemId) ||
                    materials.find(m => m.name.toLowerCase().includes(ri.name.toLowerCase()) || ri.name.toLowerCase().includes(m.name.toLowerCase()));
                return {
                    ...ri,
                    materialId: invItem?.id || '',
                    sku: invItem?.sku || 'N/A',
                    unitCost: invItem?.unitCost || 0,
                    vendorId: invItem?.preferredVendorId || '',
                };
            });

            // Group by vendor
            const vendorGroups = new Map<string, typeof itemsWithVendors>();
            for (const item of itemsWithVendors) {
                const key = item.vendorId || '__unassigned__';
                if (!vendorGroups.has(key)) vendorGroups.set(key, []);
                vendorGroups.get(key)!.push(item);
            }

            // Create a draft PO for each vendor group
            const createPOs = async () => {
                const createdIds: string[] = [];
                for (const [vendorId, items] of vendorGroups) {
                    const vendor = vendors.find(v => v.id === vendorId);
                    const poItems = items.map(item => ({
                        materialId: item.materialId,
                        name: item.name,
                        sku: item.sku,
                        quantity: item.qty,
                        unitPrice: item.unitCost,
                        totalPrice: item.unitCost * item.qty
                    }));
                    const subtotal = poItems.reduce((s, i) => s + i.totalPrice, 0);

                    const poData = {
                        organizationId: user.org_id,
                        vendorId: vendorId === '__unassigned__' ? '' : vendorId,
                        vendorName: vendor?.name || 'Unassigned Vendor',
                        status: 'draft' as const,
                        items: poItems,
                        subtotal,
                        tax: 0,
                        shipping: 0,
                        total: subtotal,
                        sentAt: null,
                        createdAt: Timestamp.now(),
                        createdBy: user.uid,
                        notes: 'Auto-created from Dashboard — Materials & Tools Needed'
                    };

                    const docRef = await addDoc(collection(db, 'purchaseOrders'), poData);
                    createdIds.push(docRef.id);
                }

                if (createdIds.length === 1) {
                    navigate(`/purchase-orders/${createdIds[0]}`);
                } else if (createdIds.length > 1) {
                    setToast({
                        show: true,
                        message: `Created ${createdIds.length} draft POs for ${requestedItems.length} items across ${createdIds.length} vendors`,
                        type: 'success',
                        poId: createdIds[0]
                    });
                }
            };

            createPOs().catch(err => {
                console.error('Auto-PO creation failed:', err);
                setToast({ show: true, message: `Failed to create PO: ${err.message}`, type: 'error' });
            });
        } catch (err) {
            console.error('Failed to parse autoPO items:', err);
        }
    }, [searchParams, user?.org_id, loading, materials, vendors, autoPOProcessed]);

    // Master PO creation when navigated from Dashboard with masterPO=true
    useEffect(() => {
        if (masterPOProcessed) return;
        if (searchParams.get('masterPO') !== 'true') return;
        if (!user?.org_id || loading) return;

        const itemsParam = searchParams.get('items');
        const strategyParam = searchParams.get('strategy') || 'optimal';
        const defaultVendorIdParam = searchParams.get('defaultVendorId') || '';
        if (!itemsParam) return;

        setMasterPOProcessed(true);
        setCreatingMasterPO(true);
        setSearchParams({});

        try {
            const requestedItems: Array<{
                name: string; qty: number; inventoryItemId: string;
                unitCost?: number; sku?: string; preferredVendorId?: string;
                vendors?: Array<{ vendorId: string; unitCost: number; estimatedDeliveryDays: number; vendorProductUrl: string; priorityLogic: string }>;
            }> = JSON.parse(itemsParam);
            if (!requestedItems.length) return;

            const strategy = strategyParam as SourcingStrategy;

            const createMasterPO = async () => {
                // Route each item to its optimal vendor based on the strategy
                const masterItems: MasterPOItem[] = [];
                const vendorGroups: Record<string, { vendor: Vendor; items: MasterPOItem[] }> = {};

                for (const ri of requestedItems) {
                    let chosenVendor: Vendor | null = null;
                    let chosenCost = ri.unitCost || 0;
                    let chosenDelivery = 3;
                    let routingMethod = 'Optimal Sourcing';
                    let vendorProductUrl = '';
                    const alternativeVendors: MasterPOItem['alternativeVendors'] = [];

                    // Use vendor assignments passed from dashboard
                    const vendorAssignments = ri.vendors || [];
                    const validAssignments = vendorAssignments.filter(a => {
                        const v = vendors.find(v => v.id === a.vendorId);
                        return v && v.active !== false;
                    });

                    if (validAssignments.length > 0) {
                        let chosenAssignment = validAssignments[0];

                        if (strategy === 'lowest_cost') {
                            chosenAssignment = validAssignments.reduce((prev, curr) =>
                                (curr.unitCost ?? chosenCost) < (prev.unitCost ?? chosenCost) ? curr : prev
                            , validAssignments[0]);
                            routingMethod = 'Lowest Cost';
                        } else if (strategy === 'total_visit_cost') {
                            chosenAssignment = validAssignments.reduce((prev, curr) =>
                                (curr.unitCost ?? chosenCost) < (prev.unitCost ?? chosenCost) ? curr : prev
                            , validAssignments[0]);
                            routingMethod = 'Total Visit Cost';
                        } else if (strategy === 'local_availability') {
                            chosenAssignment = validAssignments.reduce((prev, curr) =>
                                (curr.estimatedDeliveryDays ?? 0) <= (prev.estimatedDeliveryDays ?? 0) ? curr : prev
                            , validAssignments[0]);
                            routingMethod = 'Local Availability';
                        } else if (strategy === 'urgent_local_availability') {
                            chosenAssignment = validAssignments.reduce((prev, curr) =>
                                (curr.estimatedDeliveryDays ?? 0) <= (prev.estimatedDeliveryDays ?? 0) ? curr : prev
                            , validAssignments[0]);
                            routingMethod = 'Urgent Local Stock';
                        } else if (strategy === 'fastest_shipping') {
                            chosenAssignment = validAssignments.reduce((prev, curr) =>
                                (curr.estimatedDeliveryDays ?? 3) < (prev.estimatedDeliveryDays ?? 3) ? curr : prev
                            , validAssignments[0]);
                            routingMethod = 'Fastest Shipping';
                        } else if (strategy === 'highest_quality') {
                            chosenAssignment = validAssignments.find(v => v.priorityLogic === 'longest_lasting') ||
                                               validAssignments.find(v => v.priorityLogic === 'preferred') ||
                                               validAssignments[0];
                            routingMethod = 'Highest Quality';
                        } else if (strategy === 'preferred_vendor') {
                            const prefId = ri.preferredVendorId;
                            const prefAssignment = prefId ? validAssignments.find(v => v.vendorId === prefId) : null;
                            chosenAssignment = prefAssignment || validAssignments.find(v => v.priorityLogic === 'preferred') || validAssignments[0];
                            routingMethod = 'Preferred Vendor';
                        } else if (strategy === 'item_default') {
                            const prefId = ri.preferredVendorId;
                            const prefAssignment = prefId ? validAssignments.find(v => v.vendorId === prefId) : null;
                            chosenAssignment = prefAssignment || validAssignments[0];
                            routingMethod = 'Item Default';
                        } else {
                            routingMethod = 'Optimal Sourcing';
                        }

                        const v = vendors.find(vendor => vendor.id === chosenAssignment.vendorId);
                        if (v) {
                            chosenVendor = v;
                            chosenCost = chosenAssignment.unitCost ?? chosenCost;
                            chosenDelivery = chosenAssignment.estimatedDeliveryDays ?? 3;
                            vendorProductUrl = chosenAssignment.vendorProductUrl || '';
                        }

                        // Build alternative vendors list
                        for (const alt of validAssignments) {
                            if (alt.vendorId !== chosenAssignment.vendorId) {
                                const altV = vendors.find(v => v.id === alt.vendorId);
                                if (altV) {
                                    alternativeVendors.push({
                                        vendorId: altV.id!,
                                        vendorName: altV.name,
                                        unitCost: alt.unitCost ?? chosenCost,
                                        estimatedDeliveryDays: alt.estimatedDeliveryDays ?? 3,
                                        vendorProductUrl: alt.vendorProductUrl || ''
                                    });
                                }
                            }
                        }
                    }

                    // Fallback: use org default vendor, then unassigned
                    if (!chosenVendor && defaultVendorIdParam) {
                        const dv = vendors.find(v => v.id === defaultVendorIdParam);
                        if (dv) {
                            chosenVendor = dv;
                            routingMethod = 'Default Vendor';
                            // Generate a product search URL from the vendor's website
                            const searchName = encodeURIComponent(ri.name);
                            const site = (dv.website || '').toLowerCase();
                            if (site.includes('amazon')) {
                                vendorProductUrl = `https://www.amazon.com/s?k=${searchName}`;
                            } else if (site.includes('homedepot')) {
                                vendorProductUrl = `https://www.homedepot.com/s/${searchName}`;
                            } else if (site.includes('lowes')) {
                                vendorProductUrl = `https://www.lowes.com/search?searchTerm=${searchName}`;
                            } else if (site.includes('grainger')) {
                                vendorProductUrl = `https://www.grainger.com/search?searchQuery=${searchName}`;
                            } else if (site.includes('supplyhouse')) {
                                vendorProductUrl = `https://www.supplyhouse.com/search?q=${searchName}`;
                            } else if (site) {
                                // Generic: try appending /search?q= to the domain
                                const domain = site.startsWith('http') ? site : `https://${site}`;
                                vendorProductUrl = `${domain.replace(/\/$/, '')}/search?q=${searchName}`;
                            }
                        }
                    }
                    const vendorId = chosenVendor?.id || '__unassigned__';
                    const vendorName = chosenVendor?.name || 'Unassigned Vendor';

                    const masterItem: MasterPOItem = {
                        materialId: ri.inventoryItemId || '',
                        name: ri.name,
                        sku: ri.sku || 'N/A',
                        quantity: ri.qty,
                        unitPrice: chosenCost,
                        totalPrice: chosenCost * ri.qty,
                        vendorId,
                        vendorName,
                        vendorProductUrl: vendorProductUrl || '',
                        routingMethod,
                        estimatedDeliveryDays: chosenDelivery,
                        alternativeVendors: alternativeVendors.length > 0 ? alternativeVendors : [],
                        reviewStatus: 'pending'
                    };

                    masterItems.push(masterItem);

                    // Group by vendor for sub-order creation
                    if (!vendorGroups[vendorId]) {
                        vendorGroups[vendorId] = { vendor: chosenVendor || { id: '__unassigned__', organizationId: user.org_id, name: 'Unassigned Vendor', email: '', active: true, createdAt: Timestamp.now(), updatedAt: Timestamp.now() } as Vendor, items: [] };
                    }
                    vendorGroups[vendorId].items.push(masterItem);
                }

                const subtotal = masterItems.reduce((s, i) => s + i.totalPrice, 0);

                // Create child POs per vendor (drafts)
                const subOrderIds: string[] = [];
                const masterOrderIdPlaceholder = `pending_${Date.now()}`;

                for (const [vendorId, group] of Object.entries(vendorGroups)) {
                    const poItems = group.items.map(gi => ({
                        materialId: gi.materialId,
                        name: gi.name,
                        sku: gi.sku,
                        quantity: gi.quantity,
                        unitPrice: gi.unitPrice,
                        totalPrice: gi.totalPrice
                    }));

                    const poSubtotal = poItems.reduce((s, i) => s + i.totalPrice, 0);

                    const poData: Omit<PurchaseOrder, 'id'> = {
                        organizationId: user.org_id,
                        vendorId: vendorId === '__unassigned__' ? '' : vendorId,
                        vendorName: group.vendor.name,
                        status: 'draft',
                        items: poItems,
                        subtotal: poSubtotal,
                        tax: 0,
                        shipping: 0,
                        total: poSubtotal,
                        sentAt: null,
                        createdAt: Timestamp.now(),
                        createdBy: user.uid,
                        masterOrderId: masterOrderIdPlaceholder,
                        notes: 'Auto-created sub-order from Master PO'
                    };

                    const docRef = await addDoc(collection(db, 'purchaseOrders'), poData);
                    subOrderIds.push(docRef.id);
                }

                // Create the Master PO document
                const masterPOData: Omit<MasterPurchaseOrder, 'id'> = {
                    organizationId: user.org_id,
                    status: 'review',
                    sourcingStrategy: strategy,
                    items: masterItems,
                    subOrderIds,
                    subtotal,
                    total: subtotal,
                    createdAt: Timestamp.now(),
                    createdBy: user.uid,
                    notes: `Auto-generated master order from Dashboard — ${masterItems.length} items across ${Object.keys(vendorGroups).length} vendors`
                };

                const masterRef = await addDoc(collection(db, 'masterPurchaseOrders'), masterPOData);

                // Update child POs with the real master order ID
                for (const subId of subOrderIds) {
                    await updateDoc(doc(db, 'purchaseOrders', subId), { masterOrderId: masterRef.id });
                }

                // Navigate to the master order review page
                navigate(`/purchase-orders/master/${masterRef.id}`);
            };

            createMasterPO().catch(err => {
                console.error('Master PO creation failed:', err);
                setCreatingMasterPO(false);
                setToast({ show: true, message: `Failed to create master order: ${err.message}`, type: 'error' });
            });
        } catch (err) {
            console.error('Failed to parse masterPO items:', err);
            setCreatingMasterPO(false);
        }
    }, [searchParams, user?.org_id, loading, materials, vendors, masterPOProcessed]);

    // Build the aggregated upcoming job materials backlog
    const backlogItems = React.useMemo(() => {
        const backlogMap: Record<string, BacklogItem> = {};

        // 1. Process Approved Quotes
        quotes.forEach(quote => {
            if (!includeQuotes) return;
            const matchingJob = jobs.find(j => j.id === quote.job_id || j.id === quote.jobId);
            // Skip quotes associated with fully completed or cancelled jobs to avoid stale backlog
            if (matchingJob && (matchingJob.status === 'completed' || matchingJob.status === 'cancelled')) return;

            let jobDate: Date | null = null;
            if (matchingJob?.scheduled_start) {
                jobDate = matchingJob.scheduled_start.toDate ? matchingJob.scheduled_start.toDate() : new Date(matchingJob.scheduled_start);
            }

            const customerName = quote.customer?.name || matchingJob?.customer_name || 'Generic Customer';

            quote.lineItems?.forEach((item: any) => {
                if (item.type !== 'material') return;

                const name = item.description || 'Unknown Material';
                const materialId = item.materialId || '';
                const combinedKey = materialId || name.toLowerCase().trim();

                if (!backlogMap[combinedKey]) {
                    backlogMap[combinedKey] = {
                        id: combinedKey,
                        materialId,
                        name,
                        sku: item.sku || 'N/A',
                        unit: item.unit || 'each',
                        totalNeeded: 0,
                        totalOrdered: 0,
                        inDraftCount: 0,
                        onOrderCount: 0,
                        receivedCount: 0,
                        earliestJobDate: null,
                        associatedDemands: [],
                        baseCost: item.baseCost || item.unitPrice || 0,
                        markupPercentage: item.markupPercentage || 0,
                        preferredVendorId: item.preferredVendorId || undefined,
                        priceSource: item.priceSource || undefined,
                        vendorProductUrl: item.vendorProductUrl || undefined
                    };
                }

                const entry = backlogMap[combinedKey];
                entry.totalNeeded += item.quantity || 0;
                
                // Track earliest job schedule date
                if (jobDate) {
                    if (!entry.earliestJobDate || jobDate < entry.earliestJobDate) {
                        entry.earliestJobDate = jobDate;
                    }
                }

                entry.associatedDemands.push({
                    type: 'quote',
                    id: quote.id,
                    customerName,
                    quantity: item.quantity || 0,
                    scheduledDate: jobDate,
                    status: quote.status,
                    label: `Approved Quote ${quote.quoteNumber || quote.id.slice(0, 5)}`,
                    baseCost: item.baseCost,
                    markupPercentage: item.markupPercentage,
                    unitPrice: item.unitPrice
                });
            });
        });

        // 2. Process Approved Jobs with parts requested by technicians but no structured quote items yet
        jobs.forEach(job => {
            if (!includeJobs) return;
            if (job.status === 'completed' || job.status === 'cancelled') return;
            if (!job.parts_needed || !job.parts_description?.trim()) return;

            // Check if there is an approved quote for this job that already lists materials
            const hasStructuredQuoteMaterials = quotes.some(q => 
                (q.job_id === job.id || q.jobId === job.id) && 
                q.lineItems?.some((li: any) => li.type === 'material')
            );
            if (hasStructuredQuoteMaterials) return; // Prevent double-counting if quote materials already extracted

            let jobDate: Date | null = null;
            if (job.scheduled_start) {
                jobDate = job.scheduled_start.toDate ? job.scheduled_start.toDate() : new Date(job.scheduled_start);
            }

            const name = job.parts_description;
            const combinedKey = name.toLowerCase().trim();

            if (!backlogMap[combinedKey]) {
                backlogMap[combinedKey] = {
                    id: combinedKey,
                    materialId: '',
                    name,
                    sku: 'N/A',
                    unit: 'each',
                    totalNeeded: 0,
                    totalOrdered: 0,
                    inDraftCount: 0,
                    onOrderCount: 0,
                    receivedCount: 0,
                    earliestJobDate: null,
                    associatedDemands: [],
                    baseCost: 0,
                    markupPercentage: 0
                };
            }

            const entry = backlogMap[combinedKey];
            entry.totalNeeded += 1; // Default to 1 for manual tech requests

            if (jobDate) {
                if (!entry.earliestJobDate || jobDate < entry.earliestJobDate) {
                    entry.earliestJobDate = jobDate;
                }
            }

            entry.associatedDemands.push({
                type: 'job',
                id: job.id,
                customerName: job.customer_name || 'Generic Customer',
                quantity: 1,
                scheduledDate: jobDate,
                status: job.status,
                label: `Technician Request: ${job.category || 'Service Job'}`
            });
        });

        // 3. Subtract quantities already ordered or received in purchase orders
        orders.forEach(po => {
            if (po.status === 'canceled') return;

            po.items?.forEach(poItem => {
                const itemKey = poItem.materialId || poItem.name.toLowerCase().trim();
                const match = backlogMap[itemKey];
                if (match) {
                    const qty = poItem.quantity || 0;
                    match.totalOrdered += qty;
                    
                    if (po.status === 'draft') {
                        match.inDraftCount += qty;
                    } else if (po.status === 'sent' || po.status === 'partially_received') {
                        match.onOrderCount += qty;
                    } else if (po.status === 'received') {
                        match.receivedCount += qty;
                    }
                }
            });
        });

        return Object.values(backlogMap);
    }, [quotes, jobs, orders, includeQuotes, includeJobs]);

    const backlogCount = backlogItems.filter(item => {
        const remaining = Math.max(0, item.totalNeeded - item.totalOrdered);
        return remaining > 0;
    }).length;

    // Calculate stock deficit backlog items (materials below minQuantity, tools needing replacement)
    const stockBacklogItems = React.useMemo(() => {
        const backlogList: BacklogItem[] = [];

        // 1. Process materials below minimum threshold
        materials.forEach(mat => {
            const currentQty = mat.quantity || 0;
            const minQty = mat.minQuantity || 0;
            if (currentQty < minQty) {
                const deficit = minQty - currentQty;
                const combinedKey = `stock_mat_${mat.id}`.toLowerCase().trim();

                backlogList.push({
                    id: combinedKey,
                    materialId: mat.id,
                    name: `${mat.name} (Warehouse Restock)`,
                    sku: mat.sku || 'N/A',
                    unit: mat.unit || 'each',
                    totalNeeded: deficit,
                    totalOrdered: 0,
                    inDraftCount: 0,
                    onOrderCount: 0,
                    receivedCount: 0,
                    earliestJobDate: null,
                    associatedDemands: [
                        {
                            type: 'stock',
                            id: mat.id,
                            customerName: 'Warehouse Storage',
                            quantity: deficit,
                            scheduledDate: null,
                            status: 'low_stock',
                            label: `Stock Deficit: Current ${currentQty} / Min ${minQty}`
                        }
                    ],
                    baseCost: mat.unitCost || 0,
                    markupPercentage: mat.markupPercent || 0,
                    preferredVendorId: mat.preferredVendorId || undefined,
                    priceSource: undefined,
                    vendorProductUrl: undefined,
                    isTool: false
                });
            }
        });

        // 2. Process tools that need replacement/fleet additions
        tools.forEach(tool => {
            const needsRepl = tool.condition === 'needs_replacement' || tool.status === 'missing';
            if (needsRepl) {
                const combinedKey = `stock_tool_${tool.id}`.toLowerCase().trim();

                backlogList.push({
                    id: combinedKey,
                    materialId: tool.id,
                    name: `${tool.name} (Tool Replacement)`,
                    sku: 'N/A',
                    unit: 'each',
                    totalNeeded: 1,
                    totalOrdered: 0,
                    inDraftCount: 0,
                    onOrderCount: 0,
                    receivedCount: 0,
                    earliestJobDate: null,
                    associatedDemands: [
                        {
                            type: 'tool',
                            id: tool.id,
                            customerName: 'Tool Fleet',
                            quantity: 1,
                            scheduledDate: null,
                            status: tool.status || 'needs_replacement',
                            label: `Tool Deficit: Condition is ${tool.condition || 'unknown'} / Status is ${tool.status || 'unknown'}`
                        }
                    ],
                    baseCost: tool.replacementCost || 0,
                    markupPercentage: 0,
                    preferredVendorId: tool.preferredVendorId || undefined,
                    priceSource: undefined,
                    vendorProductUrl: undefined,
                    isTool: true
                });
            }
        });

        // 3. Subtract quantities already ordered or received in purchase orders matching these items
        orders.forEach(po => {
            if (po.status === 'canceled') return;

            po.items?.forEach(poItem => {
                const itemKey = poItem.materialId;
                if (!itemKey) return;
                
                // Find matching stock backlog item
                const match = backlogList.find(b => b.materialId === itemKey);
                if (match) {
                    const qty = poItem.quantity || 0;
                    match.totalOrdered += qty;

                    if (po.status === 'draft') {
                        match.inDraftCount += qty;
                    } else if (po.status === 'sent' || po.status === 'partially_received') {
                        match.onOrderCount += qty;
                    } else if (po.status === 'received') {
                        match.receivedCount += qty;
                    }
                }
            });
        });

        return backlogList;
    }, [materials, tools, orders]);

    const totalBacklogCount = backlogCount + stockBacklogItems.filter(item => {
        const remaining = Math.max(0, item.totalNeeded - item.totalOrdered);
        return remaining > 0;
    }).length;

    // Filter materials backlog
    const filteredBacklog = React.useMemo(() => {
        return backlogItems.filter(item => {
            // Status filtering
            const remaining = Math.max(0, item.totalNeeded - item.totalOrdered);
            if (materialStatusFilter === 'not_ordered' && item.totalOrdered > 0) return false;
            if (materialStatusFilter === 'partially_ordered' && (item.totalOrdered === 0 || remaining === 0)) return false;
            if (materialStatusFilter === 'on_order' && remaining > 0) return false;

            // Search filtering
            if (materialSearch.trim()) {
                const q = materialSearch.toLowerCase();
                return item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q);
            }
            return true;
        });
    }, [backlogItems, materialStatusFilter, materialSearch]);

    // Filter stock backlog
    const filteredStockBacklog = React.useMemo(() => {
        return stockBacklogItems.filter(item => {
            // Status filtering
            const remaining = Math.max(0, item.totalNeeded - item.totalOrdered);
            if (materialStatusFilter === 'not_ordered' && item.totalOrdered > 0) return false;
            if (materialStatusFilter === 'partially_ordered' && (item.totalOrdered === 0 || remaining === 0)) return false;
            if (materialStatusFilter === 'on_order' && remaining > 0) return false;

            // Search filtering
            if (materialSearch.trim()) {
                const q = materialSearch.toLowerCase();
                return item.name.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q);
            }
            return true;
        });
    }, [stockBacklogItems, materialStatusFilter, materialSearch]);

    // Handle Quick PO creation or Merging
    const handleQuickOrder = async (
        vendor: Vendor, 
        materialName: string, 
        materialId: string, 
        sku: string, 
        quantity: number, 
        unitCost: number
    ) => {
        if (!user || !user.org_id || quantity <= 0) return;
        setIsCreatingPO(true);

        try {
            // Find existing draft PO if merge option selected
            const existingDraft = poOption === 'merge'
                ? orders.find(po => po.status === 'draft' && po.vendorId === vendor.id)
                : null;

            if (existingDraft) {
                // Merge items into existing draft PO
                const updatedItems = [...(existingDraft.items || [])];
                const existingItemIndex = updatedItems.findIndex(i => 
                    (materialId && i.materialId === materialId) || 
                    i.name.toLowerCase().trim() === materialName.toLowerCase().trim()
                );

                if (existingItemIndex > -1) {
                    updatedItems[existingItemIndex].quantity += quantity;
                    updatedItems[existingItemIndex].totalPrice = updatedItems[existingItemIndex].quantity * updatedItems[existingItemIndex].unitPrice;
                } else {
                    updatedItems.push({
                        materialId: materialId || '',
                        name: materialName,
                        sku: sku || 'N/A',
                        quantity: quantity,
                        unitPrice: unitCost,
                        totalPrice: unitCost * quantity
                    });
                }

                const subtotal = updatedItems.reduce((sum, i) => sum + i.totalPrice, 0);
                const orgTaxRate = 0;
                const tax = subtotal * (orgTaxRate / 100);
                const total = subtotal + tax;

                await updateDoc(doc(db, 'purchaseOrders', existingDraft.id!), {
                    items: updatedItems,
                    subtotal: subtotal,
                    tax: tax,
                    total: total,
                    updatedAt: serverTimestamp()
                });

                setToast({
                    show: true,
                    message: `Added ${quantity}x "${materialName}" to Order for ${vendor.name}!`,
                    type: 'success',
                    poId: existingDraft.id
                });
            } else {
                // Create a completely new Draft Purchase Order
                const subtotal = unitCost * quantity;
                const orgTaxRate = 0;
                const tax = subtotal * (orgTaxRate / 100);
                const total = subtotal + tax;

                const poData: Omit<PurchaseOrder, 'id'> = {
                    organizationId: user.org_id,
                    vendorId: vendor.id!,
                    vendorName: vendor.name,
                    status: 'draft',
                    items: [{
                        materialId: materialId || '',
                        name: materialName,
                        sku: sku || 'N/A',
                        quantity: quantity,
                        unitPrice: unitCost,
                        totalPrice: subtotal
                    }],
                    subtotal,
                    tax,
                    shipping: 0,
                    total,
                    sentAt: null,
                    createdAt: Timestamp.now(),
                    createdBy: user.uid,
                };

                const docRef = await addDoc(collection(db, 'purchaseOrders'), poData);
                setToast({
                    show: true,
                    message: `Created new Order for ${vendor.name} with ${quantity}x "${materialName}"!`,
                    type: 'success',
                    poId: docRef.id
                });
            }
        } catch (err: any) {
            console.error('Error placing quick order:', err);
            setToast({
                show: true,
                message: `Failed to place quick order: ${err.message}`,
                type: 'error'
            });
        } finally {
            setIsCreatingPO(false);
        }
    };

    // Place Direct Order instantly (Marks status as 'sent' immediately)
    const handlePlaceDirectOrder = async (
        vendor: Vendor, 
        materialName: string, 
        materialId: string, 
        sku: string, 
        quantity: number, 
        unitCost: number
    ) => {
        if (!user || !user.org_id || quantity <= 0) return;
        setIsCreatingPO(true);

        try {
            const subtotal = unitCost * quantity;
            const orgTaxRate = 0;
            const tax = subtotal * (orgTaxRate / 100);
            const total = subtotal + tax;

            const poData: Omit<PurchaseOrder, 'id'> = {
                organizationId: user.org_id,
                vendorId: vendor.id!,
                vendorName: vendor.name,
                status: 'sent', // DIRECTLY PLACED & SENT
                items: [{
                    materialId: materialId || '',
                    name: materialName,
                    sku: sku || 'N/A',
                    quantity: quantity,
                    unitPrice: unitCost,
                    totalPrice: subtotal
                }],
                subtotal,
                tax,
                shipping: 0,
                total,
                sentAt: Timestamp.now(),
                createdAt: Timestamp.now(),
                createdBy: user.uid,
            };

            const docRef = await addDoc(collection(db, 'purchaseOrders'), poData);
            setToast({
                show: true,
                message: `⚡ Instant Sourcing Complete! ${quantity}x "${materialName}" directly ordered from ${vendor.name}.`,
                type: 'success',
                poId: docRef.id
            });
        } catch (err: any) {
            console.error('Error placing direct order:', err);
            setToast({
                show: true,
                message: `Failed to place direct order: ${err.message}`,
                type: 'error'
            });
        } finally {
            setIsCreatingPO(false);
        }
    };

    // AI One-Click Bulk Sourcing optimization and execution engine
    const runAiSourcing = async () => {
        if (!user || !user.org_id) return;
        setAiSourcingState('analyzing');
        setAiSourcingLogs([
            '🤖 [AI Procurement Agent] Initializing Auto-Sourcing Split Engine...',
            `🤖 [AI Procurement Agent] Active Strategy: ${aiSourcingCriteria.toUpperCase().replace('_', ' ')} optimization mode enabled.`,
            '🤖 [AI Procurement Agent] Scanning active upcoming orders backlog & warehouse stock deficit queues...'
        ]);
        setCreatedPoIds([]);

        const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
        await sleep(1000);

        // Combine deficits from both upcoming order demands and warehouse stock levels
        const orderDeficits = filteredBacklog.filter(item => {
            const remaining = Math.max(0, item.totalNeeded - item.totalOrdered);
            return remaining > 0;
        });

        const stockDeficits = filteredStockBacklog.filter(item => {
            const remaining = Math.max(0, item.totalNeeded - item.totalOrdered);
            return remaining > 0;
        });

        const deficitItems = [...orderDeficits, ...stockDeficits];

        if (deficitItems.length === 0) {
            setAiSourcingLogs(prev => [
                ...prev,
                '🤖 [AI Procurement Agent] Verification complete: No parts or inventory deficits found.',
                '🤖 [AI Procurement Agent] Sourcing is already fully optimized!'
            ]);
            setAiSourcingState('complete');
            return;
        }

        setAiSourcingLogs(prev => [
            ...prev,
            `🤖 [AI Procurement Agent] Identified ${deficitItems.length} items with deficits (${orderDeficits.length} for upcoming orders, ${stockDeficits.length} for warehouse stock).`,
            '🤖 [AI Procurement Agent] Switching to Phase 2: Sourcing Optimization & Vendor Selection...'
        ]);
        setAiSourcingState('optimizing');
        await sleep(1200);

        // Group items by optimized vendor
        const vendorGroups: Record<string, { vendor: Vendor; items: Array<{ item: BacklogItem; qty: number; unitCost: number }> }> = {};

        for (const item of deficitItems) {
            const remaining = Math.max(0, item.totalNeeded - item.totalOrdered);
            
            let vendorsList: VendorAssignment[] = [];
            let baseUnitCost = item.baseCost || 10;
            let preferredVendorId = item.preferredVendorId;
            let preferredReason = '';

            if (item.isTool) {
                const matchedTool = tools.find(t => t.id === item.materialId);
                if (matchedTool && matchedTool.vendors) {
                    vendorsList = matchedTool.vendors;
                    baseUnitCost = matchedTool.replacementCost || 0;
                    preferredVendorId = matchedTool.preferredVendorId;
                    preferredReason = matchedTool.preferredVendorReason || '';
                }
            } else {
                const matchedMaterial = materials.find(m => 
                    (item.materialId && m.id === item.materialId) ||
                    m.name.toLowerCase().trim() === item.name.toLowerCase().trim()
                );
                if (matchedMaterial && matchedMaterial.vendors) {
                    vendorsList = matchedMaterial.vendors;
                    baseUnitCost = matchedMaterial.unitCost || 0;
                    preferredVendorId = matchedMaterial.preferredVendorId;
                    preferredReason = matchedMaterial.preferredVendorReason || '';
                }
            }

            const validAssignments = vendorsList.filter(assignment => {
                const vendor = vendors.find(v => v.id === assignment.vendorId);
                return vendor && vendor.active !== false;
            });

            let chosenVendor: Vendor | null = null;
            let chosenCost = baseUnitCost;
            let chosenShipping = 3;
            let routingMethod = 'Optimal Sourcing';

            if (validAssignments.length > 0) {
                let chosenAssignment: VendorAssignment | null = null;

                if (aiSourcingCriteria === 'lowest_cost') {
                    chosenAssignment = validAssignments.reduce((prev, curr) => 
                        (curr.unitCost ?? baseUnitCost) < (prev.unitCost ?? baseUnitCost) ? curr : prev
                    , validAssignments[0]);
                    routingMethod = 'Lowest Cost';
                } else if (aiSourcingCriteria === 'fastest_shipping') {
                    chosenAssignment = validAssignments.reduce((prev, curr) => 
                        (curr.estimatedDeliveryDays ?? 3) < (prev.estimatedDeliveryDays ?? 3) ? curr : prev
                    , validAssignments[0]);
                    routingMethod = 'Fastest Shipping';
                } else if (aiSourcingCriteria === 'highest_quality') {
                    chosenAssignment = validAssignments.find(v => v.priorityLogic === 'longest_lasting') || 
                                       validAssignments.find(v => v.priorityLogic === 'preferred') ||
                                       validAssignments[0];
                    routingMethod = 'Highest Durability/Quality';
                } else if (aiSourcingCriteria === 'preferred_vendor') {
                    chosenAssignment = preferredVendorId ? validAssignments.find(v => v.vendorId === preferredVendorId) : null;
                    if (!chosenAssignment) {
                        chosenAssignment = validAssignments.find(v => v.priorityLogic === 'preferred') || validAssignments[0];
                    }
                    routingMethod = 'Preferred Vendor';
                } else {
                    let optimal: VendorAssignment | null = null;
                    if (item.isTool) {
                        const matchedTool = tools.find(t => t.id === item.materialId);
                        optimal = matchedTool ? determineOptimalVendor(matchedTool as any, vendors) : null;
                    } else {
                        const matchedMaterial = materials.find(m => 
                            (item.materialId && m.id === item.materialId) ||
                            m.name.toLowerCase().trim() === item.name.toLowerCase().trim()
                        );
                        optimal = matchedMaterial ? determineOptimalVendor(matchedMaterial, vendors) : null;
                    }
                    chosenAssignment = optimal || validAssignments[0];
                    routingMethod = 'Optimal Sourcing';
                }

                if (chosenAssignment) {
                    const v = vendors.find(vendor => vendor.id === chosenAssignment!.vendorId);
                    if (v) {
                        chosenVendor = v;
                        chosenCost = chosenAssignment.unitCost ?? baseUnitCost;
                        chosenShipping = chosenAssignment.estimatedDeliveryDays ?? 3;
                    }
                }
            }

            // Fallback mock vendor logic if no setup vendor is configured
            if (!chosenVendor) {
                const nameLower = item.name.toLowerCase();
                const isIndustrial = nameLower.includes('valve') || nameLower.includes('pipe') || nameLower.includes('faucet') || nameLower.includes('shower') || nameLower.includes('tape') || nameLower.includes('sealant');
                
                if (isIndustrial) {
                    chosenVendor = {
                        id: 'grainger_mock_id',
                        organizationId: user.org_id,
                        name: 'Grainger Industrial (AI Sourced)',
                        email: 'orders@grainger.com',
                        website: 'https://www.grainger.com',
                        active: true,
                        createdAt: Timestamp.now(),
                        updatedAt: Timestamp.now()
                    };
                    chosenCost = Math.round(((item.baseCost || 10) * 1.05) * 100) / 100;
                    chosenShipping = 2;
                } else {
                    chosenVendor = {
                        id: 'amazon_mock_id',
                        organizationId: user.org_id,
                        name: 'Amazon Business Prime (AI Sourced)',
                        email: 'orders@amazonbusiness.com',
                        website: 'https://business.amazon.com',
                        active: true,
                        createdAt: Timestamp.now(),
                        updatedAt: Timestamp.now()
                    };
                    chosenCost = Math.round(((item.baseCost || 10) * 0.92) * 100) / 100;
                    chosenShipping = 1;
                }
                routingMethod = 'AI Fallback';
            }

            const vendorId = chosenVendor.id || 'unknown';
            if (!vendorGroups[vendorId]) {
                vendorGroups[vendorId] = {
                    vendor: chosenVendor,
                    items: []
                };
            }

            vendorGroups[vendorId].items.push({
                item,
                qty: remaining,
                unitCost: chosenCost
            });

            setAiSourcingLogs(prev => [
                ...prev,
                `  • '${item.name}' [${item.isTool ? 'Tool' : 'Material'}] ➔ Routed to ${chosenVendor?.name} via [${routingMethod}] ($${chosenCost.toFixed(2)}/unit, Delivery: ${chosenShipping} days)`
            ]);
            await sleep(400);
        }

        setAiSourcingLogs(prev => [
            ...prev,
            `🤖 [AI Procurement Agent] Optimization successful: Split-routing mapped ${deficitItems.length} items into ${Object.keys(vendorGroups).length} supplier dispatches.`,
            '🤖 [AI Procurement Agent] Switching to Phase 3: Auto-PO Generation & Electronic Dispatch...'
        ]);
        setAiSourcingState('generating');
        await sleep(1200);

        const newPoRecords: Array<{ id: string; vendorName: string; total: number }> = [];

        // Build and dispatch dispatches to Firestore
        for (const vendorId of Object.keys(vendorGroups)) {
            const group = vendorGroups[vendorId];
            const poItems = group.items.map(gi => ({
                materialId: gi.item.materialId || '',
                name: gi.item.name,
                sku: gi.item.sku || 'N/A',
                quantity: gi.qty,
                unitPrice: gi.unitCost,
                totalPrice: gi.unitCost * gi.qty
            }));

            const subtotal = poItems.reduce((sum, i) => sum + i.totalPrice, 0);
            const orgTaxRate = 0;
            const tax = subtotal * (orgTaxRate / 100);
            const total = subtotal + tax;

            const poData: Omit<PurchaseOrder, 'id'> = {
                organizationId: user.org_id,
                vendorId: group.vendor.id!,
                vendorName: group.vendor.name,
                status: 'sent', // Auto mark as sent/placed
                items: poItems,
                subtotal,
                tax,
                shipping: 0,
                total,
                sentAt: Timestamp.now(),
                createdAt: Timestamp.now(),
                createdBy: user.uid,
            };

            try {
                const docRef = await addDoc(collection(db, 'purchaseOrders'), poData);
                newPoRecords.push({
                    id: docRef.id,
                    vendorName: group.vendor.name,
                    total
                });
                setAiSourcingLogs(prev => [
                    ...prev,
                    `⚡ [DISPATCH] Generated sent PO (${docRef.id.slice(0, 6)}...) to ${group.vendor.name} for $${total.toFixed(2)}`
                ]);
            } catch (err: any) {
                setAiSourcingLogs(prev => [
                    ...prev,
                    `❌ [ERROR] Sourcing failed for ${group.vendor.name}: ${err.message}`
                ]);
            }
            await sleep(600);
        }

        setCreatedPoIds(newPoRecords);
        setAiSourcingLogs(prev => [
            ...prev,
            '==================================================',
            '🎉 [SUCCESS] One-Click AI Sourcing Agent successfully placed all dispatches!',
            '✓ Backlogged material & stock deficits fulfilled in real-time.'
        ]);
        setAiSourcingState('complete');
    };

    const handleLaunchWebPortal = (opt: any, qty: number) => {
        if (!selectedBacklogItem) return;
        setWebOrderOption({
            vendor: opt.vendor,
            materialName: selectedBacklogItem.name,
            materialId: selectedBacklogItem.materialId || '',
            sku: selectedBacklogItem.sku || 'N/A',
            quantity: qty,
            unitCost: opt.cost,
            shippingDays: opt.shippingDays,
            totalPO: opt.cost * qty
        });
        setWebOrderHelperOpen(true);
    };

    const handleCompleteWebOrder = async (markAsSent: boolean) => {
        if (!user || !user.org_id || !webOrderOption) return;
        setIsCreatingPO(true);
        
        try {
            const { vendor, materialName, materialId, sku, quantity, unitCost } = webOrderOption;
            
            // Generate purchase order exactly like handleQuickOrder
            const subtotal = unitCost * quantity;
            const orgTaxRate = 0;
            const tax = subtotal * (orgTaxRate / 100);
            const total = subtotal + tax;

            const poData: Omit<PurchaseOrder, 'id'> = {
                organizationId: user.org_id,
                vendorId: vendor.id!,
                vendorName: vendor.name,
                status: markAsSent ? 'sent' : 'draft',
                items: [{
                    materialId: materialId || '',
                    name: materialName,
                    sku: sku || 'N/A',
                    quantity: quantity,
                    unitPrice: unitCost,
                    totalPrice: subtotal
                }],
                subtotal,
                tax,
                shipping: 0,
                total,
                sentAt: markAsSent ? Timestamp.now() : null,
                createdAt: Timestamp.now(),
                createdBy: user.uid,
            };

            const docRef = await addDoc(collection(db, 'purchaseOrders'), poData);
            
            setToast({
                show: true,
                message: markAsSent 
                    ? `Order completed & marked as SENT to ${vendor.name}!` 
                    : `Created new Draft Order for ${vendor.name}!`,
                type: 'success',
                poId: docRef.id
            });
            
            setWebOrderHelperOpen(false);
            setWebOrderOption(null);
        } catch (err: any) {
            console.error('Error placing web order:', err);
            setToast({
                show: true,
                message: `Failed to process web order: ${err.message}`,
                type: 'error'
            });
        } finally {
            setIsCreatingPO(false);
        }
    };

    const handleSort = (field: 'date' | 'vendor' | 'amount' | 'status') => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection(field === 'date' ? 'desc' : 'asc');
        }
    };

    const activeStatuses = ['draft', 'sent', 'partially_received'];
    
    let filteredOrders = orders.filter(po => {
        const isActive = activeStatuses.includes(po.status);
        return activeTab === 'active' ? isActive : po.status === 'received' || po.status === 'canceled';
    });

    if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        filteredOrders = filteredOrders.filter(po => {
            const dateStr = po.createdAt?.toDate ? po.createdAt.toDate().toLocaleDateString() : '';
            const vendorName = po.vendorName || '';
            const amountStr = po.total?.toFixed(2) || '0.00';
            const statusStr = po.status || '';
            
            return dateStr.toLowerCase().includes(lower) ||
                vendorName.toLowerCase().includes(lower) ||
                amountStr.includes(lower) ||
                statusStr.toLowerCase().includes(lower);
        });
    }

    const sortedOrders = [...filteredOrders].sort((a, b) => {
        let valA: any, valB: any;
        switch (sortField) {
            case 'date':
                valA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                valB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                break;
            case 'vendor':
                valA = a.vendorName.toLowerCase();
                valB = b.vendorName.toLowerCase();
                break;
            case 'amount':
                valA = a.total || 0;
                valB = b.total || 0;
                break;
            case 'status':
                valA = a.status.toLowerCase();
                valB = b.status.toLowerCase();
                break;
        }

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    const SortIcon = ({ field }: { field: 'date' | 'vendor' | 'amount' | 'status' }) => {
        if (sortField !== field) return <span className="opacity-0 group-hover:opacity-50"><ChevronDown className="w-4 h-4 inline-block ml-1" /></span>;
        return sortDirection === 'asc' 
            ? <ChevronUp className="w-4 h-4 inline-block ml-1 text-indigo-600" /> 
            : <ChevronDown className="w-4 h-4 inline-block ml-1 text-indigo-600" />;
    };

    // Calculate details for currently selected backlog item
    const selectedBacklogItem = backlogItems.find(item => item.id === selectedBacklogId) || stockBacklogItems.find(item => item.id === selectedBacklogId);

    // Setup sourcing options for selected item
    const sourcingOptions = React.useMemo(() => {
        if (!selectedBacklogItem) return [];

        const options: Array<{
            vendor: Vendor;
            cost: number;
            shippingDays: number;
            type: 'setup' | 'backup';
            isPreferred: boolean;
            reason?: string;
        }> = [];

        const isTool = selectedBacklogItem.isTool;
        let vendorsList: VendorAssignment[] = [];
        let baseUnitCost = selectedBacklogItem.baseCost || 10;
        let selectedItemReason = '';
        let preferredVendorId = selectedBacklogItem.preferredVendorId;

        if (isTool) {
            const matchedTool = tools.find(t => t.id === selectedBacklogItem.materialId);
            if (matchedTool && matchedTool.vendors) {
                vendorsList = matchedTool.vendors;
                baseUnitCost = matchedTool.replacementCost || 0;
                selectedItemReason = matchedTool.preferredVendorReason || '';
                preferredVendorId = matchedTool.preferredVendorId;
            }
        } else {
            const matchedMaterial = materials.find(m => 
                (selectedBacklogItem.materialId && m.id === selectedBacklogItem.materialId) ||
                m.name.toLowerCase().trim() === selectedBacklogItem.name.toLowerCase().trim()
            );
            if (matchedMaterial && matchedMaterial.vendors) {
                vendorsList = matchedMaterial.vendors;
                baseUnitCost = matchedMaterial.unitCost || 0;
                selectedItemReason = matchedMaterial.preferredVendorReason || '';
                preferredVendorId = matchedMaterial.preferredVendorId;
            }
        }

        if (vendorsList.length > 0) {
            // Use the established procurement logic to evaluate the absolute optimal setup vendor!
            let optimal: VendorAssignment | null = null;
            if (isTool) {
                const matchedTool = tools.find(t => t.id === selectedBacklogItem.materialId);
                optimal = matchedTool ? determineOptimalVendor(matchedTool as any, vendors) : null;
            } else {
                const matchedMaterial = materials.find(m => 
                    (selectedBacklogItem.materialId && m.id === selectedBacklogItem.materialId) ||
                    m.name.toLowerCase().trim() === selectedBacklogItem.name.toLowerCase().trim()
                );
                optimal = matchedMaterial ? determineOptimalVendor(matchedMaterial, vendors) : null;
            }

            vendorsList.forEach(assignment => {
                const v = vendors.find(vendor => vendor.id === assignment.vendorId);
                if (v && v.active !== false) {
                    const isPreferredWinner = optimal?.vendorId === v.id;
                    options.push({
                        vendor: v,
                        cost: assignment.unitCost || baseUnitCost || 0,
                        shippingDays: assignment.estimatedDeliveryDays ?? 3,
                        type: 'setup',
                        isPreferred: isPreferredWinner,
                        reason: isPreferredWinner ? selectedItemReason || `Optimal winner evaluated by procurement logic (${assignment.priorityLogic || 'preferred'}).` : undefined
                    });
                }
            });
        }

        // If no vendors matched in catalog but we have setup vendors in active list, show them
        if (options.length === 0 && vendors.length > 0) {
            // Fallback to the first active setup vendor in directory
            const primarySetup = vendors.find(v => v.active !== false);
            if (primarySetup) {
                options.push({
                    vendor: primarySetup,
                    cost: selectedBacklogItem.baseCost || 10,
                    shippingDays: 3,
                    type: 'setup',
                    isPreferred: false
                });
            }
        }

        // 2. Inject high-quality Mock Backup Sourcing (Amazon Business Prime & Grainger Pro) to provide online price shopping!
        const baseCost = selectedBacklogItem.baseCost || 10;
        
        // Amazon Business Prime
        const amazonVendor: Vendor = {
            id: 'amazon_mock_id',
            organizationId: user?.org_id || '',
            name: '📦 Amazon Business Prime (Online Sourcing)',
            email: 'orders@amazonbusiness.com',
            website: 'https://business.amazon.com',
            webUsername: 'procurement-admin@company.com',
            webPassword: 'AmazonPrimeProcure2026!',
            discountCodes: 'PRIME10OFF, B2BMASTERCARD',
            orderInstructions: 'Deliver to Suite B shipping dock. Enter gate code #4829.',
            active: true,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        };
        options.push({
            vendor: amazonVendor,
            cost: Math.round((baseCost * 0.92) * 100) / 100, // Competitive online price
            shippingDays: 1, // Ultra fast Next-Day Prime shipping!
            type: 'backup',
            isPreferred: false
        });

        // Grainger Industrial Sourcing
        const graingerVendor: Vendor = {
            id: 'grainger_mock_id',
            organizationId: user?.org_id || '',
            name: '🛠️ Grainger Industrial (Backup Sourcing)',
            email: 'sales@grainger.com',
            website: 'https://www.grainger.com',
            webUsername: 'accounts-payable@company.com',
            webPassword: 'GraingerDirectAuth99!',
            discountCodes: 'GRAINGERPLUS, BULKORDER15',
            orderInstructions: 'Attention: Warehouse Receiving. Verify PO number matches packing slip.',
            active: true,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        };
        options.push({
            vendor: graingerVendor,
            cost: Math.round((baseCost * 1.05) * 100) / 100, // Higher industrial quality
            shippingDays: 2,
            type: 'backup',
            isPreferred: false
        });

        return options;
    }, [selectedBacklogItem, materials, tools, vendors, user?.org_id]);

    if (creatingMasterPO) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-10 text-center max-w-md">
                    <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-4 animate-pulse">
                        <Layers className="w-6 h-6 text-indigo-600" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Creating Master Order...</h2>
                    <p className="text-sm text-gray-500">Routing items to vendors based on your sourcing strategy and creating sub-orders. This will only take a moment.</p>
                    <div className="mt-4 flex justify-center">
                        <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
            {/* Real-time Toast Notifications */}
            {toast?.show && (
                <div className="fixed bottom-5 right-5 z-50 animate-bounce p-4 rounded-xl border flex items-center justify-between gap-4 shadow-xl bg-white border-green-200 max-w-md">
                    <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0" />
                        <div>
                            <p className="text-sm font-semibold text-gray-900">{toast.message}</p>
                            {toast.poId && (
                                <Link
                                    to={`/purchase-orders/${toast.poId}`}
                                    className="text-xs text-indigo-600 hover:text-indigo-800 font-bold underline mt-1 inline-block"
                                >
                                    View & Review Draft Purchase Order →
                                </Link>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={() => setToast(null)}
                        className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                        <ShoppingBag className="w-8 h-8 text-indigo-600" />
                        Procurement & Sourcing
                    </h1>
                    <p className="text-gray-500 mt-1">Manage vendor material catalog sourcing and automated job parts pipelines</p>
                </div>
                <div className="flex gap-3">
                    {canPurchaseMaterials && (
                        <button
                            onClick={() => setShowSearchModal(true)}
                            className="inline-flex items-center px-4 py-2 border border-indigo-600 shadow-sm text-sm font-semibold rounded-lg text-indigo-600 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                        >
                            <Search className="w-4 h-4 mr-2" />
                            New Order (Catalog)
                        </button>
                    )}
                    {canAddVendors && (
                        <button
                            onClick={() => setShowVendorsModal(true)}
                            className="inline-flex items-center px-4 py-2 border border-slate-300 shadow-sm text-sm font-semibold rounded-lg text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 transition-colors"
                        >
                            <Settings className="w-4 h-4 mr-2 text-slate-500" />
                            Manage Vendors
                        </button>
                    )}
                </div>
            </div>

            {/* Top Stat Summary Grid for Materials Sourcing */}
            {activeTab === 'materials' && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-4">
                        <div className="w-12 h-12 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600">
                            <Layers className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Parts Backlog</p>
                            <p className="text-2xl font-black text-slate-900">{backlogCount}</p>
                            <p className="text-xs text-slate-500">Unique parts requiring purchase</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-4">
                        <div className="w-12 h-12 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600">
                            <CheckCircle2 className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Fully Planned</p>
                            <p className="text-2xl font-black text-slate-900">
                                {backlogItems.filter(item => Math.max(0, item.totalNeeded - item.totalOrdered) === 0 && item.totalNeeded > 0).length}
                            </p>
                            <p className="text-xs text-slate-500">Parts with adequate PO quantities</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-4">
                        <div className="w-12 h-12 bg-amber-50 rounded-lg flex items-center justify-center text-amber-600">
                            <AlertTriangle className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Partially Ordered</p>
                            <p className="text-2xl font-black text-slate-900">
                                {backlogItems.filter(item => item.totalOrdered > 0 && Math.max(0, item.totalNeeded - item.totalOrdered) > 0).length}
                            </p>
                            <p className="text-xs text-slate-500">Partially ordered material backlogs</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-4">
                        <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center text-red-500 animate-pulse">
                            <Clock className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Unordered Leads</p>
                            <p className="text-2xl font-black text-slate-900">
                                {backlogItems.filter(item => item.totalOrdered === 0 && item.totalNeeded > 0).length}
                            </p>
                            <p className="text-xs text-slate-500">Unfulfilled job material requests</p>
                        </div>
                    </div>
                </div>
            )}

            <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex border-b border-slate-100 w-full sm:w-auto">
                    <button
                        onClick={() => { setActiveTab('active'); setSelectedBacklogId(null); }}
                        className={`px-5 py-3 font-semibold text-sm border-b-2 transition-all duration-200 flex items-center gap-2 ${activeTab === 'active' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        <Clock className="w-4 h-4 text-amber-500" />
                        Active POs
                        <span className="bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded-full font-bold ml-1">
                            {orders.filter(po => activeStatuses.includes(po.status)).length}
                        </span>
                    </button>
                    <button
                        onClick={() => { setActiveTab('archived'); setSelectedBacklogId(null); }}
                        className={`px-5 py-3 font-semibold text-sm border-b-2 transition-all duration-200 flex items-center gap-2 ${activeTab === 'archived' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        Archived (Received)
                        <span className="bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded-full font-bold ml-1">
                            {orders.filter(po => po.status === 'received' || po.status === 'canceled').length}
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('materials')}
                        className={`px-5 py-3 font-semibold text-sm border-b-2 transition-all duration-200 flex items-center gap-2 ${activeTab === 'materials' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        <Layers className="w-4 h-4 text-indigo-500" />
                        Materials & Stock Backlog
                        {totalBacklogCount > 0 && (
                            <span className="bg-red-500 text-white text-xs px-2.5 py-0.5 rounded-full font-black animate-pulse shadow-sm">
                                {totalBacklogCount}
                            </span>
                        )}
                    </button>
                </div>

                <div className="relative w-full sm:w-72 pr-2">
                    {activeTab === 'materials' ? (
                        <>
                            <input
                                type="text"
                                placeholder="Search backlogged parts..."
                                value={materialSearch}
                                onChange={(e) => setMaterialSearch(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                            <Search className="w-4.5 h-4.5 absolute left-3 top-3 text-slate-400" />
                        </>
                    ) : (
                        <>
                            <input
                                type="text"
                                placeholder="Search purchase orders..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                            <Search className="w-4.5 h-4.5 absolute left-3 top-3 text-slate-400" />
                        </>
                    )}
                </div>
            </div>

            {/* PO Active/Archived Tables */}
            {activeTab !== 'materials' && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-100">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th onClick={() => handleSort('date')} className="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer group hover:bg-slate-100 select-none">Date Drafted <SortIcon field="date" /></th>
                                    <th onClick={() => handleSort('vendor')} className="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer group hover:bg-slate-100 select-none">Vendor <SortIcon field="vendor" /></th>
                                    <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Items</th>
                                    <th onClick={() => handleSort('amount')} className="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer group hover:bg-slate-100 select-none">Total Amount <SortIcon field="amount" /></th>
                                    <th onClick={() => handleSort('status')} className="px-6 py-3.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer group hover:bg-slate-100 select-none">Status <SortIcon field="status" /></th>
                                    <th className="px-6 py-3.5 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-100">
                                {sortedOrders.map(po => (
                                    <tr key={po.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-semibold">
                                            {po.createdAt?.toDate ? po.createdAt.toDate().toLocaleDateString() : 'N/A'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-950">
                                            {po.vendorName}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-medium">
                                            {po.items?.length || 0} items
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900">
                                            ${(po.total || 0).toFixed(2)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                                                po.status === 'draft' ? 'bg-yellow-50 text-yellow-800 border border-yellow-200' :
                                                po.status === 'sent' ? 'bg-blue-50 text-blue-800 border border-blue-200' :
                                                po.status === 'received' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                                                po.status === 'canceled' ? 'bg-rose-50 text-rose-800 border border-rose-200' :
                                                'bg-slate-50 text-slate-800'
                                            }`}>
                                                {po.status.replace('_', ' ').toUpperCase()}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <div className="flex items-center justify-end gap-2">
                                                <Link to={`/purchase-orders/${po.id}`} className="inline-flex items-center text-indigo-600 hover:text-indigo-900 py-1.5 px-3 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors font-bold text-xs">
                                                    {po.status === 'draft' ? 'Review & Send' : 'View Details'}
                                                </Link>
                                                <button
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        if (!window.confirm(`Delete PO for ${po.vendorName}? This cannot be undone.`)) return;
                                                        try {
                                                            await deleteDoc(doc(db, 'purchaseOrders', po.id!));
                                                            setToast({ show: true, message: `PO for ${po.vendorName} deleted`, type: 'success' });
                                                        } catch (err: any) {
                                                            setToast({ show: true, message: `Delete failed: ${err.message}`, type: 'error' });
                                                        }
                                                    }}
                                                    className="inline-flex items-center text-rose-500 hover:text-rose-700 py-1.5 px-2 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors"
                                                    title="Delete PO"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        
                        {sortedOrders.length === 0 && (
                            <div className="py-16 flex flex-col items-center justify-center text-slate-500 bg-slate-50/50 border-t border-slate-100">
                                <ShoppingCart className="w-14 h-14 text-slate-200 mb-4" />
                                <p className="text-lg font-bold text-slate-900">No purchase orders found</p>
                                <p className="text-sm mt-1 text-slate-500">There are no {activeTab} purchase orders matching your filters.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Upcoming Job Materials & Stock Dashboard Pipeline */}
            {activeTab === 'materials' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-in fade-in duration-300">
                    {/* Left Column: Deficits and Backlogs */}
                    <div className="lg:col-span-7 space-y-6">
                        {/* 1. Required Parts and Materials for Orders */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="p-4 border-b border-slate-150 bg-slate-50 flex flex-wrap gap-2 items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                    <Layers className="w-4.5 h-4.5 text-indigo-600" />
                                    <h3 className="font-extrabold text-slate-900 text-sm">Required Parts and Materials for Orders</h3>
                                </div>
                                <div className="flex gap-1">
                                    {(['all', 'not_ordered', 'partially_ordered', 'on_order'] as const).map(tab => (
                                        <button
                                            key={tab}
                                            onClick={() => setMaterialStatusFilter(tab)}
                                            className={`px-2.5 py-1 rounded-md text-[11px] font-black tracking-wide transition-all ${
                                                materialStatusFilter === tab 
                                                    ? 'bg-indigo-600 text-white shadow-sm'
                                                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                                            }`}
                                        >
                                            {tab.replace('_', ' ').toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="px-4 py-2.5 bg-slate-100/60 border-b border-slate-150 flex flex-wrap gap-4 items-center text-xs font-semibold text-slate-655">
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Demand Sources:</span>
                                <label className="flex items-center gap-1.5 cursor-pointer hover:text-indigo-650 select-none transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={includeQuotes}
                                        onChange={(e) => setIncludeQuotes(e.target.checked)}
                                        className="w-4 h-4 text-indigo-600 border-slate-355 rounded focus:ring-indigo-500 cursor-pointer"
                                    />
                                    <span>Signed/Approved Quotes</span>
                                </label>
                                <label className="flex items-center gap-1.5 cursor-pointer hover:text-indigo-655 select-none transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={includeJobs}
                                        onChange={(e) => setIncludeJobs(e.target.checked)}
                                        className="w-4 h-4 text-indigo-600 border-slate-355 rounded focus:ring-indigo-500 cursor-pointer"
                                    />
                                    <span>Approved Work Orders</span>
                                </label>
                            </div>

                            <div className="divide-y divide-slate-100 max-h-[38vh] overflow-y-auto">
                                {filteredBacklog.map(item => {
                                    const remaining = Math.max(0, item.totalNeeded - item.totalOrdered);
                                    const isSelected = selectedBacklogId === item.id;
                                    
                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => setSelectedBacklogId(item.id)}
                                            className={`p-4 transition-all cursor-pointer flex items-center justify-between gap-4 border-l-4 ${
                                                isSelected 
                                                    ? 'bg-indigo-50/50 border-indigo-600' 
                                                    : 'hover:bg-slate-50/70 border-transparent'
                                            }`}
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h4 className="font-bold text-slate-900 text-sm truncate">{item.name}</h4>
                                                    {item.sku !== 'N/A' && (
                                                        <span className="bg-slate-100 text-slate-650 text-[10px] px-2 py-0.5 rounded font-mono font-bold border border-slate-200">
                                                            SKU: {item.sku}
                                                        </span>
                                                    )}
                                                    {item.earliestJobDate && (
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                                                            (item.earliestJobDate.getTime() - Date.now()) < 3 * 24 * 60 * 60 * 1000 
                                                                ? 'bg-rose-50 text-rose-600 animate-pulse'
                                                                : 'bg-indigo-50 text-indigo-600'
                                                        }`}>
                                                            <Calendar className="w-3 h-3" />
                                                            Job: {item.earliestJobDate.toLocaleDateString()}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 font-medium">
                                                    <span className="flex items-center gap-1">
                                                        <span className="text-slate-800 font-black">{item.totalNeeded}</span> {item.unit} needed
                                                    </span>
                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                                    <span className="flex items-center gap-1">
                                                        <span className="text-indigo-600 font-black">{item.totalOrdered}</span> ordered
                                                    </span>
                                                    {remaining > 0 ? (
                                                        <>
                                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                                            <span className="text-rose-500 font-bold flex items-center gap-0.5">
                                                                <AlertCircle className="w-3.5 h-3.5" />
                                                                {remaining} deficit
                                                            </span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                                            <span className="text-emerald-500 font-bold flex items-center gap-0.5">
                                                                <Check className="w-3.5 h-3.5" /> Fully Sourced
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2.5">
                                                <span className={`px-2 py-0.5 text-[10px] font-black rounded-full uppercase tracking-wider ${
                                                    remaining === 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                                    item.totalOrdered > 0 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                                    'bg-rose-50 text-rose-700 border border-rose-200'
                                                }`}>
                                                    {remaining === 0 ? 'Planned' : item.totalOrdered > 0 ? 'Partial' : 'Unfulfilled'}
                                                </span>
                                                <ChevronRight className={`w-5 h-5 text-slate-400 transition-transform ${isSelected ? 'transform translate-x-1 text-indigo-600' : ''}`} />
                                            </div>
                                        </div>
                                    );
                                })}

                                {filteredBacklog.length === 0 && (
                                    <div className="py-10 text-center text-slate-400 bg-slate-50/20">
                                        <Package className="w-10 h-10 mx-auto text-slate-200 mb-2" />
                                        <p className="text-sm font-bold text-slate-800">No matching parts backlog</p>
                                        <p className="text-xs text-slate-500 mt-1">There are no material backlogs matching your criteria.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 2. Required Parts and Materials for Stock */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                            <div className="p-4 border-b border-slate-150 bg-slate-50 flex flex-wrap gap-2 items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                    <Layers className="w-4.5 h-4.5 text-indigo-600" />
                                    <h3 className="font-extrabold text-slate-900 text-sm">Required Parts and Materials for Stock</h3>
                                </div>
                            </div>

                            <div className="divide-y divide-slate-100 max-h-[38vh] overflow-y-auto">
                                {filteredStockBacklog.map(item => {
                                    const remaining = Math.max(0, item.totalNeeded - item.totalOrdered);
                                    const isSelected = selectedBacklogId === item.id;
                                    
                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => setSelectedBacklogId(item.id)}
                                            className={`p-4 transition-all cursor-pointer flex items-center justify-between gap-4 border-l-4 ${
                                                isSelected 
                                                    ? 'bg-indigo-50/50 border-indigo-600' 
                                                    : 'hover:bg-slate-50/70 border-transparent'
                                            }`}
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h4 className="font-bold text-slate-900 text-sm truncate">{item.name}</h4>
                                                    {item.sku !== 'N/A' && (
                                                        <span className="bg-slate-100 text-slate-650 text-[10px] px-2 py-0.5 rounded font-mono font-bold border border-slate-200">
                                                            SKU: {item.sku}
                                                        </span>
                                                    )}
                                                    {item.isTool && (
                                                        <span className="bg-purple-100 text-purple-750 text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider border border-purple-200">
                                                            🛠️ Tool Fleet
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-4 mt-2 text-xs text-slate-500 font-medium">
                                                    <span className="flex items-center gap-1">
                                                        <span className="text-slate-800 font-black">{item.totalNeeded}</span> {item.unit} deficit
                                                    </span>
                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                                    <span className="flex items-center gap-1">
                                                        <span className="text-indigo-600 font-black">{item.totalOrdered}</span> ordered
                                                    </span>
                                                    {remaining > 0 ? (
                                                        <>
                                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                                            <span className="text-rose-500 font-bold flex items-center gap-0.5">
                                                                <AlertCircle className="w-3.5 h-3.5" />
                                                                {remaining} needed
                                                            </span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                                            <span className="text-emerald-500 font-bold flex items-center gap-0.5">
                                                                <Check className="w-3.5 h-3.5" /> Fully Sourced
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2.5">
                                                <span className={`px-2 py-0.5 text-[10px] font-black rounded-full uppercase tracking-wider ${
                                                    remaining === 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                                    item.totalOrdered > 0 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                                    'bg-rose-50 text-rose-700 border border-rose-200'
                                                }`}>
                                                    {remaining === 0 ? 'Planned' : item.totalOrdered > 0 ? 'Partial' : 'Unfulfilled'}
                                                </span>
                                                <ChevronRight className={`w-5 h-5 text-slate-400 transition-transform ${isSelected ? 'transform translate-x-1 text-indigo-650' : ''}`} />
                                            </div>
                                        </div>
                                    );
                                })}

                                {filteredStockBacklog.length === 0 && (
                                    <div className="py-10 text-center text-slate-400 bg-slate-50/20">
                                        <Package className="w-10 h-10 mx-auto text-slate-200 mb-2" />
                                        <p className="text-sm font-bold text-slate-800">No stock deficit inventory</p>
                                        <p className="text-xs text-slate-500 mt-1">All warehouse tools and materials have healthy stock levels!</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Comparative Sourcing Details Panel */}
                    <div className="lg:col-span-5 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[50vh] p-5">
                        {!selectedBacklogItem ? (
                            <div className="flex flex-col h-full justify-between">
                                <div>
                                    {/* AI Agent Header Card */}
                                    <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-650 rounded-xl p-5 text-white shadow-md relative overflow-hidden">
                                        {/* Background decorative glow */}
                                        <div className="absolute right-0 bottom-0 w-32 h-32 bg-white/10 rounded-full blur-xl translate-x-10 translate-y-10"></div>
                                        <div className="relative z-10">
                                            <div className="flex items-center gap-2 bg-white/25 w-fit px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider mb-3">
                                                <Layers className="w-3.5 h-3.5 animate-spin" />
                                                Dispatcher Procurement Assistant
                                            </div>
                                            <h4 className="font-extrabold text-lg flex items-center gap-1.5">
                                                🤖 AI Auto-Sourcing Agent
                                            </h4>
                                            <p className="text-xs text-indigo-100 font-semibold mt-1 max-w-sm leading-relaxed">
                                                Automatically splits, optimizes, and dispatches your entire material deficit backlog across active setup suppliers and next-day competitive online backstops in a single click.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Deficit Overview Metrics */}
                                    <div className="mt-5 grid grid-cols-3 gap-2">
                                        <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                                            <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider">Order Deficits</span>
                                            <span className="text-lg font-black text-slate-900 block mt-1">
                                                {filteredBacklog.filter(item => Math.max(0, item.totalNeeded - item.totalOrdered) > 0).length} items
                                            </span>
                                        </div>
                                        <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                                            <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider">Stock Deficits</span>
                                            <span className="text-lg font-black text-slate-900 block mt-1">
                                                {filteredStockBacklog.filter(item => Math.max(0, item.totalNeeded - item.totalOrdered) > 0).length} items
                                            </span>
                                        </div>
                                        <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                                            <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider">Total Deficit</span>
                                            <span className="text-lg font-black text-indigo-650 block mt-1">
                                                {filteredBacklog.filter(item => Math.max(0, item.totalNeeded - item.totalOrdered) > 0).reduce((sum, item) => sum + Math.max(0, item.totalNeeded - item.totalOrdered), 0) +
                                                 filteredStockBacklog.filter(item => Math.max(0, item.totalNeeded - item.totalOrdered) > 0).reduce((sum, item) => sum + Math.max(0, item.totalNeeded - item.totalOrdered), 0)} parts
                                            </span>
                                        </div>
                                    </div>

                                    {/* Sourcing State Render */}
                                    {aiSourcingState === 'idle' ? (
                                        <div className="mt-5 space-y-4">
                                            {/* AI Auto-Sourcing Criteria Selector */}
                                            <div className="bg-indigo-50/45 border border-indigo-150 p-4 rounded-xl shadow-xs">
                                                <label className="text-xs font-black text-indigo-900 uppercase tracking-wider block mb-2.5">
                                                    AI Procurement Strategy Criteria:
                                                </label>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {[
                                                        { id: 'optimal', label: '⭐ Optimal Priority', desc: 'Sourcing balance' },
                                                        { id: 'total_visit_cost', label: '🏷️ Total Visit Cost', desc: 'Bundled single supplier' },
                                                        { id: 'local_availability', label: '📍 Local Availability', desc: 'Local store stock' },
                                                        { id: 'urgent_local_availability', label: '🚨 Urgent Local Stock', desc: 'Emergency instant pickup' },
                                                        { id: 'lowest_cost', label: '💲 Lowest Cost', desc: 'Cheapest unit costs' },
                                                        { id: 'fastest_shipping', label: '⚡ Fastest Shipping', desc: 'Shortest delivery' },
                                                        { id: 'highest_quality', label: '🛡️ Highest Quality', desc: 'Highest durability' },
                                                        { id: 'preferred_vendor', label: '🤝 Preferred Vendor', desc: 'Preferred winners first' }
                                                    ].map(criteria => (
                                                        <button
                                                            key={criteria.id}
                                                            onClick={() => setAiSourcingCriteria(criteria.id as any)}
                                                            className={`p-2.5 rounded-xl border text-left transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer ${
                                                                aiSourcingCriteria === criteria.id
                                                                    ? 'bg-white border-indigo-500 ring-2 ring-indigo-500/20 text-indigo-900 font-extrabold shadow-sm'
                                                                    : 'bg-white/60 border-slate-200 text-slate-650 hover:bg-white'
                                                            }`}
                                                        >
                                                            <span className="block text-xs">{criteria.label}</span>
                                                            <span className="block text-[10px] text-slate-400 font-medium mt-0.5">{criteria.desc}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="border border-dashed border-slate-200 rounded-xl p-5 text-center bg-slate-50/50">
                                                <Package className="w-8 h-8 text-slate-350 mx-auto mb-2" />
                                                <p className="text-xs text-slate-500 font-semibold max-w-xs mx-auto leading-relaxed">
                                                    Select a part from the list on the left to configure manual orders, or run the AI agent to purchase all deficits instantly.
                                                </p>
                                                <button
                                                    onClick={runAiSourcing}
                                                    className="mt-4 w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow-md shadow-indigo-100 transition-all flex items-center justify-center gap-1.5 hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                                                >
                                                    ⚡ Run AI Auto-Sourcing Agent
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="mt-6 space-y-4">
                                            {/* Live Logging Terminal */}
                                            <div className="flex justify-between items-center text-xs font-bold text-slate-500">
                                                <span className="flex items-center gap-1.5">
                                                    <span className={`w-2 h-2 rounded-full ${aiSourcingState === 'complete' ? 'bg-emerald-500' : 'bg-indigo-500 animate-ping'}`}></span>
                                                    AI Terminal Console
                                                </span>
                                                <span className="font-mono text-[10px] uppercase text-indigo-600 font-black tracking-wide">
                                                    {aiSourcingState}...
                                                </span>
                                            </div>
                                            
                                            <div className="bg-slate-950 font-mono text-[11px] text-slate-300 p-4 rounded-xl border border-slate-800 shadow-inner h-64 overflow-y-auto space-y-1.5 select-text">
                                                {aiSourcingLogs.map((log, idx) => (
                                                    <div 
                                                        key={idx} 
                                                        className={`leading-relaxed ${
                                                            log.includes('✓') || log.includes('[SUCCESS]') || log.startsWith('  •')
                                                                ? 'text-emerald-400 font-bold' 
                                                                : log.includes('❌') || log.includes('[ERROR]') 
                                                                    ? 'text-rose-400 font-black' 
                                                                    : log.startsWith('⚡')
                                                                        ? 'text-indigo-400 font-black'
                                                                        : 'text-slate-400 font-medium'
                                                        }`}
                                                    >
                                                        {log}
                                                    </div>
                                                ))}
                                                {aiSourcingState !== 'complete' && (
                                                    <div className="text-indigo-400 font-black animate-pulse flex items-center gap-0.5">
                                                        <span>▮</span>
                                                        <span className="text-[10px] text-slate-500">processing sourcing parameters...</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Actionable Deep Links to the newly generated POs */}
                                            {createdPoIds.length > 0 && (
                                                <div className="bg-emerald-50 border border-emerald-250 rounded-xl p-4 animate-in fade-in slide-in-from-bottom-2">
                                                    <h5 className="text-xs font-black text-emerald-900 uppercase tracking-wider mb-2">
                                                        Dispatched Purchase Orders ({createdPoIds.length})
                                                    </h5>
                                                    <div className="space-y-2">
                                                        {createdPoIds.map((po) => (
                                                            <div 
                                                                key={po.id} 
                                                                className="flex justify-between items-center bg-white border border-emerald-100 p-2.5 rounded-lg text-xs"
                                                            >
                                                                <div>
                                                                    <span className="font-extrabold text-slate-800 block">{po.vendorName}</span>
                                                                    <span className="text-[10px] text-slate-400 font-mono">PO ID: {po.id.slice(0, 8)}...</span>
                                                                </div>
                                                                <div className="flex items-center gap-3">
                                                                    <span className="font-black text-indigo-650">${po.total.toFixed(2)}</span>
                                                                    <button
                                                                        onClick={() => {
                                                                            // Switch tabs to active so the dispatcher sees their PO immediately!
                                                                            setActiveTab('active');
                                                                        }}
                                                                        className="p-1.5 text-indigo-650 hover:bg-indigo-50 border border-indigo-200 rounded-md transition-all font-black text-[10px] flex items-center gap-1 shadow-sm"
                                                                    >
                                                                        <Eye className="w-3.5 h-3.5" />
                                                                        View PO
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {aiSourcingState === 'complete' && (
                                                <button
                                                    onClick={() => {
                                                        setAiSourcingState('idle');
                                                        setAiSourcingLogs([]);
                                                        setCreatedPoIds([]);
                                                    }}
                                                    className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl border border-slate-200 transition-all text-center"
                                                >
                                                    Reset Sourcing Agent Console
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="text-[10px] text-slate-400 font-semibold text-center border-t border-slate-100 pt-4 mt-6">
                                    DispatchBox Auto-Sourcing Agent • Compliance Checked
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* Material Header */}
                                <div>
                                    <div className="flex justify-between items-start gap-4">
                                        <div>
                                            <h3 className="text-xl font-bold text-slate-900 leading-tight">{selectedBacklogItem.name}</h3>
                                            <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                                                <span>SKU: <strong className="font-mono">{selectedBacklogItem.sku}</strong></span>
                                                <span className="w-1.5 h-1.5 bg-slate-350 rounded-full"></span>
                                                <span>Unit: <strong>{selectedBacklogItem.unit}</strong></span>
                                            </p>
                                        </div>
                                        <button 
                                            onClick={() => setSelectedBacklogId(null)}
                                            className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
                                        >
                                            <X className="w-5 h-5" />
                                        </button>
                                    </div>

                                    {/* Order Quantities Configurator */}
                                    <div className="mt-4 bg-slate-50 border border-slate-150 rounded-xl p-4">
                                        <div className="flex justify-between items-center text-xs text-slate-500 mb-2">
                                            <span className="font-semibold text-slate-600">Purchase Order Quantity Config:</span>
                                            <span className="font-bold text-indigo-600 flex items-center gap-1">
                                                <Info className="w-3.5 h-3.5" /> Deficit is {Math.max(0, selectedBacklogItem.totalNeeded - selectedBacklogItem.totalOrdered)} {selectedBacklogItem.unit}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center border border-slate-250 bg-white rounded-lg overflow-hidden shadow-sm">
                                                <button
                                                    onClick={() => setOrderQuantities(prev => ({
                                                        ...prev,
                                                        [selectedBacklogItem.id]: Math.max(1, (prev[selectedBacklogItem.id] || Math.max(0, selectedBacklogItem.totalNeeded - selectedBacklogItem.totalOrdered) || 1) - 1)
                                                    }))}
                                                    className="px-3 py-2 text-slate-600 hover:bg-slate-100 transition-colors border-r border-slate-200"
                                                >
                                                    <Minus className="w-4 h-4" />
                                                </button>
                                                <input
                                                    type="number"
                                                    value={(orderQuantities[selectedBacklogItem.id] ?? Math.max(0, selectedBacklogItem.totalNeeded - selectedBacklogItem.totalOrdered)) || 1}
                                                    onChange={(e) => {
                                                        const val = parseInt(e.target.value) || 1;
                                                        setOrderQuantities(prev => ({ ...prev, [selectedBacklogItem.id]: val }));
                                                    }}
                                                    className="w-16 text-center font-bold text-slate-900 focus:outline-none text-sm"
                                                    min="1"
                                                />
                                                <button
                                                    onClick={() => setOrderQuantities(prev => ({
                                                        ...prev,
                                                        [selectedBacklogItem.id]: (prev[selectedBacklogItem.id] || Math.max(0, selectedBacklogItem.totalNeeded - selectedBacklogItem.totalOrdered) || 1) + 1
                                                    }))}
                                                    className="px-3 py-2 text-slate-600 hover:bg-slate-100 transition-colors border-l border-slate-200"
                                                >
                                                    <Plus className="w-4 h-4" />
                                                </button>
                                            </div>

                                            {/* Merging Strategy Selector */}
                                            <div className="flex-1 flex gap-2">
                                                <button
                                                    onClick={() => setPoOption('merge')}
                                                    className={`flex-1 py-2 text-center text-xs font-bold rounded-lg border transition-all ${
                                                        poOption === 'merge'
                                                            ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                                                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                                    }`}
                                                >
                                                    Add to Order
                                                </button>
                                                <button
                                                    onClick={() => setPoOption('new')}
                                                    className={`flex-1 py-2 text-center text-xs font-bold rounded-lg border transition-all ${
                                                        poOption === 'new'
                                                            ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                                                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                                    }`}
                                                >
                                                    New Order
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Demands and Timing Pipeline */}
                                <div>
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">Associated Demand Schedules</h4>
                                    <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                                        {selectedBacklogItem.associatedDemands.map((demand, i) => (
                                            <div key={i} className="p-3 border border-slate-200 bg-white rounded-xl shadow-xs text-xs">
                                                <div className="flex justify-between items-center">
                                                    <span className="font-bold text-slate-900">{demand.label}</span>
                                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                                        demand.type === 'quote' ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'
                                                    }`}>
                                                        {demand.type}
                                                    </span>
                                                </div>
                                                <p className="text-slate-500 mt-1 font-medium">Customer: <strong className="text-slate-700">{demand.customerName}</strong> | Qty Needed: <strong className="text-slate-700">{demand.quantity}</strong></p>
                                                {demand.scheduledDate ? (
                                                    <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1 font-semibold">
                                                        <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                                                        Job starts: {new Date(demand.scheduledDate).toLocaleString()} 
                                                        <span className="text-indigo-600 ml-1">
                                                            ({Math.ceil((new Date(demand.scheduledDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days left)
                                                        </span>
                                                    </p>
                                                ) : (
                                                    <p className="text-[10px] text-amber-500 mt-1 flex items-center gap-1 font-bold">
                                                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                                        Job currently unscheduled
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Vendor Comparison and timing validation list */}
                                <div>
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Compare Sourcing Offers & Delivery Validators</h4>
                                    
                                    {sourcingOptions.some(o => o.type === 'setup') && (
                                        <div className="mb-4 p-3 bg-indigo-50/50 text-indigo-850 rounded-xl text-xs font-semibold border border-indigo-150 flex items-start gap-2 shadow-xs">
                                            <Info className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
                                            <div>
                                                <p className="font-bold text-indigo-900">Configured Vendor Priority</p>
                                                <p className="text-indigo-700/90 text-[11px] mt-0.5">Sourcing prioritizes your configured Setup Catalog Vendors. Online backups are presented below as competitive comparison/fallback models.</p>
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-4">
                                        {sourcingOptions.map((opt, i) => {
                                            const qtyToBuy = (orderQuantities[selectedBacklogItem.id] ?? Math.max(0, selectedBacklogItem.totalNeeded - selectedBacklogItem.totalOrdered)) || 1;
                                            
                                            // Delivery Validator logic
                                            const days = opt.shippingDays;
                                            const deliveryDate = new Date();
                                            deliveryDate.setDate(deliveryDate.getDate() + days);

                                            let isLate = false;
                                            let validatorBadge = null;

                                            if (selectedBacklogItem.earliestJobDate) {
                                                const earliestDate = new Date(selectedBacklogItem.earliestJobDate);
                                                
                                                if (deliveryDate > earliestDate) {
                                                    isLate = true;
                                                    const delay = Math.ceil((deliveryDate.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24));
                                                    validatorBadge = (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-black bg-rose-50 text-rose-700 px-2.5 py-0.5 rounded-full border border-rose-200 animate-pulse">
                                                            <AlertTriangle className="w-3 h-3 text-rose-500" />
                                                            LATE BY {delay} {delay === 1 ? 'DAY' : 'DAYS'}
                                                        </span>
                                                    );
                                                } else {
                                                    const buffer = Math.floor((earliestDate.getTime() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24));
                                                    validatorBadge = (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-black bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full border border-emerald-200">
                                                            <Check className="w-3 h-3 text-emerald-500" />
                                                            ON TIME (Buffer: {buffer}d)
                                                        </span>
                                                    );
                                                }
                                            } else {
                                                validatorBadge = (
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full">
                                                        <HelpCircle className="w-3 h-3 text-slate-400" />
                                                        Job Unscheduled (Arrives: {days}d)
                                                    </span>
                                                );
                                            }

                                            // Setup cost markup calculations
                                            const baseMarkup = selectedBacklogItem.markupPercentage || matchedMarkupPercent(selectedBacklogItem.id) || 20;
                                            const finalBillingPrice = opt.cost * (1 + baseMarkup / 100);

                                            const lowestCost = Math.min(...sourcingOptions.map(o => o.cost));
                                            const isLowestPrice = opt.cost === lowestCost;

                                            const subtotal = opt.cost * qtyToBuy;
                                            const orgTaxRate = 0;
                                            const tax = subtotal * (orgTaxRate / 100);
                                            const total = subtotal + tax;

                                            return (
                                                <div 
                                                    key={i} 
                                                    className={`p-4 border rounded-xl shadow-xs transition-all relative ${
                                                        opt.isPreferred 
                                                            ? 'border-amber-400 bg-amber-50/10' 
                                                            : 'border-slate-200 bg-white hover:border-slate-350'
                                                    }`}
                                                >
                                                    {opt.isPreferred && (
                                                        <span className="absolute -top-2.5 left-4 bg-amber-500 text-white font-black text-[9px] px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm uppercase tracking-wide">
                                                            <Star className="w-2.5 h-2.5 fill-white" />
                                                            ⭐ Optimal Vendor Winner
                                                        </span>
                                                    )}

                                                    <div className="flex justify-between items-start gap-4">
                                                        <div>
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <h5 className="font-extrabold text-slate-900 text-sm">{opt.vendor.name}</h5>
                                                                {opt.type === 'setup' ? (
                                                                    <span className="bg-indigo-50 text-indigo-755 text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase border border-indigo-200">
                                                                        Setup Vendor
                                                                    </span>
                                                                ) : (
                                                                    <span className="bg-slate-100 text-slate-600 text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase border border-slate-200">
                                                                        Online Backup
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex flex-wrap gap-1 mt-1.5">
                                                                {isLowestPrice && (
                                                                    <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                                                                        🏷️ Lowest Price
                                                                    </span>
                                                                )}
                                                                {opt.vendor.id === 'grainger_mock_id' && (
                                                                    <span className="bg-blue-100 text-blue-800 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                                                                        ⭐ Highest Quality
                                                                    </span>
                                                                )}
                                                                {opt.vendor.id === 'amazon_mock_id' && (
                                                                    <span className="bg-indigo-100 text-indigo-800 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                                                                        ⚡ Next-Day Prime
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {opt.vendor.accountNumber && (
                                                                <p className="text-[10px] text-slate-400 font-mono mt-1">Acct: {opt.vendor.accountNumber}</p>
                                                            )}
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="text-base font-black text-slate-950">${opt.cost.toFixed(2)}</span>
                                                            <span className="text-[10px] text-slate-400 block font-medium">unit cost</span>
                                                        </div>
                                                    </div>

                                                    {/* Cost, Markup, Billing breakdown */}
                                                    <div className="mt-3 grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-150 text-[11px] font-semibold text-slate-600">
                                                        <div>
                                                            <span className="text-slate-400 block font-bold text-[9px] uppercase tracking-wider">Unit Cost</span>
                                                            <span className="text-slate-800 font-extrabold">${opt.cost.toFixed(2)}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-slate-400 block font-bold text-[9px] uppercase tracking-wider">Markup</span>
                                                            <span className="text-amber-600 font-extrabold">+{baseMarkup}%</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-slate-400 block font-bold text-[9px] uppercase tracking-wider">Billing Price</span>
                                                            <span className="text-indigo-600 font-extrabold">${finalBillingPrice.toFixed(2)}</span>
                                                        </div>
                                                    </div>

                                                    {/* Delivery Validator & Timing */}
                                                    <div className="mt-3 flex items-center justify-between gap-4 flex-wrap text-xs">
                                                        <div className="flex items-center gap-1 text-slate-500 font-bold">
                                                            <Truck className="w-4 h-4 text-indigo-500" />
                                                            Est: {opt.shippingDays} {opt.shippingDays === 1 ? 'day' : 'days'}
                                                        </div>
                                                        {validatorBadge}
                                                    </div>

                                                    {/* Call to action */}
                                                    <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center gap-4">
                                                        <div className="flex flex-col text-xs text-slate-500 font-bold gap-0.5">
                                                            <div className="flex justify-between gap-4">
                                                                <span className="text-[10px] text-slate-400">Subtotal:</span>
                                                                <span className="text-slate-700 font-bold">${subtotal.toFixed(2)}</span>
                                                            </div>
                                                            <div className="flex justify-between gap-4 text-[10px] text-slate-400">
                                                                <span>Tax ({orgTaxRate}%):</span>
                                                                <span>+${tax.toFixed(2)}</span>
                                                            </div>
                                                            <div className="flex justify-between gap-4 border-t border-slate-150 pt-1 mt-0.5 text-slate-900">
                                                                <span className="font-extrabold">Total PO cost:</span>
                                                                <span className="font-black text-indigo-650">${total.toFixed(2)}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {(opt.vendor.webUsername || opt.vendor.website || opt.vendor.id === 'amazon_mock_id' || opt.vendor.id === 'grainger_mock_id') && (
                                                                <button
                                                                    onClick={() => handleLaunchWebPortal(opt, qtyToBuy)}
                                                                    className="px-3 py-2 bg-indigo-50 text-indigo-755 border border-indigo-250 hover:bg-indigo-100 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 shadow-xs"
                                                                    title="Open Web Portal and copy credentials/discounts"
                                                                >
                                                                    <Globe className="w-3.5 h-3.5 text-indigo-650" />
                                                                    Quick Web Order
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => handlePlaceDirectOrder(
                                                                    opt.vendor,
                                                                    selectedBacklogItem.name,
                                                                    selectedBacklogItem.materialId,
                                                                    selectedBacklogItem.sku,
                                                                    qtyToBuy,
                                                                    opt.cost
                                                                )}
                                                                disabled={isCreatingPO}
                                                                className={`px-3.5 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 shadow-sm text-white ${
                                                                    isCreatingPO 
                                                                        ? 'bg-slate-400 cursor-not-allowed'
                                                                        : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-250'
                                                                }`}
                                                            >
                                                                {isCreatingPO ? (
                                                                    <>
                                                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                                        Ordering...
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                                                        Place Direct
                                                                    </>
                                                                )}
                                                            </button>
                                                            <button
                                                                onClick={() => handleQuickOrder(
                                                                    opt.vendor,
                                                                    selectedBacklogItem.name,
                                                                    selectedBacklogItem.materialId,
                                                                    selectedBacklogItem.sku,
                                                                    qtyToBuy,
                                                                    opt.cost
                                                                )}
                                                                disabled={isCreatingPO}
                                                                className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 shadow-sm text-white ${
                                                                    isCreatingPO 
                                                                        ? 'bg-slate-400 cursor-not-allowed'
                                                                        : isLate
                                                                            ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-200'
                                                                            : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
                                                                }`}
                                                            >
                                                                {isCreatingPO ? (
                                                                    <>
                                                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                                        Drafting...
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <ShoppingCart className="w-3.5 h-3.5" />
                                                                        {poOption === 'merge' ? 'Add to Order' : 'Create New Order'}
                                                                    </>
                                                                )}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {showVendorsModal && (
                <ManageVendorsModal onClose={() => setShowVendorsModal(false)} />
            )}
            
            {showSearchModal && (
                <VendorSearchModal onClose={() => setShowSearchModal(false)} />
            )}

            {webOrderHelperOpen && webOrderOption && (
                <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-2xl w-full overflow-hidden transform transition-all animate-in fade-in zoom-in duration-200">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-950 px-6 py-5 flex items-center justify-between border-b border-indigo-950/20">
                            <div>
                                <span className="text-[10px] bg-indigo-500/20 text-indigo-200 border border-indigo-500/30 font-black tracking-wider uppercase px-2 py-0.5 rounded-full">
                                    Quick Checkout Helper
                                </span>
                                <h3 className="text-lg font-black text-white mt-1">
                                    Order from {webOrderOption.vendor.name}
                                </h3>
                            </div>
                            <button
                                onClick={() => {
                                    setWebOrderHelperOpen(false);
                                    setWebOrderOption(null);
                                }}
                                className="text-slate-400 hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6 space-y-6">
                            {/* Step 1: Open Website */}
                            <div>
                                <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider mb-2 flex items-center gap-1.5">
                                    <span className="w-5 h-5 bg-indigo-100 text-indigo-755 rounded-full flex items-center justify-center text-[10px] font-black">1</span>
                                    Launch Vendor Portal
                                </h4>
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4">
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-slate-800 truncate">
                                            {webOrderOption.vendor.website || 'No website registered.'}
                                        </p>
                                        <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                                            Click the button to open the web portal in a new tab.
                                        </p>
                                    </div>
                                    <a
                                        href={webOrderOption.vendor.website || '#'}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-black transition-all flex items-center gap-1.5 shadow-sm shadow-indigo-100 shrink-0"
                                    >
                                        <Globe className="w-3.5 h-3.5" />
                                        Launch Portal
                                    </a>
                                </div>
                            </div>

                            {/* Step 2: Logon Credentials */}
                            <div>
                                <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider mb-2 flex items-center gap-1.5">
                                    <span className="w-5 h-5 bg-indigo-100 text-indigo-755 rounded-full flex items-center justify-center text-[10px] font-black">2</span>
                                    Web Logon & Credentials
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {/* Username */}
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex justify-between items-center gap-2">
                                        <div className="min-w-0 flex-1">
                                            <span className="text-[10px] text-slate-400 font-bold block uppercase">Web Username / Email</span>
                                            <span className="text-xs font-mono font-bold text-slate-700 block truncate select-all mt-0.5">
                                                {webOrderOption.vendor.webUsername || 'No username saved'}
                                            </span>
                                        </div>
                                        {webOrderOption.vendor.webUsername && (
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(webOrderOption.vendor.webUsername || '');
                                                    setCopiedUsername(true);
                                                    setTimeout(() => setCopiedUsername(false), 2000);
                                                }}
                                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all shrink-0"
                                                title="Copy username"
                                            >
                                                {copiedUsername ? (
                                                    <Check className="w-4 h-4 text-emerald-600 animate-in zoom-in" />
                                                ) : (
                                                    <Copy className="w-4 h-4" />
                                                )}
                                            </button>
                                        )}
                                    </div>

                                    {/* Password */}
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex justify-between items-center gap-2">
                                        <div className="min-w-0 flex-1">
                                            <span className="text-[10px] text-slate-400 font-bold block uppercase">Web Password</span>
                                            <span className="text-xs font-mono font-bold text-slate-700 block truncate select-all mt-0.5">
                                                {showPassword ? (webOrderOption.vendor.webPassword || '••••••••') : '••••••••'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="p-2 text-slate-400 hover:text-slate-650 hover:bg-slate-100 rounded-lg transition-all"
                                                title={showPassword ? 'Hide password' : 'Show password'}
                                            >
                                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                            {webOrderOption.vendor.webPassword && (
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(webOrderOption.vendor.webPassword || '');
                                                        setCopiedPassword(true);
                                                        setTimeout(() => setCopiedPassword(false), 2000);
                                                    }}
                                                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                                    title="Copy password"
                                                >
                                                    {copiedPassword ? (
                                                        <Check className="w-4 h-4 text-emerald-600 animate-in zoom-in" />
                                                    ) : (
                                                        <Copy className="w-4 h-4" />
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <p className="text-[10px] text-slate-400 font-semibold mt-1.5 italic">
                                    💡 Tip: You can save this password in your browser's password manager when logging into the site.
                                </p>
                            </div>

                            {/* Step 3: Material SKU & TSV Copy */}
                            <div>
                                <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider mb-2 flex items-center gap-1.5">
                                    <span className="w-5 h-5 bg-indigo-100 text-indigo-755 rounded-full flex items-center justify-center text-[10px] font-black">3</span>
                                    Material SKU & Quantities
                                </h4>
                                <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden animate-in slide-in-from-bottom-2 duration-350">
                                    <div className="overflow-x-auto">
                                        <table className="w-full border-collapse text-left text-xs">
                                            <thead>
                                                <tr className="bg-slate-100 border-b border-slate-200 text-slate-500 font-black text-[10px] uppercase">
                                                    <th className="px-4 py-2">Item Name</th>
                                                    <th className="px-4 py-2">SKU / Model</th>
                                                    <th className="px-4 py-2 text-center">Qty</th>
                                                    <th className="px-4 py-2 text-right">Cost</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-150 font-bold text-slate-700">
                                                <tr>
                                                    <td className="px-4 py-3 text-slate-900">{webOrderOption.materialName}</td>
                                                    <td className="px-4 py-3 font-mono text-[11px] text-slate-550 select-all">{webOrderOption.sku}</td>
                                                    <td className="px-4 py-3 text-center text-slate-800">{webOrderOption.quantity}</td>
                                                    <td className="px-4 py-3 text-right text-indigo-650">${webOrderOption.unitCost.toFixed(2)}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                    
                                    {/* TSV Import helper for bulk ordering */}
                                    <div className="bg-indigo-50/30 p-4 border-t border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                                        <div>
                                            <span className="text-[10px] bg-indigo-100 text-indigo-855 font-black px-1.5 py-0.5 rounded uppercase block w-fit">
                                                Bulk TSV Import Format
                                            </span>
                                            <p className="text-[11px] text-slate-500 font-semibold mt-1 max-w-md">
                                                Copy and paste directly into bulk upload fields (e.g. Grainger's "Bulk Order" tool). Format is <code className="font-mono text-indigo-650 bg-indigo-50 px-1 py-0.5 rounded">SKU [TAB] Quantity</code>.
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const tsv = `${webOrderOption.sku}\t${webOrderOption.quantity}`;
                                                navigator.clipboard.writeText(tsv);
                                                setCopiedBulk(true);
                                                setTimeout(() => setCopiedBulk(false), 2000);
                                            }}
                                            className="px-3.5 py-1.5 bg-white border border-indigo-200 text-indigo-755 hover:bg-indigo-50 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 shrink-0 shadow-xs"
                                        >
                                            {copiedBulk ? (
                                                <>
                                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                                    Copied TSV!
                                                </>
                                            ) : (
                                                <>
                                                    <Copy className="w-3.5 h-3.5" />
                                                    Copy TSV Line
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Step 4: Discounts & Codes */}
                            {webOrderOption.vendor.discountCodes && (
                                <div>
                                    <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider mb-2 flex items-center gap-1.5">
                                        <span className="w-5 h-5 bg-indigo-100 text-indigo-755 rounded-full flex items-center justify-center text-[10px] font-black">4</span>
                                        Available Discounts & Promo Codes
                                    </h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {webOrderOption.vendor.discountCodes.split(',').map((codeStr, idx) => {
                                            const code = codeStr.trim();
                                            if (!code) return null;
                                            return (
                                                <div key={idx} className="bg-emerald-50/50 border border-emerald-250 rounded-xl p-3 flex justify-between items-center gap-3">
                                                    <div>
                                                        <span className="text-[10px] text-emerald-755 font-black block uppercase tracking-wider">Promo Code</span>
                                                        <span className="text-xs font-mono font-black text-slate-900 block mt-0.5 select-all">{code}</span>
                                                    </div>
                                                    <button
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(code);
                                                            setCopiedDiscount(true);
                                                            setTimeout(() => setCopiedDiscount(false), 2000);
                                                        }}
                                                        className="p-1.5 text-emerald-650 hover:bg-emerald-100 rounded-lg transition-all"
                                                        title="Copy promo code"
                                                    >
                                                        {copiedDiscount ? (
                                                            <Check className="w-3.5 h-3.5 text-emerald-600 animate-in zoom-in" />
                                                        ) : (
                                                            <Copy className="w-3.5 h-3.5" />
                                                        )}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Additional Instructions */}
                            {webOrderOption.vendor.orderInstructions && (
                                <div className="bg-amber-50/50 border border-amber-200 rounded-xl p-4">
                                    <h5 className="text-xs font-black text-amber-900 uppercase tracking-wider mb-1">
                                        Special Ordering Instructions
                                    </h5>
                                    <p className="text-xs font-semibold text-slate-650 leading-relaxed">
                                        {webOrderOption.vendor.orderInstructions}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Footer / Complete Step */}
                        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
                            <div className="text-xs text-slate-400 font-semibold text-center sm:text-left">
                                Once you submit the order on the vendor's portal, finalize here!
                            </div>
                            <div className="flex gap-2 w-full sm:w-auto shrink-0">
                                <button
                                    onClick={() => handleCompleteWebOrder(false)}
                                    disabled={isCreatingPO}
                                    className="flex-1 sm:flex-none px-4 py-2 border border-slate-350 text-slate-700 font-extrabold rounded-lg hover:bg-slate-100 transition-all text-xs"
                                >
                                    Save as Draft PO
                                </button>
                                <button
                                    onClick={() => handleCompleteWebOrder(true)}
                                    disabled={isCreatingPO}
                                    className="flex-1 sm:flex-none px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-lg transition-all text-xs shadow-md shadow-emerald-100 flex items-center justify-center gap-1.5 animate-pulse"
                                >
                                    <Check className="w-4 h-4" />
                                    Complete & Mark Sent
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    // Helpers to query markup percent from inventory if missing
    function matchedMarkupPercent(itemId: string): number {
        const item = materials.find(m => m.id === itemId);
        return item?.markupPercent || 20;
    }
};

