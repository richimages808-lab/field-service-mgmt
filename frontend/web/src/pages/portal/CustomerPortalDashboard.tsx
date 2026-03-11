/**
 * CustomerPortalDashboard - Main dashboard for customer portal
 * Shows upcoming jobs, recent invoices, and quick actions
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePortalContext } from './CustomerPortalLayout';
import { db } from '../../firebase';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { Job, Invoice } from '../../types';

export const CustomerPortalDashboard: React.FC = () => {
    const { organization, customer, loading: contextLoading } = usePortalContext();

    const [upcomingJobs, setUpcomingJobs] = useState<Job[]>([]);
    const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            if (!customer) {
                setLoading(false);
                return;
            }

            try {
                // Fetch upcoming jobs (scheduled, not completed)
                const jobsQuery = query(
                    collection(db, 'jobs'),
                    where('customer_id', '==', customer.id),
                    where('status', 'in', ['scheduled', 'in_progress']),
                    orderBy('scheduled_at', 'asc'),
                    limit(5)
                );
                const jobsSnap = await getDocs(jobsQuery);
                setUpcomingJobs(jobsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Job)));

                // Fetch recent invoices
                const invoicesQuery = query(
                    collection(db, 'invoices'),
                    where('customer_id', '==', customer.id),
                    orderBy('createdAt', 'desc'),
                    limit(5)
                );
                const invoicesSnap = await getDocs(invoicesQuery);
                setRecentInvoices(invoicesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice)));
            } catch (error) {
                console.error('Error fetching dashboard data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [customer]);

    const formatDate = (timestamp: any) => {
        if (!timestamp) return 'TBD';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    };

    const getStatusColor = (status: string) => {
        const colors: Record<string, string> = {
            scheduled: 'bg-blue-100 text-blue-800',
            in_progress: 'bg-yellow-100 text-yellow-800',
            completed: 'bg-green-100 text-green-800',
            cancelled: 'bg-gray-100 text-gray-800',
            pending: 'bg-orange-100 text-orange-800',
            draft: 'bg-gray-100 text-gray-600',
            sent: 'bg-blue-100 text-blue-800',
            paid: 'bg-green-100 text-green-800',
            overdue: 'bg-red-100 text-red-800'
        };
        return colors[status] || 'bg-gray-100 text-gray-800';
    };

    if (contextLoading || loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Welcome Banner */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 md:p-8 text-white">
                <h1 className="text-2xl md:text-3xl font-bold mb-2">
                    Welcome back, {customer?.name?.split(' ')[0] || 'Customer'}!
                </h1>
                <p className="text-blue-100">
                    Here's an overview of your service activity.
                </p>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-4 shadow-sm border">
                    <p className="text-gray-500 text-sm">Upcoming Jobs</p>
                    <p className="text-2xl font-bold text-gray-900">{upcomingJobs.length}</p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border">
                    <p className="text-gray-500 text-sm">Completed Jobs</p>
                    <p className="text-2xl font-bold text-gray-900">{customer?.stats?.completedJobs || 0}</p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border">
                    <p className="text-gray-500 text-sm">Open Invoices</p>
                    <p className="text-2xl font-bold text-gray-900">
                        {recentInvoices.filter(i => i.status !== 'paid').length}
                    </p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border">
                    <p className="text-gray-500 text-sm">Outstanding Balance</p>
                    <p className="text-2xl font-bold text-gray-900">
                        ${(customer?.stats?.outstandingBalance || 0).toLocaleString()}
                    </p>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                {/* Upcoming Jobs */}
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    <div className="p-4 border-b flex justify-between items-center">
                        <h2 className="font-semibold text-gray-900">Upcoming Appointments</h2>
                        <Link to="/portal/jobs" className="text-sm text-blue-600 hover:text-blue-800">
                            View All →
                        </Link>
                    </div>

                    {upcomingJobs.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            <p className="mb-2">No upcoming appointments</p>
                            <Link
                                to="/portal/jobs"
                                className="text-blue-600 hover:text-blue-800 text-sm"
                            >
                                View job history
                            </Link>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {upcomingJobs.map((job) => (
                                <Link
                                    key={job.id}
                                    to={`/portal/jobs/${job.id}`}
                                    className="block p-4 hover:bg-gray-50 transition"
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <p className="font-medium text-gray-900">
                                                {job.request?.description?.substring(0, 50) || 'Service Visit'}
                                                {job.request?.description && job.request.description.length > 50 ? '...' : ''}
                                            </p>
                                            <p className="text-sm text-gray-500">
                                                {job.customer?.address}
                                            </p>
                                        </div>
                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(job.status)}`}>
                                            {job.status.replace('_', ' ').toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-4 text-sm text-gray-600">
                                        <span>📅 {formatDate(job.scheduled_at)}</span>
                                        {job.assigned_tech_name && (
                                            <span>👷 {job.assigned_tech_name}</span>
                                        )}
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>

                {/* Recent Invoices */}
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                    <div className="p-4 border-b flex justify-between items-center">
                        <h2 className="font-semibold text-gray-900">Recent Invoices</h2>
                        <Link to="/portal/invoices" className="text-sm text-blue-600 hover:text-blue-800">
                            View All →
                        </Link>
                    </div>

                    {recentInvoices.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                            <p>No invoices yet</p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {recentInvoices.map((invoice) => (
                                <Link
                                    key={invoice.id}
                                    to={`/portal/invoices/${invoice.id}`}
                                    className="block p-4 hover:bg-gray-50 transition"
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <p className="font-medium text-gray-900">
                                                Invoice #{invoice.id.substring(0, 8)}
                                            </p>
                                            <p className="text-sm text-gray-500">
                                                {formatDate(invoice.createdAt)}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-semibold text-gray-900">
                                                ${(invoice.total || invoice.amount || 0).toLocaleString()}
                                            </p>
                                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(invoice.status)}`}>
                                                {invoice.status.toUpperCase()}
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
                <h2 className="font-semibold text-gray-900 mb-4">Quick Actions</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Link
                        to="/portal/messages"
                        className="flex flex-col items-center p-4 rounded-lg border hover:bg-gray-50 transition"
                    >
                        <span className="text-3xl mb-2">💬</span>
                        <span className="text-sm font-medium text-gray-700">Send Message</span>
                    </Link>
                    <Link
                        to="/portal/jobs"
                        className="flex flex-col items-center p-4 rounded-lg border hover:bg-gray-50 transition"
                    >
                        <span className="text-3xl mb-2">📋</span>
                        <span className="text-sm font-medium text-gray-700">View All Jobs</span>
                    </Link>
                    <Link
                        to="/portal/invoices"
                        className="flex flex-col items-center p-4 rounded-lg border hover:bg-gray-50 transition"
                    >
                        <span className="text-3xl mb-2">💳</span>
                        <span className="text-sm font-medium text-gray-700">Pay Invoice</span>
                    </Link>
                    <Link
                        to="/portal/settings"
                        className="flex flex-col items-center p-4 rounded-lg border hover:bg-gray-50 transition"
                    >
                        <span className="text-3xl mb-2">⚙️</span>
                        <span className="text-sm font-medium text-gray-700">Settings</span>
                    </Link>
                </div>
            </div>

            {/* Contact Info */}
            {organization && (
                <div className="bg-blue-50 rounded-xl p-6">
                    <h2 className="font-semibold text-blue-900 mb-2">Need Help?</h2>
                    <p className="text-blue-700 text-sm mb-4">
                        Contact {organization.branding?.companyName || organization.name} directly:
                    </p>
                    <div className="flex flex-wrap gap-4">
                        {organization.outboundEmail?.fromEmail && (
                            <a
                                href={`mailto:${organization.outboundEmail.fromEmail}`}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-lg text-blue-700 hover:bg-blue-100 transition"
                            >
                                ✉️ Email Us
                            </a>
                        )}
                        <Link
                            to="/portal/messages"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                        >
                            💬 Send Message
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
};
