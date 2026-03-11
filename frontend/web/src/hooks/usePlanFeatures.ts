import { useAuth } from '../auth/AuthProvider';

export type PlanFeature =
    | 'dispatcher_console'
    | 'team_management'
    | 'advanced_analytics'
    | 'custom_integrations'
    | 'unlimited_techs';

// Feature availability by plan
const PLAN_FEATURES: Record<string, PlanFeature[]> = {
    trial: [
        'dispatcher_console',
        'team_management',
        'advanced_analytics',
        'custom_integrations',
        'unlimited_techs'
    ],
    individual: [
        // Individual plan only gets basic features - no team management
    ],
    small_business: [
        'dispatcher_console',
        'team_management'
    ],
    enterprise: [
        'dispatcher_console',
        'team_management',
        'advanced_analytics',
        'custom_integrations',
        'unlimited_techs'
    ]
};

export const usePlanFeatures = () => {
    const { organization } = useAuth();

    const getTrialEndDate = () => {
        if (!organization || !organization.trialEndsAt) return null;
        // Check if it's a Firestore Timestamp (has toDate method)
        if (typeof (organization.trialEndsAt as any).toDate === 'function') {
            return (organization.trialEndsAt as any).toDate();
        }
        // Otherwise assume it's a Date object
        return new Date(organization.trialEndsAt as any);
    };

    const isTrialExpired = (): boolean => {
        if (!organization || organization.plan !== 'trial') return false;
        const endDate = getTrialEndDate();
        if (!endDate) return false;
        return new Date() > endDate;
    };

    const hasFeature = (feature: PlanFeature): boolean => {
        if (!organization) return false;

        // Block all premium features if trial is expired
        if (isTrialExpired()) {
            return false;
        }

        const planFeatures = PLAN_FEATURES[organization.plan] || [];
        return planFeatures.includes(feature);
    };

    const getDaysUntilTrialExpires = (): number | null => {
        if (!organization || organization.plan !== 'trial') return null;
        const endDate = getTrialEndDate();
        if (!endDate) return null;

        const now = new Date();
        const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return Math.max(0, daysLeft);
    };

    return {
        hasFeature,
        isTrialExpired,
        getDaysUntilTrialExpires,
        plan: organization?.plan || 'individual'
    };
};
