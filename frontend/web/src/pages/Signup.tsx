import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import { Check, Building2, User, Users, Briefcase, ArrowRight, ArrowLeft, Loader2, Phone, Globe, Search, MessageSquare, Mic, Mail } from 'lucide-react';
import { getDefaultInventorySettings } from '../utils/defaultInventoryCategories';
import { SupportChatBot } from '../components/SupportChatBot';

// Independent add-on service definitions
const DOMAIN_TIERS = [
    { id: 'domain_existing', name: 'Bring Your Domain', price: 'Professional Branding', description: 'White-label with a domain you already own', features: ['app.yourbusiness.com portal', 'Branded email sender', 'SSL certificate included', 'DNS setup assistance'] },
    { id: 'domain_new', name: 'Register + White-Label', price: 'Fully Managed Setup', description: 'We register a new domain and configure everything', features: ['Domain registration included', 'Branded portal & email', 'WHOIS privacy protection', 'Auto-renewal management'], recommended: true }
];

const EMAIL_TIERS = [
    { id: 'email_starter', name: 'Email Starter', price: 'Essential Inbox', description: '5 aliases, forwarding to your inbox', features: ['5 custom email aliases', 'Forward to Gmail/Outlook/etc', 'Catch-all option', 'Spam filtering built-in', 'Easy alias management'] },
    { id: 'email_pro', name: 'Email Pro', price: 'Team Collaboration', description: '25 aliases + send-as', features: ['25 custom email aliases', 'Everything in Starter', 'Send-as (reply from your domain)', 'DKIM & DMARC authentication', 'SMTP credentials'], recommended: true },
    { id: 'email_business', name: 'Email Business', price: 'Advanced Operations', description: 'Unlimited aliases + priority support', features: ['Unlimited aliases', 'Everything in Pro', 'Catch-all routing', 'Priority deliverability', 'Dedicated support'] }
];

const SMS_TIERS = [
    { id: 'sms_starter', name: 'Text Starter', price: 'Automate Reminders', description: '500 SMS/month capacity', features: ['Dedicated local number', 'Appointment reminders', 'Two-way texting', 'A2P compliant'], overage: '' },
    { id: 'sms_pro', name: 'Text Pro', price: 'Drive More Reviews', description: '2,000 SMS + MMS capacity', features: ['Everything in Starter', 'Marketing campaigns', 'Auto-review requests', 'Broadcast messaging'], overage: '', recommended: true },
    { id: 'sms_unlimited', name: 'Text Unlimited', price: 'Scale Your Marketing', description: '5,000 SMS + MMS capacity', features: ['Everything in Pro', 'Unlimited scale messaging', 'Advanced analytics', 'Dedicated short codes'], overage: '' }
];

const AI_TIERS = [
    { id: 'ai_basic', name: 'AI Basic', price: 'Miss Zero Calls', description: 'Covers ~30-50 calls/mo', features: ['24/7 AI answering', 'Books appointments', 'Captures lead info', 'Confirmation texts', 'Branded greeting'], overage: '' },
    { id: 'ai_pro', name: 'AI Professional', price: 'Intelligent Front Desk', description: 'Covers ~100-150 calls/mo', features: ['Everything in Basic', 'Emergency routing', 'Pricing & availability Q&A', 'Multi-language support'], overage: '', recommended: true },
    { id: 'ai_enterprise', name: 'AI Enterprise', price: 'Complete Automation', description: 'Covers ~300-500 calls/mo', features: ['Everything in Pro', 'Custom call scripting', 'Call recording & transcripts', 'Dedicated account manager'], overage: '' }
];

// Plan tier definitions
const PLANS = [
    {
        id: 'trial',
        name: 'Free Trial',
        description: '30-day full access trial',
        features: [
            'Test all core software tools',
            'Add up to 5 technicians',
            'No credit card required',
            'Email support & onboarding'
        ],
        icon: Briefcase,
        recommended: false,
        trialDays: 30
    },
    {
        id: 'individual',
        name: 'Individual',
        description: 'For solo technicians',
        features: [
            'Organize customer & job history',
            'Streamline daily scheduling',
            'Automate invoice generation',
            'Accept payments in the field',
            'Email-to-ticket creation'
        ],
        icon: User,
        recommended: false,
        maxTechs: 1
    },
    {
        id: 'small_business',
        name: 'Small Business',
        description: 'For teams of 2-5 technicians',
        features: [
            'Everything in Individual',
            'Coordinate multi-tech schedules',
            'Track team performance metrics',
            'Real-time dispatcher console',
            'Priority support queue'
        ],
        icon: Users,
        recommended: true,
        maxTechs: 5
    },
    {
        id: 'enterprise',
        name: 'Enterprise',
        description: 'For larger organizations',
        features: [
            'Everything in Small Business',
            'Manage unlimited technicians',
            'Automate complex workflows',
            'Custom integrations & API',
            'Dedicated account manager'
        ],
        icon: Building2,
        recommended: false,
        maxTechs: -1 // unlimited
    }
];

export const Signup: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();

    // Multi-step form state
    const [step, setStep] = useState(1); // 1: Plan, 2: Account, 3: Organization, 4: Communication (optional)
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const TOTAL_STEPS = 4;

    // Form data
    const [selectedPlan, setSelectedPlan] = useState('small_business');
    const [formData, setFormData] = useState({
        // Account info
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        // Organization info
        companyName: '',
        emailPrefix: '',
        phone: '',
        businessProfile: 'general',
        // Communication services (Step 4 â€” optional, independent)
        enableDomain: false,
        domainTier: 'domain_existing',
        customDomain: '',
        enableSms: false,
        smsTier: 'sms_starter',
        areaCode: '',
        selectedNumber: '',
        enableAi: false,
        aiTier: 'ai_basic',
        // Business details for A2P (needed if SMS enabled)
        businessType: 'sole_proprietor',
        businessStreet: '',
        businessCity: '',
        businessState: '',
        businessZip: '',
        websiteUrl: '',
        smsConsent: false,
        // Email forwarding (requires domain add-on)
        enableEmail: false,
        emailTier: 'email_starter',
        emailAliases: 'info,support'
    });

    // Email prefix availability
    const [prefixChecking, setPrefixChecking] = useState(false);
    const [prefixAvailable, setPrefixAvailable] = useState<boolean | null>(null);
    const [prefixError, setPrefixError] = useState('');

    // Phone number search
    const [availableNumbers, setAvailableNumbers] = useState<any[]>([]);
    const [numberSearching, setNumberSearching] = useState(false);
    const [provisioningStatus, setProvisioningStatus] = useState('');

    // Redirect if already logged in (but not if we are actively signing up)
    useEffect(() => {
        if (user && !isLoading) {
            navigate('/');
        }
    }, [user, navigate, isLoading]);

    // Check email prefix availability with debounce
    useEffect(() => {
        if (!formData.emailPrefix || formData.emailPrefix.length < 3) {
            setPrefixAvailable(null);
            setPrefixError('');
            return;
        }

        const timer = setTimeout(async () => {
            setPrefixChecking(true);
            try {
                const checkAvailability = httpsCallable(functions, 'checkEmailPrefixAvailability');
                const result = await checkAvailability({ prefix: formData.emailPrefix }) as any;

                if (result.data.available) {
                    setPrefixAvailable(true);
                    setPrefixError('');
                } else {
                    setPrefixAvailable(false);
                    setPrefixError(result.data.error || 'Prefix not available');
                }
            } catch (err) {
                console.error('Error checking prefix:', err);
                setPrefixAvailable(null);
            } finally {
                setPrefixChecking(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [formData.emailPrefix]);

    const handleInputChange = (field: string, value: string | boolean) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setError('');
    };

    // Search for available phone numbers
    const searchPhoneNumbers = async () => {
        if (!formData.areaCode || formData.areaCode.length < 3) {
            setError('Please enter a valid 3-digit area code');
            return;
        }
        setNumberSearching(true);
        setError('');
        try {
            const searchNumbers = httpsCallable(functions, 'searchAvailableNumbers');
            const result = await searchNumbers({ areaCode: formData.areaCode, limit: 5 }) as any;
            setAvailableNumbers(result.data.numbers || []);
            if ((result.data.numbers || []).length === 0) {
                setError('No numbers available for this area code. Try another.');
            }
        } catch (err: any) {
            console.error('Error searching numbers:', err);
            setError('Failed to search phone numbers. Please try again.');
        } finally {
            setNumberSearching(false);
        }
    };

    const validateStep = (stepNum: number): boolean => {
        switch (stepNum) {
            case 1:
                return !!selectedPlan;
            case 2:
                if (!formData.name || !formData.email || !formData.password) {
                    setError('Please fill in all required fields');
                    return false;
                }
                if (formData.password.length < 6) {
                    setError('Password must be at least 6 characters');
                    return false;
                }
                if (formData.password !== formData.confirmPassword) {
                    setError('Passwords do not match');
                    return false;
                }
                return true;
            case 3:
                if (!formData.companyName) {
                    setError('Company name is required');
                    return false;
                }
                if (formData.emailPrefix && !prefixAvailable) {
                    setError('Please choose an available email prefix');
                    return false;
                }
                return true;
            case 4:
                if (formData.enableSms) {
                    if (!formData.selectedNumber) {
                        setError('Please select a phone number');
                        return false;
                    }
                    if (!formData.businessStreet || !formData.businessCity || !formData.businessState || !formData.businessZip) {
                        setError('Please fill in your business address for carrier registration');
                        return false;
                    }
                    if (!formData.smsConsent) {
                        setError('Please accept the SMS consent terms');
                        return false;
                    }
                }
                if (formData.enableDomain && !formData.customDomain) {
                    setError('Please enter your domain name');
                    return false;
                }
                if (formData.enableEmail && !formData.enableDomain) {
                    setError('Business Email requires a Custom Domain. Please enable the domain add-on first.');
                    return false;
                }
                if (formData.enableEmail && !formData.emailAliases.trim()) {
                    setError('Please enter at least one email alias');
                    return false;
                }
                return true;
            default:
                return true;
        }
    };

    const nextStep = () => {
        if (validateStep(step)) {
            setStep(prev => prev + 1);
            setError('');
        }
    };

    const prevStep = () => {
        setStep(prev => prev - 1);
        setError('');
    };

    const handleSubmit = async () => {
        // Validate current step (3 or 4)
        if (!validateStep(step)) return;

        setIsLoading(true);
        setError('');

        try {
            // 1. Create Firebase Auth user
            const userCredential = await createUserWithEmailAndPassword(
                auth,
                formData.email,
                formData.password
            );
            const firebaseUser = userCredential.user;

            // 2. Send email verification
            await sendEmailVerification(firebaseUser);

            // 3. Create user document in Firestore
            await setDoc(doc(db, 'users', firebaseUser.uid), {
                email: formData.email,
                name: formData.name,
                phone: formData.phone || '',
                role: selectedPlan === 'individual' ? 'technician' : 'admin',
                ...(selectedPlan === 'individual' ? { techType: 'solopreneur' } : {}),
                status: 'pending_verification',
                emailVerified: false,
                createdAt: new Date(),
                plan: selectedPlan
            });

            // 4. Register organization
            const orgInventorySettings = getDefaultInventorySettings(formData.businessProfile);
            const registerOrg = httpsCallable(functions, 'registerOrganization');
            const orgResult = await registerOrg({
                name: formData.companyName,
                businessProfile: formData.businessProfile,
                inventorySettings: orgInventorySettings,
                emailPrefix: formData.emailPrefix || null,
                fromName: formData.companyName,
                plan: selectedPlan,
                skipCommsProvisioning: !formData.enableSms && !formData.enableAi,
                businessDetails: formData.enableSms ? {
                    businessType: formData.businessType,
                    street: formData.businessStreet,
                    city: formData.businessCity,
                    state: formData.businessState,
                    zip: formData.businessZip,
                    websiteUrl: formData.websiteUrl || null,
                    contactEmail: formData.email,
                    contactPhone: formData.phone
                } : null,
                customDomain: formData.customDomain || null,
                addons: {
                    domain: formData.enableDomain ? { tier: formData.domainTier, domain: formData.customDomain } : null,
                    sms: formData.enableSms ? { tier: formData.smsTier } : null,
                    ai: formData.enableAi ? { tier: formData.aiTier } : null,
                    email: formData.enableEmail ? { tier: formData.emailTier, aliases: formData.emailAliases } : null
                }
            }) as any;

            // 5. Provision SMS/voice if opted in
            if (formData.enableSms && orgResult.data?.organizationId) {
                setProvisioningStatus('Setting up text communications...');
                try {
                    const provisionComms = httpsCallable(functions, 'provisionCommunicationServices');
                    await provisionComms({
                        orgId: orgResult.data.organizationId,
                        phoneNumber: formData.selectedNumber,
                        planId: formData.smsTier,
                        businessDetails: {
                            businessType: formData.businessType,
                            businessName: formData.companyName,
                            street: formData.businessStreet,
                            city: formData.businessCity,
                            state: formData.businessState,
                            zip: formData.businessZip,
                            websiteUrl: formData.websiteUrl || null,
                            contactEmail: formData.email,
                            contactPhone: formData.phone
                        },
                        customDomain: formData.customDomain || null,
                        skipVapi: !formData.enableAi
                    });
                } catch (commsErr: any) {
                    console.warn('Communication provisioning warning:', commsErr);
                }
            }

            // 6. Register custom domain if opted in
            if (formData.enableDomain && formData.customDomain && orgResult.data?.organizationId) {
                setProvisioningStatus('Configuring your custom domain...');
                try {
                    const domainFn = formData.domainTier === 'domain_new'
                        ? httpsCallable(functions, 'registerDomain')
                        : httpsCallable(functions, 'setupExistingDomain');
                    await domainFn({
                        orgId: orgResult.data.organizationId,
                        domain: formData.customDomain
                    });
                } catch (domainErr: any) {
                    console.warn('Domain registration warning:', domainErr);
                }
            }

            // 7. Set up email forwarding if opted in
            if (formData.enableEmail && formData.enableDomain && formData.customDomain && orgResult.data?.organizationId) {
                setProvisioningStatus('Setting up email forwarding...');
                try {
                    const setupEmail = httpsCallable(functions, 'setupEmailForwarding');
                    await setupEmail({
                        orgId: orgResult.data.organizationId,
                        domain: formData.customDomain,
                        aliases: formData.emailAliases.split(',').map((a: string) => a.trim()).filter(Boolean),
                        forwardTo: formData.email,
                        tier: formData.emailTier
                    });
                } catch (emailErr: any) {
                    console.warn('Email forwarding setup warning:', emailErr);
                }
            }

            // 8. Navigate to success page
            navigate('/signup-success');

        } catch (err: any) {
            console.error('Signup error:', err);
            if (err.code === 'auth/email-already-in-use') {
                setError('An account with this email already exists');
            } else if (err.code === 'auth/weak-password') {
                setError('Password is too weak');
            } else {
                setError(err.message || 'Failed to create account. Please try again.');
            }
        } finally {
            setIsLoading(false);
            setProvisioningStatus('');
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-900 via-amber-900 to-blue-800 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden max-w-5xl w-full">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-amber-600 p-6 text-white">
                    <h1 className="text-3xl font-bold">Get Started with DispatchBox</h1>
                    <p className="text-blue-200 mt-2">Set up your account in just a few minutes</p>

                    {/* Progress Steps */}
                    <div className="flex items-center mt-6 gap-2">
                        {[1, 2, 3, 4].map((num) => (
                            <React.Fragment key={num}>
                                <div className={`flex items-center gap-2 ${step >= num ? 'text-white' : 'text-blue-300'}`}>
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm
                                        ${step > num ? 'bg-green-500' : step === num ? 'bg-white text-blue-600' : 'bg-blue-500/50'}`}>
                                        {step > num ? <Check size={16} /> : num}
                                    </div>
                                    <span className="hidden sm:inline text-sm font-medium">
                                        {num === 1 ? 'Plan' : num === 2 ? 'Account' : num === 3 ? 'Organization' : 'Add-ons'}
                                    </span>
                                </div>
                                {num < 4 && <div className={`flex-1 h-0.5 ${step > num ? 'bg-green-500' : 'bg-blue-500/50'}`} />}
                            </React.Fragment>
                        ))}
                    </div>
                </div>

                <div className="p-6 md:p-8">
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
                            {error}
                        </div>
                    )}

                    {/* Step 1: Choose Plan */}
                    {step === 1 && (
                        <div>
                            <h2 className="text-2xl font-bold text-gray-800 mb-6">Choose your plan</h2>
                            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {PLANS.map((plan) => {
                                    const Icon = plan.icon;
                                    const isSelected = selectedPlan === plan.id;

                                    return (
                                        <div
                                            key={plan.id}
                                            onClick={() => setSelectedPlan(plan.id)}
                                            className={`relative rounded-xl p-5 cursor-pointer transition-all border-2
                                                ${isSelected
                                                    ? 'border-blue-600 bg-blue-50 shadow-lg'
                                                    : 'border-gray-200 hover:border-blue-300 hover:shadow'}`}
                                        >
                                            {plan.recommended && (
                                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs px-3 py-1 rounded-full font-medium">
                                                    Recommended
                                                </div>
                                            )}

                                            <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4
                                                ${isSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                                                <Icon size={24} />
                                            </div>

                                            <h3 className="font-bold text-lg text-gray-900">{plan.name}</h3>
                                            <p className="text-sm text-gray-500 mb-4">{plan.description}</p>

                                            <ul className="space-y-2">
                                                {plan.features.map((feature, idx) => (
                                                    <li key={idx} className="flex items-start gap-2 text-sm text-gray-600">
                                                        <Check size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
                                                        {feature}
                                                    </li>
                                                ))}
                                            </ul>

                                            {isSelected && (
                                                <div className="absolute top-3 right-3">
                                                    <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                                                        <Check size={14} className="text-white" />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Step 2: Account Info */}
                    {step === 2 && (
                        <div className="max-w-md mx-auto">
                            <h2 className="text-2xl font-bold text-gray-800 mb-6">Create your account</h2>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => handleInputChange('name', e.target.value)}
                                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="John Smith"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Email Address *</label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => handleInputChange('email', e.target.value)}
                                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="john@example.com"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                                    <input
                                        type="tel"
                                        value={formData.phone}
                                        onChange={(e) => handleInputChange('phone', e.target.value)}
                                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="(555) 123-4567"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                                    <input
                                        type="password"
                                        value={formData.password}
                                        onChange={(e) => handleInputChange('password', e.target.value)}
                                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="At least 6 characters"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password *</label>
                                    <input
                                        type="password"
                                        value={formData.confirmPassword}
                                        onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="Confirm your password"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Organization Info */}
                    {step === 3 && (
                        <div className="max-w-md mx-auto">
                            <h2 className="text-2xl font-bold text-gray-800 mb-2">
                                {selectedPlan === 'individual' ? 'Your Business Info' : 'Organization Details'}
                            </h2>
                            <p className="text-gray-500 mb-6">
                                {selectedPlan === 'individual'
                                    ? 'Set up your business profile for invoicing and customer communication.'
                                    : 'Configure your organization for team collaboration.'}
                            </p>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        {selectedPlan === 'individual' ? 'Business Name *' : 'Company Name *'}
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.companyName}
                                        onChange={(e) => handleInputChange('companyName', e.target.value)}
                                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        placeholder="ACME HVAC Services"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Industry / Business Type *
                                    </label>
                                    <select
                                        value={formData.businessProfile}
                                        onChange={(e) => handleInputChange('businessProfile', e.target.value)}
                                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    >
                                        <option value="general">General / Other</option>
                                        <option value="hvac">HVAC</option>
                                        <option value="electrical">Electrical</option>
                                        <option value="plumbing">Plumbing</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Service Email Prefix
                                        <span className="text-gray-400 font-normal ml-1">(optional)</span>
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <div className="relative flex-1">
                                            <input
                                                type="text"
                                                value={formData.emailPrefix}
                                                onChange={(e) => handleInputChange('emailPrefix', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                                className={`w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-blue-500 focus:border-transparent
                                                    ${prefixAvailable === true ? 'border-green-400' : prefixAvailable === false ? 'border-red-400' : 'border-gray-300'}`}
                                                placeholder="acme-hvac"
                                            />
                                            {prefixChecking && (
                                                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 animate-spin" />
                                            )}
                                            {!prefixChecking && prefixAvailable === true && (
                                                <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
                                            )}
                                        </div>
                                        <span className="text-gray-500 text-sm whitespace-nowrap">@service.dispatch-box.com</span>
                                    </div>
                                    {prefixError && (
                                        <p className="text-red-500 text-sm mt-1">{prefixError}</p>
                                    )}
                                    {prefixAvailable && formData.emailPrefix && (
                                        <p className="text-green-600 text-sm mt-1">
                                            âœ“ Your customers can email: {formData.emailPrefix}@service.dispatch-box.com
                                        </p>
                                    )}
                                    <p className="text-gray-400 text-xs mt-2">
                                        Customers can email this address to automatically create support tickets.
                                    </p>
                                </div>
                            </div>

                            {/* Summary */}
                            <div className="mt-8 p-4 bg-gray-50 rounded-lg">
                                <h3 className="font-medium text-gray-900 mb-3">Account Summary</h3>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Plan</span>
                                        <span className="font-medium">{PLANS.find(p => p.id === selectedPlan)?.name}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Account</span>
                                        <span className="font-medium">{formData.email}</span>
                                    </div>
                                    {formData.emailPrefix && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Service Email</span>
                                            <span className="font-medium text-blue-600">
                                                {formData.emailPrefix}@service.dispatch-box.com
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step 4: Power Up Your Business (Optional Add-ons) */}
                    {step === 4 && (
                        <div className="max-w-3xl mx-auto">
                            <div className="flex items-center justify-between mb-2">
                                <h2 className="text-2xl font-bold text-gray-800">Select Advanced Capabilities</h2>
                            </div>
                            <p className="text-gray-500 mb-6">Empower your operations with enterprise-grade tools. Select the capabilities that best fit your business workflows. You can configure these later from your dashboard.</p>

                            {/* CARD 1: Custom Domain */}
                            <div className={`rounded-xl border-2 mb-4 transition-all ${formData.enableDomain ? 'border-blue-500 bg-blue-50/30' : 'border-gray-200'}`}>
                                <div className="p-5"><label className="flex items-center justify-between cursor-pointer">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${formData.enableDomain ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}><Globe size={20} /></div>
                                        <div><h3 className="font-bold text-gray-900">ðŸŒ Use Your Own Domain</h3><p className="text-sm text-gray-500">from $4.99/mo â€” <i>e.g. app.billsplumbing.com</i></p></div>
                                    </div>
                                    <div className="relative"><input type="checkbox" checked={formData.enableDomain} onChange={(e) => handleInputChange('enableDomain', e.target.checked)} className="sr-only" /><div className={`w-12 h-6 rounded-full transition-colors ${formData.enableDomain ? 'bg-blue-600' : 'bg-gray-300'}`}><div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${formData.enableDomain ? 'translate-x-6' : ''}`} /></div></div>
                                </label></div>
                                {formData.enableDomain && (<div className="px-5 pb-5 space-y-3">
                                    <div className="bg-white rounded-lg p-3 border border-blue-100"><p className="text-xs text-gray-500">ðŸ’¡ <b>Bill's Plumbing</b> runs at <code className="text-blue-600">app.billsplumbing.com</code> â€” fully branded experience</p></div>
                                    <div className="grid grid-cols-2 gap-3">{DOMAIN_TIERS.map(t => (<div key={t.id} onClick={() => handleInputChange('domainTier', t.id)} className={`rounded-lg p-3 border-2 cursor-pointer transition-all ${formData.domainTier === t.id ? 'border-blue-600 bg-white shadow' : 'border-gray-200 hover:border-blue-300'}`}>{'recommended' in t && t.recommended && <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">Recommended</span>}<p className="font-bold text-gray-900 mt-1">{t.name}</p><p className="text-blue-600 font-bold">{t.price}</p><p className="text-xs text-gray-500 mb-2">{t.description}</p><ul className="space-y-1">{t.features.map((f, i) => <li key={i} className="text-xs text-gray-600 flex items-start gap-1"><Check size={10} className="text-green-500 mt-0.5 flex-shrink-0" />{f}</li>)}</ul></div>))}</div>
                                    <input type="text" value={formData.customDomain} onChange={(e) => handleInputChange('customDomain', e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, ''))} className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500" placeholder={formData.domainTier === 'domain_new' ? 'Search for a domain (e.g. billsplumbing.com)' : 'Enter your existing domain'} />
                                </div>)}
                            </div>

                            {/* CARD 2: Business Email (requires domain) */}
                            <div className={`rounded-xl border-2 mb-4 transition-all ${formData.enableEmail ? 'border-teal-500 bg-teal-50/30' : formData.enableDomain ? 'border-gray-200' : 'border-gray-100 opacity-50'}`}>
                                <div className="p-5"><label className={`flex items-center justify-between ${formData.enableDomain ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${formData.enableEmail ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-500'}`}><Mail size={20} /></div>
                                        <div><h3 className="font-bold text-gray-900">📧 Business Operations Email</h3><p className="text-sm text-gray-500">Provide direct support routing through your custom domain</p>{!formData.enableDomain && <p className="text-xs text-amber-600 mt-0.5">⚠ Enable Custom Brand Identity first</p>}</div>
                                    </div>
                                    <div className="relative"><input type="checkbox" checked={formData.enableEmail} onChange={(e) => { if (formData.enableDomain) handleInputChange('enableEmail', e.target.checked); }} className="sr-only" disabled={!formData.enableDomain} /><div className={`w-12 h-6 rounded-full transition-colors ${formData.enableEmail ? 'bg-teal-600' : 'bg-gray-300'}`}><div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${formData.enableEmail ? 'translate-x-6' : ''}`} /></div></div>
                                </label></div>
                                {formData.enableEmail && (<div className="px-5 pb-5 space-y-3">
                                    <div className="bg-white rounded-lg p-3 border border-teal-100"><p className="text-xs text-gray-500">💡 <b>Bill's Plumbing</b> gets <code className="text-teal-600">info@billsplumbing.com</code> and <code className="text-teal-600">support@billsplumbing.com</code> — all forwarded to their existing inbox. Professional email, zero hassle.</p></div>
                                    <div className="grid grid-cols-3 gap-3">{EMAIL_TIERS.map(t => (<div key={t.id} onClick={() => handleInputChange('emailTier', t.id)} className={`rounded-lg p-3 border-2 cursor-pointer transition-all ${formData.emailTier === t.id ? 'border-teal-600 bg-white shadow' : 'border-gray-200 hover:border-teal-300'}`}>{'recommended' in t && t.recommended && <span className="text-xs bg-teal-600 text-white px-2 py-0.5 rounded-full">Popular</span>}<p className="font-bold text-gray-900 mt-1">{t.name}</p><p className="text-teal-600 font-bold">{t.price}</p><p className="text-xs text-gray-500 mb-1">{t.description}</p><ul className="space-y-0.5">{t.features.map((f, i) => <li key={i} className="text-xs text-gray-600 flex items-start gap-1"><Check size={10} className="text-green-500 mt-0.5 flex-shrink-0" />{f}</li>)}</ul></div>))}</div>
                                    <div><h4 className="font-semibold text-gray-800 mb-1 text-sm flex items-center gap-2"><Mail size={14} /> Email Aliases</h4><p className="text-xs text-gray-500 mb-2">Comma-separated list of aliases (forwarded to {formData.email || 'your account email'})</p>
                                        <input type="text" value={formData.emailAliases} onChange={(e) => handleInputChange('emailAliases', e.target.value.toLowerCase().replace(/[^a-z0-9,._-]/g, ''))} className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-teal-500 text-sm" placeholder="info, support, hello" />
                                        {formData.customDomain && formData.emailAliases && <div className="mt-2 flex flex-wrap gap-1">{formData.emailAliases.split(',').filter(Boolean).map((alias: string, i: number) => <span key={i} className="inline-flex items-center gap-1 text-xs bg-teal-50 text-teal-700 px-2 py-1 rounded-full border border-teal-200"><Mail size={10} />{alias.trim()}@{formData.customDomain}</span>)}</div>}
                                    </div>
                                </div>)}
                            </div>

                            {/* CARD 3: Text Communications */}
                            <div className={`rounded-xl border-2 mb-4 transition-all ${formData.enableSms ? 'border-emerald-500 bg-emerald-50/30' : 'border-gray-200'}`}>
                                <div className="p-5"><label className="flex items-center justify-between cursor-pointer">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${formData.enableSms ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-500'}`}><MessageSquare size={20} /></div>
                                        <div><h3 className="font-bold text-gray-900">ðŸ’¬ Real-Time Texting Portal</h3><p className="text-sm text-gray-500">Drive engagement with automated reminders and two-way SMS</p></div>
                                    </div>
                                    <div className="relative"><input type="checkbox" checked={formData.enableSms} onChange={(e) => handleInputChange('enableSms', e.target.checked)} className="sr-only" /><div className={`w-12 h-6 rounded-full transition-colors ${formData.enableSms ? 'bg-emerald-600' : 'bg-gray-300'}`}><div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${formData.enableSms ? 'translate-x-6' : ''}`} /></div></div>
                                </label></div>
                                {formData.enableSms && (<div className="px-5 pb-5 space-y-4">
                                    <div className="grid grid-cols-3 gap-3">{SMS_TIERS.map(t => (<div key={t.id} onClick={() => handleInputChange('smsTier', t.id)} className={`rounded-lg p-3 border-2 cursor-pointer transition-all ${formData.smsTier === t.id ? 'border-emerald-600 bg-white shadow' : 'border-gray-200 hover:border-emerald-300'}`}>{'recommended' in t && t.recommended && <span className="text-xs bg-emerald-600 text-white px-2 py-0.5 rounded-full">Popular</span>}<p className="font-bold text-gray-900 mt-1">{t.name}</p><p className="text-emerald-600 font-bold">{t.price}</p><p className="text-xs text-gray-500 mb-1">{t.description}</p><ul className="space-y-0.5">{t.features.map((f, i) => <li key={i} className="text-xs text-gray-600 flex items-start gap-1"><Check size={10} className="text-green-500 mt-0.5 flex-shrink-0" />{f}</li>)}</ul><p className="text-xs text-gray-400 mt-1">Overage: {t.overage}</p></div>))}</div>
                                    <div><h4 className="font-semibold text-gray-800 mb-2 text-sm flex items-center gap-2"><Phone size={14} /> Select Your Number</h4>
                                        <div className="flex gap-2 mb-2"><input type="text" value={formData.areaCode} onChange={(e) => handleInputChange('areaCode', e.target.value.replace(/\D/g, '').slice(0, 3))} className="w-28 px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-emerald-500 text-sm" placeholder="Area code" maxLength={3} /><button type="button" onClick={searchPhoneNumbers} disabled={numberSearching || formData.areaCode.length < 3} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1">{numberSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Search</button></div>
                                        {availableNumbers.length > 0 && (<div className="grid grid-cols-2 gap-2">{availableNumbers.map((num: any) => (<div key={num.phoneNumber} onClick={() => handleInputChange('selectedNumber', num.phoneNumber)} className={`p-2 rounded-lg border-2 cursor-pointer flex items-center gap-2 text-sm ${formData.selectedNumber === num.phoneNumber ? 'border-emerald-600 bg-emerald-50' : 'border-gray-200 hover:border-emerald-300'}`}><Phone size={14} className={formData.selectedNumber === num.phoneNumber ? 'text-emerald-600' : 'text-gray-400'} /><span className="font-mono font-bold text-gray-900">{num.friendlyName || num.phoneNumber}</span>{formData.selectedNumber === num.phoneNumber && <Check size={14} className="text-emerald-600 ml-auto" />}</div>))}</div>)}
                                    </div>
                                    <div><h4 className="font-semibold text-gray-800 mb-1 text-sm flex items-center gap-2"><Building2 size={14} /> Business Address</h4><p className="text-xs text-gray-500 mb-2">Required by carriers for SMS approval</p>
                                        <div className="space-y-2"><select value={formData.businessType} onChange={(e) => handleInputChange('businessType', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"><option value="sole_proprietor">Sole Proprietor</option><option value="llc">LLC</option><option value="corporation">Corporation</option><option value="partnership">Partnership</option><option value="nonprofit">Nonprofit</option></select><input type="text" value={formData.businessStreet} onChange={(e) => handleInputChange('businessStreet', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" placeholder="Street Address *" /><div className="grid grid-cols-3 gap-2"><input type="text" value={formData.businessCity} onChange={(e) => handleInputChange('businessCity', e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 text-sm" placeholder="City *" /><input type="text" value={formData.businessState} onChange={(e) => handleInputChange('businessState', e.target.value.toUpperCase().slice(0, 2))} className="px-3 py-2 rounded-lg border border-gray-300 text-sm" placeholder="State *" maxLength={2} /><input type="text" value={formData.businessZip} onChange={(e) => handleInputChange('businessZip', e.target.value.replace(/\D/g, '').slice(0, 5))} className="px-3 py-2 rounded-lg border border-gray-300 text-sm" placeholder="ZIP *" maxLength={5} /></div><input type="url" value={formData.websiteUrl} onChange={(e) => handleInputChange('websiteUrl', e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" placeholder="Website URL (optional)" /></div>
                                    </div>
                                    <label className="flex items-start gap-2 bg-gray-50 rounded-lg p-3 cursor-pointer"><input type="checkbox" checked={formData.smsConsent} onChange={(e) => handleInputChange('smsConsent', e.target.checked)} className="mt-0.5 w-4 h-4 text-emerald-600 border-gray-300 rounded" /><span className="text-xs text-gray-600">I agree to the <a href="#" className="text-emerald-600 underline">Terms of Service</a> and consent to sending SMS messages to customers.</span></label>
                                </div>)}
                            </div>

                            {/* CARD 4: AI Phone Receptionist */}
                            <div className={`rounded-xl border-2 mb-4 transition-all ${formData.enableAi ? 'border-amber-500 bg-amber-50/30' : 'border-gray-200'}`}>
                                <div className="p-5"><label className="flex items-center justify-between cursor-pointer">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${formData.enableAi ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-500'}`}><Mic size={20} /></div>
                                        <div><h3 className="font-bold text-gray-900">ðŸ¤– AI Predictive Desk</h3><p className="text-sm text-gray-500">Intelligently capture leads and route emergencies with AI</p></div>
                                    </div>
                                    <div className="relative"><input type="checkbox" checked={formData.enableAi} onChange={(e) => handleInputChange('enableAi', e.target.checked)} className="sr-only" /><div className={`w-12 h-6 rounded-full transition-colors ${formData.enableAi ? 'bg-amber-600' : 'bg-gray-300'}`}><div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${formData.enableAi ? 'translate-x-6' : ''}`} /></div></div>
                                </label></div>
                                {formData.enableAi && (<div className="px-5 pb-5 space-y-4">
                                    <div className="bg-white rounded-lg p-3 border border-amber-100"><p className="text-xs text-gray-500">ðŸ’¡ <b>Jones Security Services</b> used to miss 60% of after-hours calls. Now AI answers every call, books appointments, and routes emergencies â€” capturing an estimated <b>$3,000-$5,000/mo in leads</b>.</p></div>
                                    <div className="grid grid-cols-3 gap-3">{AI_TIERS.map(t => (<div key={t.id} onClick={() => handleInputChange('aiTier', t.id)} className={`rounded-lg p-3 border-2 cursor-pointer transition-all ${formData.aiTier === t.id ? 'border-amber-600 bg-white shadow' : 'border-gray-200 hover:border-amber-300'}`}>{'recommended' in t && t.recommended && <span className="text-xs bg-amber-600 text-white px-2 py-0.5 rounded-full">Best Value</span>}<p className="font-bold text-gray-900 mt-1">{t.name}</p><p className="text-amber-600 font-bold">{t.price}</p><p className="text-xs text-gray-500 mb-1">{t.description}</p><ul className="space-y-0.5">{t.features.map((f, i) => <li key={i} className="text-xs text-gray-600 flex items-start gap-1"><Check size={10} className="text-green-500 mt-0.5 flex-shrink-0" />{f}</li>)}</ul><p className="text-xs text-gray-400 mt-1">Overage: {t.overage}</p></div>))}</div>
                                    <div className="bg-amber-50 rounded-lg p-3"><h4 className="text-sm font-semibold text-amber-900 mb-1">What your AI Receptionist does:</h4><div className="grid grid-cols-2 gap-1 text-xs text-amber-800"><span>âœ“ Answers calls 24/7/365</span><span>âœ“ Books appointments</span><span>âœ“ Handles emergencies</span><span>âœ“ Captures lead info</span><span>âœ“ Sends confirmation texts</span><span>âœ“ Transfers to a human</span></div></div>
                                </div>)}
                            </div>

                            {/* Summary */}
                            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                                <h3 className="font-medium text-gray-900 mb-3">Account Summary</h3>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between"><span className="text-gray-500">Plan</span><span className="font-medium">{PLANS.find(p => p.id === selectedPlan)?.name}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-500">Organization</span><span className="font-medium">{formData.companyName}</span></div>
                                    {formData.enableDomain && <div className="flex justify-between"><span className="text-gray-500">Brand Identity</span><span className="font-medium text-blue-600">{formData.customDomain || '(not set)'} — {DOMAIN_TIERS.find(t => t.id === formData.domainTier)?.name}</span></div>}
                                    {formData.enableEmail && <div className="flex justify-between"><span className="text-gray-500">Email Operations</span><span className="font-medium text-teal-600">{EMAIL_TIERS.find(t => t.id === formData.emailTier)?.name}</span></div>}
                                    {formData.enableSms && <><div className="flex justify-between"><span className="text-gray-500">Texting Portal</span><span className="font-medium text-emerald-600">{SMS_TIERS.find(t => t.id === formData.smsTier)?.name}</span></div>{formData.selectedNumber && <div className="flex justify-between"><span className="text-gray-500">Phone</span><span className="font-mono font-medium">{formData.selectedNumber}</span></div>}</>}
                                    {formData.enableAi && <div className="flex justify-between"><span className="text-gray-500">Predictive Desk</span><span className="font-medium text-amber-600">{AI_TIERS.find(t => t.id === formData.aiTier)?.name}</span></div>}
                                    {!formData.enableDomain && !formData.enableEmail && !formData.enableSms && !formData.enableAi && <p className="text-gray-400 italic text-xs">No advanced capabilities selected. You can enable them anytime from your dashboard.</p>}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Navigation Buttons */}
                    <div className="flex justify-between mt-8 pt-6 border-t">
                        <div>
                            {step > 1 && (
                                <button
                                    type="button"
                                    onClick={prevStep}
                                    className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800"
                                >
                                    <ArrowLeft size={18} />
                                    Back
                                </button>
                            )}
                        </div>

                        <div className="flex items-center gap-4">
                            <Link to="/login" className="text-sm text-gray-500 hover:text-gray-700">
                                Already have an account? Sign in
                            </Link>

                            {step < TOTAL_STEPS ? (
                                <button
                                    type="button"
                                    onClick={nextStep}
                                    className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition"
                                >
                                    {step === 3 ? 'Continue' : 'Next'}
                                    <ArrowRight size={18} />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleSubmit}
                                    disabled={isLoading}
                                    className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 size={18} className="animate-spin" />
                                            {provisioningStatus || 'Creating Account...'}
                                        </>
                                    ) : (
                                        <>
                                            Create Account
                                            <ArrowRight size={18} />
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            <SupportChatBot />
        </div>
    );
};

