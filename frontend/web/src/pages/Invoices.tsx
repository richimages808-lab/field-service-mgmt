import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { Invoice } from '../types';
import { useAuth } from '../auth/AuthProvider';
import { Link } from 'react-router-dom';
import { CreateInvoiceModal } from '../components/invoices/CreateInvoiceModal';
import { BatchInvoicingQueue } from '../components/invoices/BatchInvoicingQueue';
import { Plus, ListChecks, Search, ChevronUp, ChevronDown, Receipt } from 'lucide-react';
import { ModuleHeader, ModuleTabs, ModuleFilterToolbar } from '../components/ui';

export const Invoices: React.FC = () => {
    const { user } = useAuth();
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'individual' | 'grouped'>('individual');
    const [activeTab, setActiveTab] = useState<'active' | 'archive'>('active');
    const [searchTerm, setSearchTerm] = useState('');
    const [sortField, setSortField] = useState<'date' | 'customer' | 'amount' | 'status'>('date');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isBatchQueueOpen, setIsBatchQueueOpen] = useState(false);

    useEffect(() => {
        if (!user) return;
        const orgId = user.org_id || user.uid;

        const q = query(
            collection(db, 'invoices'),
            where('org_id', '==', orgId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
            // Client-side sort
            list.sort((a, b) => {
                const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
                const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
                return dateB.getTime() - dateA.getTime(); // Descending
            });
            setInvoices(list);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [user]);

    const handleMarkPaid = async (invoiceId: string) => {
        if (!confirm('Mark this invoice as PAID?')) return;
        try {
            await updateDoc(doc(db, 'invoices', invoiceId), { status: 'paid' });
        } catch (e) {
            console.error("Error updating invoice:", e);
            alert("Failed to update invoice");
        }
    };

    if (loading) return <div className="p-8">Loading...</div>;

    // Compute effective status — flag overdue invoices in real-time
    const getEffectiveStatus = (inv: Invoice): string => {
        if (inv.status === 'paid' || inv.status === 'void') return inv.status;
        if ((inv.status === 'sent' || inv.status === 'partial') && inv.dueDate) {
            const dueDate = inv.dueDate?.toDate ? inv.dueDate.toDate() : new Date(inv.dueDate);
            if (dueDate < new Date()) return 'overdue';
        }
        return inv.status || 'draft';
    };

    const archiveStatuses = ['sent', 'paid', 'void'];
    
    let filteredInvoices = invoices.filter(inv => {
        const isArchive = archiveStatuses.includes(inv.status?.toLowerCase() || 'pending');
        return activeTab === 'archive' ? isArchive : !isArchive;
    });

    if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        filteredInvoices = filteredInvoices.filter(inv => {
            const dateStr = inv.createdAt?.toDate ? inv.createdAt.toDate().toLocaleDateString() : '';
            const custName = inv.customer?.name || 'Unknown';
            const amountStr = inv.total?.toFixed(2) || '0.00';
            const statusStr = inv.status || 'pending';
            
            return dateStr.toLowerCase().includes(lower) ||
                custName.toLowerCase().includes(lower) ||
                amountStr.includes(lower) ||
                statusStr.toLowerCase().includes(lower);
        });
    }

    const handleSort = (field: 'date' | 'customer' | 'amount' | 'status') => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection(field === 'date' ? 'desc' : 'asc');
        }
    };

    const sortedInvoices = [...filteredInvoices].sort((a, b) => {
        let valA: any, valB: any;
        switch (sortField) {
            case 'date':
                valA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                valB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                break;
            case 'customer':
                valA = (a.customer?.name || '').toLowerCase();
                valB = (b.customer?.name || '').toLowerCase();
                break;
            case 'amount':
                valA = a.total || 0;
                valB = b.total || 0;
                break;
            case 'status':
                valA = (a.status || '').toLowerCase();
                valB = (b.status || '').toLowerCase();
                break;
        }

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    const groupedByMonth: { monthString: string, timestamp: number, invoices: Invoice[] }[] = [];
    if (viewMode === 'individual') {
        const groupMap: Record<string, { monthString: string, timestamp: number, invoices: Invoice[] }> = {};
        sortedInvoices.forEach(inv => {
            const date = inv.createdAt?.toDate ? inv.createdAt.toDate() : new Date(0);
            const monthYear = date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
            const monthTimestamp = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
            
            if (!groupMap[monthYear]) {
                groupMap[monthYear] = {
                    monthString: monthYear,
                    timestamp: monthTimestamp,
                    invoices: []
                };
            }
            groupMap[monthYear].invoices.push(inv);
        });
        
        const monthSortDir = (sortField === 'date' && sortDirection === 'asc') ? 1 : -1;
        groupedByMonth.push(...Object.values(groupMap).sort((a, b) => {
             return (a.timestamp - b.timestamp) * monthSortDir;
        }));
    }

    const SortIcon = ({ field }: { field: 'date' | 'customer' | 'amount' | 'status' }) => {
        if (sortField !== field) return <span className="opacity-0 group-hover:opacity-50"><ChevronDown className="w-4 h-4 inline-block ml-1" /></span>;
        return sortDirection === 'asc' 
            ? <ChevronUp className="w-4 h-4 inline-block ml-1 text-blue-600" /> 
            : <ChevronDown className="w-4 h-4 inline-block ml-1 text-blue-600" />;
    };

    return (
        <div className="px-4 sm:px-6 lg:px-8 py-5 space-y-5 max-w-[1600px] mx-auto">
            {/* Unified Page Header */}
            <ModuleHeader
                icon={<Receipt className="w-5 h-5 sm:w-6 sm:h-6" />}
                title="Invoices & Billing"
                subtitle="Create, track, batch bill, and manage receivables for completed work orders"
                actions={
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs sm:text-sm shadow-sm hover:shadow transition-all active:scale-98 cursor-pointer"
                        >
                            <Plus className="w-4 h-4" />
                            Create Invoice
                        </button>
                        <button
                            onClick={() => setIsBatchQueueOpen(true)}
                            disabled={isBatchQueueOpen}
                            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl font-bold text-xs sm:text-sm shadow-sm hover:shadow transition-all active:scale-98 cursor-pointer"
                        >
                            <ListChecks className="w-4 h-4" />
                            Run Billing Cycle
                        </button>
                    </div>
                }
            />

            {/* Controls Row: Status Tabs + Rollup Toggle + Unified Search */}
            <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <ModuleTabs
                        tabs={[
                            { id: 'active', label: 'Active Invoices', count: invoices.filter(i => !archiveStatuses.includes(i.status?.toLowerCase() || 'pending')).length },
                            { id: 'archive', label: 'Archive (Sent/Paid)', count: invoices.filter(i => archiveStatuses.includes(i.status?.toLowerCase() || 'pending')).length }
                        ]}
                        activeTab={activeTab}
                        onChange={(id) => setActiveTab(id as any)}
                    />

                    <ModuleTabs
                        tabs={[
                            { id: 'individual', label: 'Individual' },
                            { id: 'grouped', label: 'Rolled Up' }
                        ]}
                        activeTab={viewMode}
                        onChange={(id) => setViewMode(id as any)}
                    />
                </div>

                <ModuleFilterToolbar
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    searchPlaceholder="Search invoices by customer, date, amount, or status..."
                />
            </div>

            <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
                <table className="min-w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th onClick={() => handleSort('date')} className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer group hover:bg-slate-100 select-none">Date <SortIcon field="date" /></th>
                            <th onClick={() => handleSort('customer')} className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer group hover:bg-slate-100 select-none">Customer <SortIcon field="customer" /></th>
                            <th onClick={() => handleSort('amount')} className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer group hover:bg-slate-100 select-none">Amount <SortIcon field="amount" /></th>
                            <th onClick={() => handleSort('status')} className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer group hover:bg-slate-100 select-none">Status <SortIcon field="status" /></th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {viewMode === 'individual' ? (
                            groupedByMonth.map((group) => (
                                <React.Fragment key={group.monthString}>
                                    <tr className="bg-gray-100/80">
                                        <td colSpan={5} className="px-6 py-2 text-sm font-semibold text-gray-700">
                                            {group.monthString}
                                        </td>
                                    </tr>
                                    {group.invoices.map(invoice => (
                                        <tr key={invoice.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {invoice.createdAt?.toDate ? invoice.createdAt.toDate().toLocaleDateString() : 'N/A'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">{invoice.customer?.name || 'Unknown'}</td>
                                            <td className="px-6 py-4 whitespace-nowrap">${invoice.total?.toFixed(2)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {(() => {
                                                    const effectiveStatus = getEffectiveStatus(invoice);
                                                    const statusClasses: Record<string, string> = {
                                                        paid: 'bg-green-100 text-green-800',
                                                        sent: 'bg-blue-100 text-blue-800',
                                                        draft: 'bg-yellow-100 text-yellow-800',
                                                        partial: 'bg-orange-100 text-orange-800',
                                                        overdue: 'bg-red-100 text-red-800 animate-pulse',
                                                        void: 'bg-gray-100 text-gray-600',
                                                    };
                                                    return (
                                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusClasses[effectiveStatus] || 'bg-gray-100 text-gray-800'}`}>
                                                            {effectiveStatus}
                                                        </span>
                                                    );
                                                })()}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                                <Link to={`/invoices/${invoice.id}`} className="text-blue-600 hover:text-blue-900">View</Link>
                                                {invoice.status !== 'paid' && (
                                                    <button
                                                        onClick={() => handleMarkPaid(invoice.id)}
                                                        className="text-green-600 hover:text-green-900"
                                                    >
                                                        Mark Paid
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))
                        ) : (
                            (() => {
                                const rolledUp = Object.values(filteredInvoices.reduce((acc, inv) => {
                                    const name = inv.customer?.name || 'Unknown';
                                    if (!acc[name]) {
                                        acc[name] = { id: `group-${name}`, customerName: name, count: 0, total: 0, status: 'mixed' as any };
                                    }
                                    acc[name].count++;
                                    acc[name].total += inv.total || 0;
                                    return acc;
                                }, {} as Record<string, { id: string, customerName: string, count: number, total: number, status: string }>));
                                
                                rolledUp.sort((a, b) => {
                                    let valA: any, valB: any;
                                    switch (sortField) {
                                        case 'customer':
                                            valA = a.customerName.toLowerCase();
                                            valB = b.customerName.toLowerCase();
                                            break;
                                        case 'amount':
                                            valA = a.total;
                                            valB = b.total;
                                            break;
                                        default:
                                            valA = a.customerName.toLowerCase();
                                            valB = b.customerName.toLowerCase();
                                    }
                                    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
                                    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
                                    return 0;
                                });

                                return rolledUp.map(group => (
                                    <tr key={group.id} className="bg-gray-50 hover:bg-gray-100">
                                        <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-500">
                                            Various
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap font-bold">{group.customerName}</td>
                                        <td className="px-6 py-4 whitespace-nowrap font-bold">${group.total.toFixed(2)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                                                {group.count} Invoices
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            <span className="text-gray-400 cursor-not-allowed">View Details</span>
                                        </td>
                                    </tr>
                                ));
                            })()
                        )}
                    </tbody>
                </table>
                {filteredInvoices.length === 0 && (
                    <div className="p-8 text-center text-gray-500 flex flex-col items-center">
                        <ListChecks className="w-12 h-12 text-gray-300 mb-3" />
                        <p className="text-lg font-medium">No invoices found</p>
                        <p className="text-sm">Try adjusting your search or filters.</p>
                    </div>
                )}
            </div>

            <CreateInvoiceModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onCreated={() => {}}
            />

            <BatchInvoicingQueue
                isOpen={isBatchQueueOpen}
                onClose={() => setIsBatchQueueOpen(false)}
            />
        </div>
    );
};
