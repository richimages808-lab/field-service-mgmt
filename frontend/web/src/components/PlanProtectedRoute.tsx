import React from 'react';
import { Navigate } from 'react-router-dom';
import { usePlanFeatures, PlanFeature } from '../hooks/usePlanFeatures';
import { AlertCircle } from 'lucide-react';

interface PlanProtectedRouteProps {
    children: React.ReactNode;
    requiredFeature: PlanFeature;
}

export const PlanProtectedRoute: React.FC<PlanProtectedRouteProps> = ({ children, requiredFeature }) => {
    const { hasFeature, plan } = usePlanFeatures();

    if (!hasFeature(requiredFeature)) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-8 h-8 text-yellow-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Feature Not Available</h2>
                    <p className="text-gray-600 mb-6">
                        This feature requires a {requiredFeature === 'dispatcher_console' ? 'Small Business' : 'higher'} plan.
                        You're currently on the <span className="font-semibold capitalize">{plan}</span> plan.
                    </p>
                    <div className="space-y-3">
                        <button
                            onClick={() => window.history.back()}
                            className="w-full bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-indigo-700 transition"
                        >
                            Go Back
                        </button>
                        <button
                            onClick={() => window.location.href = '/'}
                            className="w-full bg-gray-100 text-gray-700 px-6 py-3 rounded-lg font-medium hover:bg-gray-200 transition"
                        >
                            Return to Dashboard
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return <>{children}</>;
};
