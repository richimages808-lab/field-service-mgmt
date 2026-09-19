import React, { useState, useEffect } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { db, functions } from '../../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'react-hot-toast';
import {
    Smartphone, Shield, CheckCircle2, RefreshCw,
    Loader2, Info, AlertTriangle
} from 'lucide-react';
import { SMSAutomationManager } from '../admin/SMSAutomationManager';
import { A2PRegistrationForm } from '../admin/A2PRegistrationForm';

export const TextingSettings: React.FC = () => {
    const { user, organization, loading: authLoading } = useAuth();
    const orgId = user?.org_id || organization?.id || '';

    const [subscription, setSubscription] = useState<any>(null);
    const [loadingSub, setLoadingSub] = useState(true);
    const [refreshingA2p, setRefreshingA2p] = useState(false);

    const loadSubscription = async () => {
        if (!orgId) {
            setLoadingSub(false);
            return;
        }
        setLoadingSub(true);
        try {
            const subDoc = await getDoc(doc(db, 'org_texting_subscriptions', orgId));
            if (subDoc.exists()) {
                setSubscription(subDoc.data());
            }
        } catch (err) {
            console.error('Error loading texting subscription:', err);
        } finally {
            setLoadingSub(false);
        }
    };

    useEffect(() => {
        if (!authLoading) {
            loadSubscription();
        }
    }, [orgId, authLoading]);

    const handleRefreshA2P = async () => {
        setRefreshingA2p(true);
        try {
            const checkStatus = httpsCallable(functions, 'checkA2PStatus');
            const result: any = await checkStatus({ orgId });
            if (result?.data?.status) {
                toast.success(`A2P Carrier Status: ${result.data.status}`);
                await loadSubscription();
            } else {
                toast.success('Carrier profile re-evaluated');
            }
        } catch (err: any) {
            console.error(err);
            toast.error(err.message || 'Failed to check status');
        } finally {
            setRefreshingA2p(false);
        }
    };

    const formatPhone = (phone?: string) => {
        if (!phone) return '';
        const cleaned = ('' + phone).replace(/\D/g, '');
        const match = cleaned.match(/^(1|)?(\d{3})(\d{3})(\d{4})$/);
        if (match) {
            return ['(', match[2], ') ', match[3], '-', match[4]].join('');
        }
        return phone;
    };

    if (loadingSub) {
        return (
            <div className="py-12 flex items-center justify-center text-gray-500">
                <Loader2 className="w-6 h-6 animate-spin mr-2 text-blue-600" />
                <span className="text-sm">Loading Texting & SMS configuration...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Info Banner */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex gap-3 shadow-sm">
                <Info className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" />
                <div>
                    <h4 className="font-semibold text-indigo-900 text-sm">SMS Automation & Carrier Compliance</h4>
                    <p className="text-xs text-indigo-700 mt-1 leading-relaxed">
                        Configure automated customer text messages, job reminders, dynamic technician dispatch alerts, and customizable message templates. All texting operates through your organization&apos;s verified 10DLC A2P compliant Twilio number.
                    </p>
                </div>
            </div>

            {/* Carrier Status / Twilio Phone Badge */}
            {subscription && subscription.phoneNumber ? (
                <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex items-center gap-3.5">
                            <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl text-white shadow-sm">
                                <Shield className="w-6 h-6" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-lg font-bold text-gray-900">
                                        {formatPhone(subscription.phoneNumber)}
                                    </h2>
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        10DLC A2P Verified & Active
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    {subscription.planName || 'Standard'} Plan • {subscription.includedMessages || 2000} monthly messages included
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleRefreshA2P}
                                disabled={refreshingA2p}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition disabled:opacity-50"
                            >
                                {refreshingA2p ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                Verify Carrier Status
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-5">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                            <h3 className="text-sm font-semibold text-amber-900">Carrier Verification (10DLC A2P) Pending</h3>
                            <p className="text-xs text-amber-700 mt-1 mb-4">
                                Complete your business registration below to obtain a dedicated local textable phone number and ensure compliant message delivery to US mobile carriers.
                            </p>
                            <A2PRegistrationForm orgId={orgId} onSuccess={loadSubscription} />
                        </div>
                    </div>
                </div>
            )}

            {/* Automation Rules & Template Management */}
            <SMSAutomationManager
                orgId={orgId}
                orgName={organization?.name || 'Our Company'}
                twilioPhoneNumber={subscription?.phoneNumber}
            />
        </div>
    );
};
