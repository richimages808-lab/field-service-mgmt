import React, { useState, useEffect } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { Link } from 'react-router-dom';
import { ArrowLeft, CreditCard, FileText, Calculator, Landmark, Check, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';

export const AdminIntegrations: React.FC = () => {
    const { user, organization } = useAuth();
    const [taxRate, setTaxRate] = useState(4.712); // Stored as percentage directly (e.g. 4.712%)
    const [stripeEnabled, setStripeEnabled] = useState(false);
    const [loading, setLoading] = useState(true);

    const orgId = organization?.id || user?.org_id;

    useEffect(() => {
        const loadOrgSettings = async () => {
            if (!orgId) {
                setLoading(false);
                return;
            }
            try {
                const orgRef = doc(db, 'organizations', orgId);
                const snap = await getDoc(orgRef);
                if (snap.exists()) {
                    const data = snap.data();
                    if (data.settings?.defaultTaxRate !== undefined) {
                        setTaxRate(data.settings.defaultTaxRate);
                    }
                    setStripeEnabled(data.settings?.stripeEnabled || false);
                }
            } catch (error) {
                console.error("Error loading integrations settings:", error);
            } finally {
                setLoading(false);
            }
        };

        loadOrgSettings();
    }, [orgId]);

    const handleSaveTax = async () => {
        if (!orgId) return;
        try {
            const orgRef = doc(db, 'organizations', orgId);
            await updateDoc(orgRef, {
                'settings.defaultTaxRate': Number(taxRate)
            });
            toast.success('Default tax rate updated successfully');
        } catch (error) {
            console.error("Error saving tax rate:", error);
            toast.error('Failed to save tax rate');
        }
    };

    const handleToggleStripe = async () => {
        if (!orgId) return;
        try {
            const nextState = !stripeEnabled;
            const orgRef = doc(db, 'organizations', orgId);
            await updateDoc(orgRef, {
                'settings.stripeEnabled': nextState
            });
            setStripeEnabled(nextState);
            toast.success(nextState ? 'Stripe payments connected' : 'Stripe payments disconnected');
        } catch (error) {
            console.error("Error toggling Stripe:", error);
            toast.error('Failed to toggle Stripe connection');
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="bg-white rounded-lg p-8 text-center shadow">
                    <Loader2 className="animate-spin rounded-full h-12 w-12 text-blue-600 mx-auto" />
                    <p className="mt-4 text-gray-600">Loading settings...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <header className="mb-8 flex items-center gap-4">
                <Link to="/admin" className="text-gray-500 hover:text-gray-700">
                    <ArrowLeft className="w-6 h-6" />
                </Link>
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Integrations & Finance</h1>
                    <p className="text-gray-600">Manage payments, taxes, and third-party apps.</p>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">


                {/* 2. Payment Gateways */}
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="bg-green-100 p-2 rounded-lg">
                            <CreditCard className="w-6 h-6 text-green-600" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-800">Payment Gateways</h2>
                    </div>

                    <div className="border rounded-lg p-4 mb-4 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-600 rounded flex items-center justify-center text-white font-bold">S</div>
                            <div>
                                <h3 className="font-bold">Stripe Payments</h3>
                                <p className="text-xs text-gray-500">Credit cards & ACH</p>
                            </div>
                        </div>
                        <button
                            onClick={handleToggleStripe}
                            className={`px-3 py-1 rounded-full text-xs font-medium ${stripeEnabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}
                        >
                            {stripeEnabled ? 'Connected' : 'Connect'}
                        </button>
                    </div>

                    <div className="bg-yellow-50 p-3 rounded text-xs text-yellow-800 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 mt-0.5" />
                        <p>Offline payments (Cash/Check) are always enabled.</p>
                    </div>
                </div>

                {/* 3. Accounting */}
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="bg-green-100 p-2 rounded-lg">
                            <Landmark className="w-6 h-6 text-green-600" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-800">Accounting Sync</h2>
                    </div>
                    <p className="text-gray-600 mb-6 text-sm">
                        Automatically sync invoices and payments to your accounting software.
                    </p>

                    <div className="border rounded-lg p-4 mb-4 flex justify-between items-center opacity-75">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-green-700 rounded flex items-center justify-center text-white font-bold">QB</div>
                            <div>
                                <h3 className="font-bold">QuickBooks Online</h3>
                                <p className="text-xs text-gray-500">Sync invoices & customers</p>
                            </div>
                        </div>
                        <button disabled className="px-3 py-1 rounded-full text-xs bg-gray-100 text-gray-400 cursor-not-allowed">
                            Coming Soon
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
