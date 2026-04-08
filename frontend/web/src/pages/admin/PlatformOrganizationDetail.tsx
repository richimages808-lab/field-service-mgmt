import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../firebase';
import { Organization } from '../../types';
import { Building2, ArrowLeft, Save, CreditCard, DollarSign, Activity, Ghost, Key, Zap, Globe, MessageSquare, Mic, ShieldAlert, X, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

export const PlatformOrganizationDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user, impersonate } = useAuth();
    
    const [organization, setOrganization] = useState<Organization | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    // Support Access State
    const [accessStatus, setAccessStatus] = useState<'none' | 'pending' | 'approved' | 'expired'>('none');
    const [accessExpiresAt, setAccessExpiresAt] = useState<Date | null>(null);

    // Global Config State
    const [globalBaseRate, setGlobalBaseRate] = useState<number>(2.9);

    // Revocation Modal State
    const [serviceToRevoke, setServiceToRevoke] = useState<{ id: 'domain' | 'sms' | 'aiPhone', name: string } | null>(null);
    const [revoking, setRevoking] = useState(false);
    const functions = getFunctions();

    // Form states
    const [name, setName] = useState('');
    const [plan, setPlan] = useState('trial');
    const [maxTechs, setMaxTechs] = useState('');
    const [stripeFeeOverridePercent, setStripeFeeOverridePercent] = useState('');
    const [processingMarginPercent, setProcessingMarginPercent] = useState('1.0');
    const [monthlySubscriptionOverride, setMonthlySubscriptionOverride] = useState('');
    const [defaultPlatformFeePercent, setDefaultPlatformFeePercent] = useState('');

    const isSiteAdmin = (user as any)?.site_admin === true || user?.email?.toLowerCase() === 'rich@richheaton.com';

    useEffect(() => {
        if (!isSiteAdmin || !id) {
            navigate('/', { replace: true });
            return;
        }

        const fetchOrgDetails = async () => {
            try {
                // Fetch Global Base Rate
                const configDoc = await getDoc(doc(db, 'site_config', 'global'));
                if (configDoc.exists()) {
                    const conf = configDoc.data();
                    if (conf.baseStripeRate !== undefined) {
                        setGlobalBaseRate(Number(conf.baseStripeRate));
                    }
                }

                const orgDoc = await getDoc(doc(db, 'organizations', id));
                if (orgDoc.exists()) {
                    const data = orgDoc.data() as Organization;
                    setOrganization(data);
                    
                    // Initialize form states
                    setName(data.name || '');
                    setPlan(data.plan || 'trial');
                    setMaxTechs(data.maxTechs ? String(data.maxTechs) : '');
                    setStripeFeeOverridePercent(data.settings?.stripeFeeOverridePercent ? String(data.settings.stripeFeeOverridePercent) : '');
                    setProcessingMarginPercent(data.settings?.processingMarginPercent !== undefined ? String(data.settings.processingMarginPercent) : '1.0');
                    setMonthlySubscriptionOverride(data.settings?.monthlySubscriptionOverride ? String(data.settings.monthlySubscriptionOverride) : '');
                    setDefaultPlatformFeePercent(data.settings?.defaultPlatformFeePercent ? String(data.settings.defaultPlatformFeePercent) : '');
                } else {
                    toast.error("Organization not found");
                    navigate('/platform-organizations');
                }

                // Fetch Support Access Request Status
                const accessDoc = await getDoc(doc(db, 'support_access_requests', id));
                if (accessDoc.exists()) {
                    const data = accessDoc.data();
                    if (data.status === 'approved') {
                        const expires = data.expiresAt?.toDate();
                        if (expires && expires > new Date()) {
                            setAccessStatus('approved');
                            setAccessExpiresAt(expires);
                        } else {
                            setAccessStatus('expired');
                        }
                    } else if (data.status === 'pending') {
                        setAccessStatus('pending');
                    }
                }
            } catch (error) {
                console.error("Error fetching organization detail:", error);
                toast.error("Failed to load organization details");
            } finally {
                setLoading(false);
            }
        };

        fetchOrgDetails();
    }, [id, isSiteAdmin, navigate]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id || !organization) return;

        setSaving(true);
        try {
            const margin = processingMarginPercent ? parseFloat(processingMarginPercent) : 1.0;
            const calculatedStripeRate = globalBaseRate + margin;

            const updatePayload: any = {
                name,
                plan,
                maxTechs: maxTechs ? parseInt(maxTechs, 10) : null,
                'settings.stripeFeeOverridePercent': calculatedStripeRate,
                'settings.processingMarginPercent': margin,
                'settings.monthlySubscriptionOverride': monthlySubscriptionOverride ? parseFloat(monthlySubscriptionOverride) : null,
                'settings.defaultPlatformFeePercent': defaultPlatformFeePercent ? parseFloat(defaultPlatformFeePercent) : null,
            };

            await updateDoc(doc(db, 'organizations', id), updatePayload);
            toast.success("Organization settings updated successfully");
            
            // Update local state to reflect changes without remounting
            setOrganization({
                ...organization,
                name,
                plan: plan as any,
                maxTechs: maxTechs ? parseInt(maxTechs, 10) : undefined,
                settings: {
                    ...organization.settings,
                    stripeFeeOverridePercent: calculatedStripeRate,
                    processingMarginPercent: margin,
                    monthlySubscriptionOverride: monthlySubscriptionOverride ? parseFloat(monthlySubscriptionOverride) : undefined,
                    defaultPlatformFeePercent: defaultPlatformFeePercent ? parseFloat(defaultPlatformFeePercent) : undefined
                }
            });
        } catch (error) {
            console.error("Error updating organization:", error);
            toast.error("Failed to update organization");
        } finally {
            setSaving(false);
        }
    };

    const handleRequestAccess = async () => {
        if (!id) return;
        try {
            await setDoc(doc(db, 'support_access_requests', id), {
                orgId: id,
                status: 'pending',
                requestedAt: serverTimestamp(),
                requestedBy: user?.email
            });
            setAccessStatus('pending');
            toast.success("Support access request sent to tenant");
        } catch (error) {
            console.error("Error requesting access:", error);
            toast.error("Failed to request access");
        }
    };

    const handleImpersonate = () => {
        if (!id || !organization) return;
        if (accessStatus !== 'approved') {
            toast.error("You do not have approved access yet.");
            return;
        }
        impersonate(id, organization.name);
        toast.success(`Now impersonating ${organization.name}`);
        navigate('/'); // Redirect to the dashboard which will now load their context
    };

    const handleRevokeService = async () => {
        if (!serviceToRevoke || !id) return;
        
        setRevoking(true);
        try {
            if (serviceToRevoke.id === 'domain') {
                const removeDomain = httpsCallable(functions, 'removeCustomDomain');
                await removeDomain({ orgId: id });
            } else if (serviceToRevoke.id === 'sms') {
                const releaseNumber = httpsCallable(functions, 'releasePhoneNumber');
                await releaseNumber({ orgId: id });
            } else if (serviceToRevoke.id === 'aiPhone') {
                const deleteAgent = httpsCallable(functions, 'deleteVapiAssistant');
                await deleteAgent({ orgId: id });
            }
            
            toast.success(`Successfully revoked ${serviceToRevoke.name}`);
            setServiceToRevoke(null);
            
            // Reload page to reflect changes
            window.location.reload();
        } catch (error: any) {
            console.error("Error revoking service:", error);
            toast.error(error?.message || "Failed to revoke service");
        } finally {
            setRevoking(false);
        }
    };

    if (loading) {
        return <div className="p-12 text-center text-gray-500 animate-pulse">Loading SaaS tenant details...</div>;
    }

    if (!organization) return null;

    return (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8">
            <div className="max-w-4xl mx-auto space-y-6">
                
                {/* Header Back Link */}
                <button 
                    onClick={() => navigate('/platform-organizations')}
                    className="flex items-center text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                    <ArrowLeft className="w-4 h-4 mr-1" /> Back to Tenants Directory
                </button>

                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                            <Building2 className="text-gray-400" />
                            {organization.name || "Unnamed Organization"}
                        </h1>
                        <p className="text-gray-500 mt-1 font-mono text-sm">Tenant ID: {id}</p>
                    </div>
                    
                    
                    {accessStatus === 'approved' ? (
                        <div className="flex flex-col items-end">
                            <button 
                                onClick={handleImpersonate}
                                className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-5 py-2.5 rounded-lg shadow-sm font-medium transition animate-pulse"
                            >
                                <Ghost className="w-5 h-5" />
                                Impersonate Tenant
                            </button>
                            <span className="text-xs text-amber-600 mt-1 font-medium">
                                Access expires {accessExpiresAt?.toLocaleTimeString()}
                            </span>
                        </div>
                    ) : accessStatus === 'pending' ? (
                        <button 
                            disabled
                            className="flex items-center gap-2 bg-gray-200 text-gray-500 px-5 py-2.5 rounded-lg shadow-sm font-medium cursor-not-allowed"
                        >
                            <Key className="w-5 h-5" />
                            Access Request Pending...
                        </button>
                    ) : (
                        <button 
                            onClick={handleRequestAccess}
                            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-lg shadow-sm font-medium transition"
                        >
                            <Key className="w-5 h-5" />
                            Request System Access
                        </button>
                    )}
                </div>

                <form onSubmit={handleSave} className="space-y-6">
                    {/* General Settings Card */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="bg-slate-50 px-6 py-4 border-b border-gray-200 flex items-center gap-2">
                            <Activity className="w-5 h-5 text-slate-500" />
                            <h2 className="font-bold text-gray-800 text-lg">General Profile</h2>
                        </div>
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                                <input 
                                    type="text" 
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Subscription Plan</label>
                                <select
                                    value={plan}
                                    onChange={(e) => setPlan(e.target.value)}
                                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                >
                                    <option value="trial">Trial</option>
                                    <option value="individual">Individual / Solo</option>
                                    <option value="small_business">Small Business</option>
                                    <option value="enterprise">Enterprise</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Max Technicians Limit</label>
                                <input 
                                    type="number" 
                                    value={maxTechs}
                                    placeholder="e.g. 5 (Leave blank for unlimited)"
                                    onChange={(e) => setMaxTechs(e.target.value)}
                                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Financial Overrides Card */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="bg-emerald-50 px-6 py-4 border-b border-gray-200 flex items-center gap-2">
                            <DollarSign className="w-5 h-5 text-emerald-600" />
                            <h2 className="font-bold text-gray-800 text-lg">Financial & Fee Overrides</h2>
                        </div>
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 flex flex-col gap-4 md:col-span-2">
                                <div>
                                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                        <CreditCard className="w-4 h-4 text-emerald-600" />
                                        Platform Processing Margin Builder
                                    </h3>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Ensure your profit margin remains protected even if processor costs change.
                                    </p>
                                </div>
                                
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center text-sm border-b border-gray-200 pb-2">
                                        <span className="text-gray-500">Base Stripe Cost (Global)</span>
                                        <span className="font-mono text-gray-800">{globalBaseRate.toFixed(2)}%</span>
                                    </div>
                                    
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="font-medium text-gray-700">+ Your Platform Premium (Profit)</span>
                                        <div className="flex items-center gap-1 w-32 border border-gray-300 rounded p-1 bg-white">
                                            <input 
                                                type="number" 
                                                step="0.01"
                                                min="0"
                                                value={processingMarginPercent}
                                                onChange={(e) => {
                                                    const val = parseFloat(e.target.value);
                                                    if (val < 0) {
                                                        toast.error('Margin cannot be less than 0%');
                                                        setProcessingMarginPercent('0');
                                                    } else {
                                                        setProcessingMarginPercent(e.target.value);
                                                    }
                                                }}
                                                className="w-full text-right outline-none ring-0 border-none px-1 font-mono focus:ring-0 text-amber-600 font-bold"
                                            />
                                            <span className="font-mono text-gray-400 mr-2">%</span>
                                        </div>
                                    </div>
                                    
                                    <div className="flex justify-between items-center bg-emerald-100 text-emerald-900 p-3 rounded text-sm font-bold mt-2">
                                        <span>Total Processing Fee Charged to Tenant</span>
                                        <span className="font-mono text-lg">{(globalBaseRate + (parseFloat(processingMarginPercent) || 0)).toFixed(2)}%</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Custom SaaS Monthly Fee ($)
                                </label>
                                <p className="text-xs text-gray-500 mb-3">
                                    Override standard pricing for enterprise deals or manual billing.
                                </p>
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-500 font-bold">$</span>
                                    <input 
                                        type="number" 
                                        step="0.01"
                                        value={monthlySubscriptionOverride}
                                        placeholder="e.g. 500.00"
                                        onChange={(e) => setMonthlySubscriptionOverride(e.target.value)}
                                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <button 
                            type="submit"
                            disabled={saving}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg shadow-sm font-bold flex items-center gap-2 transition disabled:opacity-50"
                        >
                            <Save className="w-5 h-5" />
                            {saving ? 'Saving...' : 'Save Configuration'}
                        </button>
                    </div>

                </form>

                {/* App Features & Addons Manager */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mt-6">
                    <div className="bg-blue-50 px-6 py-4 border-b border-gray-200 flex items-center gap-2 mb-2">
                        <Zap className="w-5 h-5 text-blue-600" />
                        <h2 className="font-bold text-gray-800 text-lg">Active Applications & Add-ons</h2>
                    </div>
                    <div className="p-6">
                        {(!organization?.customDomain && !organization?.twilioPhoneNumber && !organization?.vapiAssistantId) ? (
                            <div className="text-center py-6 bg-slate-50 text-slate-500 rounded-lg border border-slate-100 italic">
                                No premium applications currently enabled for this tenant.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4">
                                {/* Custom Domain Item */}
                                {organization?.customDomain && (
                                    <div className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
                                        <div className="flex items-center gap-4">
                                            <div className="bg-blue-100 text-blue-600 p-2 rounded-lg flex-shrink-0">
                                                <Globe className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900">Custom Domain</h3>
                                                <p className="text-sm text-gray-500 font-mono mt-0.5">{organization.customDomain}</p>
                                                <p className="text-xs font-semibold text-emerald-600 mt-1">Cost: $14.99/mo</p>
                                            </div>
                                        </div>
                                        <button 
                                            type="button"
                                            onClick={() => setServiceToRevoke({ id: 'domain', name: `Domain: ${organization.customDomain}` })}
                                            className="px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md border border-red-200 transition whitespace-nowrap ml-4"
                                        >
                                            Revoke API
                                        </button>
                                    </div>
                                )}

                                {/* SMS Texting Item */}
                                {organization?.twilioPhoneNumber && (
                                    <div className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
                                        <div className="flex items-center gap-4">
                                            <div className="bg-violet-100 text-violet-600 p-2 rounded-lg flex-shrink-0">
                                                <MessageSquare className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900">SMS Communications</h3>
                                                <p className="text-sm text-gray-500 font-mono mt-0.5">{organization.twilioPhoneNumber}</p>
                                                <p className="text-xs font-semibold text-emerald-600 mt-1">Tier: Included ($29.99/mo)</p>
                                            </div>
                                        </div>
                                        <button 
                                            type="button"
                                            onClick={() => setServiceToRevoke({ id: 'sms', name: `SMS Comm Line: ${organization.twilioPhoneNumber}` })}
                                            className="px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md border border-red-200 transition whitespace-nowrap ml-4"
                                        >
                                            Revoke API
                                        </button>
                                    </div>
                                )}

                                {/* AI Phone Receptionist Item */}
                                {organization?.vapiAssistantId && (
                                    <div className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
                                        <div className="flex items-center gap-4">
                                            <div className="bg-amber-100 text-amber-600 p-2 rounded-lg flex-shrink-0">
                                                <Mic className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900">AI Phone Agent</h3>
                                                <p className="text-sm text-gray-500 font-mono mt-0.5">Instance: {organization.vapiAssistantId}</p>
                                                <p className="text-xs font-semibold text-emerald-600 mt-1">Tier: AI Voice ($49.99/mo)</p>
                                            </div>
                                        </div>
                                        <button 
                                            type="button"
                                            onClick={() => setServiceToRevoke({ id: 'aiPhone', name: 'AI Voice Receptionist' })}
                                            className="px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md border border-red-200 transition whitespace-nowrap ml-4"
                                        >
                                            Revoke API
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

            </div>

            {/* Revoke API Service Modal */}
            {serviceToRevoke && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden relative">
                        <div className="px-6 py-4 bg-red-50 border-b border-red-100 flex items-center gap-3">
                            <ShieldAlert className="w-6 h-6 text-red-600 flex-shrink-0" />
                            <h3 className="font-bold text-red-900 text-lg">Revoke Partner Integration</h3>
                            <button 
                                onClick={() => !revoking && setServiceToRevoke(null)}
                                className="ml-auto text-red-400 hover:text-red-700 disabled:opacity-50"
                                disabled={revoking}
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="p-6">
                            <p className="text-gray-700 leading-relaxed mb-4">
                                You are about to forcefully tear down the API connection for <b className="text-gray-900">{serviceToRevoke.name}</b>.
                            </p>
                            
                            <div className="bg-gray-50 border border-gray-200 rounded p-4 mb-4 text-sm text-gray-600">
                                This will execute a live API request to our third-party partner (Twilio, Cloudflare, or Vapi) to destructively release this resource. It cannot be easily undone and may disrupt the customer's live operations immediately.
                            </div>

                            <p className="text-sm font-semibold text-gray-800 mb-2">To proceed, you must confirm your intent below:</p>
                        </div>

                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
                            <button
                                type="button"
                                disabled={revoking}
                                onClick={() => setServiceToRevoke(null)}
                                className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={revoking}
                                onClick={handleRevokeService}
                                className="px-4 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition flex items-center gap-2 disabled:opacity-50"
                            >
                                {revoking && <Loader2 className="w-4 h-4 animate-spin" />}
                                {revoking ? 'Executing API Teardown...' : 'Yes, Destructively Revoke'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
