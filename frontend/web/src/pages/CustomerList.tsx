import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Job } from '../types';
import { useAuth } from '../auth/AuthProvider';
import { Phone, Mail, MapPin, Clock } from 'lucide-react';

interface Customer {
    id: string;
    name: string;
    email: string;
    phone: string;
    address: string;
    jobs?: Job[];
}

export const CustomerList: React.FC = () => {
    const { user } = useAuth();
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;
        const orgId = 'demo-org';

        const fetchData = async () => {
            // 1. Fetch Jobs to derive customers (since we don't have a dedicated customers collection in this demo yet)
            // In a real app, we'd fetch 'customers' collection. 
            // Here we'll aggregate unique customers from jobs.
            const jobsRef = collection(db, 'jobs');
            const q = query(jobsRef, where('org_id', '==', orgId));
            const snapshot = await getDocs(q);
            const jobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));

            const custMap = new Map<string, Customer>();

            jobs.forEach(job => {
                const c = job.customer;
                // Use name as key for demo if id missing
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

    if (loading) return <div className="p-8">Loading Contacts...</div>;

    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold text-gray-800">Contacts</h1>
                <p className="text-gray-600">Your customer directory</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {customers.map(cust => (
                    <div key={cust.id} className="bg-white rounded-lg shadow hover:shadow-md transition-shadow overflow-hidden">
                        <div className="p-6">
                            <div className="flex items-center mb-4">
                                <div className="h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xl mr-4">
                                    {cust.name.charAt(0)}
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg text-gray-800">{cust.name}</h3>
                                    <div className="flex items-center text-xs text-gray-500">
                                        <MapPin className="w-3 h-3 mr-1" />
                                        {cust.address}
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
                                onClick={() => setExpandedId(expandedId === cust.id ? null : cust.id)}
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
                                                <span className="font-medium">{job.request.description.substring(0, 30)}...</span>
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
        </div>
    );
};
