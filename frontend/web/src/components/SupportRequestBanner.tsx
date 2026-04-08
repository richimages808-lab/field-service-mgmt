import React, { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { KeyRound, ShieldAlert } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface AccessRequest {
    status: 'pending' | 'approved' | 'denied';
    requestedBy?: string;
    expiresAt?: any;
}

export const SupportRequestBanner: React.FC = () => {
    const { user, impersonatingOrgId } = useAuth();
    const [request, setRequest] = useState<AccessRequest | null>(null);

    useEffect(() => {
        // Only run for authenticated users who belong to an org and ARE NOT actively impersonating anyone
        const orgId = user?.org_id;
        if (!orgId || impersonatingOrgId || user?.site_admin) return;

        const checkRequest = async () => {
            try {
                const docRef = doc(db, 'support_access_requests', orgId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data() as AccessRequest;
                    if (data.status === 'pending') {
                        setRequest(data);
                    }
                }
            } catch (error) {
                console.error("Failed to check support requests:", error);
            }
        };

        checkRequest();
        
        // Polling every 30 seconds since we aren't using a full onSnapshot listener for performance
        const interval = setInterval(checkRequest, 30000);
        return () => clearInterval(interval);
    }, [user?.org_id, impersonatingOrgId, user?.site_admin]);

    if (!request || !user?.org_id) return null;

    const handleApprove = async () => {
        try {
            // Expires in 24 hours
            const expiry = new Date();
            expiry.setHours(expiry.getHours() + 24);

            await updateDoc(doc(db, 'support_access_requests', user.org_id), {
                status: 'approved',
                expiresAt: expiry
            });
            setRequest(null);
            toast.success("Support access approved for 24 hours.");
        } catch (error) {
            console.error("Failed to approve:", error);
            toast.error("Failed to approve access request.");
        }
    };

    const handleDeny = async () => {
        try {
            await updateDoc(doc(db, 'support_access_requests', user.org_id), {
                status: 'denied',
                expiresAt: null
            });
            setRequest(null);
            toast.success("Support access denied.");
        } catch (error) {
            console.error("Failed to deny:", error);
        }
    };

    // Only allow dispatchers/admins to approve requests
    if (user.role !== 'dispatcher') return null;

    return (
        <div className="bg-sky-600 text-white w-full py-2.5 px-4 shadow-md flex items-center justify-center z-[90] relative">
            <div className="flex flex-col md:flex-row items-center gap-4 max-w-7xl mx-auto w-full justify-between">
                <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center bg-sky-800 rounded-full p-2">
                        <ShieldAlert className="w-5 h-5 text-sky-200" />
                    </span>
                    <div>
                        <p className="font-bold text-sm tracking-wide">
                            Support Access Request
                        </p>
                        <p className="text-xs text-sky-200">
                            DispatchBox Platform Support ({request.requestedBy || 'Admin'}) has requested temporary access to your account to troubleshoot an issue.
                        </p>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button 
                        onClick={handleApprove}
                        className="bg-white text-sky-700 hover:bg-sky-50 border border-transparent px-4 py-1.5 rounded text-sm font-bold flex items-center gap-1 transition"
                    >
                        <KeyRound className="w-4 h-4" /> Approve (24h)
                    </button>
                    <button 
                        onClick={handleDeny}
                        className="bg-sky-700 hover:bg-sky-800 border border-sky-500 text-white px-4 py-1.5 rounded text-sm font-bold transition"
                    >
                        Deny
                    </button>
                </div>
            </div>
        </div>
    );
};
