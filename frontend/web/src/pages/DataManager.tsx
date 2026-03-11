import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { db } from '../firebase';
import { collection, query, getDocs, limit, doc, updateDoc, deleteDoc, where } from 'firebase/firestore';
import { Job, Invoice } from '../types';
import { generateRandomJob, generateRandomInvoice, clearData, generatePendingJobRequest } from '../lib/seeding';
import { useAuth } from '../auth/AuthProvider';

export const DataManager: React.FC = () => {
    const { user } = useAuth();
    const orgId = user?.org_id || 'demo-org';
    const [activeTab, setActiveTab] = useState<'jobs' | 'invoices'>('jobs');
    const [jobs, setJobs] = useState<Job[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchData = async () => {
        if (!user) return;
        setLoading(true);
        try {
            // Fetch Jobs
            const jobsQ = query(collection(db, 'jobs'), where('org_id', '==', orgId), limit(100));
            const jobsSnap = await getDocs(jobsQ);
            const jobsList = jobsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Job));
            // Client-side sort
            jobsList.sort((a, b) => (b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0) - (a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0));
            setJobs(jobsList);

            // Fetch Invoices
            const invQ = query(collection(db, 'invoices'), where('org_id', '==', orgId), limit(100));
            const invSnap = await getDocs(invQ);
            const invList = invSnap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice));
            invList.sort((a, b) => (b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0) - (a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0));
            setInvoices(invList);
        } catch (e: any) {
            console.error(e);
            toast.error('Error fetching data: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (user) {
            fetchData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const handleSeedJobs = async (count: number) => {
        const loadingToast = toast.loading(`Generating ${count} jobs...`);
        try {
            for (let i = 0; i < count; i++) {
                await generateRandomJob(user?.uid, user?.email || 'User');
            }
            toast.success(`Successfully added ${count} jobs!`, { id: loadingToast });
            fetchData();
        } catch (e: any) {
            toast.error('Error: ' + e.message, { id: loadingToast });
        }
    };

    const handleSeedInvoices = async (count: number) => {
        const loadingToast = toast.loading(`Generating ${count} invoices...`);
        try {
            for (let i = 0; i < count; i++) {
                await generateRandomInvoice();
            }
            toast.success(`Successfully added ${count} invoices!`, { id: loadingToast });
            fetchData();
        } catch (e: any) {
            toast.error('Error: ' + e.message, { id: loadingToast });
        }
    };

    const handleSeedPendingRequests = async (count: number) => {
        const loadingToast = toast.loading(`Generating ${count} pending job requests...`);
        try {
            for (let i = 0; i < count; i++) {
                await generatePendingJobRequest();
            }
            toast.success(`Successfully added ${count} pending requests!`, { id: loadingToast });
            fetchData();
        } catch (e: any) {
            toast.error('Error: ' + e.message, { id: loadingToast });
        }
    };

    const handleClearAll = async () => {
        if (!window.confirm('Are you sure you want to DELETE ALL DATA? This cannot be undone.')) return;
        const loadingToast = toast.loading('Clearing database...');
        try {
            await clearData(orgId);
            toast.success('Database cleared successfully!', { id: loadingToast });
            fetchData();
        } catch (e: any) {
            toast.error('Error: ' + e.message, { id: loadingToast });
        }
    };

    const updateJobField = async (id: string, field: keyof Job, value: any) => {
        try {
            await updateDoc(doc(db, 'jobs', id), { [field]: value });
            setJobs(prev => prev.map(j => j.id === id ? { ...j, [field]: value } : j));
        } catch (e) {
            console.error("Update failed", e);
        }
    };

    const updateInvoiceField = async (id: string, field: keyof Invoice, value: any) => {
        try {
            await updateDoc(doc(db, 'invoices', id), { [field]: value });
            setInvoices(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
        } catch (e) {
            console.error("Update failed", e);
        }
    };

    const deleteRecord = async (collectionName: string, id: string) => {
        if (!window.confirm('Delete this record?')) return;
        try {
            await deleteDoc(doc(db, collectionName, id));
            toast.success('Record deleted successfully');
            fetchData();
        } catch (e) {
            console.error("Delete failed", e);
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen">
            <h1 className="text-3xl font-bold mb-6 text-gray-800">Data Manager</h1>

            {/* Controls */}
            <div className="bg-white p-4 rounded shadow mb-6 flex flex-wrap gap-4 items-center">
                <button onClick={() => handleSeedJobs(5)} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                    + Add 5 Jobs
                </button>
                <button onClick={() => handleSeedPendingRequests(5)} className="bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700">
                    + Add 5 Pending Requests
                </button>
                <button onClick={() => handleSeedInvoices(5)} className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700">
                    + Add 5 Invoices
                </button>
                <button onClick={handleClearAll} className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 ml-auto">
                    Clear All Data
                </button>
                <button onClick={fetchData} className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700">
                    Refresh
                </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 mb-4">
                <button
                    className={`py-2 px-4 font-medium ${activeTab === 'jobs' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    onClick={() => setActiveTab('jobs')}
                >
                    Jobs ({jobs.length})
                </button>
                <button
                    className={`py-2 px-4 font-medium ${activeTab === 'invoices' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    onClick={() => setActiveTab('invoices')}
                >
                    Invoices ({invoices.length})
                </button>
            </div>

            {/* Data Grid */}
            <div className="bg-white rounded shadow overflow-x-auto">
                {loading ? (
                    <div className="p-8 text-center text-gray-500">Loading data...</div>
                ) : activeTab === 'jobs' ? (
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {jobs.map(job => (
                                <tr key={job.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">{job.id.substring(0, 8)}...</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{job.customer.name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <select
                                            value={job.status}
                                            onChange={(e) => updateJobField(job.id, 'status', e.target.value)}
                                            className="text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                                        >
                                            <option value="pending">Pending</option>
                                            <option value="unscheduled">Unscheduled (Approved)</option>
                                            <option value="scheduled">Scheduled</option>
                                            <option value="in_progress">In Progress</option>
                                            <option value="completed">Completed</option>
                                            <option value="cancelled">Cancelled</option>
                                        </select>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <select
                                            value={job.priority}
                                            onChange={(e) => updateJobField(job.id, 'priority', e.target.value)}
                                            className="text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                                        >
                                            <option value="low">Low</option>
                                            <option value="medium">Medium</option>
                                            <option value="high">High</option>
                                        </select>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 truncate max-w-xs">
                                        {job.request.description}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        <button onClick={() => deleteRecord('jobs', job.id)} className="text-red-600 hover:text-red-900">Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {invoices.map(inv => (
                                <tr key={inv.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">{inv.id.substring(0, 8)}...</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{inv.customer_name}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        $<input
                                            type="number"
                                            value={inv.amount}
                                            onChange={(e) => updateInvoiceField(inv.id, 'amount', parseFloat(e.target.value))}
                                            className="w-24 border-gray-300 rounded-md shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                                        />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <select
                                            value={inv.status}
                                            onChange={(e) => updateInvoiceField(inv.id, 'status', e.target.value)}
                                            className="text-sm border-gray-300 rounded-md shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                                        >
                                            <option value="draft">Draft</option>
                                            <option value="sent">Sent</option>
                                            <option value="paid">Paid</option>
                                            <option value="overdue">Overdue</option>
                                        </select>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                        <button onClick={() => deleteRecord('invoices', inv.id)} className="text-red-600 hover:text-red-900">Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};
