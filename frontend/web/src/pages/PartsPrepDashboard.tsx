import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../firebase';
import { 
    collection, query, where, onSnapshot, updateDoc, doc, Timestamp, addDoc, getDocs 
} from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
    Boxes, Truck, Warehouse, DollarSign, AlertTriangle, CheckCircle2, Clock, 
    Calendar, ArrowRight, ArrowRightLeft, Search, Filter, RefreshCw, FileText, 
    ExternalLink, Phone, Mail, ShieldAlert, Sparkles, User, ChevronRight, 
    Check, X, Eye, CreditCard, ChevronDown, PackageCheck, AlertCircle, 
    TrendingUp, MapPin, Receipt, PlusCircle, CheckCheck
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PurchaseOrder, POItem, Vendor } from '../types/Vendor';
import { Job, MaterialItem, JobPrepPackage } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────
const toDate = (val: any): Date | null => {
    if (!val) return null;
    if (val instanceof Date) return val;
    if (typeof val?.toDate === 'function') return val.toDate();
    if (typeof val === 'string' || typeof val === 'number') {
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
    }
    return null;
};

const formatDate = (val: any, fallback = 'TBD'): string => {
    const d = toDate(val);
    if (!d) return fallback;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatCurrency = (val: number | undefined): string => {
    return (val || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
};

type PersonaMode = 'all' | 'dispatcher' | 'accounting' | 'prep_tech';
type TabKey = 'prep_alerts' | 'incoming_orders' | 'warehouse_truck' | 'accounting_ap';

export const PartsPrepDashboard: React.FC = () => {
    const { user, organization } = useAuth();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const initialTab = (searchParams.get('tab') as TabKey) || 'prep_alerts';
    const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
    const [personaMode, setPersonaMode] = useState<PersonaMode>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);

    // Data Collections
    const [orders, setOrders] = useState<PurchaseOrder[]>([]);
    const [jobs, setJobs] = useState<Job[]>([]);
    const [materials, setMaterials] = useState<MaterialItem[]>([]);
    const [prepPackages, setPrepPackages] = useState<JobPrepPackage[]>([]);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [technicians, setTechnicians] = useState<any[]>([]);

    // Modals
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [selectedPOForPayment, setSelectedPOForPayment] = useState<PurchaseOrder | null>(null);
    const [paymentStatusInput, setPaymentStatusInput] = useState<'received_and_paid' | 'received_not_paid' | 'paid_in_full' | 'unpaid'>('received_and_paid');
    const [paymentMethodInput, setPaymentMethodInput] = useState<'credit_card' | 'ach' | 'check' | 'net_terms' | 'cash'>('credit_card');
    const [paymentRefInput, setPaymentRefInput] = useState('');
    const [invoiceNumInput, setInvoiceNumInput] = useState('');
    const [invoiceDateInput, setInvoiceDateInput] = useState(new Date().toISOString().slice(0, 10));
    const [paymentAmountInput, setPaymentAmountInput] = useState<number>(0);
    const [paymentNotesInput, setPaymentNotesInput] = useState('');
    const [isSavingPayment, setIsSavingPayment] = useState(false);

    // Transfer Modal
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [transferItem, setTransferItem] = useState<{ id: string; name: string; maxQty: number; source: 'warehouse' | 'truck'; currentTruck?: string } | null>(null);
    const [transferQty, setTransferQty] = useState(1);
    const [targetDestination, setTargetDestination] = useState<'truck' | 'warehouse'>('truck');
    const [targetTechId, setTargetTechId] = useState('');
    const [targetTechName, setTargetTechName] = useState('');
    const [transferNotes, setTransferNotes] = useState('');
    const [isSavingTransfer, setIsSavingTransfer] = useState(false);

    // Update Expected Delivery Modal
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [selectedPOForSchedule, setSelectedPOForSchedule] = useState<PurchaseOrder | null>(null);
    const [expDateInput, setExpDateInput] = useState('');
    const [carrierInput, setCarrierInput] = useState('');
    const [trackingInput, setTrackingInput] = useState('');
    const [deliveryStatusInput, setDeliveryStatusInput] = useState<string>('in_transit');
    const [isSavingSchedule, setIsSavingSchedule] = useState(false);

    // Quick Receive Modal
    const [showReceiveModal, setShowReceiveModal] = useState(false);
    const [selectedPOForReceive, setSelectedPOForReceive] = useState<PurchaseOrder | null>(null);
    const [receiveLines, setReceiveLines] = useState<Array<{
        materialId: string;
        name: string;
        sku: string;
        qtyOrdered: number;
        previouslyReceived: number;
        receiveNow: number;
        condition: 'good' | 'damaged';
        location: string;
        bin: string;
    }>>([]);
    const [receiveNotes, setReceiveNotes] = useState('');
    const [isSavingReceipt, setIsSavingReceipt] = useState(false);

    const orgId = user?.org_id || (user as any)?.organizationId;

    // ─── Subscriptions ────────────────────────────────────────────────────────
    useEffect(() => {
        if (!orgId) return;
        setLoading(true);
        const unsubs: (() => void)[] = [];

        // 1. Purchase Orders
        const qPOs = query(collection(db, 'purchaseOrders'), where('organizationId', '==', orgId));
        unsubs.push(onSnapshot(qPOs, snap => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as PurchaseOrder));
            setOrders(list);
        }));

        // 2. Jobs
        const qJobs = query(collection(db, 'jobs'), where('org_id', '==', orgId));
        unsubs.push(onSnapshot(qJobs, snap => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Job));
            setJobs(list);
        }));

        // 3. Materials
        const qMats = query(collection(db, 'materials'), where('org_id', '==', orgId));
        unsubs.push(onSnapshot(qMats, snap => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as MaterialItem));
            setMaterials(list);
        }));

        // 4. Job Prep Packages
        const qPrep = query(collection(db, 'jobPrepPackages'), where('org_id', '==', orgId));
        unsubs.push(onSnapshot(qPrep, snap => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as JobPrepPackage));
            setPrepPackages(list);
        }));

        // 5. Vendors
        const qVendors = query(collection(db, 'vendors'), where('organizationId', '==', orgId));
        unsubs.push(onSnapshot(qVendors, snap => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Vendor));
            setVendors(list);
        }));

        // 6. Technicians (users with role technician)
        const qTechs = query(collection(db, 'users'), where('org_id', '==', orgId), where('role', '==', 'technician'));
        unsubs.push(onSnapshot(qTechs, snap => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setTechnicians(list);
            setLoading(false);
        }));

        return () => unsubs.forEach(u => u());
    }, [orgId]);

    // Sync tab with URL
    const handleTabChange = (tab: TabKey) => {
        setActiveTab(tab);
        setSearchParams({ tab });
    };

    // ─── Calculations & Groupings ─────────────────────────────────────────────

    // 1. Scheduled Jobs Analysis (Prep Readiness & Risks)
    const scheduledJobsAnalysis = useMemo(() => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        return jobs
            .filter(j => j.status === 'scheduled' || j.status === 'in_progress')
            .map(job => {
                const schedDate = toDate(job.scheduled_at);
                const daysUntilJob = schedDate ? Math.ceil((schedDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;

                // Find associated POs for this job
                const linkedPOs = orders.filter(po => po.jobId === job.id || po.items.some(i => i.jobId === job.id));

                // Find prep package
                const prepPkg = prepPackages.find(p => p.job_id === job.id);

                // Collect required materials list from job and POs
                const requiredItems: Array<{
                    name: string;
                    sku?: string;
                    qtyNeeded: number;
                    qtyReceived: number;
                    status: 'arrived_warehouse' | 'on_truck' | 'in_transit' | 'delayed' | 'not_ordered';
                    expectedArrival?: Date | null;
                    poId?: string;
                    vendorName?: string;
                    carrier?: string;
                    trackingNumber?: string;
                    location?: string;
                }> = [];

                // From job.materials_needed
                if (job.materials_needed && Array.isArray(job.materials_needed)) {
                    job.materials_needed.forEach(m => {
                        const po = linkedPOs.find(p => p.items.some(it => it.name.toLowerCase() === m.name.toLowerCase()));
                        const poItem = po?.items.find(it => it.name.toLowerCase() === m.name.toLowerCase());
                        const isRecv = m.received || po?.status === 'received' || (poItem && (poItem.receivedQty || 0) >= (m.quantity || 1));
                        
                        let itemStatus: 'arrived_warehouse' | 'on_truck' | 'in_transit' | 'delayed' | 'not_ordered' = 'not_ordered';
                        if (poItem?.transferredToTruck || po?.destinationType === 'shop' || poItem?.truckLocation) {
                            itemStatus = 'on_truck';
                        } else if (isRecv) {
                            itemStatus = 'arrived_warehouse';
                        } else if (po) {
                            const exp = toDate(po.expectedDeliveryDate);
                            if (exp && schedDate && exp.getTime() > schedDate.getTime()) {
                                itemStatus = 'delayed';
                            } else {
                                itemStatus = 'in_transit';
                            }
                        }

                        requiredItems.push({
                            name: m.name,
                            qtyNeeded: m.quantity || 1,
                            qtyReceived: isRecv ? (m.quantity || 1) : (poItem?.receivedQty || 0),
                            status: itemStatus,
                            expectedArrival: toDate(po?.expectedDeliveryDate),
                            poId: po?.id,
                            vendorName: po?.vendorName,
                            carrier: po?.carrier,
                            trackingNumber: po?.trackingNumber,
                            location: poItem?.binLocation || 'Warehouse'
                        });
                    });
                }

                // From linked PO items if not already added
                linkedPOs.forEach(po => {
                    po.items.forEach(it => {
                        const already = requiredItems.some(r => r.name.toLowerCase() === it.name.toLowerCase());
                        if (!already) {
                            const isRecv = (it.receivedQty || 0) >= it.quantity || po.status === 'received';
                            let itemStatus: 'arrived_warehouse' | 'on_truck' | 'in_transit' | 'delayed' | 'not_ordered' = 'in_transit';
                            if (it.transferredToTruck || it.truckLocation) {
                                itemStatus = 'on_truck';
                            } else if (isRecv) {
                                itemStatus = 'arrived_warehouse';
                            } else {
                                const exp = toDate(po.expectedDeliveryDate);
                                if (exp && schedDate && exp.getTime() > schedDate.getTime()) {
                                    itemStatus = 'delayed';
                                } else {
                                    itemStatus = 'in_transit';
                                }
                            }

                            requiredItems.push({
                                name: it.name,
                                sku: it.sku,
                                qtyNeeded: it.quantity,
                                qtyReceived: it.receivedQty || (isRecv ? it.quantity : 0),
                                status: itemStatus,
                                expectedArrival: toDate(po.expectedDeliveryDate),
                                poId: po.id,
                                vendorName: po.vendorName,
                                carrier: po.carrier,
                                trackingNumber: po.trackingNumber,
                                location: it.binLocation || 'Warehouse'
                            });
                        }
                    });
                });

                // Compute overall job readiness state
                const hasItems = requiredItems.length > 0;
                const allArrived = hasItems && requiredItems.every(i => i.status === 'arrived_warehouse' || i.status === 'on_truck');
                const allOnTruck = hasItems && requiredItems.every(i => i.status === 'on_truck');
                const hasDelayedOrMissing = hasItems && requiredItems.some(i => i.status === 'delayed' || i.status === 'in_transit' || i.status === 'not_ordered');

                // Determine prep alert category
                let prepAlert: 'critical_risk' | 'warning' | 'ready_to_prep' | 'on_truck' | 'no_parts_needed' = 'no_parts_needed';

                if (hasItems) {
                    if (allOnTruck) {
                        prepAlert = 'on_truck';
                    } else if (allArrived) {
                        prepAlert = 'ready_to_prep';
                    } else if (daysUntilJob !== null && daysUntilJob <= 3 && hasDelayedOrMissing) {
                        prepAlert = 'critical_risk';
                    } else if (hasDelayedOrMissing) {
                        prepAlert = 'warning';
                    }
                }

                return {
                    job,
                    schedDate,
                    daysUntilJob,
                    prepPkg,
                    linkedPOs,
                    requiredItems,
                    prepAlert,
                    hasItems,
                    allArrived,
                    allOnTruck
                };
            })
            .sort((a, b) => {
                // Priority: critical_risk first, then ready_to_prep, then by date
                if (a.prepAlert === 'critical_risk' && b.prepAlert !== 'critical_risk') return -1;
                if (b.prepAlert === 'critical_risk' && a.prepAlert !== 'critical_risk') return 1;
                if (a.prepAlert === 'ready_to_prep' && b.prepAlert !== 'ready_to_prep') return -1;
                if (b.prepAlert === 'ready_to_prep' && a.prepAlert !== 'ready_to_prep') return 1;
                return (a.schedDate?.getTime() || 0) - (b.schedDate?.getTime() || 0);
            });
    }, [jobs, orders, prepPackages]);

    // 2. Incoming Orders Breakdown
    const incomingOrders = useMemo(() => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        return orders
            .filter(o => o.status !== 'canceled')
            .map(po => {
                const expDate = toDate(po.expectedDeliveryDate);
                const isOverdue = expDate ? (expDate.getTime() < now.getTime() && po.status !== 'received') : false;
                const isArrived = po.status === 'received' || po.deliveryStatus === 'delivered';
                
                // Delivery status badge
                const delStatus = po.deliveryStatus || (isArrived ? 'delivered' : isOverdue ? 'delayed' : 'in_transit');

                return {
                    po,
                    expDate,
                    isOverdue,
                    isArrived,
                    delStatus
                };
            })
            .sort((a, b) => (b.po.createdAt?.toMillis?.() || 0) - (a.po.createdAt?.toMillis?.() || 0));
    }, [orders]);

    // 3. Accounting & AP Ledger Calculation
    const accountingAnalysis = useMemo(() => {
        let totalReceivedNotPaid = 0;
        let countReceivedNotPaid = 0;

        let totalReceivedAndPaid = 0;
        let countReceivedAndPaid = 0;

        let totalPaidAdvance = 0;
        let countPaidAdvance = 0;

        let totalUnpaidOpen = 0;
        let countUnpaidOpen = 0;

        const categorizedPOs = orders.map(po => {
            const isRecv = po.status === 'received' || po.status === 'partially_received' || po.deliveryStatus === 'delivered';
            const isPaid = po.paymentStatus === 'received_and_paid' || po.paymentStatus === 'paid_in_full';

            let category: 'received_not_paid' | 'received_and_paid' | 'paid_advance' | 'unpaid_open';

            if (isRecv && !isPaid) {
                category = 'received_not_paid';
                totalReceivedNotPaid += po.total || 0;
                countReceivedNotPaid++;
            } else if (isRecv && isPaid) {
                category = 'received_and_paid';
                totalReceivedAndPaid += po.total || 0;
                countReceivedAndPaid++;
            } else if (!isRecv && isPaid) {
                category = 'paid_advance';
                totalPaidAdvance += po.total || 0;
                countPaidAdvance++;
            } else {
                category = 'unpaid_open';
                totalUnpaidOpen += po.total || 0;
                countUnpaidOpen++;
            }

            return {
                po,
                isRecv,
                isPaid,
                category
            };
        });

        return {
            categorizedPOs,
            totalReceivedNotPaid,
            countReceivedNotPaid,
            totalReceivedAndPaid,
            countReceivedAndPaid,
            totalPaidAdvance,
            countPaidAdvance,
            totalUnpaidOpen,
            countUnpaidOpen
        };
    }, [orders]);

    // 4. Warehouse vs Truck Inventory Breakdown
    const inventoryLocationsAnalysis = useMemo(() => {
        const warehouseItems: MaterialItem[] = [];
        const truckItems: MaterialItem[] = [];

        materials.forEach(m => {
            const loc = (m.location || '').toLowerCase();
            if (loc.includes('truck') || m.tech_id || m.assigned_tech_name || m.truck_name) {
                truckItems.push(m);
            } else {
                warehouseItems.push(m);
            }
        });

        // Group truck items by tech/truck
        const byTruckMap: Record<string, MaterialItem[]> = {};
        truckItems.forEach(t => {
            const key = t.truck_name || t.assigned_tech_name || (t.tech_id ? `Tech ID: ${t.tech_id.slice(0, 6)}` : 'Unassigned Tech Truck');
            if (!byTruckMap[key]) byTruckMap[key] = [];
            byTruckMap[key].push(t);
        });

        return {
            warehouseItems,
            truckItems,
            byTruckMap,
            totalWarehouseQty: warehouseItems.reduce((acc, it) => acc + (it.quantity || 0), 0),
            totalWarehouseVal: warehouseItems.reduce((acc, it) => acc + (it.quantity || 0) * (it.unitCost || 0), 0),
            totalTruckQty: truckItems.reduce((acc, it) => acc + (it.quantity || 0), 0),
            totalTruckVal: truckItems.reduce((acc, it) => acc + (it.quantity || 0) * (it.unitCost || 0), 0),
        };
    }, [materials]);

    // Alerts count for badge
    const criticalAlertsCount = scheduledJobsAnalysis.filter(j => j.prepAlert === 'critical_risk').length;
    const readyToPrepCount = scheduledJobsAnalysis.filter(j => j.prepAlert === 'ready_to_prep').length;

    // ─── Modal Handlers ───────────────────────────────────────────────────────
    
    // Open Payment Modal
    const handleOpenPaymentModal = (po: PurchaseOrder) => {
        setSelectedPOForPayment(po);
        setPaymentStatusInput(po.paymentStatus === 'received_and_paid' ? 'received_and_paid' : 
                               po.paymentStatus === 'paid_in_full' ? 'paid_in_full' : 
                               po.status === 'received' ? 'received_and_paid' : 'received_not_paid');
        setPaymentMethodInput((po.paymentMethod as any) || 'credit_card');
        setPaymentRefInput(po.paymentReference || '');
        setInvoiceNumInput(po.invoiceNumber || '');
        setInvoiceDateInput(po.invoiceDate ? toDate(po.invoiceDate)?.toISOString().slice(0, 10) || '' : new Date().toISOString().slice(0, 10));
        setPaymentAmountInput(po.paidAmount || po.total || 0);
        setPaymentNotesInput(po.paymentNotes || '');
        setShowPaymentModal(true);
    };

    // Save Payment Status
    const handleSavePayment = async () => {
        if (!selectedPOForPayment?.id) return;
        setIsSavingPayment(true);
        try {
            const updatePayload: Partial<PurchaseOrder> = {
                paymentStatus: paymentStatusInput,
                paidAmount: paymentAmountInput,
                paidAt: paymentStatusInput === 'received_and_paid' || paymentStatusInput === 'paid_in_full' ? Timestamp.now() : null,
                paidBy: user?.uid,
                paidByName: user?.displayName || user?.email || 'Accounting Agent',
                paymentMethod: paymentMethodInput,
                paymentReference: paymentRefInput,
                invoiceNumber: invoiceNumInput,
                invoiceDate: invoiceDateInput ? Timestamp.fromDate(new Date(invoiceDateInput)) : null,
                paymentNotes: paymentNotesInput
            };

            await updateDoc(doc(db, 'purchaseOrders', selectedPOForPayment.id), updatePayload);
            toast.success(`Updated accounting status for PO #${selectedPOForPayment.externalOrderNumber || selectedPOForPayment.id.slice(0, 8)}`);
            setShowPaymentModal(false);
        } catch (err: any) {
            console.error('Error updating PO payment:', err);
            toast.error(`Failed to update payment: ${err.message || 'Unknown error'}`);
        } finally {
            setIsSavingPayment(false);
        }
    };

    // Open Transfer Modal
    const handleOpenTransferModal = (item: { id: string; name: string; maxQty: number; source: 'warehouse' | 'truck'; currentTruck?: string }) => {
        setTransferItem(item);
        setTransferQty(1);
        setTargetDestination(item.source === 'warehouse' ? 'truck' : 'warehouse');
        setTargetTechId(technicians[0]?.id || '');
        setTargetTechName(technicians[0]?.name || technicians[0]?.displayName || 'Primary Tech Truck');
        setTransferNotes('');
        setShowTransferModal(true);
    };

    // Execute Transfer
    const handleExecuteTransfer = async () => {
        if (!transferItem?.id) return;
        setIsSavingTransfer(true);
        try {
            const matRef = doc(db, 'materials', transferItem.id);
            if (targetDestination === 'truck') {
                await updateDoc(matRef, {
                    location: 'Truck',
                    tech_id: targetTechId || null,
                    assigned_tech_name: targetTechName,
                    truck_name: `${targetTechName}'s Truck`,
                    lastRestockedAt: Timestamp.now()
                });
                toast.success(`Transferred ${transferQty} unit(s) of "${transferItem.name}" to ${targetTechName}'s Truck`);
            } else {
                await updateDoc(matRef, {
                    location: 'Warehouse',
                    tech_id: null,
                    assigned_tech_name: null,
                    truck_name: null,
                    zone: 'Staging / Pick Area',
                    lastRestockedAt: Timestamp.now()
                });
                toast.success(`Returned ${transferQty} unit(s) of "${transferItem.name}" to Warehouse`);
            }
            setShowTransferModal(false);
        } catch (err: any) {
            console.error('Error executing inventory transfer:', err);
            toast.error(`Transfer failed: ${err.message || 'Unknown error'}`);
        } finally {
            setIsSavingTransfer(false);
        }
    };

    // Open Schedule / Tracking Modal
    const handleOpenScheduleModal = (po: PurchaseOrder) => {
        setSelectedPOForSchedule(po);
        setExpDateInput(po.expectedDeliveryDate ? toDate(po.expectedDeliveryDate)?.toISOString().slice(0, 10) || '' : '');
        setCarrierInput(po.carrier || '');
        setTrackingInput(po.trackingNumber || '');
        setDeliveryStatusInput(po.deliveryStatus || 'in_transit');
        setShowScheduleModal(true);
    };

    // Save Schedule / Tracking
    const handleSaveSchedule = async () => {
        if (!selectedPOForSchedule?.id) return;
        setIsSavingSchedule(true);
        try {
            const updatePayload: any = {
                expectedDeliveryDate: expDateInput ? Timestamp.fromDate(new Date(expDateInput)) : null,
                carrier: carrierInput,
                trackingNumber: trackingInput,
                deliveryStatus: deliveryStatusInput
            };

            if (deliveryStatusInput === 'delivered' && selectedPOForSchedule.status !== 'received') {
                updatePayload.status = 'received';
                updatePayload.receivedAt = Timestamp.now();
                updatePayload.receivedBy = user?.uid;
            }

            await updateDoc(doc(db, 'purchaseOrders', selectedPOForSchedule.id), updatePayload);

            // Also check linked job and update expected date
            if (selectedPOForSchedule.jobId) {
                try {
                    await updateDoc(doc(db, 'jobs', selectedPOForSchedule.jobId), {
                        expectedPartsArrivalDate: expDateInput ? Timestamp.fromDate(new Date(expDateInput)) : null,
                        partsCarrier: carrierInput,
                        partsTrackingNumber: trackingInput,
                        parts_ready: deliveryStatusInput === 'delivered'
                    });
                } catch (e) {
                    console.warn('Could not cascade date to linked job:', e);
                }
            }

            toast.success(`Updated arrival schedule for PO #${selectedPOForSchedule.externalOrderNumber || selectedPOForSchedule.id.slice(0, 8)}`);
            setShowScheduleModal(false);
        } catch (err: any) {
            console.error('Error updating PO schedule:', err);
            toast.error(`Failed to update schedule: ${err.message || 'Unknown error'}`);
        } finally {
            setIsSavingSchedule(false);
        }
    };

    // Open Quick Receive Modal
    const handleOpenReceiveModal = (po: PurchaseOrder) => {
        setSelectedPOForReceive(po);
        setReceiveLines(po.items.map(item => {
            const prev = item.receivedQty || 0;
            const remaining = Math.max(0, item.quantity - prev);
            return {
                materialId: item.materialId,
                name: item.name,
                sku: item.sku || '',
                qtyOrdered: item.quantity,
                previouslyReceived: prev,
                receiveNow: remaining,
                condition: 'good',
                location: 'Warehouse',
                bin: item.binLocation || 'Dock-Staging'
            };
        }));
        setReceiveNotes('');
        setShowReceiveModal(true);
    };

    // Execute Quick Receive (Partial or Full)
    const handleExecuteReceive = async () => {
        if (!selectedPOForReceive?.id || !user) return;
        const totalReceivingNow = receiveLines.reduce((acc, l) => acc + (l.receiveNow || 0), 0);
        if (totalReceivingNow <= 0) {
            toast.error('Please enter a quantity greater than 0 to receive.');
            return;
        }

        setIsSavingReceipt(true);
        try {
            const updatedItems = selectedPOForReceive.items.map((item, idx) => {
                const line = receiveLines[idx];
                const added = line ? Math.max(0, line.receiveNow) : 0;
                return {
                    ...item,
                    receivedQty: (item.receivedQty || 0) + added,
                    binLocation: line?.bin || item.binLocation || 'Dock-Staging'
                };
            });

            const allFullyReceived = updatedItems.every(i => (i.receivedQty || 0) >= i.quantity);

            // 1. Audit Log in receivingRecords
            await addDoc(collection(db, 'receivingRecords'), {
                org_id: orgId,
                purchaseOrderId: selectedPOForReceive.id,
                vendorId: selectedPOForReceive.vendorId || '',
                vendorName: selectedPOForReceive.vendorName || '',
                receivedBy: user.uid,
                receivedByName: user.displayName || user.email || 'Prep Tech',
                receivedAt: Timestamp.now(),
                items: receiveLines.filter(l => l.receiveNow > 0).map(l => ({
                    materialId: l.materialId,
                    name: l.name,
                    sku: l.sku,
                    quantityExpected: l.qtyOrdered,
                    quantityReceived: l.receiveNow,
                    condition: l.condition,
                    binLocation: l.bin
                })),
                notes: receiveNotes || '',
                status: allFullyReceived ? 'complete' : 'partial'
            });

            // 2. Update PO in Firestore
            const poUpdate: any = {
                items: updatedItems,
                status: allFullyReceived ? 'received' : 'partially_received',
                deliveryStatus: allFullyReceived ? 'delivered' : 'in_transit',
                receivedAt: allFullyReceived ? Timestamp.now() : (selectedPOForReceive.receivedAt || Timestamp.now()),
                receivedBy: user.uid,
                updatedAt: Timestamp.now()
            };

            // Transition paymentStatus: if unpaid or not set, merchandise is now in warehouse -> accrued liability!
            if (!selectedPOForReceive.paymentStatus || selectedPOForReceive.paymentStatus === 'unpaid') {
                poUpdate.paymentStatus = 'received_not_paid';
            }

            await updateDoc(doc(db, 'purchaseOrders', selectedPOForReceive.id), poUpdate);

            // 3. Update linked Job readiness
            if (selectedPOForReceive.jobId) {
                try {
                    await updateDoc(doc(db, 'jobs', selectedPOForReceive.jobId), {
                        parts_ready: allFullyReceived,
                        equipment_ready: allFullyReceived,
                        parts_procurement_status: allFullyReceived ? 'ready' : 'partially_received',
                        has_pending_po: !allFullyReceived,
                        updatedAt: Timestamp.now()
                    });
                } catch (jErr) {
                    console.warn('Could not update linked job readiness:', jErr);
                }
            }

            // 4. Update warehouse materials inventory
            for (const line of receiveLines) {
                if (line.receiveNow <= 0) continue;
                const mat = materials.find(m => m.id === line.materialId || m.name.toLowerCase() === line.name.toLowerCase());
                if (mat?.id) {
                    try {
                        await updateDoc(doc(db, 'materials', mat.id), {
                            quantity: (mat.quantity || 0) + line.receiveNow,
                            location: 'Warehouse',
                            zone: 'Staging / Pick Area',
                            binLocation: line.bin || 'Dock-Staging',
                            lastRestockedAt: Timestamp.now()
                        });
                    } catch (mErr) {
                        console.warn(`Could not update material ${line.name}:`, mErr);
                    }
                } else {
                    try {
                        await addDoc(collection(db, 'materials'), {
                            org_id: orgId,
                            organizationId: orgId,
                            name: line.name,
                            sku: line.sku || '',
                            quantity: line.receiveNow,
                            location: 'Warehouse',
                            zone: 'Staging / Pick Area',
                            binLocation: line.bin || 'Dock-Staging',
                            unitCost: selectedPOForReceive.items.find(i => i.materialId === line.materialId)?.unitPrice || 0,
                            lastRestockedAt: Timestamp.now(),
                            createdAt: Timestamp.now()
                        });
                    } catch (mCreateErr) {
                        console.warn(`Could not create material ${line.name}:`, mCreateErr);
                    }
                }
            }

            toast.success(
                allFullyReceived
                    ? `All items received for PO #${selectedPOForReceive.externalOrderNumber || selectedPOForReceive.id.slice(0, 8)}! Linked job is now Ready to Prep.`
                    : `Partial receipt recorded (${totalReceivingNow} items). PO updated to Partially Received.`
            );
            setShowReceiveModal(false);
        } catch (err: any) {
            console.error('Error saving receipt:', err);
            toast.error(`Receipt failed: ${err.message || 'Unknown error'}`);
        } finally {
            setIsSavingReceipt(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50/70 p-4 sm:p-6 lg:p-8 space-y-6">
            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* 1. HEADER & PERSONA ROLE SWITCHER */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-sm">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-amber-500 flex items-center justify-center text-white shadow-md shadow-indigo-100">
                                <Boxes className="w-6 h-6" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                                        Parts & Materials Prep Dashboard
                                    </h1>
                                    <span className="px-2 py-0.5 text-xs font-semibold bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200">
                                        Sandbox Pro
                                    </span>
                                </div>
                                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                                    Unified visibility for dispatchers, accounting & prep techs: incoming orders, warehouse staging, tech truck stock & AP reconciliation.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Role Filter & Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
                        <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-medium text-slate-600">
                            <button
                                type="button"
                                onClick={() => setPersonaMode('all')}
                                className={`px-3 py-1.5 rounded-lg transition-all ${personaMode === 'all' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'hover:text-slate-900'}`}
                            >
                                All Views
                            </button>
                            <button
                                type="button"
                                onClick={() => { setPersonaMode('dispatcher'); setActiveTab('prep_alerts'); }}
                                className={`px-3 py-1.5 rounded-lg transition-all ${personaMode === 'dispatcher' ? 'bg-blue-600 text-white shadow-xs font-semibold' : 'hover:text-slate-900'}`}
                            >
                                Dispatcher
                            </button>
                            <button
                                type="button"
                                onClick={() => { setPersonaMode('accounting'); setActiveTab('accounting_ap'); }}
                                className={`px-3 py-1.5 rounded-lg transition-all ${personaMode === 'accounting' ? 'bg-amber-600 text-white shadow-xs font-semibold' : 'hover:text-slate-900'}`}
                            >
                                Accounting (AP)
                            </button>
                            <button
                                type="button"
                                onClick={() => { setPersonaMode('prep_tech'); setActiveTab('prep_alerts'); }}
                                className={`px-3 py-1.5 rounded-lg transition-all ${personaMode === 'prep_tech' ? 'bg-emerald-600 text-white shadow-xs font-semibold' : 'hover:text-slate-900'}`}
                            >
                                Prep Techs
                            </button>
                        </div>

                        <Link
                            to="/purchase-orders"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors border border-slate-200"
                        >
                            <PlusCircle className="w-3.5 h-3.5" />
                            Create PO
                        </Link>
                        <Link
                            to="/receiving"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-xl transition-colors border border-blue-200"
                        >
                            <PackageCheck className="w-3.5 h-3.5" />
                            Receiving Dock
                        </Link>
                    </div>
                </div>

                {/* ═══════════════════════════════════════════════════════════ */}
                {/* 2. EXECUTIVE KPI CARDS */}
                {/* ═══════════════════════════════════════════════════════════ */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-6">
                    {/* Card 1: Critical Prep Risk */}
                    <button
                        type="button"
                        onClick={() => handleTabChange('prep_alerts')}
                        className={`text-left p-3.5 rounded-xl border transition-all relative overflow-hidden ${
                            criticalAlertsCount > 0 
                                ? 'bg-rose-50/70 border-rose-200 hover:border-rose-300 ring-rose-200/50' 
                                : 'bg-slate-50/80 border-slate-200 hover:border-slate-300'
                        } ${activeTab === 'prep_alerts' ? 'ring-2 ring-rose-400 shadow-xs' : ''}`}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700 flex items-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 animate-pulse" />
                                Prep Risks
                            </span>
                            <span className={`text-xs px-1.5 py-0.5 font-bold rounded-md ${criticalAlertsCount > 0 ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                                {criticalAlertsCount}
                            </span>
                        </div>
                        <div className="text-xl font-extrabold text-slate-900 mt-1">
                            {criticalAlertsCount} {criticalAlertsCount === 1 ? 'Job At Risk' : 'Jobs At Risk'}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                            Scheduled &lt; 3 days, parts missing
                        </div>
                    </button>

                    {/* Card 2: Ready to Prep */}
                    <button
                        type="button"
                        onClick={() => handleTabChange('prep_alerts')}
                        className={`text-left p-3.5 rounded-xl border transition-all ${
                            readyToPrepCount > 0 
                                ? 'bg-emerald-50/70 border-emerald-200 hover:border-emerald-300' 
                                : 'bg-slate-50/80 border-slate-200 hover:border-slate-300'
                        } ${activeTab === 'prep_alerts' ? 'ring-2 ring-emerald-400 shadow-xs' : ''}`}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                Ready to Prep
                            </span>
                            <span className="text-xs px-1.5 py-0.5 font-bold rounded-md bg-emerald-600 text-white">
                                {readyToPrepCount}
                            </span>
                        </div>
                        <div className="text-xl font-extrabold text-slate-900 mt-1">
                            {readyToPrepCount} {readyToPrepCount === 1 ? 'Job Ready' : 'Jobs Ready'}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                            Merchandise arrived in warehouse
                        </div>
                    </button>

                    {/* Card 3: Incoming Orders */}
                    <button
                        type="button"
                        onClick={() => handleTabChange('incoming_orders')}
                        className={`text-left p-3.5 rounded-xl border transition-all bg-blue-50/60 border-blue-200 hover:border-blue-300 ${
                            activeTab === 'incoming_orders' ? 'ring-2 ring-blue-400 shadow-xs' : ''
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 flex items-center gap-1">
                                <Truck className="w-3.5 h-3.5 text-blue-600" />
                                Incoming Orders
                            </span>
                            <span className="text-xs px-1.5 py-0.5 font-bold rounded-md bg-blue-600 text-white">
                                {incomingOrders.filter(o => !o.isArrived).length}
                            </span>
                        </div>
                        <div className="text-xl font-extrabold text-slate-900 mt-1">
                            {incomingOrders.filter(o => !o.isArrived).length} In Transit
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                            {incomingOrders.filter(o => o.isOverdue).length} overdue / delayed
                        </div>
                    </button>

                    {/* Card 4: Warehouse vs Trucks */}
                    <button
                        type="button"
                        onClick={() => handleTabChange('warehouse_truck')}
                        className={`text-left p-3.5 rounded-xl border transition-all bg-indigo-50/60 border-indigo-200 hover:border-indigo-300 ${
                            activeTab === 'warehouse_truck' ? 'ring-2 ring-indigo-400 shadow-xs' : ''
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-1">
                                <Warehouse className="w-3.5 h-3.5 text-indigo-600" />
                                Stock Balance
                            </span>
                            <span className="text-xs px-1.5 py-0.5 font-bold rounded-md bg-indigo-600 text-white">
                                {inventoryLocationsAnalysis.totalWarehouseQty + inventoryLocationsAnalysis.totalTruckQty}
                            </span>
                        </div>
                        <div className="text-xl font-extrabold text-slate-900 mt-1">
                            {inventoryLocationsAnalysis.totalWarehouseQty} whse / {inventoryLocationsAnalysis.totalTruckQty} truck
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                            {formatCurrency(inventoryLocationsAnalysis.totalWarehouseVal + inventoryLocationsAnalysis.totalTruckVal)} inventory value
                        </div>
                    </button>

                    {/* Card 5: Accounting AP Status */}
                    <button
                        type="button"
                        onClick={() => handleTabChange('accounting_ap')}
                        className={`text-left p-3.5 rounded-xl border transition-all bg-amber-50/70 border-amber-200 hover:border-amber-300 ${
                            activeTab === 'accounting_ap' ? 'ring-2 ring-amber-400 shadow-xs' : ''
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1">
                                <Receipt className="w-3.5 h-3.5 text-amber-700" />
                                Accrued AP
                            </span>
                            <span className="text-xs px-1.5 py-0.5 font-bold rounded-md bg-amber-600 text-white">
                                {accountingAnalysis.countReceivedNotPaid}
                            </span>
                        </div>
                        <div className="text-xl font-extrabold text-slate-900 mt-1 text-amber-950">
                            {formatCurrency(accountingAnalysis.totalReceivedNotPaid)}
                        </div>
                        <div className="text-[11px] text-amber-800 mt-0.5 truncate font-medium">
                            Received Not Paid (Unbilled)
                        </div>
                    </button>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* 3. PROACTIVE ALERT NOTIFICATION BANNERS */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {criticalAlertsCount > 0 && (
                <div className="bg-gradient-to-r from-rose-500 to-red-600 text-white rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start sm:items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                            <ShieldAlert className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <div className="font-bold text-base flex items-center gap-2">
                                <span>CRITICAL JOB PREP RISK ALERT</span>
                                <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full font-semibold">
                                    {criticalAlertsCount} {criticalAlertsCount === 1 ? 'Job' : 'Jobs'} Blocked
                                </span>
                            </div>
                            <p className="text-xs sm:text-sm text-rose-100 mt-0.5">
                                Upcoming job(s) are scheduled within 3 days, but required parts and materials have NOT yet arrived from the supplier! Check arrival dates or reschedule below.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => handleTabChange('prep_alerts')}
                        className="px-4 py-2 bg-white text-rose-700 hover:bg-rose-50 text-xs font-bold rounded-xl shadow-xs transition-colors shrink-0 self-start sm:self-center"
                    >
                        Review Blocked Jobs &rarr;
                    </button>
                </div>
            )}

            {readyToPrepCount > 0 && criticalAlertsCount === 0 && (
                <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start sm:items-center gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                            <Sparkles className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <div className="font-bold text-base flex items-center gap-2">
                                <span>MERCHANDISE HAS ARRIVED &mdash; READY FOR PREP</span>
                                <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full font-semibold">
                                    {readyToPrepCount} Ready
                                </span>
                            </div>
                            <p className="text-xs sm:text-sm text-emerald-100 mt-0.5">
                                All required parts have arrived in the warehouse. Preppers can pick, stage, and transfer materials to technician trucks now.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => handleTabChange('prep_alerts')}
                        className="px-4 py-2 bg-white text-emerald-800 hover:bg-emerald-50 text-xs font-bold rounded-xl shadow-xs transition-colors shrink-0 self-start sm:self-center"
                    >
                        Open Prep Packages &rarr;
                    </button>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* 4. MAIN NAVIGATION TABS */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div className="border-b border-slate-200">
                <nav className="flex space-x-2 sm:space-x-4 overflow-x-auto pb-px">
                    <button
                        type="button"
                        onClick={() => handleTabChange('prep_alerts')}
                        className={`flex items-center gap-2 py-3 px-3.5 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
                            activeTab === 'prep_alerts'
                                ? 'border-indigo-600 text-indigo-600'
                                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                        }`}
                    >
                        <AlertTriangle className="w-4 h-4" />
                        <span>Job Prep & Readiness Alerts</span>
                        {criticalAlertsCount > 0 && (
                            <span className="px-1.5 py-0.5 text-[10px] font-extrabold bg-rose-500 text-white rounded-full">
                                {criticalAlertsCount}
                            </span>
                        )}
                        {readyToPrepCount > 0 && (
                            <span className="px-1.5 py-0.5 text-[10px] font-extrabold bg-emerald-500 text-white rounded-full">
                                {readyToPrepCount}
                            </span>
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={() => handleTabChange('incoming_orders')}
                        className={`flex items-center gap-2 py-3 px-3.5 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
                            activeTab === 'incoming_orders'
                                ? 'border-indigo-600 text-indigo-600'
                                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                        }`}
                    >
                        <Truck className="w-4 h-4" />
                        <span>Incoming & Recent Orders</span>
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-600 rounded-full border border-slate-200">
                            {orders.length}
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => handleTabChange('warehouse_truck')}
                        className={`flex items-center gap-2 py-3 px-3.5 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
                            activeTab === 'warehouse_truck'
                                ? 'border-indigo-600 text-indigo-600'
                                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                        }`}
                    >
                        <Warehouse className="w-4 h-4" />
                        <span>Warehouse vs. Tech Trucks</span>
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-600 rounded-full border border-slate-200">
                            {inventoryLocationsAnalysis.warehouseItems.length + inventoryLocationsAnalysis.truckItems.length}
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => handleTabChange('accounting_ap')}
                        className={`flex items-center gap-2 py-3 px-3.5 text-xs sm:text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
                            activeTab === 'accounting_ap'
                                ? 'border-indigo-600 text-indigo-600'
                                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                        }`}
                    >
                        <Receipt className="w-4 h-4" />
                        <span>Accounting & AP Status</span>
                        {accountingAnalysis.countReceivedNotPaid > 0 && (
                            <span className="px-1.5 py-0.5 text-[10px] font-extrabold bg-amber-500 text-white rounded-full">
                                {accountingAnalysis.countReceivedNotPaid} AP
                            </span>
                        )}
                    </button>
                </nav>
            </div>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* TAB 1: JOB PREP & READINESS ALERTS */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'prep_alerts' && (
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
                        <div>
                            <h2 className="text-base font-bold text-slate-900">
                                Scheduled Jobs Prep Readiness
                            </h2>
                            <p className="text-xs text-slate-500">
                                Monitor parts arrival vs job schedule dates to prevent day-of job cancellations.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                                <input
                                    type="text"
                                    placeholder="Filter by job, customer, or tech..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50 w-64"
                                />
                            </div>
                            <Link
                                to="/jobs?view=prep"
                                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-200 transition-colors"
                            >
                                Open Job Prep Packager &rarr;
                            </Link>
                        </div>
                    </div>

                    {scheduledJobsAnalysis.length === 0 ? (
                        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                            <Boxes className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                            <h3 className="text-base font-bold text-slate-700">No Scheduled Jobs Found</h3>
                            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                                Once jobs are scheduled with materials or purchase orders, prep readiness and arrival alerts will appear here automatically.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {scheduledJobsAnalysis
                                .filter(({ job }) => {
                                    if (!searchQuery) return true;
                                    const q = searchQuery.toLowerCase();
                                    return (
                                        job.title?.toLowerCase().includes(q) ||
                                        job.customer?.name?.toLowerCase().includes(q) ||
                                        job.assigned_tech_name?.toLowerCase().includes(q)
                                    );
                                })
                                .map(({ job, schedDate, daysUntilJob, requiredItems, prepAlert, linkedPOs }) => {
                                    const isCritical = prepAlert === 'critical_risk';
                                    const isReady = prepAlert === 'ready_to_prep';
                                    const isOnTruck = prepAlert === 'on_truck';

                                    return (
                                        <div
                                            key={job.id}
                                            className={`bg-white rounded-2xl border transition-all p-4 sm:p-5 shadow-xs ${
                                                isCritical
                                                    ? 'border-rose-300 ring-2 ring-rose-200/50 bg-gradient-to-br from-white via-rose-50/20 to-white'
                                                    : isReady
                                                    ? 'border-emerald-300 ring-1 ring-emerald-200/60 bg-gradient-to-br from-white via-emerald-50/15 to-white'
                                                    : isOnTruck
                                                    ? 'border-indigo-200 bg-white'
                                                    : 'border-slate-200 bg-white'
                                            }`}
                                        >
                                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-3">
                                                <div className="flex items-start gap-3">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                                        isCritical ? 'bg-rose-100 text-rose-700' :
                                                        isReady ? 'bg-emerald-100 text-emerald-700' :
                                                        isOnTruck ? 'bg-indigo-100 text-indigo-700' :
                                                        'bg-slate-100 text-slate-600'
                                                    }`}>
                                                        {isCritical ? <AlertTriangle className="w-5 h-5 animate-pulse" /> :
                                                         isReady ? <CheckCircle2 className="w-5 h-5" /> :
                                                         isOnTruck ? <Truck className="w-5 h-5" /> :
                                                         <Clock className="w-5 h-5" />}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <Link
                                                                to={`/jobs/${job.id}`}
                                                                className="text-base font-bold text-slate-900 hover:text-indigo-600 transition-colors"
                                                            >
                                                                {job.title || `Job #${job.id?.slice(0, 8)}`}
                                                            </Link>
                                                            
                                                            {/* Alert Badge */}
                                                            {isCritical && (
                                                                <span className="px-2 py-0.5 text-xs font-extrabold rounded-md bg-rose-600 text-white animate-pulse">
                                                                    PREP RISK &bull; Parts Not Arrived!
                                                                </span>
                                                            )}
                                                            {isReady && (
                                                                <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-emerald-600 text-white">
                                                                    READY TO PREP &bull; In Warehouse
                                                                </span>
                                                            )}
                                                            {isOnTruck && (
                                                                <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-indigo-600 text-white">
                                                                    ON TECH TRUCK
                                                                </span>
                                                            )}
                                                            {!isCritical && !isReady && !isOnTruck && requiredItems.length > 0 && (
                                                                <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-amber-100 text-amber-800">
                                                                    Partially Arrived / In Transit
                                                                </span>
                                                            )}
                                                            {requiredItems.length === 0 && (
                                                                <span className="px-2 py-0.5 text-xs font-medium rounded-md bg-slate-100 text-slate-600">
                                                                    Standard Labor Only
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center gap-4 text-xs text-slate-500 mt-1 flex-wrap">
                                                            <span className="flex items-center gap-1 font-medium text-slate-700">
                                                                <User className="w-3.5 h-3.5 text-slate-400" />
                                                                {job.customer?.name || 'Customer'}
                                                            </span>
                                                            <span className="flex items-center gap-1">
                                                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                                                {formatDate(schedDate)} 
                                                                {daysUntilJob !== null && (
                                                                    <span className={`font-semibold ml-1 ${daysUntilJob <= 2 ? 'text-rose-600' : 'text-slate-600'}`}>
                                                                        ({daysUntilJob === 0 ? 'Today' : daysUntilJob === 1 ? 'Tomorrow' : `in ${daysUntilJob} days`})
                                                                    </span>
                                                                )}
                                                            </span>
                                                            <span className="flex items-center gap-1 font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                                                                <Truck className="w-3.5 h-3.5 text-indigo-600" />
                                                                Tech: {job.assigned_tech_name || 'Unassigned'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Job Action Buttons */}
                                                <div className="flex items-center gap-2 self-start lg:self-center">
                                                    <Link
                                                        to={`/jobs/${job.id}`}
                                                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
                                                    >
                                                        Job Details
                                                    </Link>
                                                    <Link
                                                        to={`/jobs?view=prep&jobId=${job.id}`}
                                                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center gap-1"
                                                    >
                                                        <Boxes className="w-3.5 h-3.5" />
                                                        Job Prep Package
                                                    </Link>
                                                </div>
                                            </div>

                                            {/* Required Materials Table / Sub-list */}
                                            {requiredItems.length > 0 ? (
                                                <div className="mt-3 overflow-x-auto">
                                                    <table className="w-full text-left text-xs">
                                                        <thead>
                                                            <tr className="text-slate-400 uppercase font-semibold text-[10px] border-b border-slate-100">
                                                                <th className="py-2 px-2">Part / Material</th>
                                                                <th className="py-2 px-2">Qty Needed</th>
                                                                <th className="py-2 px-2">Received</th>
                                                                <th className="py-2 px-2">Status & Location</th>
                                                                <th className="py-2 px-2">Expected Date / PO</th>
                                                                <th className="py-2 px-2 text-right">Actions</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-100">
                                                            {requiredItems.map((item, idx) => (
                                                                <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                                                                    <td className="py-2.5 px-2 font-semibold text-slate-900">
                                                                        {item.name}
                                                                        {item.sku && <span className="text-[10px] text-slate-400 block font-mono">SKU: {item.sku}</span>}
                                                                    </td>
                                                                    <td className="py-2.5 px-2 font-medium text-slate-700">
                                                                        {item.qtyNeeded}
                                                                    </td>
                                                                    <td className="py-2.5 px-2 font-medium">
                                                                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                                                            item.qtyReceived >= item.qtyNeeded ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                                                                        }`}>
                                                                            {item.qtyReceived} / {item.qtyNeeded}
                                                                        </span>
                                                                    </td>
                                                                    <td className="py-2.5 px-2">
                                                                        {item.status === 'on_truck' && (
                                                                            <span className="inline-flex items-center gap-1 text-indigo-700 font-semibold bg-indigo-50 px-2 py-0.5 rounded-md">
                                                                                <Truck className="w-3 h-3" /> On Tech Truck
                                                                            </span>
                                                                        )}
                                                                        {item.status === 'arrived_warehouse' && (
                                                                            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md">
                                                                                <Warehouse className="w-3 h-3" /> In Warehouse ({item.location})
                                                                            </span>
                                                                        )}
                                                                        {item.status === 'in_transit' && (
                                                                            <span className="inline-flex items-center gap-1 text-blue-700 font-semibold bg-blue-50 px-2 py-0.5 rounded-md">
                                                                                <Clock className="w-3 h-3" /> In Transit
                                                                            </span>
                                                                        )}
                                                                        {item.status === 'delayed' && (
                                                                            <span className="inline-flex items-center gap-1 text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded-md">
                                                                                <AlertTriangle className="w-3 h-3 text-rose-600" /> Delayed Past Job Date!
                                                                            </span>
                                                                        )}
                                                                        {item.status === 'not_ordered' && (
                                                                            <span className="inline-flex items-center gap-1 text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-md">
                                                                                Needs PO
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    <td className="py-2.5 px-2 text-slate-600">
                                                                        {item.expectedArrival ? (
                                                                            <div>
                                                                                <span className="font-semibold text-slate-800">{formatDate(item.expectedArrival)}</span>
                                                                                {item.vendorName && <span className="text-[10px] text-slate-400 block">{item.vendorName}</span>}
                                                                            </div>
                                                                        ) : item.poId ? (
                                                                            <span className="text-slate-400">PO Linked (TBD)</span>
                                                                        ) : (
                                                                            <span className="text-slate-400">No PO assigned</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="py-2.5 px-2 text-right">
                                                                        {item.status === 'arrived_warehouse' && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleOpenTransferModal({
                                                                                    id: materials.find(m => m.name.toLowerCase() === item.name.toLowerCase())?.id || item.poId || 'temp',
                                                                                    name: item.name,
                                                                                    maxQty: item.qtyReceived,
                                                                                    source: 'warehouse'
                                                                                })}
                                                                                className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-[11px] rounded-lg border border-indigo-200 inline-flex items-center gap-1"
                                                                            >
                                                                                <ArrowRightLeft className="w-3 h-3" />
                                                                                Transfer to Truck
                                                                            </button>
                                                                        )}
                                                                        {item.poId && item.status !== 'arrived_warehouse' && item.status !== 'on_truck' && (
                                                                            <div className="flex items-center justify-end gap-1.5">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => {
                                                                                        const po = orders.find(o => o.id === item.poId);
                                                                                        if (po) handleOpenReceiveModal(po);
                                                                                        else navigate(`/receiving?poId=${item.poId}`);
                                                                                    }}
                                                                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] rounded-lg inline-flex items-center gap-1 shadow-2xs transition-colors"
                                                                                    title="Receive incoming shipment"
                                                                                >
                                                                                    <PackageCheck className="w-3 h-3" />
                                                                                    Receive
                                                                                </button>
                                                                                <Link
                                                                                    to={`/purchase-orders/${item.poId}`}
                                                                                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] rounded-lg inline-flex items-center gap-1"
                                                                                >
                                                                                    <ExternalLink className="w-3 h-3" />
                                                                                    Track PO
                                                                                </Link>
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ) : (
                                                <div className="mt-2 text-xs text-slate-400 italic">
                                                    No specific materials recorded for this job.
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                        </div>
                    )}
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* TAB 2: INCOMING & RECENT ORDERS */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'incoming_orders' && (
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
                        <div>
                            <h2 className="text-base font-bold text-slate-900">
                                Purchase Orders & Expected Delivery Tracking
                            </h2>
                            <p className="text-xs text-slate-500">
                                Real-time incoming pipeline from Home Depot, Johnstone, Ferguson, and Grainger with carrier tracking.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                                <input
                                    type="text"
                                    placeholder="Search vendor, tracking, item..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50 w-64"
                                />
                            </div>
                            <Link
                                to="/purchase-orders"
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors"
                            >
                                + New Purchase Order
                            </Link>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                                    <tr>
                                        <th className="py-3 px-4">PO & Vendor</th>
                                        <th className="py-3 px-4">Expected Date</th>
                                        <th className="py-3 px-4">Carrier & Tracking</th>
                                        <th className="py-3 px-4">Destination</th>
                                        <th className="py-3 px-4">Delivery Status</th>
                                        <th className="py-3 px-4">Items / Total</th>
                                        <th className="py-3 px-4">Payment Status</th>
                                        <th className="py-3 px-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {incomingOrders
                                        .filter(({ po }) => {
                                            if (!searchQuery) return true;
                                            const q = searchQuery.toLowerCase();
                                            return (
                                                po.vendorName?.toLowerCase().includes(q) ||
                                                po.externalOrderNumber?.toLowerCase().includes(q) ||
                                                po.trackingNumber?.toLowerCase().includes(q) ||
                                                po.items.some(i => i.name.toLowerCase().includes(q))
                                            );
                                        })
                                        .map(({ po, expDate, isOverdue, isArrived, delStatus }) => (
                                            <tr key={po.id} className="hover:bg-slate-50/70 transition-colors">
                                                <td className="py-3.5 px-4">
                                                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                                        <Link to={`/purchase-orders/${po.id}`} className="hover:text-indigo-600">
                                                            {po.externalOrderNumber || `PO-${po.id?.slice(0, 8).toUpperCase()}`}
                                                        </Link>
                                                        {po.jobTitle && (
                                                            <span className="text-[10px] font-normal text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                                                                Job: {po.jobTitle}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-slate-500 font-medium text-[11px] mt-0.5">
                                                        {po.vendorName}
                                                    </div>
                                                </td>

                                                <td className="py-3.5 px-4">
                                                    {expDate ? (
                                                        <div className={`font-semibold ${isOverdue ? 'text-rose-600' : 'text-slate-800'}`}>
                                                            {formatDate(expDate)}
                                                            {isOverdue && (
                                                                <span className="text-[10px] text-rose-500 block font-bold">
                                                                    OVERDUE / DELAYED
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-400 italic">No date set</span>
                                                    )}
                                                </td>

                                                <td className="py-3.5 px-4 text-slate-600">
                                                    {po.carrier ? (
                                                        <div>
                                                            <span className="font-semibold text-slate-800">{po.carrier}</span>
                                                            {po.trackingNumber && (
                                                                <span className="text-[11px] font-mono text-slate-500 block">
                                                                    #{po.trackingNumber}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-400 italic">Standard Freight</span>
                                                    )}
                                                </td>

                                                <td className="py-3.5 px-4">
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
                                                        {po.destinationType === 'shop' || po.truckLocation ? (
                                                            <>
                                                                <Truck className="w-3 h-3 text-indigo-600" /> Tech Truck
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Warehouse className="w-3 h-3 text-blue-600" /> Warehouse
                                                            </>
                                                        )}
                                                    </span>
                                                </td>

                                                <td className="py-3.5 px-4">
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                                        delStatus === 'delivered' ? 'bg-emerald-100 text-emerald-800' :
                                                        delStatus === 'out_for_delivery' ? 'bg-cyan-100 text-cyan-800' :
                                                        delStatus === 'delayed' ? 'bg-rose-100 text-rose-800' :
                                                        'bg-blue-100 text-blue-800'
                                                    }`}>
                                                        {delStatus === 'delivered' ? <CheckCircle2 className="w-3 h-3" /> :
                                                         delStatus === 'delayed' ? <AlertTriangle className="w-3 h-3" /> :
                                                         <Truck className="w-3 h-3" />}
                                                        {delStatus?.replace(/_/g, ' ').toUpperCase()}
                                                    </span>
                                                </td>

                                                <td className="py-3.5 px-4">
                                                    <div className="font-bold text-slate-900">{formatCurrency(po.total)}</div>
                                                    <div className="text-[11px] text-slate-400">
                                                        {po.items.length} {po.items.length === 1 ? 'item' : 'items'}
                                                    </div>
                                                </td>

                                                <td className="py-3.5 px-4">
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                                        po.paymentStatus === 'received_and_paid' || po.paymentStatus === 'paid_in_full' ? 'bg-emerald-100 text-emerald-800' :
                                                        po.paymentStatus === 'received_not_paid' ? 'bg-amber-100 text-amber-800' :
                                                        'bg-slate-100 text-slate-600'
                                                    }`}>
                                                        {po.paymentStatus === 'received_and_paid' ? 'Received & Paid' :
                                                         po.paymentStatus === 'received_not_paid' ? 'Recv, Not Paid' :
                                                         po.paymentStatus === 'paid_in_full' ? 'Paid in Full' : 'Unpaid / Open'}
                                                    </span>
                                                </td>

                                                <td className="py-3.5 px-4 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        {po.status !== 'received' && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenReceiveModal(po)}
                                                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg shadow-2xs transition-colors inline-flex items-center gap-1"
                                                                title="Receive Shipment (Partial or Full)"
                                                            >
                                                                <PackageCheck className="w-3.5 h-3.5" />
                                                                Receive
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenScheduleModal(po)}
                                                            className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                            title="Edit expected delivery date & tracking"
                                                        >
                                                            <Calendar className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenPaymentModal(po)}
                                                            className="p-1.5 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                                            title="Update accounting / payment status"
                                                        >
                                                            <Receipt className="w-4 h-4" />
                                                        </button>
                                                        <Link
                                                            to={`/purchase-orders/${po.id}`}
                                                            className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                            title="View PO Details"
                                                        >
                                                            <Eye className="w-4 h-4" />
                                                        </Link>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* TAB 3: WAREHOUSE VS. TECH TRUCKS */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'warehouse_truck' && (
                <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
                        <div>
                            <h2 className="text-base font-bold text-slate-900">
                                Stock Distribution: Main Warehouse vs. Technician Trucks
                            </h2>
                            <p className="text-xs text-slate-500">
                                Transfer received merchandise between warehouse storage bins and mobile technician vehicle kits.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-200">
                                Warehouse Value: {formatCurrency(inventoryLocationsAnalysis.totalWarehouseVal)}
                            </span>
                            <span className="text-xs font-semibold px-3 py-1 bg-amber-50 text-amber-800 rounded-lg border border-amber-200">
                                Truck Value: {formatCurrency(inventoryLocationsAnalysis.totalTruckVal)}
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Column 1: Main Warehouse Stock */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                                        <Warehouse className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-900 text-sm">Main Warehouse Inventory</h3>
                                        <p className="text-[11px] text-slate-400">
                                            {inventoryLocationsAnalysis.warehouseItems.length} items &bull; {inventoryLocationsAnalysis.totalWarehouseQty} total units in storage
                                        </p>
                                    </div>
                                </div>
                                <Link
                                    to="/warehouse"
                                    className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                                >
                                    Warehouse Manager &rarr;
                                </Link>
                            </div>

                            <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[500px] pr-1">
                                {inventoryLocationsAnalysis.warehouseItems.length === 0 ? (
                                    <div className="p-8 text-center text-slate-400 text-xs">
                                        No items currently categorized in warehouse inventory.
                                    </div>
                                ) : (
                                    inventoryLocationsAnalysis.warehouseItems.map(item => (
                                        <div
                                            key={item.id}
                                            className="p-3 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3"
                                        >
                                            <div>
                                                <div className="font-bold text-slate-900 text-xs">{item.name}</div>
                                                <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                                                    <span>Location: <strong className="text-slate-600">{item.binLocation || item.zone || 'Main Bay'}</strong></span>
                                                    <span>&bull;</span>
                                                    <span>Cost: {formatCurrency(item.unitCost)}</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-extrabold">
                                                    {item.quantity} in stock
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenTransferModal({
                                                        id: item.id,
                                                        name: item.name,
                                                        maxQty: item.quantity,
                                                        source: 'warehouse'
                                                    })}
                                                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded-lg shadow-2xs transition-colors flex items-center gap-1"
                                                >
                                                    <Truck className="w-3 h-3" />
                                                    To Truck
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Column 2: Tech Trucks Stock */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                                        <Truck className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-900 text-sm">Technician Trucks Active Stock</h3>
                                        <p className="text-[11px] text-slate-400">
                                            {inventoryLocationsAnalysis.truckItems.length} items &bull; {inventoryLocationsAnalysis.totalTruckQty} units on technician vans
                                        </p>
                                    </div>
                                </div>
                                <Link
                                    to="/tools?tab=by_tech"
                                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                                >
                                    Truck Kits &rarr;
                                </Link>
                            </div>

                            <div className="space-y-4 flex-1 overflow-y-auto max-h-[500px] pr-1">
                                {Object.keys(inventoryLocationsAnalysis.byTruckMap).length === 0 ? (
                                    <div className="p-8 text-center text-slate-400 text-xs">
                                        No merchandise currently allocated to technician vehicles.
                                    </div>
                                ) : (
                                    Object.entries(inventoryLocationsAnalysis.byTruckMap).map(([truckName, items]) => (
                                        <div key={truckName} className="rounded-xl border border-slate-200 overflow-hidden">
                                            <div className="bg-slate-100/80 px-3.5 py-2 flex items-center justify-between text-xs font-bold text-slate-800">
                                                <span className="flex items-center gap-1.5">
                                                    <Truck className="w-3.5 h-3.5 text-indigo-600" />
                                                    {truckName}
                                                </span>
                                                <span className="text-[10px] text-slate-500 font-semibold">
                                                    {items.reduce((sum, i) => sum + (i.quantity || 0), 0)} units
                                                </span>
                                            </div>
                                            <div className="p-2 space-y-1.5 divide-y divide-slate-100">
                                                {items.map(item => (
                                                    <div key={item.id} className="pt-1.5 flex items-center justify-between text-xs px-1">
                                                        <div>
                                                            <div className="font-semibold text-slate-900">{item.name}</div>
                                                            <div className="text-[10px] text-slate-400">Qty: {item.quantity} &bull; {formatCurrency(item.unitCost)} ea</div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenTransferModal({
                                                                id: item.id,
                                                                name: item.name,
                                                                maxQty: item.quantity,
                                                                source: 'truck',
                                                                currentTruck: truckName
                                                            })}
                                                            className="text-[10px] text-slate-600 hover:text-indigo-600 hover:bg-slate-100 px-2 py-0.5 rounded border border-slate-200 transition-colors"
                                                        >
                                                            Return to Whse
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* TAB 4: ACCOUNTING & AP STATUS */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {activeTab === 'accounting_ap' && (
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
                        <div>
                            <h2 className="text-base font-bold text-slate-900">
                                Accounts Payable (AP) & Payment Matching
                            </h2>
                            <p className="text-xs text-slate-500">
                                Accrued AP control: 3-way matching between Purchase Orders, Warehouse Receiving, and Vendor Payments.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                                <input
                                    type="text"
                                    placeholder="Search vendor, invoice, PO..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50 w-64"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Accounting Mini-KPI Summary */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/60">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                                Received, Not Paid (Accrued AP)
                            </span>
                            <div className="text-xl font-extrabold text-amber-950 mt-1">
                                {formatCurrency(accountingAnalysis.totalReceivedNotPaid)}
                            </div>
                            <div className="text-xs text-amber-800 mt-0.5">
                                {accountingAnalysis.countReceivedNotPaid} orders awaiting vendor invoice payment
                            </div>
                        </div>

                        <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/60">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                                Received & Paid (Reconciled)
                            </span>
                            <div className="text-xl font-extrabold text-emerald-950 mt-1">
                                {formatCurrency(accountingAnalysis.totalReceivedAndPaid)}
                            </div>
                            <div className="text-xs text-emerald-800 mt-0.5">
                                {accountingAnalysis.countReceivedAndPaid} fully matched & settled orders
                            </div>
                        </div>

                        <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/60">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-800">
                                Paid, Awaiting Delivery
                            </span>
                            <div className="text-xl font-extrabold text-indigo-950 mt-1">
                                {formatCurrency(accountingAnalysis.totalPaidAdvance)}
                            </div>
                            <div className="text-xs text-indigo-800 mt-0.5">
                                {accountingAnalysis.countPaidAdvance} prepaid orders in transit
                            </div>
                        </div>

                        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
                                Open Commitments (Unpaid)
                            </span>
                            <div className="text-xl font-extrabold text-slate-900 mt-1">
                                {formatCurrency(accountingAnalysis.totalUnpaidOpen)}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                                {accountingAnalysis.countUnpaidOpen} orders placed with payment pending
                            </div>
                        </div>
                    </div>

                    {/* Accounting PO Ledger Table */}
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                                    <tr>
                                        <th className="py-3 px-4">PO # / Vendor</th>
                                        <th className="py-3 px-4">Merchandise Status</th>
                                        <th className="py-3 px-4">Accounting Status</th>
                                        <th className="py-3 px-4">Invoice # & Date</th>
                                        <th className="py-3 px-4">Payment Method / Ref</th>
                                        <th className="py-3 px-4">Total Amount</th>
                                        <th className="py-3 px-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {accountingAnalysis.categorizedPOs
                                        .filter(({ po }) => {
                                            if (!searchQuery) return true;
                                            const q = searchQuery.toLowerCase();
                                            return (
                                                po.vendorName?.toLowerCase().includes(q) ||
                                                po.externalOrderNumber?.toLowerCase().includes(q) ||
                                                po.invoiceNumber?.toLowerCase().includes(q) ||
                                                po.paymentReference?.toLowerCase().includes(q)
                                            );
                                        })
                                        .map(({ po, isRecv, isPaid, category }) => (
                                            <tr key={po.id} className="hover:bg-slate-50/70 transition-colors">
                                                <td className="py-3.5 px-4">
                                                    <div className="font-bold text-slate-900">
                                                        <Link to={`/purchase-orders/${po.id}`} className="hover:text-indigo-600">
                                                            {po.externalOrderNumber || `PO-${po.id?.slice(0, 8).toUpperCase()}`}
                                                        </Link>
                                                    </div>
                                                    <div className="text-slate-500 text-[11px]">{po.vendorName}</div>
                                                </td>

                                                <td className="py-3.5 px-4">
                                                    {isRecv ? (
                                                        <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-bold text-[11px]">
                                                            <CheckCircle2 className="w-3 h-3" /> Arrived in Whse
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full font-semibold text-[11px]">
                                                            <Clock className="w-3 h-3" /> In Transit / Ordered
                                                        </span>
                                                    )}
                                                </td>

                                                <td className="py-3.5 px-4">
                                                    {category === 'received_not_paid' && (
                                                        <span className="inline-flex items-center gap-1 text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full font-bold text-[11px]">
                                                            <AlertCircle className="w-3 h-3 text-amber-700" /> Received, Not Paid
                                                        </span>
                                                    )}
                                                    {category === 'received_and_paid' && (
                                                        <span className="inline-flex items-center gap-1 text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full font-bold text-[11px]">
                                                            <CheckCheck className="w-3 h-3 text-emerald-700" /> Received &amp; Paid
                                                        </span>
                                                    )}
                                                    {category === 'paid_advance' && (
                                                        <span className="inline-flex items-center gap-1 text-indigo-800 bg-indigo-100 px-2.5 py-0.5 rounded-full font-bold text-[11px]">
                                                            <CreditCard className="w-3 h-3 text-indigo-700" /> Paid (Prepaid)
                                                        </span>
                                                    )}
                                                    {category === 'unpaid_open' && (
                                                        <span className="inline-flex items-center gap-1 text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-full font-semibold text-[11px]">
                                                            Unpaid / Open
                                                        </span>
                                                    )}
                                                </td>

                                                <td className="py-3.5 px-4 text-slate-600">
                                                    {po.invoiceNumber ? (
                                                        <div>
                                                            <span className="font-semibold text-slate-800">Inv: {po.invoiceNumber}</span>
                                                            {po.invoiceDate && (
                                                                <span className="text-[10px] text-slate-400 block">
                                                                    {formatDate(po.invoiceDate)}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-400 italic">No invoice recorded</span>
                                                    )}
                                                </td>

                                                <td className="py-3.5 px-4 text-slate-600">
                                                    {po.paymentMethod ? (
                                                        <div>
                                                            <span className="font-semibold text-slate-800 capitalize">
                                                                {po.paymentMethod.replace(/_/g, ' ')}
                                                            </span>
                                                            {po.paymentReference && (
                                                                <span className="text-[10px] font-mono text-slate-400 block">
                                                                    Ref: {po.paymentReference}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-slate-400 italic">&mdash;</span>
                                                    )}
                                                </td>

                                                <td className="py-3.5 px-4 font-bold text-slate-900">
                                                    {formatCurrency(po.total)}
                                                </td>

                                                <td className="py-3.5 px-4 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenPaymentModal(po)}
                                                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-lg shadow-2xs transition-colors inline-flex items-center gap-1.5"
                                                    >
                                                        <Receipt className="w-3.5 h-3.5" />
                                                        Update Payment
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* MODAL 1: RECORD / UPDATE PAYMENT (ACCOUNTING) */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {showPaymentModal && selectedPOForPayment && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2">
                                <Receipt className="w-5 h-5 text-amber-600" />
                                <h3 className="text-base font-bold text-slate-900">
                                    Update Accounting &amp; Payment Status
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowPaymentModal(false)}
                                className="text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
                            <div>
                                <span className="text-slate-400">Order:</span>{' '}
                                <strong className="text-slate-800">{selectedPOForPayment.externalOrderNumber || selectedPOForPayment.id?.slice(0, 8)}</strong>
                                <div className="text-slate-500 font-medium">{selectedPOForPayment.vendorName}</div>
                            </div>
                            <div className="text-right">
                                <span className="text-slate-400">Total:</span>{' '}
                                <strong className="text-emerald-700 text-sm">{formatCurrency(selectedPOForPayment.total)}</strong>
                            </div>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                    Payment &amp; AP Status
                                </label>
                                <select
                                    value={paymentStatusInput}
                                    onChange={e => setPaymentStatusInput(e.target.value as any)}
                                    className="w-full p-2 rounded-lg border border-slate-200 bg-white font-medium focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="received_and_paid">Received &amp; Paid (Matched &amp; Reconciled)</option>
                                    <option value="received_not_paid">Received, Not Paid (Accrued AP / Unbilled)</option>
                                    <option value="paid_in_full">Paid in Full (Prepaid / Advance Payment)</option>
                                    <option value="unpaid">Unpaid (Open PO Commitment)</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block font-semibold text-slate-700 mb-1">
                                        Payment Method
                                    </label>
                                    <select
                                        value={paymentMethodInput}
                                        onChange={e => setPaymentMethodInput(e.target.value as any)}
                                        className="w-full p-2 rounded-lg border border-slate-200 bg-white font-medium focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="credit_card">Company Credit Card</option>
                                        <option value="ach">ACH / Direct Wire</option>
                                        <option value="check">Paper Check</option>
                                        <option value="net_terms">Net 30 / Vendor Terms</option>
                                        <option value="cash">Cash / Petty Cash</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block font-semibold text-slate-700 mb-1">
                                        Check / Reference #
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Check #1042 or Auth ID"
                                        value={paymentRefInput}
                                        onChange={e => setPaymentRefInput(e.target.value)}
                                        className="w-full p-2 rounded-lg border border-slate-200 font-medium focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block font-semibold text-slate-700 mb-1">
                                        Vendor Invoice Number
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g. INV-88391"
                                        value={invoiceNumInput}
                                        onChange={e => setInvoiceNumInput(e.target.value)}
                                        className="w-full p-2 rounded-lg border border-slate-200 font-medium focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block font-semibold text-slate-700 mb-1">
                                        Invoice Date
                                    </label>
                                    <input
                                        type="date"
                                        value={invoiceDateInput}
                                        onChange={e => setInvoiceDateInput(e.target.value)}
                                        className="w-full p-2 rounded-lg border border-slate-200 font-medium focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                    Paid Amount ($)
                                </label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={paymentAmountInput}
                                    onChange={e => setPaymentAmountInput(parseFloat(e.target.value) || 0)}
                                    className="w-full p-2 rounded-lg border border-slate-200 font-medium focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                    Accounting Notes
                                </label>
                                <textarea
                                    rows={2}
                                    placeholder="Add any internal verification remarks..."
                                    value={paymentNotesInput}
                                    onChange={e => setPaymentNotesInput(e.target.value)}
                                    className="w-full p-2 rounded-lg border border-slate-200 font-medium focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                            <button
                                type="button"
                                onClick={() => setShowPaymentModal(false)}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={isSavingPayment}
                                onClick={handleSavePayment}
                                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors disabled:opacity-50"
                            >
                                {isSavingPayment ? 'Saving...' : 'Save Accounting Record'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* MODAL 2: TRANSFER TO TECH TRUCK / WAREHOUSE */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {showTransferModal && transferItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2">
                                <ArrowRightLeft className="w-5 h-5 text-indigo-600" />
                                <h3 className="text-base font-bold text-slate-900">
                                    Transfer Material Location
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowTransferModal(false)}
                                className="text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="bg-indigo-50/60 p-3 rounded-xl border border-indigo-100 text-xs">
                            <span className="text-indigo-600 font-medium">Selected Item:</span>
                            <div className="font-bold text-slate-900 text-sm mt-0.5">{transferItem.name}</div>
                            <div className="text-slate-500 text-[11px] mt-0.5">
                                Current Location: <strong>{transferItem.source === 'warehouse' ? 'Main Warehouse' : transferItem.currentTruck || 'Tech Truck'}</strong>
                            </div>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                    Transfer Destination
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setTargetDestination('truck')}
                                        className={`p-2.5 rounded-xl border text-center font-bold transition-all flex items-center justify-center gap-2 ${
                                            targetDestination === 'truck'
                                                ? 'bg-indigo-600 text-white border-indigo-600'
                                                : 'bg-slate-50 text-slate-700 border-slate-200'
                                        }`}
                                    >
                                        <Truck className="w-4 h-4" />
                                        Technician Truck
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setTargetDestination('warehouse')}
                                        className={`p-2.5 rounded-xl border text-center font-bold transition-all flex items-center justify-center gap-2 ${
                                            targetDestination === 'warehouse'
                                                ? 'bg-blue-600 text-white border-blue-600'
                                                : 'bg-slate-50 text-slate-700 border-slate-200'
                                        }`}
                                    >
                                        <Warehouse className="w-4 h-4" />
                                        Warehouse Storage
                                    </button>
                                </div>
                            </div>

                            {targetDestination === 'truck' && (
                                <div>
                                    <label className="block font-semibold text-slate-700 mb-1">
                                        Assign to Technician Vehicle
                                    </label>
                                    <select
                                        value={targetTechId}
                                        onChange={e => {
                                            const tId = e.target.value;
                                            setTargetTechId(tId);
                                            const tech = technicians.find(t => t.id === tId);
                                            setTargetTechName(tech?.name || tech?.displayName || 'Tech Truck');
                                        }}
                                        className="w-full p-2 rounded-lg border border-slate-200 bg-white font-medium focus:ring-2 focus:ring-indigo-500"
                                    >
                                        {technicians.length === 0 ? (
                                            <option value="">Primary Service Van (Fleet #1)</option>
                                        ) : (
                                            technicians.map(t => (
                                                <option key={t.id} value={t.id}>
                                                    {t.name || t.displayName || t.email} ({t.truck_name || 'Service Van'})
                                                </option>
                                            ))
                                        )}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                    Transfer Quantity (Max: {transferItem.maxQty || 1})
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    max={transferItem.maxQty || 100}
                                    value={transferQty}
                                    onChange={e => setTransferQty(parseInt(e.target.value) || 1)}
                                    className="w-full p-2 rounded-lg border border-slate-200 font-medium focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                    Staging Bin / Shelf Note
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. Truck 1 - Bin Drawer C or Warehouse Rack B-2"
                                    value={transferNotes}
                                    onChange={e => setTransferNotes(e.target.value)}
                                    className="w-full p-2 rounded-lg border border-slate-200 font-medium focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                            <button
                                type="button"
                                onClick={() => setShowTransferModal(false)}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={isSavingTransfer}
                                onClick={handleExecuteTransfer}
                                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors disabled:opacity-50"
                            >
                                {isSavingTransfer ? 'Transferring...' : 'Confirm Transfer'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* MODAL 3: UPDATE EXPECTED DELIVERY SCHEDULE & TRACKING */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {showScheduleModal && selectedPOForSchedule && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2">
                                <Calendar className="w-5 h-5 text-indigo-600" />
                                <h3 className="text-base font-bold text-slate-900">
                                    Update Expected Arrival Date
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowScheduleModal(false)}
                                className="text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                    Expected Delivery Date
                                </label>
                                <input
                                    type="date"
                                    value={expDateInput}
                                    onChange={e => setExpDateInput(e.target.value)}
                                    className="w-full p-2 rounded-lg border border-slate-200 font-medium focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                    Carrier
                                </label>
                                <select
                                    value={carrierInput}
                                    onChange={e => setCarrierInput(e.target.value)}
                                    className="w-full p-2 rounded-lg border border-slate-200 bg-white font-medium focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="">Select or Type Carrier</option>
                                    <option value="UPS">UPS Ground / Express</option>
                                    <option value="FedEx">FedEx Freight / Ground</option>
                                    <option value="Vendor Truck">Vendor Dedicated Truck</option>
                                    <option value="Local Courier">Local Supply House Courier</option>
                                    <option value="Customer Pickup">Store Will Call Pickup</option>
                                </select>
                            </div>

                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                    Tracking Number
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. 1Z9999999999999999"
                                    value={trackingInput}
                                    onChange={e => setTrackingInput(e.target.value)}
                                    className="w-full p-2 rounded-lg border border-slate-200 font-medium focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                    Delivery Status
                                </label>
                                <select
                                    value={deliveryStatusInput}
                                    onChange={e => setDeliveryStatusInput(e.target.value)}
                                    className="w-full p-2 rounded-lg border border-slate-200 bg-white font-medium focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="order_placed">Order Placed</option>
                                    <option value="in_transit">In Transit</option>
                                    <option value="out_for_delivery">Out for Delivery</option>
                                    <option value="delivered">Delivered to Warehouse</option>
                                    <option value="delayed">Delayed / Rescheduled</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                            <button
                                type="button"
                                onClick={() => setShowScheduleModal(false)}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={isSavingSchedule}
                                onClick={handleSaveSchedule}
                                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors disabled:opacity-50"
                            >
                                {isSavingSchedule ? 'Saving...' : 'Save Schedule'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* MODAL 4: QUICK RECEIVE SHIPMENT (PARTIAL OR FULL) */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {showReceiveModal && selectedPOForReceive && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                                    <PackageCheck className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">
                                        Receive Incoming Shipment & Check-in
                                    </h3>
                                    <p className="text-xs text-slate-500">
                                        PO #{selectedPOForReceive.externalOrderNumber || selectedPOForReceive.id.slice(0, 8)} &bull; {selectedPOForReceive.vendorName}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowReceiveModal(false)}
                                className="text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Order & Job Context */}
                        {selectedPOForReceive.jobTitle && (
                            <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs text-indigo-900 flex items-center justify-between">
                                <div>
                                    <span className="font-bold">Allocated for Job:</span> {selectedPOForReceive.jobTitle}
                                </div>
                                <span className="text-[11px] font-medium bg-white px-2 py-0.5 rounded border border-indigo-200 text-indigo-700">
                                    Customer: {selectedPOForReceive.customerName || 'Direct Work Order'}
                                </span>
                            </div>
                        )}

                        {/* Quick fill buttons */}
                        <div className="flex items-center justify-between text-xs pt-1">
                            <span className="font-semibold text-slate-700">
                                Items to Receive:
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setReceiveLines(prev => prev.map(l => ({
                                            ...l,
                                            receiveNow: Math.max(0, l.qtyOrdered - l.previouslyReceived)
                                        })));
                                    }}
                                    className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold rounded-md transition-colors"
                                >
                                    Receive All Remaining
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setReceiveLines(prev => prev.map(l => ({ ...l, receiveNow: 0 })));
                                    }}
                                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium rounded-md transition-colors"
                                >
                                    Clear All
                                </button>
                            </div>
                        </div>

                        {/* Line Items Table */}
                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                                    <tr>
                                        <th className="py-2.5 px-3">Item / SKU</th>
                                        <th className="py-2.5 px-3 text-center">Ordered</th>
                                        <th className="py-2.5 px-3 text-center">Prev Recv</th>
                                        <th className="py-2.5 px-3 w-28">Receive Now</th>
                                        <th className="py-2.5 px-3">Warehouse Bin</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {receiveLines.map((line, idx) => {
                                        const remaining = Math.max(0, line.qtyOrdered - line.previouslyReceived);
                                        return (
                                            <tr key={idx} className="hover:bg-slate-50/50">
                                                <td className="py-2.5 px-3">
                                                    <div className="font-semibold text-slate-900">{line.name}</div>
                                                    {line.sku && <div className="text-[10px] text-slate-400 font-mono">SKU: {line.sku}</div>}
                                                </td>
                                                <td className="py-2.5 px-3 text-center font-bold text-slate-700">
                                                    {line.qtyOrdered}
                                                </td>
                                                <td className="py-2.5 px-3 text-center">
                                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                                                        {line.previouslyReceived}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={line.qtyOrdered}
                                                        value={line.receiveNow}
                                                        onChange={e => {
                                                            const val = Math.max(0, parseInt(e.target.value) || 0);
                                                            setReceiveLines(prev => prev.map((l, i) => i === idx ? { ...l, receiveNow: val } : l));
                                                        }}
                                                        className="w-full p-1.5 rounded-md border border-slate-200 text-xs font-bold text-center focus:ring-2 focus:ring-emerald-500"
                                                    />
                                                    {remaining > 0 && line.receiveNow < remaining && (
                                                        <span className="text-[10px] text-amber-600 block mt-0.5">
                                                            {remaining - line.receiveNow} backordered
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-3">
                                                    <input
                                                        type="text"
                                                        placeholder="e.g. Rack A-3"
                                                        value={line.bin}
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            setReceiveLines(prev => prev.map((l, i) => i === idx ? { ...l, bin: val } : l));
                                                        }}
                                                        className="w-full p-1.5 rounded-md border border-slate-200 text-xs focus:ring-2 focus:ring-emerald-500"
                                                    />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Notes & Packing Slip */}
                        <div className="space-y-1 text-xs">
                            <label className="block font-semibold text-slate-700">
                                Packing Slip / Delivery Notes (Optional)
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. Packing Slip #PS-88419, delivered by supplier driver Joe"
                                value={receiveNotes}
                                onChange={e => setReceiveNotes(e.target.value)}
                                className="w-full p-2 rounded-lg border border-slate-200 font-medium focus:ring-2 focus:ring-emerald-500"
                            />
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 pt-4">
                            <Link
                                to={`/receiving?poId=${selectedPOForReceive.id}`}
                                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                            >
                                <ExternalLink className="w-3.5 h-3.5" />
                                Open in Advanced Receiving (Barcode Scanning)
                            </Link>

                            <div className="flex items-center gap-2 self-end sm:self-center">
                                <button
                                    type="button"
                                    onClick={() => setShowReceiveModal(false)}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    disabled={isSavingReceipt}
                                    onClick={handleExecuteReceive}
                                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                >
                                    <PackageCheck className="w-4 h-4" />
                                    {isSavingReceipt ? 'Recording Receipt...' : 'Confirm Receipt & Update Inventory'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
