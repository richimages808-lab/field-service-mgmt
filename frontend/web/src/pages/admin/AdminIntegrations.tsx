import React, { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { Link } from 'react-router-dom';
import { ArrowLeft, CreditCard, FileText, Calculator, Landmark, Check, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

export const AdminIntegrations: React.FC = () => {
    const { user } = useAuth();
    // In a real app, these would be loaded from Firestore (org settings)
    const [taxRate, setTaxRate] = useState(0.08);
    const [stripeEnabled, setStripeEnabled] = useState(false);
    const [quickbooksConnected, setQuickbooksConnected] = useState(false);

    const handleSaveTax = () => {
        // TODO: Save to Firestore
        toast.success('Default tax rate updated');
    };

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
                {/* 1. Tax Settings */}
                <div className="bg-white rounded-lg shadow p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="bg-blue-100 p-2 rounded-lg">
                            <Calculator className="w-6 h-6 text-blue-600" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-800">Tax Settings</h2>
                    </div>
                    <p className="text-gray-600 mb-6 text-sm">
                        Set your default tax rate for invoices. Future updates will support automated tax lookups (Avalara/TaxJar).
                    </p>

                    <div className="flex gap-4 items-end">
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Default Tax Rate (%)</label>
                            <input
                                type="number"
                                step="0.01"
                                value={taxRate * 100}
                                onChange={(e) => setTaxRate(Number(e.target.value) / 100)}
                                className="w-full px-3 py-2 border rounded-md"
                            />
                        </div>
                        <button
                            onClick={handleSaveTax}
                            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                        >
                            Save Settings
                        </button>
                    </div>
                </div>

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
                            onClick={() => setStripeEnabled(!stripeEnabled)}
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
