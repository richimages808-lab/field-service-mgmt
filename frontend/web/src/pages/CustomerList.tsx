import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Job } from '../types';
import { useAuth } from '../auth/AuthProvider';
import { Phone, Mail, MapPin, Clock } from 'lucide-react';
import { AddCustomerModal } from '../components/AddCustomerModal';

interface Customer {
    id: string;
    name: string;
    email: string;
    phone: string;
    address: string;
    billingTerms?: string;
    jobs?: Job[];
}

export const CustomerList: React.FC = () => {
    const { user } = useAuth();
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

    const handleAddCustomer = () => {
        setEditingCustomer(null);
        setIsAddModalOpen(true);
    };

    const handleEditCustomer = (cust: Customer) => {
        setEditingCustomer(cust);
        setIsAddModalOpen(true);
    };

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

    if (loading) return <div className="p-8">Loading Customers...</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-8">
            <header className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Customers</h1>
                    <p className="text-gray-600">Your customer directory</p>
                </div>
                {canAddCustomers && (
                    <button 
                        onClick={handleAddCustomer}
                        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 font-medium"
                    >
                        + Add Customer
                    </button>
                )}
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {customers.map(cust => (
                    <div 
                        key={cust.id} 
                        className="bg-white rounded-lg shadow hover:shadow-md transition-shadow overflow-hidden cursor-pointer"
                        onClick={() => navigate(`/contacts/${cust.id}`)}
                    >
                        <div className="p-6">
                            <div className="flex items-center mb-4">
                                    <div className="flex-shrink-0 h-10 w-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold text-lg">
                                        {cust.name ? cust.name.charAt(0).toUpperCase() : '?'}
                                    </div>
                                    <div className="ml-4">
                                        <div className="text-sm font-medium text-gray-900">{cust.name || 'Unnamed'}</div>
                                        <div className="text-sm text-gray-500">{cust.email}</div>
                                        {cust.billingTerms && (
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 uppercase tracking-wide">
                                                {cust.billingTerms.replace(/_/g, ' ')}
                                            </span>
                                        )}
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
                                className="w-full py-2 bg-gray-50 text-gray-600 text-sm font-medium rounded hover:bg-gray-100 flex items-center justify-center"
                            >
                                <Clock className="w-4 h-4 mr-2" />
                                {expandedId === cust.id ? 'Hide History' : 'View History'}
                            </button>
                        </div>

                        {expandedId === cust.id && (
                            <div className="bg-gray-50 p-4 border-t border-gray-100">
                                <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Recent Jobs</h4>
                                <div className="space-y-2">
                                    {cust.jobs?.slice(0, 3).map(job => (
                                        <div key={job.id} className="text-sm bg-white p-2 rounded border border-gray-200">
                                            <div className="flex justify-between">
                                                <span className="font-medium">{(job.request?.description || 'No description').substring(0, 30)}...</span>
                                                <span className={`text-xs px-1 rounded ${job.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                    {job.status}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
            
            <AddCustomerModal 
                isOpen={isAddModalOpen} 
                onClose={() => setIsAddModalOpen(false)} 
                onAdded={() => {
                    window.location.reload();
                }} 
                customerToEdit={editingCustomer}
            />
        </div>
    );
};
