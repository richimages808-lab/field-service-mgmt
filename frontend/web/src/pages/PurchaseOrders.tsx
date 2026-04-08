import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { PurchaseOrder } from '../types/Vendor';
import { useAuth } from '../auth/AuthProvider';
import { Link } from 'react-router-dom';
import { Search, ChevronUp, ChevronDown, ShoppingCart, Settings } from 'lucide-react';
import { ManageVendorsModal } from '../components/inventory/ManageVendorsModal';
import { VendorSearchModal } from '../components/inventory/VendorSearchModal';
export const PurchaseOrders: React.FC = () => {
    const { user } = useAuth();
    
    // Extracted Permission checks
    const userRole = (user as any)?.role;
    const userPermissions = (user as any)?.permissions;
    const canPurchaseMaterials = userRole === 'admin' || userRole === 'dispatcher' || (userPermissions?.canPurchaseMaterials ?? true);
    const canAddVendors = userRole === 'admin' || userRole === 'dispatcher' || (userPermissions?.canAddVendors ?? true);

    const [orders, setOrders] = useState<PurchaseOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortField, setSortField] = useState<'date' | 'vendor' | 'amount' | 'status'>('date');
    const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc');
    const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
    const [showVendorsModal, setShowVendorsModal] = useState(false);
    const [showSearchModal, setShowSearchModal] = useState(false);
    useEffect(() => {
        if (!user?.org_id) return;

        const q = query(
            collection(db, 'purchaseOrders'),
            where('organizationId', '==', user.org_id)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseOrder));
            setOrders(list);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user?.org_id]);

    const handleSort = (field: 'date' | 'vendor' | 'amount' | 'status') => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection(field === 'date' ? 'desc' : 'asc');
        }
    };

    if (loading) return <div className="p-8"><div className="animate-pulse flex space-x-4"><div className="flex-1 space-y-4 py-1"><div className="h-4 bg-gray-200 rounded w-3/4"></div><div className="space-y-2"><div className="h-4 bg-gray-200 rounded"></div><div className="h-4 bg-gray-200 rounded w-5/6"></div></div></div></div></div>;

    const activeStatuses = ['draft', 'sent', 'partially_received'];
    
    let filteredOrders = orders.filter(po => {
        const isActive = activeStatuses.includes(po.status);
        return activeTab === 'active' ? isActive : !isActive;
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
            ? <ChevronUp className="w-4 h-4 inline-block ml-1 text-blue-600" /> 
            : <ChevronDown className="w-4 h-4 inline-block ml-1 text-blue-600" />;
    };

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">Purchase Orders</h1>
                    <p className="text-gray-500 mt-1">Manage vendor material and tool orders</p>
                </div>
                <div className="flex gap-3">
                    {canPurchaseMaterials && (
                        <button
                            onClick={() => setShowSearchModal(true)}
                            className="inline-flex items-center px-4 py-2 border border-indigo-600 shadow-sm text-sm font-medium rounded-md text-indigo-600 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                        >
                            <Search className="w-5 h-5 mr-2" />
                            New Order (Catalog)
                        </button>
                    )}
                    {canAddVendors && (
                        <button
                            onClick={() => setShowVendorsModal(true)}
                            className="inline-flex items-center px-4 py-2 border border-blue-600 shadow-sm text-sm font-medium rounded-md text-blue-600 bg-white hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                        >
                            <Settings className="w-5 h-5 mr-2" />
                            Manage Vendors
                        </button>
                    )}
                </div>
            </div>

            <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex border-b border-gray-200">
                    <button
                        onClick={() => setActiveTab('active')}
                        className={`px-6 py-2 border-b-2 font-medium text-sm ${activeTab === 'active' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                    >
                        Active Orders
                    </button>
                    <button
                        onClick={() => setActiveTab('archived')}
                        className={`px-6 py-2 border-b-2 font-medium text-sm ${activeTab === 'archived' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                    >
                        Archived (Received)
                    </button>
                </div>

                <div className="relative w-full sm:w-72">
                    <input
                        type="text"
                        placeholder="Search orders..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <Search className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" />
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th onClick={() => handleSort('date')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer group hover:bg-gray-100 select-none">Date Drafted <SortIcon field="date" /></th>
                                <th onClick={() => handleSort('vendor')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer group hover:bg-gray-100 select-none">Vendor <SortIcon field="vendor" /></th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Items</th>
                                <th onClick={() => handleSort('amount')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer group hover:bg-gray-100 select-none">Total Amount <SortIcon field="amount" /></th>
                                <th onClick={() => handleSort('status')} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer group hover:bg-gray-100 select-none">Status <SortIcon field="status" /></th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {sortedOrders.map(po => (
                                <tr key={po.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {po.createdAt?.toDate ? po.createdAt.toDate().toLocaleDateString() : 'N/A'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {po.vendorName}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {po.items?.length || 0} items
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        ${(po.total || 0).toFixed(2)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                                            po.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                                            po.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                                            po.status === 'received' ? 'bg-green-100 text-green-800' :
                                            po.status === 'canceled' ? 'bg-red-100 text-red-800' :
                                            'bg-gray-100 text-gray-800'
                                        }`}>
                                            {po.status.replace('_', ' ').toUpperCase()}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <Link to={`/purchase-orders/${po.id}`} className="inline-flex items-center text-blue-600 hover:text-blue-900 py-1.5 px-3 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors font-medium">
                                            {po.status === 'draft' ? 'Review & Send' : 'View Details'}
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    
                    {sortedOrders.length === 0 && (
                        <div className="py-12 flex flex-col items-center justify-center text-gray-500 bg-gray-50 border-t border-gray-100">
                            <ShoppingCart className="w-12 h-12 text-gray-300 mb-4" />
                            <p className="text-lg font-medium text-gray-900">No purchase orders found</p>
                            <p className="text-sm mt-1">There are no {activeTab} purchase orders matching your search.</p>
                        </div>
                    )}
                </div>
            </div>

            {showVendorsModal && (
                <ManageVendorsModal onClose={() => setShowVendorsModal(false)} />
            )}
            
            {showSearchModal && (
                <VendorSearchModal onClose={() => setShowSearchModal(false)} />
            )}
        </div>
    );
};
