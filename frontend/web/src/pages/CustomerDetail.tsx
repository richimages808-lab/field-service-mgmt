import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { Customer, Job, Invoice, CustomerAsset, ScheduledMessage, RateCardMatrix, CustomerContact, CustomerAddress } from '../types';
import { Building2, Users, MapPin, History, FileText, ChevronLeft, Mail, Phone, Plus, Tag, Send, AlertCircle, Wrench, Settings, MessageSquare, Clock, CheckCircle, XCircle, Trash2, PhoneCall, Bot, Search, Filter, ChevronDown, ChevronUp, ExternalLink, DollarSign, Edit } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { AddAssetModal } from '../components/AddAssetModal';
import { AddContactModal } from '../components/AddContactModal';
import { AddLocationModal } from '../components/AddLocationModal';
import toast from 'react-hot-toast';
import { QuoteJobTimeline } from '../components/QuoteJobTimeline';
import { CustomerPhotoStrip } from '../components/CustomerPhotoStrip';

export const CustomerDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    
    // Permission checks
    const userRole = (user as any)?.role;
    const userPermissions = (user as any)?.permissions;
    const canAddCustomers = userRole === 'admin' || userRole === 'dispatcher' || (userPermissions?.canAddCustomers ?? true);
    const canAddLocations = userRole === 'admin' || userRole === 'dispatcher' || (userPermissions?.canAddLocations ?? true);

    const [customer, setCustomer] = useState<Customer | null>(null);
    const [rateCard, setRateCard] = useState<RateCardMatrix | null>(null);
    const [jobs, setJobs] = useState<Job[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [assets, setAssets] = useState<CustomerAsset[]>([]);
    const [communications, setCommunications] = useState<ScheduledMessage[]>([]);
    const [unifiedComms, setUnifiedComms] = useState<any[]>([]);
    const [commsLoading, setCommsLoading] = useState(false);
    const [commsSearch, setCommsSearch] = useState('');
    const [commsFilter, setCommsFilter] = useState<'all' | 'call' | 'email' | 'sms' | 'quote'>('all');
    const [expandedCommsId, setExpandedCommsId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'contacts' | 'sites' | 'equipment' | 'history' | 'invoices' | 'comms'>('overview');
    const [isAddAssetOpen, setIsAddAssetOpen] = useState(false);
    const [isAddContactOpen, setIsAddContactOpen] = useState(false);
    const [editingContact, setEditingContact] = useState<CustomerContact | null>(null);
    const [isAddLocationOpen, setIsAddLocationOpen] = useState(false);
    const [editingLocation, setEditingLocation] = useState<CustomerAddress | null>(null);
    const [expandedJobIds, setExpandedJobIds] = useState<Set<string>>(new Set());

    const toggleExpandJob = (jobId: string) => {
        setExpandedJobIds(prev => {
            const next = new Set(prev);
            if (next.has(jobId)) next.delete(jobId);
            else next.add(jobId);
            return next;
        });
    };

    useEffect(() => {
        if (!id) return;

        const fetchData = async () => {
             setLoading(true);
             try {
                // Fetch Customer Document
                const custRef = doc(db, 'customers', id);
                const custSnap = await getDoc(custRef);
                
                if (custSnap.exists()) {
                    setCustomer({ id: custSnap.id, ...custSnap.data() } as Customer);
                } else {
                    toast.error("Customer not found.");
                    navigate('/contacts');
                    return;
                }

                if (user?.uid) {
                    const techRef = doc(db, 'technicians', user.uid);
                    const techSnap = await getDoc(techRef);
                    if (techSnap.exists() && techSnap.data().rateCard) {
                        setRateCard(techSnap.data().rateCard as RateCardMatrix);
                    }
                }

                // Fetch Jobs
                const orgId = 'demo-org';
                const jobsQuery = query(collection(db, 'jobs'), where('org_id', '==', orgId));
                const jobsSnap = await getDocs(jobsQuery);
                const allJobs = jobsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Job));
                
                // Currently Jobs use nested customer object. We filter by id or name
                const custName = custSnap.data()?.name;
                const custJobs = allJobs.filter(j => (j.customer as any)?.id === id || j.customer?.name === custName);
                // Sort by date descending
                setJobs(custJobs.sort((a,b) => {
                    const d1 = a.createdAt?.seconds || 0;
                    const d2 = b.createdAt?.seconds || 0;
                    return d2 - d1;
                }));

                // Fetch Invoices
                const invQuery = query(collection(db, 'invoices'), where('customerId', '==', id));
                const invSnap = await getDocs(invQuery);
                const custInvoices = invSnap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice));
                setInvoices(custInvoices.sort((a,b) => {
                     const d1 = a.createdAt?.seconds || 0;
                     const d2 = b.createdAt?.seconds || 0;
                     return d2 - d1;
                }));

                // Fetch Assets
                const assetsQuery = query(collection(db, 'assets'), where('customerId', '==', id));
                const assetsSnap = await getDocs(assetsQuery);
                setAssets(assetsSnap.docs.map(d => ({ id: d.id, ...d.data() } as CustomerAsset)));

                // Fetch Communications Log
                const commsQuery = query(collection(db, 'scheduled_messages'), where('customerId', '==', id));
                const commsSnap = await getDocs(commsQuery);
                const custComms = commsSnap.docs.map(d => ({ id: d.id, ...d.data() } as ScheduledMessage));
                setCommunications(custComms.sort((a,b) => {
                     const d1 = a.scheduledFor?.seconds || 0;
                     const d2 = b.scheduledFor?.seconds || 0;
                     return d2 - d1;
                }));

             } catch (err) {
                 console.error(err);
                 toast.error("Failed to load customer profile.");
             } finally {
                 setLoading(false);
             }
        };

        fetchData();
    }, [id, navigate, user?.uid]);

    // Lazy-load unified communications when Comms tab is selected
    useEffect(() => {
        if (activeTab !== 'comms' || !customer || !id) return;
        if (unifiedComms.length > 0) return; // already loaded

        const loadUnifiedComms = async () => {
            setCommsLoading(true);
            const items: any[] = [];
            const custPhone = customer.phone || '';
            const custEmail = customer.email || '';
            const custName = customer.name || '';

            try {
                // 1. Voice call transcripts from tickets
                const phoneQueries: Promise<any>[] = [];
                if (custPhone) {
                    phoneQueries.push(getDocs(query(collection(db, 'tickets'), where('requestorPhone', '==', custPhone))));
                    // Also try normalized phone
                    const digits = custPhone.replace(/\D/g, '');
                    if (digits.length === 10) {
                        phoneQueries.push(getDocs(query(collection(db, 'tickets'), where('requestorPhone', '==', `+1${digits}`))));
                    }
                }
                if (custEmail) {
                    phoneQueries.push(getDocs(query(collection(db, 'tickets'), where('requestorEmail', '==', custEmail))));
                }
                const ticketResults = await Promise.all(phoneQueries);
                const seenTicketIds = new Set<string>();
                ticketResults.forEach(snap => {
                    snap.docs.forEach((d: any) => {
                        if (seenTicketIds.has(d.id)) return;
                        seenTicketIds.add(d.id);
                        const data = d.data();
                        items.push({
                            id: `ticket-${d.id}`,
                            type: 'call' as const,
                            channel: data.source === 'SMS' ? 'sms' : 'call',
                            title: data.source === 'SMS' ? 'Inbound SMS' : 'AI Voice Call',
                            summary: data.description || 'Voice intake call',
                            timestamp: data.createdAt?.toDate?.() || new Date(0),
                            status: data.status,
                            transcript: data.transcript || null,
                            icon: data.source === 'SMS' ? 'sms' : 'call',
                            linkTo: data.autoJobId ? `/jobs/${data.autoJobId}` : null,
                        });
                    });
                });

                // 2. Communications collection (SMS notes)
                try {
                    const commsSnap = await getDocs(query(collection(db, 'communications'), where('customer_id', '==', id)));
                    commsSnap.docs.forEach(d => {
                        const data = d.data();
                        items.push({
                            id: `comm-${d.id}`,
                            type: 'sms' as const,
                            channel: 'sms',
                            title: data.type === 'internal_note' ? 'System Note' : 'SMS Communication',
                            summary: data.content || '',
                            timestamp: data.timestamp?.toDate?.() || new Date(0),
                            status: data.status || 'sent',
                            icon: 'sms',
                        });
                    });
                } catch (e) { /* collection may not exist */ }

                // 3. Email logs (enriched with type, direction, from, htmlBody)
                if (custEmail) {
                    try {
                        const emailSnap = await getDocs(query(collection(db, 'email_logs'), where('to', '==', custEmail), where('status', '==', 'sent')));
                        emailSnap.docs.forEach(d => {
                            const data = d.data();
                            const typeLabels: Record<string, string> = {
                                'job_status_update': 'Job Status Update',
                                'job_assignment': 'Job Assignment',
                                'quote_sent': 'Quote Sent',
                                'quote_notification': 'Quote Notification',
                                'ticket_confirmation': 'Ticket Confirmation',
                                'auto_reply': 'Auto Reply',
                                'proxy_reply': 'Reply',
                                'custom': 'Email',
                            };
                            const typeLabel = typeLabels[data.type] || 'Email';
                            items.push({
                                id: `email-${d.id}`,
                                type: 'email' as const,
                                channel: 'email',
                                title: data.subject || typeLabel,
                                summary: `${typeLabel} from ${data.fromName || data.from || 'System'}`,
                                timestamp: data.createdAt?.toDate?.() || new Date(0),
                                status: data.status || 'sent',
                                icon: 'email',
                            });
                        });
                    } catch (e) { /* collection may not exist */ }
                }

                // 4. Customer communications (questions/approvals)
                const custJobIds = jobs.map(j => j.id);
                for (const jobId of custJobIds.slice(0, 10)) {
                    try {
                        const ccSnap = await getDocs(query(collection(db, 'customer_communications'), where('jobId', '==', jobId)));
                        ccSnap.docs.forEach(d => {
                            const data = d.data();
                            items.push({
                                id: `cc-${d.id}`,
                                type: data.method === 'email' ? 'email' as const : 'sms' as const,
                                channel: data.method || 'sms',
                                title: data.type === 'question' ? 'Question Sent' : data.type === 'approval' ? 'Approval Notice' : 'Outbound Message',
                                summary: data.question || `${data.type} via ${data.method}`,
                                timestamp: data.sentAt?.toDate?.() || new Date(0),
                                status: data.success ? 'sent' : 'failed',
                                icon: data.method || 'sms',
                                linkTo: `/jobs/${jobId}`,
                            });
                        });
                    } catch (e) { /* skip */ }
                }

                // 5. Voice callback sessions
                if (custPhone) {
                    try {
                        const digits = custPhone.replace(/\D/g, '');
                        const phoneVariants = [custPhone];
                        if (digits.length === 10) phoneVariants.push(`+1${digits}`);
                        if (digits.length === 11 && digits.startsWith('1')) phoneVariants.push(`+${digits}`);
                        for (const pv of phoneVariants) {
                            const vsSnap = await getDocs(query(collection(db, 'voice_sessions'), where('customerPhone', '==', pv)));
                            vsSnap.docs.forEach(d => {
                                const data = d.data();
                                if (items.find(i => i.id === `vs-${d.id}`)) return;
                                items.push({
                                    id: `vs-${d.id}`,
                                    type: 'call' as const,
                                    channel: 'callback',
                                    title: 'AI Quote Callback',
                                    summary: `Status: ${(data.status || 'unknown').replace(/_/g, ' ')}`,
                                    timestamp: data.createdAt?.toDate?.() || new Date(0),
                                    status: data.status,
                                    transcript: data.transcript || null,
                                    icon: 'callback',
                                });
                            });
                        }
                    } catch (e) { /* skip */ }
                }

                // 6. Quote communications (customerNotes)
                try {
                    const qSnap = await getDocs(query(collection(db, 'quotes'), where('customer_id', '==', id)));
                    qSnap.docs.forEach(d => {
                        const data = d.data();
                        const notes = data.customerNotes || [];
                        if (notes.length > 0) {
                            notes.forEach((note: any, idx: number) => {
                                items.push({
                                    id: `qn-${d.id}-${idx}`,
                                    type: 'quote' as const,
                                    channel: 'quote',
                                    title: note.author === 'customer' ? 'Customer Reply' : note.type === 'status_change' ? 'Quote Status Update' : 'Technician Note',
                                    summary: note.text || '',
                                    timestamp: note.createdAt ? new Date(note.createdAt) : new Date(0),
                                    status: 'logged',
                                    icon: 'quote',
                                    linkTo: `/quotes/${d.id}/edit`,
                                });
                            });
                        }
                        // Also log the quote itself
                        items.push({
                            id: `quote-${d.id}`,
                            type: 'quote' as const,
                            channel: 'quote',
                            title: `Quote ${data.quoteNumber ? '#' + data.quoteNumber : ''}`,
                            summary: `$${(data.total || 0).toFixed(2)} — ${(data.status || 'draft').replace(/_/g, ' ')}`,
                            timestamp: data.createdAt?.toDate?.() || new Date(0),
                            status: data.status,
                            icon: 'quote',
                            linkTo: `/quotes/${d.id}/edit`,
                        });
                    });
                } catch (e) { /* skip */ }

                // 7. Scheduled messages (already loaded)
                communications.forEach(msg => {
                    items.push({
                        id: `sched-${msg.id}`,
                        type: msg.type === 'email' ? 'email' as const : 'sms' as const,
                        channel: msg.type,
                        title: `Scheduled: ${(msg.category || 'message').replace(/_/g, ' ')}`,
                        summary: msg.content?.body || msg.content?.subject || '',
                        timestamp: msg.scheduledFor?.toDate?.() || new Date(0),
                        status: msg.status,
                        icon: msg.type,
                    });
                });

            } catch (err) {
                console.error('Failed to load unified comms:', err);
            }

            // Sort by newest first
            items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
            setUnifiedComms(items);
            setCommsLoading(false);
        };

        loadUnifiedComms();
    }, [activeTab, customer, id, jobs, communications]);

    // Filtered + searched comms
    const filteredComms = useMemo(() => {
        let result = unifiedComms;
        if (commsFilter !== 'all') {
            result = result.filter(c => c.type === commsFilter);
        }
        if (commsSearch.trim()) {
            const q = commsSearch.toLowerCase();
            result = result.filter(c =>
                (c.title || '').toLowerCase().includes(q) ||
                (c.summary || '').toLowerCase().includes(q)
            );
        }
        return result;
    }, [unifiedComms, commsFilter, commsSearch]);

    const handleEmailInvoice = (invoiceId: string) => {
        // Find billing contact
        const billingContact = customer?.contacts?.find(c => c.type === 'billing') || customer;
        const targetEmail = billingContact?.email;

        if (!targetEmail) {
            toast.error("No billing email found for this customer.");
            return;
        }

        toast.success(`Polite payment reminder sent to ${targetEmail} for Invoice #${invoiceId.substring(0,6).toUpperCase()}`);
    };

    if (loading) return <div className="p-8 flex items-center justify-center text-gray-500">Loading full CRM profile...</div>;
    if (!customer) return null;

    const handleDeleteCustomer = async () => {
        if (!window.confirm(`Are you sure you want to delete ${customer.name}? This action cannot be undone.`)) {
            return;
        }

        try {
            await deleteDoc(doc(db, 'customers', customer.id));
            toast.success("Customer deleted.");
            navigate('/contacts');
        } catch (error) {
            console.error("Error deleting customer:", error);
            toast.error("Failed to delete customer.");
        }
    };

    const handleSaveContact = async (contact: CustomerContact) => {
        if (!customer) return;

        let updatedContacts = customer.contacts ? [...customer.contacts] : [];

        // If this contact is default, make others non-default
        if (contact.isDefault) {
            updatedContacts = updatedContacts.map(c => ({ ...c, isDefault: false }));
        }

        const existingIndex = updatedContacts.findIndex(c => c.id === contact.id);
        if (existingIndex >= 0) {
            updatedContacts[existingIndex] = contact;
        } else {
            updatedContacts.push(contact);
        }

        try {
            const custRef = doc(db, 'customers', customer.id);
            await updateDoc(custRef, {
                contacts: updatedContacts,
                updatedAt: serverTimestamp()
            });

            setCustomer({
                ...customer,
                contacts: updatedContacts
            });
            toast.success("Contact saved successfully");
        } catch (err) {
            console.error("Failed to save contact:", err);
            toast.error("Failed to save contact");
            throw err;
        }
    };

    const handleDeleteContact = async (e: React.MouseEvent, contactId: string) => {
        e.stopPropagation();
        if (!customer) return;
        if (!window.confirm("Are you sure you want to delete this contact?")) return;

        const updatedContacts = (customer.contacts || []).filter(c => c.id !== contactId);

        try {
            const custRef = doc(db, 'customers', customer.id);
            await updateDoc(custRef, {
                contacts: updatedContacts,
                updatedAt: serverTimestamp()
            });

            setCustomer({
                ...customer,
                contacts: updatedContacts
            });
            toast.success("Contact deleted");
        } catch (err) {
            console.error("Failed to delete contact:", err);
            toast.error("Failed to delete contact");
        }
    };

    const handleSaveLocation = async (address: CustomerAddress) => {
        if (!customer) return;

        let updatedAddresses = customer.addresses ? [...customer.addresses] : [];

        // If this address is default, make others non-default
        if (address.isDefault) {
            updatedAddresses = updatedAddresses.map(a => ({ ...a, isDefault: false }));
        }

        const existingIndex = updatedAddresses.findIndex(a => a.id === address.id);
        if (existingIndex >= 0) {
            updatedAddresses[existingIndex] = address;
        } else {
            updatedAddresses.push(address);
        }

        try {
            const custRef = doc(db, 'customers', customer.id);
            const updates: any = {
                addresses: updatedAddresses,
                updatedAt: serverTimestamp()
            };
            if (address.isDefault) {
                updates.primaryAddressId = address.id;
                updates.address = `${address.street}, ${address.city}, ${address.state} ${address.zip}`.trim();
            }

            await updateDoc(custRef, updates);

            setCustomer({
                ...customer,
                addresses: updatedAddresses,
                primaryAddressId: address.isDefault ? address.id : customer.primaryAddressId,
                address: address.isDefault ? updates.address : customer.address
            });
            toast.success("Location saved successfully");
        } catch (err) {
            console.error("Failed to save location:", err);
            toast.error("Failed to save location");
            throw err;
        }
    };

    const handleDeleteLocation = async (e: React.MouseEvent, addressId: string) => {
        e.stopPropagation();
        if (!customer) return;
        if (!window.confirm("Are you sure you want to delete this location?")) return;

        const updatedAddresses = (customer.addresses || []).filter(a => a.id !== addressId);

        try {
            const custRef = doc(db, 'customers', customer.id);
            await updateDoc(custRef, {
                addresses: updatedAddresses,
                updatedAt: serverTimestamp()
            });

            setCustomer({
                ...customer,
                addresses: updatedAddresses
            });
            toast.success("Location deleted");
        } catch (err) {
            console.error("Failed to delete location:", err);
            toast.error("Failed to delete location");
        }
    };

    const isCorpTech = user?.role === 'technician' && (user as any)?.techType === 'corporate';

    const renderOverview = () => (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
                <h3 className="font-bold text-gray-800 border-b pb-3 mb-4 flex items-center">
                    <Building2 className="w-5 h-5 mr-2 text-blue-500" /> Account Details
                </h3>
                <div className="space-y-4">
                    <div>
                        <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider">Primary Phone</p>
                        <p className="font-medium text-gray-900">{customer.phone || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider">Primary Email</p>
                        <p className="font-medium text-gray-900">{customer.email || 'N/A'}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider">Billing Terms</p>
                        <p className="font-medium text-gray-900 capitalize">{customer.billing?.terms?.replace(/_/g, ' ') || 'Net 30'}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider mb-1">Pricing Tier</p>
                        {rateCard?.customRates && rateCard.customRates.length > 0 ? (
                            isCorpTech ? (
                                <p className="font-medium text-gray-900 mt-1">
                                    {customer.billing?.defaultRateTierId 
                                        ? rateCard.customRates.find(t => t.id === customer.billing?.defaultRateTierId)?.name 
                                        : 'Standard Rates'}
                                </p>
                            ) : (
                                <select 
                                    value={customer.billing?.defaultRateTierId || ''}
                                    onChange={async (e) => {
                                        const val = e.target.value;
                                        const newBilling = { ...(customer.billing || {}), defaultRateTierId: val || undefined };
                                        setCustomer({ ...customer, billing: newBilling as any });
                                        try {
                                            await updateDoc(doc(db, 'customers', id!), { billing: newBilling });
                                            toast.success('Pricing tier updated');
                                        } catch(err) {
                                            toast.error('Failed to update pricing tier');
                                        }
                                    }}
                                    className="block w-full max-w-[200px] rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border bg-white"
                                >
                                    <option value="">Standard Rates</option>
                                    {rateCard.customRates.map((tier) => (
                                        <option key={tier.id} value={tier.id}>{tier.name} ({tier.condition.type === 'percentage' ? `${tier.condition.amount}%` : `$${tier.condition.amount}`})</option>
                                    ))}
                                </select>
                            )
                        ) : (
                            <p className="font-medium text-gray-500 italic text-sm mt-1">No custom rate tiers defined</p>
                        )}
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider mb-1">Platform Fee Override (%)</p>
                        <div className="flex items-center gap-2 mt-1">
                            <input
                                type="number"
                                value={customer.customPlatformFeePercent ?? ''}
                                placeholder="Default"
                                onChange={async (e) => {
                                    const val = e.target.value ? parseFloat(e.target.value) : null;
                                    setCustomer({ ...customer, customPlatformFeePercent: val === null ? undefined : val });
                                    try {
                                        await updateDoc(doc(db, 'customers', id!), { 
                                            customPlatformFeePercent: val === null ? null : val 
                                        });
                                        toast.success('Platform fee updated');
                                    } catch(err) {
                                        toast.error('Failed to update platform fee');
                                    }
                                }}
                                step="0.01"
                                min="0"
                                className="block w-24 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border bg-white"
                            />
                            <span className="text-sm text-gray-500">
                                {customer.customPlatformFeePercent === undefined || customer.customPlatformFeePercent === null 
                                    ? '(Using global default)' 
                                    : '%'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
                 <h3 className="font-bold text-gray-800 border-b pb-3 mb-4 flex items-center">
                    <Tag className="w-5 h-5 mr-2 text-emerald-500" /> Snapshot
                </h3>
                <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="bg-blue-50 p-4 rounded-lg">
                        <p className="text-3xl font-bold text-blue-600">{jobs.length}</p>
                        <p className="text-xs text-slate-600 font-medium uppercase mt-1">Total Jobs</p>
                    </div>
                    <div className="bg-emerald-50 p-4 rounded-lg">
                        <p className="text-3xl font-bold text-emerald-600">{invoices.filter(i => i.status === 'paid').length}</p>
                        <p className="text-xs text-slate-600 font-medium uppercase mt-1">Paid Invoices</p>
                    </div>
                    <div className="bg-amber-50 p-4 rounded-lg">
                        <p className="text-3xl font-bold text-amber-600">{invoices.filter(i => i.status !== 'paid').length}</p>
                        <p className="text-xs text-slate-600 font-medium uppercase mt-1">Open Invoices</p>
                    </div>
                     <div className="bg-slate-50 p-4 rounded-lg flex items-center justify-center">
                        <div className="text-left">
                            <p className="text-sm font-semibold text-slate-700">{customer.addresses?.length || 1}</p>
                            <p className="text-xs text-slate-500">Service Locations</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderContacts = () => (
        <div className="space-y-4">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-gray-800">Contact Directory</h3>
                {canAddCustomers && (
                    <button 
                        onClick={() => { setEditingContact(null); setIsAddContactOpen(true); }}
                        className="text-sm bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition flex items-center font-medium shadow-sm cursor-pointer"
                    >
                        <Plus className="w-4 h-4 mr-2" /> Add Contact
                    </button>
                )}
            </div>
            
            {customer.contacts && customer.contacts.length > 0 ? customer.contacts.map(contact => (
                <div key={contact.id} className="bg-white rounded-lg shadow p-5 border-l-4 border-blue-500 hover:shadow-md transition">
                    <div className="flex justify-between items-start">
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h4 className="font-bold text-gray-900 text-lg">{contact.name}</h4>
                                <span className={`text-[10px] px-2.5 py-0.5 rounded-full uppercase tracking-widest font-bold
                                     ${contact.type === 'primary' ? 'bg-blue-100 text-blue-700' : 
                                       contact.type === 'billing' ? 'bg-emerald-100 text-emerald-700' : 
                                       'bg-slate-100 text-slate-700'}`}>
                                    {contact.type}
                                </span>
                                {contact.isDefault && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 uppercase tracking-widest font-bold">
                                        Default
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center text-sm text-gray-500 mt-2 gap-6 flex-wrap">
                                {contact.email && <span className="flex items-center"><Mail className="w-4 h-4 mr-1.5 text-gray-400" />{contact.email}</span>}
                                {contact.phone && <span className="flex items-center"><Phone className="w-4 h-4 mr-1.5 text-gray-400" />{contact.phone}</span>}
                            </div>
                            {contact.notes && (
                                <p className="text-xs text-gray-500 mt-2 italic bg-gray-50 p-2 rounded border border-gray-100 max-w-xl">
                                    Notes: {contact.notes}
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => { setEditingContact(contact); setIsAddContactOpen(true); }}
                                className="text-blue-600 hover:text-blue-800 text-sm font-medium transition cursor-pointer px-2 py-1 rounded hover:bg-blue-50 flex items-center gap-1"
                            >
                                <Edit className="w-3.5 h-3.5" /> Edit
                            </button>
                            <button 
                                onClick={(e) => handleDeleteContact(e, contact.id)}
                                className="text-red-600 hover:text-red-800 text-sm font-medium transition cursor-pointer px-2 py-1 rounded hover:bg-red-50 flex items-center gap-1"
                            >
                                <Trash2 className="w-3.5 h-3.5" /> Delete
                            </button>
                        </div>
                    </div>
                </div>
            )) : (
                <div className="bg-white text-center p-12 rounded-lg shadow-sm border border-dashed border-gray-300">
                    <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No auxiliary contacts configured.</p>
                    <p className="text-sm text-gray-400 mt-1">Add billing or on-site contacts to manage communications.</p>
                </div>
            )}
        </div>
    );

    const renderSites = () => (
        <div className="space-y-4">
             <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-gray-800">Service Locations</h3>
                {canAddLocations && (
                    <button 
                        onClick={() => { setEditingLocation(null); setIsAddLocationOpen(true); }}
                        className="text-sm bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition flex items-center font-medium shadow-sm cursor-pointer"
                    >
                        <Plus className="w-4 h-4 mr-2" /> Add Location
                    </button>
                )}
            </div>
            
            {customer.addresses && customer.addresses.length > 0 ? customer.addresses.map(site => (
                <div key={site.id} className="bg-white rounded-lg shadow p-5 hover:shadow-md transition flex items-center justify-between">
                    <div className="flex items-start">
                        <MapPin className="w-5 h-5 text-gray-400 mt-0.5 mr-4" />
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-bold text-gray-900">{site.label || site.type || 'Unnamed Site'}</h4>
                                {site.isDefault && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 uppercase tracking-widest font-bold">
                                        Default
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-gray-600 mt-1">{site.street}, {site.city}, {site.state} {site.zip}</p>
                            {site.accessNotes && <p className="text-xs text-amber-600 mt-2 bg-amber-50 px-2 py-1 rounded inline-block font-medium">Notes: {site.accessNotes}</p>}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => { setEditingLocation(site); setIsAddLocationOpen(true); }}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium transition cursor-pointer px-2 py-1 rounded hover:bg-blue-50 flex items-center gap-1"
                        >
                            <Edit className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button 
                            onClick={(e) => handleDeleteLocation(e, site.id)}
                            className="text-red-600 hover:text-red-800 text-sm font-medium transition cursor-pointer px-2 py-1 rounded hover:bg-red-50 flex items-center gap-1"
                        >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                    </div>
                </div>
            )) : (
                <div className="bg-white text-center p-12 rounded-lg shadow-sm border border-dashed border-gray-300">
                     <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No specific service locations mapped.</p>
                    <p className="text-sm text-gray-400 mt-1">Jobs will default to the customer's primary address.</p>
                </div>
            )}
        </div>
    );

    const renderEquipment = () => (
        <div className="space-y-4">
             <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-gray-800">Equipment & Assets</h3>
                <button onClick={() => setIsAddAssetOpen(true)} className="text-sm bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition flex items-center font-medium shadow-sm">
                    <Plus className="w-4 h-4 mr-2" /> Add Asset
                </button>
            </div>
            
            {assets.length > 0 ? assets.map(asset => {
                // Find repair history for this specific asset
                const assetJobs = jobs.filter(j => j.assetId === asset.id);
                return (
                    <div key={asset.id} className="bg-white rounded-lg shadow overflow-hidden group">
                        <div className="p-5 border-b border-gray-100 flex items-start justify-between">
                            <div className="flex items-start">
                                <div className="bg-slate-100 p-3 rounded-lg mr-4 group-hover:bg-blue-50 transition">
                                    <Wrench className="w-6 h-6 text-slate-500 group-hover:text-blue-500 transition" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-900 text-lg">{asset.name}</h4>
                                    <div className="flex items-center text-sm text-gray-600 mt-1 gap-3 flex-wrap">
                                        {asset.make && <span>Make: <span className="font-medium text-gray-900">{asset.make}</span></span>}
                                        {asset.model && <span>Model: <span className="font-medium text-gray-900">{asset.model}</span></span>}
                                        {asset.serialNumber && <span>S/N: <span className="font-medium text-gray-900">{asset.serialNumber}</span></span>}
                                    </div>
                                    {asset.notes && <p className="text-sm text-gray-500 mt-3 bg-gray-50 p-2 rounded max-w-2xl border border-gray-100 italic">{asset.notes}</p>}
                                </div>
                            </div>
                            <span className={`px-2.5 py-1 text-[10px] uppercase tracking-wide font-bold rounded-full ${asset.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                {asset.status || 'active'}
                            </span>
                        </div>
                        {/* Nested Repair History for this Asset */}
                        <div className="p-4 bg-slate-50/50">
                            {assetJobs.length > 0 ? (
                                <div className="space-y-2">
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Repair History ({assetJobs.length})</p>
                                    {assetJobs.map(job => (
                                        <div key={job.id} className="flex items-center justify-between text-sm bg-white p-2 px-3 rounded border border-gray-200 shadow-sm cursor-pointer hover:border-blue-300" onClick={() => navigate(`/jobs/${job.id}`)}>
                                            <div className="flex items-center">
                                                <span className="text-gray-500 w-24">{job.createdAt?.toDate ? job.createdAt.toDate().toLocaleDateString() : 'Unknown'}</span>
                                                <span className="font-medium text-gray-800">{job.request?.description || 'Service call'}</span>
                                            </div>
                                            <span className={`text-xs capitalize font-medium ${job.status === 'completed' ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                {job.status}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500 italic py-1">No repair history logged for this equipment.</p>
                            )}
                        </div>
                    </div>
                );
            }) : (
                <div className="bg-white text-center p-12 rounded-lg shadow-sm border border-dashed border-gray-300">
                     <Wrench className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">No equipment tracked for this customer.</p>
                    <p className="text-sm text-gray-400 mt-1">Add specific units or assets to map repair histories.</p>
                </div>
            )}
        </div>
    );

    const renderHistory = () => (
        <div className="bg-white rounded-lg shadow overflow-hidden">
             <div className="p-4 border-b bg-gray-50">
                <h3 className="font-bold text-gray-800">Job Ledger</h3>
            </div>
            {jobs.length > 0 ? (
                <div className="divide-y divide-gray-100">
                    {jobs.map(job => (
                        <div key={job.id} className="transition">
                            <div 
                                className="p-4 hover:bg-slate-50 flex justify-between items-center cursor-pointer"
                                onClick={() => toggleExpandJob(job.id)}
                            >
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); toggleExpandJob(job.id); }}
                                        className="text-gray-400 hover:text-blue-600 p-1"
                                    >
                                        {expandedJobIds.has(job.id) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    </button>
                                    <div>
                                        <h4 className="font-semibold text-gray-900 line-clamp-1 flex items-center gap-2">
                                            {job.request?.description || 'Service call'}
                                            <span 
                                                onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${job.id}`); }}
                                                className="text-blue-500 hover:text-blue-700 text-xs font-normal flex items-center ml-2 cursor-pointer"
                                            >
                                                <ExternalLink className="w-3 h-3 mr-0.5" /> View
                                            </span>
                                        </h4>
                                        <div className="text-xs text-gray-500 mt-1 flex items-center gap-3">
                                           <span>{job.createdAt?.toDate ? job.createdAt.toDate().toLocaleDateString() : 'Unknown Date'}</span>
                                           <span>•</span>
                                           <span className="flex items-center"><MapPin className="w-3 h-3 mr-1" /> {job.site_name || 'Primary Address'}</span>
                                        </div>
                                    </div>
                                </div>
                                <span className={`px-3 py-1 text-[10px] uppercase tracking-wide font-bold rounded-full ${job.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                    {job.status}
                                </span>
                            </div>
                            {expandedJobIds.has(job.id) && (
                                <div className="px-6 pb-4 pt-2 bg-slate-50/50 border-t border-dashed border-gray-150">
                                    <div className="max-w-4xl border border-gray-200 rounded-xl bg-white p-4 shadow-inner">
                                        {/* Customer's original request */}
                                        {job.request?.description && (
                                            <div className="mb-3">
                                                <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Customer Request</h5>
                                                <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-2.5 border border-gray-100 leading-relaxed">
                                                    {job.request.description}
                                                </p>
                                            </div>
                                        )}
                                        {/* Customer photos */}
                                        {job.request?.photos && job.request.photos.length > 0 && (
                                            <div className="mb-3">
                                                <CustomerPhotoStrip photos={job.request.photos} compact maxVisible={4} />
                                            </div>
                                        )}
                                        <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Job Activity & Quote History</h5>
                                        <QuoteJobTimeline jobId={job.id} isInternal={true} />
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="p-12 text-center text-gray-500">
                     <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                     <p>No job history available for this customer.</p>
                </div>
            )}
        </div>
    );

    const renderInvoices = () => (
         <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="p-4 border-b bg-gray-50">
                <h3 className="font-bold text-gray-800">Billing & Invoices</h3>
            </div>
            {invoices.length > 0 ? (
                <div className="divide-y divide-gray-100">
                    {invoices.map(invoice => (
                        <div key={invoice.id} className="p-4 hover:bg-slate-50 transition flex justify-between items-center">
                            <div>
                                <h4 className="font-semibold text-gray-900">Invoice #{invoice.id.substring(0,6).toUpperCase()}</h4>
                                <div className="text-xs text-gray-500 mt-1 flex items-center gap-3">
                                    <span>Due: {invoice.dueDate?.toDate ? invoice.dueDate.toDate().toLocaleDateString() : 'N/A'}</span>
                                    {invoice.status !== 'paid' && invoice.dueDate && invoice.dueDate.seconds * 1000 < Date.now() && (
                                        <span className="text-red-500 font-bold flex items-center"><AlertCircle className="w-3 h-3 mr-1" /> Overdue</span>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className={`px-3 py-1 text-[10px] uppercase tracking-wide font-bold rounded-full ${invoice.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                    {invoice.status}
                                </span>
                                <span className="font-bold text-gray-900">${invoice.total.toFixed(2)}</span>
                                {invoice.status !== 'paid' && (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleEmailInvoice(invoice.id); }}
                                        className="bg-blue-50 text-blue-600 p-2 rounded hover:bg-blue-100 transition"
                                        title="Email Reminder"
                                    >
                                        <Send className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="p-12 text-center text-gray-500">
                     <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                     <p>No invoices generated for this customer.</p>
                </div>
            )}
         </div>
    );

    const renderCommunications = () => {
        const getCommIcon = (item: any) => {
            switch (item.icon) {
                case 'call': return <PhoneCall className="w-5 h-5 text-emerald-500" />;
                case 'callback': return <Bot className="w-5 h-5 text-violet-500" />;
                case 'email': return <Mail className="w-5 h-5 text-blue-500" />;
                case 'sms': return <MessageSquare className="w-5 h-5 text-amber-500" />;
                case 'quote': return <DollarSign className="w-5 h-5 text-teal-500" />;
                default: return <MessageSquare className="w-5 h-5 text-gray-400" />;
            }
        };
        const getStatusBadge = (status: string) => {
            const map: Record<string, { bg: string; text: string; label: string }> = {
                sent: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Sent' },
                PENDING: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Pending' },
                COMPLETED: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Completed' },
                scheduled: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Scheduled' },
                approved: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Approved' },
                failed: { bg: 'bg-rose-50', text: 'text-rose-700', label: 'Failed' },
                cancelled: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Cancelled' },
                logged: { bg: 'bg-slate-50', text: 'text-slate-600', label: 'Logged' },
            };
            const s = map[status] || { bg: 'bg-gray-50', text: 'text-gray-600', label: (status || 'unknown').replace(/_/g, ' ') };
            return <span className={`${s.bg} ${s.text} px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide`}>{s.label}</span>;
        };
        const renderTranscript = (transcript: any[]) => {
            if (!transcript || transcript.length === 0) return null;
            return (
                <div style={{ maxHeight: 320, overflowY: 'auto', padding: '12px', background: '#0f172a', borderRadius: 8, marginTop: 8 }}>
                    {transcript.map((entry: any, i: number) => {
                        let role = 'unknown', text = '';
                        if (typeof entry === 'string') {
                            const match = entry.match(/^(AI|User|Agent|Customer|System):\s*(.*)/i);
                            role = match ? match[1].toLowerCase() : 'system';
                            text = match ? match[2] : entry;
                        } else {
                            role = (entry.role || 'system').toLowerCase();
                            text = entry.text || entry.content || '';
                        }
                        const isAI = role === 'ai' || role === 'agent' || role === 'assistant' || role === 'system';
                        return (
                            <div key={i} style={{ display: 'flex', justifyContent: isAI ? 'flex-start' : 'flex-end', marginBottom: 6 }}>
                                <div style={{
                                    maxWidth: '80%', padding: '8px 12px', borderRadius: 12,
                                    background: isAI ? '#1e293b' : '#4f46e5',
                                    color: isAI ? '#94a3b8' : '#e0e7ff',
                                    fontSize: 13, lineHeight: 1.5,
                                    borderTopLeftRadius: isAI ? 4 : 12,
                                    borderTopRightRadius: isAI ? 12 : 4,
                                }}>
                                    <div style={{ fontSize: 10, opacity: 0.6, marginBottom: 2, textTransform: 'uppercase' }}>{isAI ? '🤖 AI' : '👤 Customer'}</div>
                                    {text}
                                </div>
                            </div>
                        );
                    })}
                </div>
            );
        };

        const filterCounts = {
            all: unifiedComms.length,
            call: unifiedComms.filter(c => c.type === 'call').length,
            email: unifiedComms.filter(c => c.type === 'email').length,
            sms: unifiedComms.filter(c => c.type === 'sms').length,
            quote: unifiedComms.filter(c => c.type === 'quote').length,
        };

        return (
            <div className="bg-white rounded-lg shadow overflow-hidden">
                {/* Header */}
                <div className="p-4 border-b bg-gradient-to-r from-slate-50 to-indigo-50">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                            <History className="w-5 h-5 text-indigo-600" /> Unified Communications
                            <span className="ml-2 bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-semibold">{unifiedComms.length}</span>
                        </h3>
                    </div>
                    {/* Search */}
                    <div className="relative mb-3">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={commsSearch}
                            onChange={e => setCommsSearch(e.target.value)}
                            placeholder="Search calls, emails, texts, quotes..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 outline-none bg-white"
                        />
                    </div>
                    {/* Filter pills */}
                    <div className="flex gap-2 flex-wrap">
                        {([
                            { key: 'all', label: 'All', icon: <Filter className="w-3.5 h-3.5" /> },
                            { key: 'call', label: 'Calls', icon: <PhoneCall className="w-3.5 h-3.5" /> },
                            { key: 'email', label: 'Emails', icon: <Mail className="w-3.5 h-3.5" /> },
                            { key: 'sms', label: 'Texts', icon: <MessageSquare className="w-3.5 h-3.5" /> },
                            { key: 'quote', label: 'Quotes', icon: <DollarSign className="w-3.5 h-3.5" /> },
                        ] as const).map(f => (
                            <button
                                key={f.key}
                                onClick={() => setCommsFilter(f.key)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                                    commsFilter === f.key
                                        ? 'bg-indigo-600 text-white shadow-sm'
                                        : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                                }`}
                            >
                                {f.icon} {f.label}
                                <span className={`ml-1 ${commsFilter === f.key ? 'text-indigo-200' : 'text-gray-400'}`}>
                                    {filterCounts[f.key]}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Timeline */}
                {commsLoading ? (
                    <div className="p-12 text-center">
                        <div className="animate-spin w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full mx-auto mb-3" />
                        <p className="text-gray-500 text-sm">Loading communication history...</p>
                    </div>
                ) : filteredComms.length > 0 ? (
                    <div className="divide-y divide-gray-50">
                        {filteredComms.map(item => {
                            const isExpanded = expandedCommsId === item.id;
                            const hasTranscript = item.transcript && item.transcript.length > 0;
                            return (
                                <div key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                    <div
                                        className="p-4 flex items-start gap-3 cursor-pointer"
                                        onClick={() => hasTranscript && setExpandedCommsId(isExpanded ? null : item.id)}
                                    >
                                        {/* Icon */}
                                        <div className="mt-0.5 flex-shrink-0 w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center border">
                                            {getCommIcon(item)}
                                        </div>
                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex justify-between items-start gap-2">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h4 className="font-semibold text-gray-900 text-sm">{item.title}</h4>
                                                    {getStatusBadge(item.status)}
                                                </div>
                                                <span className="text-[11px] text-gray-400 whitespace-nowrap flex-shrink-0">
                                                    {item.timestamp.getTime() > 0
                                                        ? item.timestamp.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
                                                        : '—'}
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-500 mt-0.5 truncate">{item.summary}</p>
                                            <div className="flex items-center gap-2 mt-1.5">
                                                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold bg-gray-50 px-1.5 py-0.5 rounded">
                                                    {item.channel}
                                                </span>
                                                {hasTranscript && (
                                                    <button className="text-[11px] text-indigo-600 font-medium flex items-center gap-1 hover:text-indigo-800">
                                                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                        {isExpanded ? 'Hide' : 'View'} Transcript ({item.transcript.length} msgs)
                                                    </button>
                                                )}
                                                {item.linkTo && (
                                                    <button
                                                        onClick={e => { e.stopPropagation(); navigate(item.linkTo); }}
                                                        className="text-[11px] text-blue-600 font-medium flex items-center gap-1 hover:text-blue-800"
                                                    >
                                                        <ExternalLink className="w-3 h-3" /> View
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    {/* Expanded transcript */}
                                    {isExpanded && hasTranscript && (
                                        <div className="px-4 pb-4 pl-16">
                                            {renderTranscript(item.transcript)}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="p-12 text-center text-gray-500">
                        <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        {commsSearch || commsFilter !== 'all' ? (
                            <>
                                <p className="font-medium">No results found.</p>
                                <p className="text-sm mt-1">Try adjusting your search or filter.</p>
                            </>
                        ) : (
                            <>
                                <p className="font-medium">No communication history yet.</p>
                                <p className="text-sm mt-1">Calls, emails, texts, and quote interactions will appear here.</p>
                            </>
                        )}
                    </div>
                )}
            </div>
        );
    };

    const tabs = [
        { id: 'overview', label: 'Overview', icon: Building2 },
        { id: 'contacts', label: 'Contacts', icon: Users },
        { id: 'sites', label: 'Locations', icon: MapPin },
        { id: 'equipment', label: 'Equipment', icon: Wrench },
        { id: 'comms', label: 'Comms', icon: MessageSquare },
        { id: 'history', label: 'Work History', icon: History },
        { id: 'invoices', label: 'Invoices', icon: FileText },
    ] as const;

    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8">
            {/* Header */}
            <div className="mb-8">
                <button 
                    onClick={() => navigate('/contacts')} 
                    className="flex items-center text-sm text-slate-500 hover:text-blue-600 mb-4 transition font-medium"
                >
                    <ChevronLeft className="w-4 h-4 mr-1" /> Back to Directory
                </button>
                <div className="flex justify-between items-end">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">{customer.name}</h1>
                        <p className="text-slate-500 mt-1 max-w-2xl">
                            {customer.addresses?.[0] ? `${customer.addresses[0].street}, ${customer.addresses[0].city}` : 'No primary address configured'}
                        </p>
                    </div>
                    {canAddCustomers && (
                        <button
                            onClick={handleDeleteCustomer}
                            className="bg-red-50 text-red-600 px-4 py-2 rounded hover:bg-red-100 font-medium text-sm flex items-center transition"
                            title="Delete Customer"
                        >
                            <Trash2 className="w-4 h-4 mr-2" /> Delete
                        </button>
                    )}
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="bg-white border-b border-gray-200 mb-6 rounded-t-lg px-2 pt-2">
                <nav className="-mb-px flex space-x-1 overflow-x-auto">
                    {tabs.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`
                                    whitespace-nowrap flex items-center py-4 px-6 border-b-2 font-medium text-sm transition-colors
                                    ${isActive 
                                        ? 'border-blue-500 text-blue-600 bg-blue-50/50 rounded-t-md' 
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-t-md hover:border-gray-300'
                                    }
                                `}
                            >
                                <Icon className={`w-4 h-4 mr-2 ${isActive ? 'text-blue-500' : 'text-gray-400'}`} />
                                {tab.label}
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* Content Area */}
            <div className="max-w-5xl">
                {activeTab === 'overview' && renderOverview()}
                {activeTab === 'contacts' && renderContacts()}
                {activeTab === 'sites' && renderSites()}
                {activeTab === 'equipment' && renderEquipment()}
                {activeTab === 'comms' && renderCommunications()}
                {activeTab === 'history' && renderHistory()}
                {activeTab === 'invoices' && renderInvoices()}
            </div>
            
            <AddAssetModal 
                isOpen={isAddAssetOpen} 
                onClose={() => setIsAddAssetOpen(false)} 
                customerId={id!} 
                onSuccess={(newAsset) => setAssets([...assets, newAsset])} 
            />

            <AddContactModal
                isOpen={isAddContactOpen}
                onClose={() => {
                    setIsAddContactOpen(false);
                    setEditingContact(null);
                }}
                contactToEdit={editingContact}
                onSave={handleSaveContact}
            />

            <AddLocationModal
                isOpen={isAddLocationOpen}
                onClose={() => {
                    setIsAddLocationOpen(false);
                    setEditingLocation(null);
                }}
                locationToEdit={editingLocation}
                onSave={handleSaveLocation}
            />
        </div>
    );
};
