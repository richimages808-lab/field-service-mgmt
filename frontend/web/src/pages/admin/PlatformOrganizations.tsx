import React, { useState, useEffect } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { Navigate, Link } from 'react-router-dom';
import { collection, query, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Organization } from '../../types';
import { Building2, Search, Activity, DollarSign, Crown, Users, Settings } from 'lucide-react';
import { toast } from 'react-hot-toast';

export const PlatformOrganizations: React.FC = () => {
    const { user } = useAuth();
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    
    // Global Config
    const [showConfig, setShowConfig] = useState(false);
    const [baseRate, setBaseRate] = useState('2.9');
    const [savingConfig, setSavingConfig] = useState(false);

    const isSiteAdmin = (user as any)?.site_admin === true || user?.email?.toLowerCase() === 'rich@richheaton.com';

    useEffect(() => {
        if (!isSiteAdmin) return;
        
        const fetchOrgs = async () => {
            try {
                const q = query(collection(db, 'organizations'));
                const snap = await getDocs(q);
                const results = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Organization);
                
                // Sort by creation date descending
                setOrganizations(results.sort((a, b) => {
                    const timeA = a.createdAt?.seconds || 0;
                    const timeB = b.createdAt?.seconds || 0;
                    return timeB - timeA;
                }));
            } catch (error) {
                console.error("Error fetching organizations:", error);
                toast.error("Failed to load organizations");
            } finally {
                setLoading(false);
                setLoading(false);
            }
        };

        const fetchGlobalConfig = async () => {
            try {
                const configDoc = await getDoc(doc(db, 'site_config', 'global'));
                if (configDoc.exists() && configDoc.data().baseStripeRate) {
                    setBaseRate(String(configDoc.data().baseStripeRate));
                }
            } catch(e) {
                console.error(e);
            }
        };

        fetchOrgs();
        fetchGlobalConfig();
    }, [isSiteAdmin]);

    if (!isSiteAdmin) {
        return <Navigate to="/" replace />;
    }

    const filteredOrgs = organizations.filter(org => 
        org.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        org.slug?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSaveGlobalConfig = async () => {
        setSavingConfig(true);
        try {
            await setDoc(doc(db, 'site_config', 'global'), {
                baseStripeRate: parseFloat(baseRate) || 2.9
            }, { merge: true });
            toast.success("Global configuration saved. Rates will be propagated.");
            setShowConfig(false);
        } catch (e) {
            toast.error("Failed to save global config");
        } finally {
            setSavingConfig(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8">
            <div className="max-w-7xl mx-auto space-y-6">
                
                {/* Header Subcomponent */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-blue-800">
                            Platform Tenants
                        </h1>
                        <p className="text-gray-500 mt-1">
                            Manage the organizations and businesses using the system.
                        </p>
                    </div>
                    <button 
                        onClick={() => setShowConfig(true)}
                        className="flex items-center gap-2 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 px-4 py-2 rounded-lg border border-slate-300 shadow-sm font-medium transition"
                    >
                        <Settings className="w-4 h-4" /> Global Platform Config
                    </button>
                </div>

                {/* Sub-Header Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                        <div className="flex items-center gap-3 mb-2 text-gray-500">
                            <Building2 className="w-5 h-5 text-blue-500" />
                            <span className="font-medium text-sm">Total Tenants</span>
                        </div>
                        <p className="text-3xl font-bold text-gray-900">{organizations.length}</p>
                    </div>
                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                        <div className="flex items-center gap-3 mb-2 text-gray-500">
                            <Activity className="w-5 h-5 text-emerald-500" />
                            <span className="font-medium text-sm">Active Subscriptions</span>
                        </div>
                        <p className="text-3xl font-bold text-gray-900">{organizations.filter(o => o.plan !== 'trial').length}</p>
                    </div>
                </div>

                {/* Search Bar */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex items-center">
                    <Search className="w-5 h-5 text-gray-400 ml-2" />
                    <input
                        type="text"
                        placeholder="Search tenants by name or ID..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="flex-1 ml-4 outline-none border-none ring-0 placeholder:text-gray-400"
                    />
                </div>

                {/* Organizations Grid */}
                {loading ? (
                    <div className="py-12 flex justify-center items-center">
                        <span className="text-gray-400 font-medium animate-pulse">Loading platform organizations...</span>
                    </div>
                ) : filteredOrgs.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredOrgs.map(org => {
                            const isTrialStatus = org.plan === 'trial';
                            
                            return (
                                <Link to={`/platform-organizations/${org.id}`} key={org.id} className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 transition overflow-hidden block">
                                    <div className="p-5 border-b border-gray-100 flex justify-between items-start">
                                        <div>
                                            <h3 className="font-bold text-lg text-gray-900">{org.name || 'Unnamed Org'}</h3>
                                            <p className="text-xs text-gray-500 mt-1 font-mono">ID: {org.id}</p>
                                        </div>
                                        <div className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide flex items-center gap-1 ${
                                            isTrialStatus ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                                        }`}>
                                            {isTrialStatus ? <Activity className="w-3 h-3" /> : <Crown className="w-3 h-3" />}
                                            {org.plan?.replace('_', ' ') || 'Unknown Plan'}
                                        </div>
                                    </div>
                                    
                                    <div className="p-5 space-y-4">
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-gray-500 flex items-center gap-2">
                                                <Users className="w-4 h-4" /> Max Techs
                                            </span>
                                            <span className="font-medium text-gray-900">
                                                {org.maxTechs ? org.maxTechs : 'Unlimited'}
                                            </span>
                                        </div>
                                        
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-gray-500 flex items-center gap-2">
                                                <DollarSign className="w-4 h-4" /> Default Tax Rate
                                            </span>
                                            <span className="font-medium text-gray-900">
                                                {(org as any).settings?.defaultTaxRate || 'N/A'}%
                                            </span>
                                        </div>
                                        
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-gray-500 flex items-center gap-2">
                                                <Building2 className="w-4 h-4" /> Platform Fee Override
                                            </span>
                                            <span className="font-medium text-emerald-600">
                                                {(org as any).settings?.defaultPlatformFeePercent 
                                                    ? `${(org as any).settings.defaultPlatformFeePercent}%` 
                                                    : 'Not Set (Global default applies)'}
                                            </span>
                                        </div>
                                        
                                        {org.createdAt && (
                                            <div className="pt-4 border-t border-gray-100 mt-4 text-xs text-gray-400 text-center">
                                                Joined {new Date(org.createdAt.seconds * 1000).toLocaleDateString()}
                                            </div>
                                        )}
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                ) : (
                    <div className="bg-white p-16 rounded-xl border border-dashed border-gray-300 flex flex-col items-center justify-center text-center">
                        <Building2 className="w-16 h-16 text-gray-300 mb-4" />
                        <h3 className="text-xl font-bold text-gray-700">No organizations found</h3>
                        <p className="text-gray-500 mt-2">No active tenants match your search filter.</p>
                    </div>
                )}
            </div>

            {/* Global Config Modal */}
            {showConfig && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden relative animate-in fade-in zoom-in duration-200">
                        <div className="bg-slate-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                            <div className="flex items-center gap-2 text-slate-800 font-bold">
                                <Settings className="w-5 h-5 text-slate-500" />
                                Global System Configuration
                            </div>
                            <button onClick={() => setShowConfig(false)} className="text-gray-400 hover:text-gray-600">&times;</button>
                        </div>
                        <div className="p-6">
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Base Stripe Processing Rate (%)
                                </label>
                                <p className="text-xs text-gray-500 mb-3">
                                    This is the floor cost you pay Stripe (e.g., 2.9%). If you increase this, all tenant rates will increase proportionately to protect your platform margins. An email will also be sent.
                                </p>
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="number" 
                                        step="0.01"
                                        value={baseRate}
                                        onChange={(e) => setBaseRate(e.target.value)}
                                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                    />
                                    <span className="text-gray-500 font-bold">%</span>
                                </div>
                            </div>
                        </div>
                        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end gap-3 flex-row-reverse">
                            <button 
                                disabled={savingConfig}
                                onClick={handleSaveGlobalConfig}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-bold disabled:opacity-50"
                            >
                                {savingConfig ? 'Saving...' : 'Save & Propagate'}
                            </button>
                            <button 
                                onClick={() => setShowConfig(false)}
                                className="text-gray-600 hover:text-gray-800 px-5 py-2 rounded-lg font-medium"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
