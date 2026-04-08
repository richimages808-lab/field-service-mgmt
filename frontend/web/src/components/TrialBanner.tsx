import React from 'react';
import { usePlanFeatures } from '../hooks/usePlanFeatures';
import { useAuth } from '../auth/AuthProvider';
import { AlertCircle, Clock, X } from 'lucide-react';

export const TrialBanner: React.FC = () => {
    const { organization } = useAuth();
    const { getDaysUntilTrialExpires, isTrialExpired } = usePlanFeatures();
    const [isDismissed, setIsDismissed] = React.useState(false);

    // Only show for trial plan
    if (!organization || organization.plan !== 'trial') {
        return null;
    }

    const daysLeft = getDaysUntilTrialExpires();
    const expired = isTrialExpired();

    // Don't show if dismissed or if there's more than 7 days left
    if (isDismissed || (daysLeft !== null && daysLeft > 7 && !expired)) {
        return null;
    }

    const getBannerStyle = () => {
        if (expired) {
            return 'bg-red-50 border-red-200 text-red-800';
        }
        if (daysLeft !== null && daysLeft <= 3) {
            return 'bg-orange-50 border-orange-200 text-orange-800';
        }
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
    };

    const getIcon = () => {
        if (expired) {
            return <AlertCircle className="w-5 h-5 text-red-600" />;
        }
        return <Clock className="w-5 h-5 text-yellow-600" />;
    };

    const getMessage = () => {
        if (expired) {
            return (
                <>
                    <span className="font-bold">Your trial has expired.</span> Upgrade now to continue using all features.
                </>
            );
        }
        if (daysLeft === 0) {
            return (
                <>
                    <span className="font-bold">Last day of your trial!</span> Upgrade today to keep access to all features.
                </>
            );
        }
        if (daysLeft === 1) {
            return (
                <>
                    <span className="font-bold">1 day left</span> in your trial. Upgrade to continue using all features.
                </>
            );
        }
        return (
            <>
                <span className="font-bold">{daysLeft} days left</span> in your trial. Upgrade to unlock full access.
            </>
        );
    };

    return (
        <div className={`border-b ${getBannerStyle()}`}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                        {getIcon()}
                        <p className="text-sm font-medium">
                            {getMessage()}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => {
                                // In a real app, this would navigate to the upgrade/billing page
                                alert('Upgrade functionality would go here - navigate to billing/pricing page');
                            }}
                            className={`px-4 py-2 rounded-lg font-medium text-sm transition ${
                                expired
                                    ? 'bg-red-600 text-white hover:bg-red-700'
                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                            }`}
                        >
                            {expired ? 'Upgrade Now' : 'View Plans'}
                        </button>
                        {!expired && (
                            <button
                                onClick={() => setIsDismissed(true)}
                                className="p-1 rounded hover:bg-yellow-100 transition"
                                aria-label="Dismiss banner"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
