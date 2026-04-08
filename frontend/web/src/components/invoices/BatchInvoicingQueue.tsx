import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { Job, Invoice, Customer } from '../../types';
import { useAuth } from '../../auth/AuthProvider';
import { X, ChevronRight, ChevronLeft, Save, Send, SkipForward, DollarSign, Clock, Package, Paperclip, CheckCircle } from 'lucide-react';

interface BatchInvoicingQueueProps {
    isOpen: boolean;
    onClose: () => void;
}

interface CustomerGroup {
    customerId: string;
    customerName: string;
    customerData?: Customer;
    jobs: Job[];
}

interface JobInvoiceItem {
    description: string;
    quantity: number;
    amount: number;
}

interface JobDraft {
    lineItems: JobInvoiceItem[];
    reviewed: boolean;
}

interface InvoiceDraft {
    jobDrafts: Record<string, JobDraft>;
    discount: number;
    taxRate: number;
    attachQuotes: boolean;
}

export const BatchInvoicingQueue: React.FC<BatchInvoicingQueueProps> = ({ isOpen, onClose }) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [groups, setGroups] = useState<CustomerGroup[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);

    // Store un-saved form state per customer so it survives toggling
    const [drafts, setDrafts] = useState<Record<string, InvoiceDraft>>({});
    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

    useEffect(() => {
        if (groups.length > 0 && groups[currentIndex]) {
            const currentJobs = groups[currentIndex].jobs;
            if (!currentJobs.some(j => j.id === selectedJobId)) {
                setSelectedJobId(currentJobs[0]?.id || null);
            }
        }
    }, [currentIndex, groups, selectedJobId]);

    useEffect(() => {
        if (!isOpen || !user) return;
        
        const fetchPendingJobs = async () => {
            setLoading(true);
            try {
                const orgId = (user as any).org_id || (user as any).organization?.id;
                if (!orgId) return;

                // 1. Fetch completed jobs
                const jobsQuery = query(
                    collection(db, 'jobs'),
                    where('org_id', '==', orgId),
                    where('status', '==', 'completed')
                );
                
                const snapshot = await getDocs(jobsQuery);
                const allCompleted = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Job));
                
                // 2. Filter uninvoiced jobs (no invoice_id and not marked archived)
                const uninvoiced = allCompleted.filter(job => !job.invoice_id);

                // 3. Fetch customers map
                const custSnapshot = await getDocs(query(collection(db, 'customers'), where('org_id', '==', orgId)));
                const customersMap = custSnapshot.docs.reduce((acc, doc) => {
                    acc[doc.id] = { id: doc.id, ...doc.data() } as Customer;
                    return acc;
                }, {} as Record<string, Customer>);

                // 4. Group by customer
                const grouped: Record<string, CustomerGroup> = {};
                for (const job of uninvoiced) {
                    const custId = job.customer_id || 'unknown';
                    const custName = job.customer?.name || 'Unknown Customer';
                    
                    if (!grouped[custId]) {
                        grouped[custId] = {
                            customerId: custId,
                            customerName: custName,
                            customerData: customersMap[custId],
                            jobs: []
                        };
                    }
                    grouped[custId].jobs.push(job);
                }

                const groupsArray = Object.values(grouped).sort((a, b) => a.customerName.localeCompare(b.customerName));
                setGroups(groupsArray);
                
                // Initialize Drafts
                let defaultTax = 4.712;
                if ((user as any)?.organization?.settings?.defaultTaxRate !== undefined) {
                    defaultTax = (user as any).organization.settings.defaultTaxRate;
                }

                const initialDrafts: Record<string, InvoiceDraft> = {};
                for (const group of groupsArray) {
                    const groupTax = group.customerData?.billing?.taxExempt ? 0 : defaultTax;
                    
                    const jobDrafts: Record<string, JobDraft> = {};
                    let totalPreFill = 0;

                    for (const job of group.jobs) {
                        const amount = job.costs?.total || job.estimates?.total || 150;
                        totalPreFill += amount;
                        jobDrafts[job.id] = {
                            lineItems: [{
                                description: `Service call: ${job.request?.description?.substring(0, 50) || 'General Service'} - ${job.finished_at ? new Date(job.finished_at.seconds * 1000).toLocaleDateString() : 'Completed'}`,
                                quantity: 1,
                                amount: amount
                            }],
                            reviewed: false
                        };
                    }

                    // Automatically check if any job has quotes attached
                    const hasQuotes = group.jobs.some(j => j.active_quote_id || j.signature);

                    initialDrafts[group.customerId] = {
                        jobDrafts,
                        discount: group.customerData?.billing?.discountPercent ? (totalPreFill * (group.customerData.billing.discountPercent / 100)) : 0,
                        taxRate: groupTax,
                        attachQuotes: hasQuotes
                    };
                }
                setDrafts(initialDrafts);

            } catch (error) {
                console.error("Error fetching pending jobs for invoicing", error);
            } finally {
                setLoading(false);
            }
        };

        fetchPendingJobs();
    }, [isOpen, user]);

    const handleNext = () => {
        // If there's another customer in the array, jump to them, else close. 
        // Note: we remove the currently processed customer from the list!
        const currentGroup = groups[currentIndex];
        const newGroups = groups.filter(g => g.customerId !== currentGroup.customerId);
        
        if (newGroups.length === 0) {
            onClose(); // all done
        } else {
            setGroups(newGroups);
            // After removing, the next one slides into `currentIndex`, or if we were at the end, go to 0
            setCurrentIndex(Math.min(currentIndex, newGroups.length - 1));
        }
    };

    const processInvoice = async (action: 'send' | 'save' | 'archive') => {
        if (!user) return;
        setProcessing(true);
        try {
            const orgId = (user as any).org_id || (user as any).organization?.id;
            const currentGroup = groups[currentIndex];
            const draft = drafts[currentGroup.customerId];
            const batch = writeBatch(db);

            if (action === 'archive') {
                // Just mark jobs as archived (to hide them from the queue without deleting)
                currentGroup.jobs.forEach(job => {
                    const jobRef = doc(db, 'jobs', job.id);
                    batch.update(jobRef, { invoice_id: 'archived' }); // Explicit standard marker
                });
                const allLineItems = Object.values(draft.jobDrafts).flatMap(jd => jd.lineItems);
                
                // Create an archived invoice strictly for records
                const invoiceRef = doc(collection(db, 'invoices'));
                const newInvoice: Partial<Invoice> = {
                    org_id: orgId,
                    customer_id: currentGroup.customerId !== 'unknown' ? currentGroup.customerId : undefined,
                    customer: {
                        name: currentGroup.customerName,
                        address: currentGroup.customerData?.addresses?.[0]?.street || currentGroup.jobs[0]?.customer?.address || '',
                        email: currentGroup.customerData?.email || currentGroup.jobs[0]?.customer?.email || ''
                    },
                    items: allLineItems.map(li => ({
                        description: li.description,
                        amount: li.amount,
                        quantity: li.quantity,
                        unit_price: li.amount,
                        total: li.amount * li.quantity
                    })),
                    subtotal: 0,
                    tax_amount: 0,
                    total: 0,
                    balance_due: 0,
                    status: 'archived',
                    createdAt: serverTimestamp(),
                };
                batch.set(invoiceRef, newInvoice);

            } else {
                // Create logic for 'send' or 'save'
                const invoiceRef = doc(collection(db, 'invoices'));
                
                const allLineItems = Object.values(draft.jobDrafts).flatMap(jd => jd.lineItems);
                const subtotal = allLineItems.reduce((acc, item) => acc + (item.amount * item.quantity), 0);
                const taxable = Math.max(0, subtotal - draft.discount);
                const taxAmount = taxable * (draft.taxRate / 100);
                const total = taxable + taxAmount;

                // Determine due date
                let daysToAdd = 30;
                if (currentGroup.customerData?.billing?.terms === 'due_on_receipt') daysToAdd = 0;
                else if (currentGroup.customerData?.billing?.terms === 'net15') daysToAdd = 15;
                else if (currentGroup.customerData?.billing?.terms === 'net30') daysToAdd = 30;
                else if (currentGroup.customerData?.billing?.terms === 'net60') daysToAdd = 60;
                else if (currentGroup.customerData?.billing?.terms === 'net90') daysToAdd = 90;

                const dueDate = new Date();
                dueDate.setDate(dueDate.getDate() + daysToAdd);

                // Attachments logic
                const attachments: any[] = [];
                if (draft.attachQuotes) {
                    currentGroup.jobs.forEach(job => {
                        if (job.active_quote_id) {
                            attachments.push({
                                type: 'quote_pdf',
                                name: `Quote #${job.active_quote_id.substring(0,6)}`,
                                url: `internal://quotes/${job.active_quote_id}`
                            });
                        }
                    });
                }

                const newInvoice: Partial<Invoice> = {
                    org_id: orgId,
                    customer: {
                        name: currentGroup.customerName,
                        address: currentGroup.customerData?.addresses?.[0]?.street || currentGroup.jobs[0]?.customer?.address || '',
                        email: currentGroup.customerData?.email || currentGroup.jobs[0]?.customer?.email || ''
                    },
                    items: allLineItems.map(li => ({
                        description: li.description,
                        amount: li.amount,
                        quantity: li.quantity,
                        unit_price: li.amount,
                        total: li.amount * li.quantity
                    })),
                    subtotal,
                    tax_amount: taxAmount,
                    total,
                    balance_due: total,
                    status: action === 'send' ? 'sent' : 'draft',
                    is_locked: action === 'send',
                    createdAt: serverTimestamp(),
                    dueDate: Timestamp.fromDate(dueDate),
                };

                if (currentGroup.customerId !== 'unknown') {
                    newInvoice.customer_id = currentGroup.customerId;
                }
                if (attachments.length > 0) {
                    newInvoice.attachments = attachments;
                }

                batch.set(invoiceRef, newInvoice);

                // Update jobs to link them
                currentGroup.jobs.forEach(job => {
                    const jobRef = doc(db, 'jobs', job.id);
                    batch.update(jobRef, { invoice_id: invoiceRef.id });
                });
            }

            await batch.commit();
            handleNext();
        } catch (error) {
            console.error("Error processing invoice:", error);
            alert("Failed to process invoice");
        } finally {
            setProcessing(false);
        }
    };

    const updateDraft = (customerId: string, field: keyof InvoiceDraft, value: any) => {
        setDrafts(prev => ({
            ...prev,
            [customerId]: {
                ...prev[customerId],
                [field]: value
            }
        }));
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex overflow-hidden bg-gray-900/80 backdrop-blur-sm items-center justify-center p-4">
            <div className="bg-white w-full max-w-[95vw] xl:max-w-[1600px] h-[95vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden ring-1 ring-gray-900/5">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 bg-white flex items-center justify-between flex-shrink-0 relative z-10 shadow-sm">
                    <div>
                        <h2 className="text-xl font-bold font-display text-gray-900">Batch Invoicing Queue</h2>
                        <p className="text-sm font-medium text-blue-600 mt-1">
                            {groups.length > 0 ? `Processing ${currentIndex + 1} of ${groups.length} customers` : 'Checking uninvoiced jobs...'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {loading ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-12">
                        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="text-gray-600 font-medium">Gathering uninvoiced completed jobs...</p>
                    </div>
                ) : groups.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-gray-50/50">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
                            <CheckCircle className="w-10 h-10 text-green-600" />
                        </div>
                        <h3 className="text-2xl font-bold font-display text-gray-900 mb-2">You're all caught up!</h3>
                        <p className="text-gray-500 mb-8 max-w-sm text-lg">
                            There are no completed jobs awaiting invoices at this time.
                        </p>
                        <button
                            onClick={onClose}
                            className="px-8 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 shadow-md transition-all hover:-translate-y-0.5"
                        >
                            Return to Dashboard
                        </button>
                    </div>
                ) : (
                    <div className="flex-1 overflow-hidden flex flex-col bg-gray-50/30">
                        {/* Top: Horizontal Navigation */}
                        <div className="w-full bg-white border-b border-gray-100 flex-shrink-0 overflow-x-auto shadow-[0_1px_5px_rgba(0,0,0,0.02)] z-10 custom-scrollbar">
                            <div className="flex p-3 gap-3 min-w-max">
                                {groups.map((g, idx) => (
                                    <button 
                                        key={g.customerId}
                                        onClick={() => setCurrentIndex(idx)}
                                        className={`flex-shrink-0 text-left p-3 min-w-[220px] rounded-xl border flex items-center justify-between transition-all duration-200 ${
                                            idx === currentIndex 
                                            ? 'border-blue-200 bg-blue-50/80 shadow-sm ring-1 ring-blue-600/10' 
                                            : 'border-gray-100 bg-white hover:border-blue-100 hover:bg-gray-50'
                                        }`}
                                    >
                                        <div className="min-w-0 pr-4">
                                            <p className={`text-sm font-semibold truncate ${idx === currentIndex ? 'text-blue-900' : 'text-gray-900'}`}>
                                                {g.customerName}
                                            </p>
                                            <p className="text-xs text-gray-500 font-medium truncate mt-1 flex items-center gap-1">
                                                <Package className="w-3 h-3" />
                                                {g.jobs.length} completed job{g.jobs.length !== 1 && 's'}
                                            </p>
                                        </div>
                                        {idx === currentIndex ? (
                                            <div className="w-2.5 h-2.5 bg-blue-600 rounded-full shadow-sm flex-shrink-0 animate-pulse"></div>
                                        ) : (
                                            <ChevronRight className="w-4 h-4 text-gray-300" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Main Content Area */}
                        {(() => {
                            const currentGroup = groups[currentIndex];
                            const draft = drafts[currentGroup.customerId];
                            if (!draft) return null;

                            const allLineItems = Object.values(draft.jobDrafts).flatMap(jd => jd.lineItems);
                            const subtotal = allLineItems.reduce((acc, item) => acc + (item.amount * item.quantity), 0);
                            const taxable = Math.max(0, subtotal - draft.discount);
                            const taxObj = taxable * (draft.taxRate / 100);
                            const total = taxable + taxObj;

                            const selectedJob = currentGroup.jobs.find(j => j.id === selectedJobId) || currentGroup.jobs[0];
                            const jobDraft = selectedJob ? draft.jobDrafts[selectedJob.id] : null;

                            return (
                                <div className="flex-1 overflow-y-auto flex flex-col">
                                    <div className="p-8 max-w-full mx-auto w-full">
                                        <div className="mb-8 flex items-start justify-between">
                                            <div>
                                                <h3 className="text-3xl font-bold font-display text-gray-900 tracking-tight">{currentGroup.customerName}</h3>
                                                <p className="text-gray-500 flex items-center gap-2 mt-2 font-medium">
                                                    <span className="bg-blue-100 text-blue-800 py-0.5 px-2.5 rounded-full text-xs font-bold tracking-wide uppercase">
                                                        {currentGroup.jobs.length} Uninvoiced Jobs
                                                    </span>
                                                    <span>•</span>
                                                    <span>{currentGroup.customerData?.billing?.terms || 'net30'} terms</span>
                                                </p>
                                            </div>
                                            
                                            {/* Quick Actions / Toggles */}
                                            <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                                                <label className="flex items-center gap-2 cursor-pointer group">
                                                    <div className="relative flex items-center">
                                                        <input 
                                                            type="checkbox"
                                                            checked={draft.attachQuotes}
                                                            onChange={(e) => updateDraft(currentGroup.customerId, 'attachQuotes', e.target.checked)}
                                                            className="w-5 h-5 text-blue-600 rounded-md border-gray-300 focus:ring-blue-500 transition-colors cursor-pointer"
                                                        />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-semibold text-gray-700 group-hover:text-blue-700 transition-colors flex items-center gap-1.5">
                                                            <Paperclip className="w-3.5 h-3.5" /> Attach Quotes
                                                        </span>
                                                        <span className="text-xs text-gray-400">Include signed documents</span>
                                                    </div>
                                                </label>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6 mb-8">
                                            {/* Job Selection List */}
                                            <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden flex flex-col h-[500px]">
                                                <div className="bg-gray-50 px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <Package className="w-5 h-5 text-blue-600" />
                                                        <h4 className="font-semibold text-gray-900">Review Jobs ({currentGroup.jobs.length})</h4>
                                                    </div>
                                                </div>
                                                <div className="p-3 overflow-y-auto space-y-3 bg-gray-50/30 flex-1">
                                                    {currentGroup.jobs.map((job) => {
                                                        const isSelected = job.id === selectedJobId;
                                                        const jDraft = draft.jobDrafts[job.id];
                                                        const jobTotal = jDraft.lineItems.reduce((a, i) => a + (i.amount * i.quantity), 0);
                                                        return (
                                                        <div 
                                                            key={job.id} 
                                                            onClick={() => setSelectedJobId(job.id)}
                                                            className={`p-4 rounded-xl border transition-all cursor-pointer ${isSelected ? 'border-blue-500 bg-blue-50/50 shadow-md ring-1 ring-blue-500/20' : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm'}`}
                                                        >
                                                            <div className="flex justify-between items-start mb-2">
                                                                <span className="text-xs font-bold tracking-wider text-gray-500 uppercase">
                                                                    Job ID: {job.id.substring(0, 8)}
                                                                </span>
                                                                <span className="font-bold text-gray-900">${jobTotal.toFixed(2)}</span>
                                                            </div>
                                                            <p className={`text-sm font-medium mb-3 line-clamp-2 ${isSelected ? 'text-blue-900' : 'text-gray-800'}`}>
                                                                {job.request?.description || 'No description provided.'}
                                                            </p>
                                                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100/50">
                                                                <span className="text-xs font-medium text-gray-500 flex items-center gap-1">
                                                                    <Clock className="w-3.5 h-3.5" />
                                                                    {job.finished_at ? new Date(job.finished_at.seconds * 1000).toLocaleDateString() : 'Unknown Date'}
                                                                </span>
                                                                {jDraft.reviewed ? (
                                                                    <span className="text-xs font-bold text-green-600 flex items-center gap-1 bg-green-50 px-2 py-0.5 rounded-full"><CheckCircle className="w-3.5 h-3.5" /> Reviewed</span>
                                                                ) : (
                                                                    <span className="text-xs font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">Pending</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* Line Items Editor for Selected Job */}
                                            {selectedJob && jobDraft ? (
                                            <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden flex flex-col h-[500px]">
                                                <div className="bg-gray-50 px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                                                    <h4 className="font-semibold text-gray-900 truncate pr-4">Line Items - Job #{selectedJob.id.substring(0,8)}</h4>
                                                    {!jobDraft.reviewed && (
                                                        <button 
                                                            onClick={() => {
                                                                const newJobDrafts = { ...draft.jobDrafts };
                                                                newJobDrafts[selectedJob.id] = { ...newJobDrafts[selectedJob.id], reviewed: true };
                                                                updateDraft(currentGroup.customerId, 'jobDrafts', newJobDrafts);
                                                            }}
                                                            className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded-full transition-colors flex items-center gap-1.5 whitespace-nowrap"
                                                        >
                                                            <CheckCircle className="w-3.5 h-3.5" /> Mark as Reviewed
                                                        </button>
                                                    )}
                                                    {jobDraft.reviewed && (
                                                        <button 
                                                            onClick={() => {
                                                                const newJobDrafts = { ...draft.jobDrafts };
                                                                newJobDrafts[selectedJob.id] = { ...newJobDrafts[selectedJob.id], reviewed: false };
                                                                updateDraft(currentGroup.customerId, 'jobDrafts', newJobDrafts);
                                                            }}
                                                            className="text-xs font-bold text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full transition-colors whitespace-nowrap"
                                                        >
                                                            Needs Edit
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="overflow-x-auto flex-1 bg-white">
                                                    <table className="min-w-full divide-y divide-gray-100">
                                                        <thead className="bg-white sticky top-0 z-10 shadow-[0_1px_0_0_rgba(243,244,246,1)]">
                                                            <tr>
                                                                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                                                                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-20">Qty</th>
                                                                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Rate</th>
                                                                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Total</th>
                                                                <th className="px-5 py-3 w-12"></th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-100">
                                                            {jobDraft.lineItems.map((item, index) => (
                                                                <tr key={index} className="hover:bg-blue-50/30 transition-colors group">
                                                                    <td className="px-5 py-3">
                                                                        <textarea
                                                                            rows={1}
                                                                            value={item.description}
                                                                            onChange={(e) => {
                                                                                const newItems = [...jobDraft.lineItems];
                                                                                newItems[index].description = e.target.value;
                                                                                const newJobDrafts = { ...draft.jobDrafts, [selectedJob.id]: { ...jobDraft, lineItems: newItems } };
                                                                                updateDraft(currentGroup.customerId, 'jobDrafts', newJobDrafts);
                                                                            }}
                                                                            className="w-full bg-transparent border-0 border-b border-dashed border-gray-200 hover:border-blue-400 focus:border-blue-600 focus:ring-0 p-1 resize-none font-medium text-gray-800 py-1"
                                                                        />
                                                                    </td>
                                                                    <td className="px-5 py-3">
                                                                        <input
                                                                            type="number"
                                                                            min="1"
                                                                            value={item.quantity}
                                                                            onChange={(e) => {
                                                                                const newItems = [...jobDraft.lineItems];
                                                                                newItems[index].quantity = parseFloat(e.target.value) || 0;
                                                                                const newJobDrafts = { ...draft.jobDrafts, [selectedJob.id]: { ...jobDraft, lineItems: newItems } };
                                                                                updateDraft(currentGroup.customerId, 'jobDrafts', newJobDrafts);
                                                                            }}
                                                                            className="w-full text-right bg-transparent border-0 border-b border-dashed border-gray-200 hover:border-blue-400 focus:border-blue-600 focus:ring-0 p-1 font-medium text-gray-800"
                                                                        />
                                                                    </td>
                                                                    <td className="px-5 py-3">
                                                                        <div className="relative">
                                                                            <span className="absolute left-1 top-1.5 text-gray-400">$</span>
                                                                            <input
                                                                                type="number"
                                                                                min="0"
                                                                                value={item.amount}
                                                                                onChange={(e) => {
                                                                                    const newItems = [...jobDraft.lineItems];
                                                                                    newItems[index].amount = parseFloat(e.target.value) || 0;
                                                                                    const newJobDrafts = { ...draft.jobDrafts, [selectedJob.id]: { ...jobDraft, lineItems: newItems } };
                                                                                    updateDraft(currentGroup.customerId, 'jobDrafts', newJobDrafts);
                                                                                }}
                                                                                className="w-full pl-5 text-right bg-transparent border-0 border-b border-dashed border-gray-200 hover:border-blue-400 focus:border-blue-600 focus:ring-0 p-1 font-medium text-gray-800"
                                                                            />
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-5 py-3 text-right font-bold text-gray-900">
                                                                        ${(item.quantity * item.amount).toFixed(2)}
                                                                    </td>
                                                                    <td className="px-3 py-3 text-right">
                                                                        <button
                                                                            onClick={() => {
                                                                                const newItems = jobDraft.lineItems.filter((_, i) => i !== index);
                                                                                const newJobDrafts = { ...draft.jobDrafts, [selectedJob.id]: { ...jobDraft, lineItems: newItems } };
                                                                                updateDraft(currentGroup.customerId, 'jobDrafts', newJobDrafts);
                                                                            }}
                                                                            className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1.5 hover:bg-red-50 rounded-lg"
                                                                            title="Remove item"
                                                                        >
                                                                            <X className="w-4 h-4" />
                                                                        </button>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                <div className="bg-gray-50 px-5 py-3 border-t border-gray-100 mt-auto">
                                                    <button
                                                        onClick={() => {
                                                            const newItems = [...jobDraft.lineItems, { description: '', quantity: 1, amount: 0 }];
                                                            const newJobDrafts = { ...draft.jobDrafts, [selectedJob.id]: { ...jobDraft, lineItems: newItems } };
                                                            updateDraft(currentGroup.customerId, 'jobDrafts', newJobDrafts);
                                                        }}
                                                        className="text-sm font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1.5"
                                                    >
                                                        <span className="text-lg leading-none">+</span> Add Line Item
                                                    </button>
                                                </div>
                                            </div>
                                            ) : (
                                                <div className="bg-white border border-gray-100 shadow-sm rounded-2xl overflow-hidden flex flex-col items-center justify-center p-12 text-gray-500 h-[500px]">
                                                    <Package className="w-12 h-12 text-gray-300 mb-4" />
                                                    <p className="font-medium text-gray-600">No job selected</p>
                                                    <p className="text-sm mt-1">Select a job from the list to review its line items.</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Totals Section */}
                                        <div className="flex justify-end p-6 bg-white border border-gray-100 shadow-sm rounded-2xl">
                                            <div className="w-80 space-y-4">
                                                <div className="flex justify-between text-gray-500 font-medium">
                                                    <span>Subtotal</span>
                                                    <span className="text-gray-900">${subtotal.toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-gray-500 font-medium">
                                                    <span>Discount</span>
                                                    <div className="relative w-28">
                                                        <span className="absolute left-2.5 top-2 text-gray-400 font-medium">$</span>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={draft.discount}
                                                            onChange={(e) => updateDraft(currentGroup.customerId, 'discount', parseFloat(e.target.value) || 0)}
                                                            className="w-full pl-7 border border-gray-200 rounded-lg px-2 py-1.5 text-right focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium text-gray-900 transition-shadow"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex justify-between items-center text-gray-500 font-medium">
                                                    <span>Tax Rate (%)</span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.001"
                                                        value={draft.taxRate}
                                                        onChange={(e) => updateDraft(currentGroup.customerId, 'taxRate', parseFloat(e.target.value) || 0)}
                                                        className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-right focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium text-gray-900 transition-shadow"
                                                    />
                                                </div>
                                                <div className="flex justify-between text-gray-500 font-medium pb-4 border-b border-gray-100">
                                                    <span>Tax</span>
                                                    <span className="text-gray-900">${taxObj.toFixed(2)}</span>
                                                </div>
                                                <div className="flex justify-between text-2xl font-bold font-display tracking-tight text-gray-900 pt-1">
                                                    <span>Total</span>
                                                    <span>${total.toFixed(2)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Footer Controls */}
                                    <div className="mt-auto px-8 py-5 border-t border-gray-200 bg-white flex items-center justify-between shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] relative z-20">
                                        <div className="flex gap-4">
                                            <button
                                                onClick={() => processInvoice('archive')}
                                                disabled={processing}
                                                className="px-5 py-2.5 text-sm font-bold tracking-wide text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-all flex items-center gap-2 focus:ring-4 focus:ring-gray-100 disabled:opacity-50"
                                            >
                                                <SkipForward className="w-4 h-4" />
                                                Skip & Archive
                                            </button>
                                        </div>
                                        
                                        <div className="flex gap-4">
                                            <button
                                                onClick={() => processInvoice('save')}
                                                disabled={processing}
                                                className="px-6 py-2.5 text-sm font-bold tracking-wide text-gray-700 bg-white border-2 border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all focus:ring-4 focus:ring-gray-100 flex items-center gap-2 disabled:opacity-50"
                                            >
                                                <Save className="w-4 h-4" />
                                                Save Draft
                                            </button>
                                            <button
                                                onClick={() => processInvoice('send')}
                                                disabled={processing}
                                                className="px-8 py-2.5 text-sm font-bold tracking-wide text-white bg-blue-600 rounded-xl shadow-lg shadow-blue-600/20 hover:bg-blue-700 hover:shadow-blue-600/30 hover:-translate-y-0.5 transition-all focus:ring-4 focus:ring-blue-600/20 flex items-center gap-2 disabled:opacity-50"
                                            >
                                                <Send className="w-4 h-4" />
                                                {processing ? 'Processing...' : (groups.length === 1 ? 'Send & Finish' : 'Send & Next')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )}
            </div>
        </div>
    );
};
