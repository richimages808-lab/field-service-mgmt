import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { Job } from '../types';
import { useAuth } from '../auth/AuthProvider';
import { Phone, Mail, MapPin, Clock, Trash2, Edit2, ExternalLink, History, MessageSquare, Users, Plus, ChevronDown } from 'lucide-react';
import { AddCustomerModal } from '../components/AddCustomerModal';
import { CustomerHistoryTimeline } from '../components/CustomerHistoryTimeline';
import { useOrgPath } from '../lib/orgRouting';
import { ModuleHeader, ModuleFilterToolbar } from '../components/ui';
import toast from 'react-hot-toast';

interface Customer {
    id: string;
    name: string;
    email: string;
    phone: string;
    address: string;
    billingTerms?: string;
    totalSpent?: number;
    contactType?: string;
    jobs?: Job[];
}

export const CustomerList: React.FC = () => {
    const { user } = useAuth();
    const { orgPath } = useOrgPath();
    const navigate = useNavigate();
    
    // Permission check
    const userRole = (user as any)?.role;
    const userPermissions = (user as any)?.permissions;
    const canAddCustomers = userRole === 'admin' || userRole === 'dispatcher' || (userPermissions?.canAddCustomers ?? true);

    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
    const [prefillData, setPrefillData] = useState<any>(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState('name');
    const [filterType, setFilterType] = useState('all');

    const handleAddCustomer = () => {
        setEditingCustomer(null);
        setPrefillData(null);
        setIsAddModalOpen(true);
    };

    const handleEditCustomer = (cust: Customer) => {
        setEditingCustomer(cust);
        setPrefillData(null);
        setIsAddModalOpen(true);
    };

    const handleDeleteCustomer = async (e: React.MouseEvent, custId: string, custName: string) => {
        e.stopPropagation();
        if (!window.confirm(`Are you sure you want to delete ${custName}? This action cannot be undone.`)) {
            return;
        }
        try {
            await deleteDoc(doc(db, 'customers', custId));
            setCustomers(prev => prev.filter(c => c.id !== custId));
            toast.success('Customer deleted successfully');
        } catch (error) {
            console.error('Error deleting customer:', error);
            toast.error('Failed to delete customer');
        }
    };

    const location = useLocation();

    useEffect(() => {
        if (location.state?.prefill) {
            setEditingCustomer(null);
            setPrefillData(location.state.prefill);
            setIsAddModalOpen(true);
            // Clear state so a refresh doesn't reopen it
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, navigate]);

    useEffect(() => {
        if (!user) return;
        const orgId = 'demo-org';

        const fetchData = async () => {
            const [jobsSnap, custSnap] = await Promise.all([
                getDocs(query(collection(db, 'jobs'), where('org_id', '==', orgId))),
                getDocs(query(collection(db, 'customers'), where('org_id', '==', orgId)))
            ]);
            
            const jobs = jobsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));
            const realCusts = custSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

            const custMap = new Map<string, Customer>();

            realCusts.forEach(c => {
                custMap.set(c.name, {
                    id: c.id,
                    name: c.name,
                    email: c.email || 'N/A',
                    phone: c.phone || 'N/A',
                    address: c.address || 'N/A',
                    billingTerms: c.billing?.terms,
                    totalSpent: c.stats?.totalSpent || 0,
                    contactType: c.contactType || 'Customer',
                    jobs: []
                });
            });

            jobs.forEach(job => {
                const c = job.customer;
                const key = c.name;
                if (!custMap.has(key)) {
                    custMap.set(key, {
                        id: key, // Mock ID
                        name: c.name,
                        email: c.email || 'N/A',
                        phone: c.phone || 'N/A',
                        address: c.address,
                        totalSpent: 0,
                        contactType: 'Customer',
                        jobs: []
                    });
                }
                custMap.get(key)?.jobs?.push(job);
            });

            setCustomers(Array.from(custMap.values()));
            setLoading(false);
        };

        fetchData();
    }, [user]);

    if (loading) return <div className="p-8">Loading Contacts...</div>;

    const uniqueContactTypes = Array.from(new Set(customers.map(c => c.contactType || 'Customer'))).sort();

    const filteredCustomers = customers.filter(c => {
        const matchesSearch = 
            c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.phone.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.address.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = filterType === 'all' || (c.contactType || 'Customer') === filterType;
        return matchesSearch && matchesType;
    }).sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'totalSpent') return (b.totalSpent || 0) - (a.totalSpent || 0); // Descending
        if (sortBy === 'contactType') return (a.contactType || 'Customer').localeCompare(b.contactType || 'Customer');
        return 0;
    });

    const newCustomers = filteredCustomers.filter(c => !c.totalSpent || c.totalSpent === 0);
    const existingCustomers = filteredCustomers.filter(c => c.totalSpent && c.totalSpent > 0);

    const renderCustomerCard = (cust: Customer) => (
        <div 
            key={cust.id} 
            className="bg-white rounded-lg shadow hover:shadow-md transition-shadow overflow-hidden"
        >
            <div className="p-6">
                <div 
                    className="flex items-center mb-4 cursor-pointer hover:opacity-85 transition"
                    onClick={() => navigate(orgPath(`/contacts/${cust.id}`))}
                >
                        <div className="flex-shrink-0 h-10 w-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold text-lg">
                            {cust.name ? cust.name.charAt(0).toUpperCase() : '?'}
                        </div>
                        <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{cust.name || 'Unnamed'}</div>
                            <div className="text-sm text-gray-500">{cust.email}</div>
                            {cust.billingTerms && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 uppercase tracking-wide inline-block mt-1 mr-2">
                                    {cust.billingTerms.replace(/_/g, ' ')}
                                </span>
                            )}
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-800 uppercase tracking-wide inline-block mt-1">
                                {cust.contactType || 'Customer'}
                            </span>
                            <div className="flex items-center text-xs text-gray-500 mt-1">
                                <MapPin className="w-3 h-3 mr-1 flex-shrink-0" />
                                <span className="truncate max-w-[200px]">{cust.address}</span>
                            </div>
                        </div>
                </div>

                <div className="space-y-2 mb-4">
                    <div className="flex items-center text-sm text-gray-600">
                        <Phone className="w-4 h-4 mr-3 text-gray-400" />
                        {cust.phone !== 'N/A' ? (
                            <a href={`tel:${cust.phone}`} className="hover:text-blue-600">{cust.phone}</a>
                        ) : 'No Phone'}
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                        <Mail className="w-4 h-4 mr-3 text-gray-400" />
                        {cust.email !== 'N/A' ? (
                            <a href={`mailto:${cust.email}`} className="hover:text-blue-600">{cust.email}</a>
                        ) : 'No Email'}
                    </div>
                </div>

                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        setExpandedId(expandedId === cust.id ? null : cust.id);
                    }}
                    className="w-full py-2 bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-100 flex items-center justify-center gap-1.5 transition-colors border border-slate-200/60"
                >
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>{expandedId === cust.id ? 'Hide History' : 'View History'}</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${expandedId === cust.id ? 'rotate-180 text-blue-600' : 'text-slate-400'}`} />
                </button>

                {canAddCustomers && (
                    <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleEditCustomer(cust);
                            }}
                            className="flex-1 py-1.5 bg-gray-50 text-blue-600 text-xs font-medium rounded hover:bg-blue-50 flex items-center justify-center transition"
                        >
                            <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Edit
                        </button>
                        <button
                            onClick={(e) => handleDeleteCustomer(e, cust.id, cust.name)}
                            className="flex-1 py-1.5 bg-gray-50 text-red-600 text-xs font-medium rounded hover:bg-red-50 flex items-center justify-center transition"
                        >
                            <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
                        </button>
                    </div>
                )}
            </div>

            {expandedId === cust.id && (
                <div className="bg-slate-50 p-4 border-t border-gray-200 space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700 uppercase tracking-wider">
                            <History className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Complete Event & Interaction History</span>
                        </div>
                        {cust.id && !cust.id.startsWith('mock-') && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(orgPath(`/contacts/${cust.id}`));
                                }}
                                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded transition"
                            >
                                <span>Full Profile</span>
                                <ExternalLink className="w-3 h-3" />
                            </button>
                        )}
                    </div>

                    <CustomerHistoryTimeline
                        customerId={cust.id}
                        customerName={cust.name}
                        customerPhone={cust.phone}
                        customerEmail={cust.email}
                        orgId={user?.org_id || 'demo-org'}
                        compact={true}
                        showFilters={true}
                    />
                </div>
            )}
        </div>
    );

    return (
        <div className="px-4 sm:px-6 lg:px-8 py-5 space-y-5 max-w-[1600px] mx-auto">
            {/* Unified Page Header */}
            <ModuleHeader
                icon={<Users className="w-5 h-5 sm:w-6 sm:h-6" />}
                title="Customers & Contacts"
                subtitle="Customer directory, communication history, job records, and billing terms"
                badge={`${customers.length} Contacts`}
                actions={
                    canAddCustomers && (
                        <button 
                            onClick={handleAddCustomer}
                            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs sm:text-sm shadow-sm hover:shadow transition-all active:scale-98 cursor-pointer"
                        >
                            <Plus className="w-4 h-4" />
                            Add Contact
                        </button>
                    )
                }
            />

            {/* Unified Search & Filter Toolbar */}
            <ModuleFilterToolbar
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder="Search contacts by name, email, phone, or address..."
                filters={
                    <div className="flex items-center gap-2 flex-wrap">
                        <select 
                            value={filterType} 
                            onChange={e => setFilterType(e.target.value)}
                            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                            <option value="all">All Types</option>
                            {uniqueContactTypes.map(t => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                        <select 
                            value={sortBy} 
                            onChange={e => setSortBy(e.target.value)}
                            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                            <option value="name">Name (A-Z)</option>
                            <option value="totalSpent">Total Spent (High-Low)</option>
                            <option value="contactType">Contact Type</option>
                        </select>
                    </div>
                }
            />

            {existingCustomers.length > 0 && (
                <div className="mb-12">
                    <h2 className="text-xl font-bold text-gray-800 mb-4 border-b border-gray-200 pb-2">Existing Contacts</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {existingCustomers.map(renderCustomerCard)}
                    </div>
                </div>
            )}

            {newCustomers.length > 0 && (
                <div>
                    <h2 className="text-xl font-bold text-gray-800 mb-4 border-b border-gray-200 pb-2">New Contacts</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {newCustomers.map(renderCustomerCard)}
                    </div>
                </div>
            )}
            
            <AddCustomerModal 
                isOpen={isAddModalOpen} 
                onClose={() => setIsAddModalOpen(false)} 
                onAdded={() => {
                    window.location.reload();
                }} 
                customerToEdit={editingCustomer}
                prefill={prefillData}
            />
        </div>
    );
};
