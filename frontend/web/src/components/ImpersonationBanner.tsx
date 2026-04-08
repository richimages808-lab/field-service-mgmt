import React, { useEffect } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { AlertTriangle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'react-hot-toast';

export const ImpersonationBanner: React.FC = () => {
    const { impersonatingOrgId, impersonatingOrgName, stopImpersonating, user } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (!impersonatingOrgId || !user?.site_admin) return;

        const verifyAccess = async () => {
            try {
                const docRef = doc(db, 'support_access_requests', impersonatingOrgId);
                const docSnap = await getDoc(docRef);
                
                if (!docSnap.exists()) {
                    handleStopImpersonating("Support access was removed.");
                    return;
                }

                const data = docSnap.data();
                if (data.status !== 'approved') {
                    handleStopImpersonating("Support access was revoked.");
                    return;
                }

                const expires = data.expiresAt?.toDate();
                if (!expires || expires < new Date()) {
                    handleStopImpersonating("Support access has expired.");
                    return;
                }
            } catch (error) {
                console.error("Failed to verify support access:", error);
            }
        };

        verifyAccess();
        const interval = setInterval(verifyAccess, 30000); // Check every 30s
        return () => clearInterval(interval);
    }, [impersonatingOrgId, user]);

    if (!impersonatingOrgId) return null;

    const handleStopImpersonating = (reason?: string) => {
        stopImpersonating();
        
        if (reason) {
            toast.error(reason);
        }
        
        // Prevent users from being stuck on a page that immediately redirects them (like normal tenant dashboard)
        // Send them back to their SaaS list
        navigate('/platform-organizations');
    };

    return (
        <div className="bg-red-600 text-white w-full py-2 px-4 shadow-md flex items-center justify-center z-[100] relative">
            <div className="flex items-center gap-3 max-w-7xl mx-auto w-full justify-between">
                <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center bg-red-800 rounded-full p-1.5 animate-pulse">
                        <AlertTriangle className="w-5 h-5 text-red-200" />
                    </span>
                    <div>
                        <p className="font-bold text-sm tracking-wide">
                            GHOST MODE: You are impersonating <span className="underline decoration-red-400 decoration-2 underline-offset-2">{impersonatingOrgName || 'Tenant'}</span>
                        </p>
                        <p className="text-xs text-red-200">
                            Any changes made will affect their live data.
                        </p>
                    </div>
                </div>

                <button 
                    onClick={() => handleStopImpersonating()}
                    className="bg-red-800 hover:bg-red-900 border border-red-700 text-white px-4 py-1.5 rounded text-sm font-bold flex items-center gap-1 transition"
                >
                    <X className="w-4 h-4" /> Stop Impersonating
                </button>
            </div>
        </div>
    );
};
