import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { AlertTriangle, Loader2, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const A2PBanner: React.FC = () => {
    const { user, organization } = useAuth();
    const isSystemAdmin = user?.site_admin;
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [showBanner, setShowBanner] = useState(false);
    const [a2pStatus, setA2pStatus] = useState<string | null>(null);

    useEffect(() => {
        const checkStatus = async () => {
            // Only care if communication services are enabled and user is not system admin viewing it
            if (!organization || isSystemAdmin) {
                setLoading(false);
                return;
            }

            if (!organization.communicationServices?.enabled) {
                setLoading(false);
                return;
            }

            try {
                const getStatus = httpsCallable(functions, 'getCommunicationStatus');
                const result = await getStatus({ orgId: organization.id });
                const data = result.data as any;

                if (data?.sms?.active && data?.sms?.a2pStatus !== 'APPROVED') {
                    setA2pStatus(data.sms.a2pStatus || 'not_registered');
                    setShowBanner(true);
                }
            } catch (error) {
                console.error("Failed to check A2P status for banner:", error);
            } finally {
                setLoading(false);
            }
        };

        checkStatus();
    }, [organization, isSystemAdmin]);

    if (loading || !showBanner) return null;

    const isPending = a2pStatus === 'IN_PROGRESS' || a2pStatus === 'pending';

    return (
        <div className="bg-amber-50 border-b border-amber-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                        <div>
                            <p className="text-sm font-medium text-amber-900">
                                {isPending ? (
                                    <>SMS Registration Pending: Your A2P 10DLC campaign is currently under review by carriers.</>
                                ) : (
                                    <>Action Required: A2P 10DLC Registration is required to send SMS to US numbers.</>
                                )}
                            </p>
                            <p className="text-xs text-amber-700 mt-0.5">
                                {isPending 
                                    ? "Delivery may be filtered or blocked until approved (1-7 days). Voice calls are unaffected." 
                                    : "Please complete your business registration to enable text messaging."}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => navigate('/admin/communications')}
                        className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                    >
                        {isPending ? 'View Status' : 'Register Now'}
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
};
