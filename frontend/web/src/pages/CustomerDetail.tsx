import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { Customer, Job, Invoice, CustomerAsset, ScheduledMessage, RateCardMatrix } from '../types';
import { Building2, Users, MapPin, History, FileText, ChevronLeft, Mail, Phone, Plus, Tag, Send, AlertCircle, Wrench, Settings, MessageSquare, Clock, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { AddAssetModal } from '../components/AddAssetModal';
import toast from 'react-hot-toast';

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
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'contacts' | 'sites' | 'equipment' | 'history' | 'invoices' | 'comms'>('overview');
    const [isAddAssetOpen, setIsAddAssetOpen] = useState(false);

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
                    <button className="text-sm bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition flex items-center font-medium shadow-sm">
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
                            </div>
                            <div className="flex items-center text-sm text-gray-500 mt-2 gap-6">
                                {contact.email && <span className="flex items-center"><Mail className="w-4 h-4 mr-1.5 text-gray-400" />{contact.email}</span>}
                                {contact.phone && <span className="flex items-center"><Phone className="w-4 h-4 mr-1.5 text-gray-400" />{contact.phone}</span>}
                            </div>
                        </div>
                        <button className="text-blue-600 hover:text-blue-800 text-sm font-medium transition cursor-pointer px-2 py-1 rounded hover:bg-blue-50">Edit</button>
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
                    <button className="text-sm bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition flex items-center font-medium shadow-sm">
                        <Plus className="w-4 h-4 mr-2" /> Add Location
                    </button>
                )}
            </div>
            
            {customer.addresses && customer.addresses.length > 0 ? customer.addresses.map(site => (
                <div key={site.id} className="bg-white rounded-lg shadow p-5 hover:shadow-md transition flex items-center justify-between">
                    <div className="flex items-start">
                        <MapPin className="w-5 h-5 text-gray-400 mt-0.5 mr-4" />
                        <div>
                            <h4 className="font-bold text-gray-900">{site.label || site.type || 'Unnamed Site'}</h4>
                            <p className="text-sm text-gray-600 mt-1">{site.street}, {site.city}, {site.state} {site.zip}</p>
                            {site.accessNotes && <p className="text-xs text-amber-600 mt-2 bg-amber-50 px-2 py-1 rounded inline-block font-medium">Notes: {site.accessNotes}</p>}
                        </div>
                    </div>
                     <button className="text-blue-600 hover:text-blue-800 text-sm font-medium transition cursor-pointer px-2 py-1 rounded hover:bg-blue-50">Edit</button>
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
                        <div key={job.id} className="p-4 hover:bg-slate-50 transition cursor-pointer flex justify-between items-center" onClick={() => navigate(`/jobs/${job.id}`)}>
                            <div>
                                <h4 className="font-semibold text-gray-900 line-clamp-1">{job.request?.description || 'Service call'}</h4>
                                <div className="text-xs text-gray-500 mt-1 flex items-center gap-3">
                                   <span>{job.createdAt?.toDate ? job.createdAt.toDate().toLocaleDateString() : 'Unknown Date'}</span>
                                   <span>•</span>
                                   <span className="flex items-center"><MapPin className="w-3 h-3 mr-1" /> {job.site_name || 'Primary Address'}</span>
                                </div>
                            </div>
                            <span className={`px-3 py-1 text-[10px] uppercase tracking-wide font-bold rounded-full ${job.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                                {job.status}
                            </span>
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

    const renderCommunications = () => (
         <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                <h3 className="font-bold text-gray-800">Communications Log</h3>
                <button className="text-sm bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition flex items-center shadow-sm">
                    <Plus className="w-4 h-4 mr-2" /> Schedule Message
                </button>
            </div>
            {communications.length > 0 ? (
                <div className="divide-y divide-gray-100">
                    {communications.map(msg => (
                        <div key={msg.id} className="p-4 hover:bg-slate-50 transition flex items-start gap-4">
                            <div className="mt-1">
                                {msg.status === 'sent' ? <CheckCircle className="w-5 h-5 text-emerald-500" /> : 
                                 msg.status === 'scheduled' ? <Clock className="w-5 h-5 text-blue-500" /> :
                                 msg.status === 'cancelled' ? <XCircle className="w-5 h-5 text-gray-400" /> :
                                 <AlertCircle className="w-5 h-5 text-rose-500" />}
                            </div>
                            <div className="flex-1">
                                <div className="flex justify-between items-start">
                                    <h4 className="font-semibold text-gray-900 capitalize">{msg.category.replace('_', ' ')}</h4>
                                    <span className="text-xs text-gray-500">
                                        {msg.scheduledFor?.toDate ? msg.scheduledFor.toDate().toLocaleString() : 'Date missing'}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-600 mt-1"><span className="font-medium text-gray-800">To:</span> {msg.recipientName} ({msg.recipientAddress}) via <span className="uppercase tracking-wider font-semibold">{msg.type}</span></p>
                                <div className="mt-2 bg-slate-50 border border-slate-100 p-3 rounded text-sm text-gray-700 italic">
                                    {msg.content.subject && <div className="font-medium not-italic mb-1">{msg.content.subject}</div>}
                                    "{msg.content.body}"
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="p-12 text-center text-gray-500">
                     <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                     <p className="font-medium">No automated communications scheduled.</p>
                     <p className="text-sm mt-1">Configure automated post-job surveys or payment reminders to see them here.</p>
                </div>
            )}
         </div>
    );

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
        </div>
    );
};
