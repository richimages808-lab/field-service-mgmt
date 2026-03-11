import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { Job, Invoice, UserProfile } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useAuth } from '../auth/AuthProvider';
import { Link } from 'react-router-dom';
import { Plus, User, Mail, Phone, Wrench, Edit2 } from 'lucide-react';
import { AddTechnicianModal } from '../components/dispatcher/AddTechnicianModal';
import { EditTechnicianModal } from '../components/dispatcher/EditTechnicianModal';

export const AdminDashboard: React.FC = () => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        revenue: 0,
        openTickets: 0,
        activeTechs: 0
    });
    interface RevenueData { name: string; revenue: number;[key: string]: any; }
    interface StatusData { name: string; value: number;[key: string]: any; }
    const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
    const [jobStatusData, setJobStatusData] = useState<StatusData[]>([]);
    const [unassignedJobs, setUnassignedJobs] = useState<Job[]>([]);
    const [technicians, setTechnicians] = useState<UserProfile[]>([]);
    const [isAddTechModalOpen, setIsAddTechModalOpen] = useState(false);
    const [isEditTechModalOpen, setIsEditTechModalOpen] = useState(false);
    const [selectedTech, setSelectedTech] = useState<UserProfile | null>(null);

    const handleEditTech = (tech: UserProfile) => {
        setSelectedTech(tech);
        setIsEditTechModalOpen(true);
    };

    useEffect(() => {
        const fetchData = async () => {
            if (!user) return;
            const orgId = user.org_id || 'demo-org'; // Get from user's org_id claim

            try {
                // 1. Fetch Jobs
                const jobsRef = collection(db, 'jobs');
                const jobsQ = query(jobsRef, where('org_id', '==', orgId));
                const jobsSnapshot = await getDocs(jobsQ);
                const jobs = jobsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Job));

                // 2. Fetch Invoices
                const invoicesRef = collection(db, 'invoices');
                const invoicesQ = query(invoicesRef, where('org_id', '==', orgId));
                const invoicesSnapshot = await getDocs(invoicesQ);
                const invoices = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));

                // 3. Fetch Techs (Users)
                const usersRef = collection(db, 'users');
                const usersQ = query(usersRef, where('org_id', '==', orgId), where('role', '==', 'technician'));
                const usersSnapshot = await getDocs(usersQ);
                const techCount = usersSnapshot.size;

                // --- Calculate Stats ---

                // Revenue
                const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);

                // Open Tickets
                const openTickets = jobs.filter(j => j.status !== 'completed' && j.status !== 'cancelled').length;

                // Unassigned Jobs
                const unassigned = jobs.filter(j => j.status === 'pending' && !j.assigned_tech_id);

                setStats({
                    revenue: totalRevenue,
                    openTickets: openTickets,
                    activeTechs: techCount
                });
                setUnassignedJobs(unassigned);

                // --- Prepare Chart Data ---

                // Revenue Trend (Mocking monthly data from invoices for demo)
                // In a real app, we'd group by month. Here we'll just show last 6 months mock or real if available.
                const monthlyRevenue = [
                    { name: 'Jun', revenue: 4000 },
                    { name: 'Jul', revenue: 3000 },
                    { name: 'Aug', revenue: 2000 },
                    { name: 'Sep', revenue: 2780 },
                    { name: 'Oct', revenue: 1890 },
                    { name: 'Nov', revenue: 2390 },
                ];
                // Overwrite with real data if we had enough... for now let's mix real total into a "Current" bar
                monthlyRevenue.push({ name: 'Current', revenue: totalRevenue });
                setRevenueData(monthlyRevenue);

                // Job Status Distribution
                const statusCounts = jobs.reduce((acc: any, job) => {
                    acc[job.status] = (acc[job.status] || 0) + 1;
                    return acc;
                }, {});
                const statusData = Object.keys(statusCounts).map(key => ({
                    name: key.charAt(0).toUpperCase() + key.slice(1),
                    value: statusCounts[key]
                }));
                setJobStatusData(statusData);

                setLoading(false);

            } catch (error) {
                console.error("Error fetching dashboard data:", error);
                setLoading(false);
            }
        };

        fetchData();
    }, [user]);

    // Real-time subscription for technicians
    useEffect(() => {
        if (!user) return;
        const orgId = user.org_id || 'demo-org';
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('org_id', '==', orgId), where('role', '==', 'technician'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const techs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserProfile));
            setTechnicians(techs);
            setStats(prev => ({ ...prev, activeTechs: techs.length }));
        });

        return () => unsubscribe();
    }, [user]);

    if (loading) return <div className="p-8">Loading Dashboard...</div>;

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <header className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Corporate Admin Dashboard</h1>
                    <p className="text-gray-600">Overview of organization performance</p>
                </div>
                <div className="space-x-4">
                    <Link to="/admin/integrations" className="text-gray-600 hover:text-blue-600 text-sm font-medium mr-4">
                        Integrations & Finance
                    </Link>
                    <Link to="/admin/services" className="text-gray-600 hover:text-blue-600 text-sm font-medium mr-4">
                        Services Catalog
                    </Link>
                    <Link to="/admin/communications" className="text-gray-600 hover:text-indigo-600 text-sm font-medium mr-4">
                        📡 Communications Hub
                    </Link>
                    <Link to="/dispatcher" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
                        Manage Schedule
                    </Link>
                    <Link to="/jobs/new" className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded">
                        + New Job
                    </Link>
                </div>
            </header>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
                    <h3 className="text-gray-500 text-sm font-medium uppercase">Total Revenue</h3>
                    <p className="text-3xl font-bold text-gray-800">${stats.revenue.toLocaleString()}</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-500">
                    <h3 className="text-gray-500 text-sm font-medium uppercase">Open Tickets</h3>
                    <p className="text-3xl font-bold text-gray-800">{stats.openTickets}</p>
                </div>
                <div className="bg-white p-6 rounded-lg shadow border-l-4 border-purple-500">
                    <h3 className="text-gray-500 text-sm font-medium uppercase">Active Techs</h3>
                    <p className="text-3xl font-bold text-gray-800">{stats.activeTechs}</p>
                </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Revenue Trend</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={revenueData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="revenue" fill="#82ca9d" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-lg shadow">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Job Status Distribution</h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={jobStatusData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    paddingAngle={5}
                                    dataKey="value"
                                    label
                                >
                                    {jobStatusData.map((_entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Active Technicians Section */}
            <div className="bg-white rounded-lg shadow overflow-hidden mb-8">
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">Active Technicians ({technicians.length})</h3>
                        <p className="text-sm text-gray-500">Manage your field service team</p>
                    </div>
                    <div className="flex space-x-3">
                        <Link to="/techs" className="text-indigo-600 hover:text-indigo-800 text-sm font-medium py-2 px-3">
                            View All &rarr;
                        </Link>
                        <button
                            onClick={() => setIsAddTechModalOpen(true)}
                            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Add Technician
                        </button>
                    </div>
                </div>
                <div className="p-6">
                    {technicians.length === 0 ? (
                        <div className="text-center py-8">
                            <User className="mx-auto h-12 w-12 text-gray-400" />
                            <h3 className="mt-2 text-sm font-medium text-gray-900">No technicians yet</h3>
                            <p className="mt-1 text-sm text-gray-500">Get started by adding your first technician.</p>
                            <div className="mt-4">
                                <button
                                    onClick={() => setIsAddTechModalOpen(true)}
                                    className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                                >
                                    <Plus className="w-4 h-4 mr-2" />
                                    Add Technician
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {technicians.slice(0, 6).map((tech) => (
                                <div
                                    key={tech.id}
                                    className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                                    onClick={() => handleEditTech(tech)}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-start">
                                            <div className="flex-shrink-0 bg-indigo-100 rounded-full p-2">
                                                <User className="h-5 w-5 text-indigo-600" />
                                            </div>
                                            <div className="ml-3 flex-1 min-w-0">
                                                <h4 className="text-sm font-medium text-gray-900 truncate">{tech.name}</h4>
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${tech.techType === 'solopreneur'
                                                    ? 'bg-purple-100 text-purple-800'
                                                    : 'bg-green-100 text-green-800'
                                                    }`}>
                                                    {tech.techType === 'solopreneur' ? 'Contractor' : 'Employee'}
                                                </span>
                                            </div>
                                        </div>
                                        <Edit2 className="h-4 w-4 text-gray-400" />
                                    </div>
                                    <div className="mt-3 space-y-1">
                                        <div className="flex items-center text-xs text-gray-500">
                                            <Mail className="flex-shrink-0 mr-1.5 h-3 w-3 text-gray-400" />
                                            <span className="truncate">{tech.email}</span>
                                        </div>
                                        <div className="flex items-center text-xs text-gray-500">
                                            <Phone className="flex-shrink-0 mr-1.5 h-3 w-3 text-gray-400" />
                                            {tech.phone || 'No phone'}
                                        </div>
                                        {tech.specialties && tech.specialties.length > 0 && (
                                            <div className="flex items-start text-xs text-gray-500">
                                                <Wrench className="flex-shrink-0 mr-1.5 h-3 w-3 text-gray-400 mt-0.5" />
                                                <div className="flex flex-wrap gap-1">
                                                    {tech.specialties.slice(0, 3).map((skill) => (
                                                        <span key={skill} className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">
                                                            {skill}
                                                        </span>
                                                    ))}
                                                    {tech.specialties.length > 3 && (
                                                        <span className="text-gray-400">+{tech.specialties.length - 3}</span>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {technicians.length > 6 && (
                                <div className="mt-4 text-center">
                                    <Link to="/techs" className="text-indigo-600 hover:text-indigo-800 text-sm font-medium">
                                        View all {technicians.length} technicians &rarr;
                                    </Link>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Unassigned Jobs List */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-gray-800">Unassigned Jobs ({unassignedJobs.length})</h3>
                    <Link to="/schedule" className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                        View Schedule Board &rarr;
                    </Link>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {unassignedJobs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500">No unassigned jobs.</td>
                                </tr>
                            ) : (
                                unassignedJobs.map(job => (
                                    <tr key={job.id}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{job.customer?.name || 'Unknown'}</td>
                                        <td className="px-6 py-4 text-sm text-gray-500 truncate max-w-xs">{job.request?.description || 'No description'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                                                ${job.priority === 'high' ? 'bg-red-100 text-red-800' :
                                                    job.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                                        'bg-green-100 text-green-800'}`}>
                                                {job.priority}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {job.createdAt?.toDate ? job.createdAt.toDate().toLocaleDateString() : 'N/A'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            <Link to={`/schedule?jobId=${job.id}`} className="text-indigo-600 hover:text-indigo-900">Assign</Link>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add Technician Modal */}
            <AddTechnicianModal
                isOpen={isAddTechModalOpen}
                onClose={() => setIsAddTechModalOpen(false)}
            />

            {/* Edit Technician Modal */}
            <EditTechnicianModal
                isOpen={isEditTechModalOpen}
                onClose={() => {
                    setIsEditTechModalOpen(false);
                    setSelectedTech(null);
                }}
                technician={selectedTech}
            />
        </div>
    );
};
