import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { usePlanFeatures } from '../hooks/usePlanFeatures';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
    Building2,
    Mail,
    Palette,
    CreditCard,
    Save,
    CheckCircle,
    AlertCircle,
    Loader2,
    Crown,
    Users,
    DollarSign
} from 'lucide-react';

interface OrgSettings {
    name: string;
    emailPrefix: string;
    autoReplyEnabled: boolean;
    autoReplyTemplate: string;
    fromName: string;
    primaryColor: string;
    logoUrl: string;
    defaultTaxRate: number;
}

export const OrganizationSettings: React.FC = () => {
    const { user, organization } = useAuth();
    const { plan, getDaysUntilTrialExpires } = usePlanFeatures();
    const [settings, setSettings] = useState<OrgSettings>({
        name: '',
        emailPrefix: '',
        autoReplyEnabled: false,
        autoReplyTemplate: '',
        fromName: '',
        primaryColor: '#6366f1',
        logoUrl: '',
        defaultTaxRate: 4.712
    });
    const [activeTab, setActiveTab] = useState<'profile' | 'email' | 'branding' | 'billing' | 'financial'>('profile');
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (organization) {
            // Load existing organization settings
            setSettings({
                name: organization.name || '',
                emailPrefix: '',
                autoReplyEnabled: false,
                autoReplyTemplate: 'Thank you for contacting us! We have received your message and will respond shortly.',
                fromName: organization.name || '',
                primaryColor: '#6366f1',
                logoUrl: '',
                defaultTaxRate: (organization as any).settings?.defaultTaxRate || 4.712
            });
        }
    }, [organization]);

    const handleInputChange = (field: keyof OrgSettings, value: string | boolean | number) => {
        setSettings(prev => ({ ...prev, [field]: value }));
        setSaveSuccess(false);
    };

    const handleSave = async () => {
        if (!organization) return;

        setIsSaving(true);
        setError('');

        try {
            const orgRef = doc(db, 'organizations', organization.id);
            await updateDoc(orgRef, {
                name: settings.name,
                'inboundEmail.autoReplyEnabled': settings.autoReplyEnabled,
                'inboundEmail.autoReplyTemplate': settings.autoReplyTemplate,
                'outboundEmail.fromName': settings.fromName,
                'branding.primaryColor': settings.primaryColor,
                'branding.logoUrl': settings.logoUrl,
                'settings.defaultTaxRate': settings.defaultTaxRate,
                updatedAt: new Date()
            });

            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
        } catch (err: any) {
            console.error('Error saving settings:', err);
            setError(err.message || 'Failed to save settings');
        } finally {
            setIsSaving(false);
        }
    };

    const getPlanBadge = () => {
        const colors = {
            trial: 'bg-purple-100 text-purple-800',
            individual: 'bg-blue-100 text-blue-800',
            small_business: 'bg-green-100 text-green-800',
            enterprise: 'bg-yellow-100 text-yellow-800'
        };

        return (
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${colors[plan] || colors.individual}`}>
                {plan === 'enterprise' && <Crown className="w-4 h-4 mr-1" />}
                {plan.replace('_', ' ').toUpperCase()}
            </span>
        );
    };

    const tabs = [
        { id: 'profile' as const, label: 'Profile', icon: Building2 },
        { id: 'email' as const, label: 'Email Settings', icon: Mail },
        { id: 'branding' as const, label: 'Branding', icon: Palette },
        { id: 'financial' as const, label: 'Financial', icon: DollarSign },
        { id: 'billing' as const, label: 'Plan & Billing', icon: CreditCard }
    ];

    return (
        <div className="max-w-6xl mx-auto">
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-gray-900">Organization Settings</h1>
                <p className="text-gray-500 mt-1">Manage your organization profile and preferences</p>
            </div>

            {/* Tab Navigation */}
            <div className="bg-white rounded-lg shadow-sm mb-6">
                <div className="border-b border-gray-200">
                    <nav className="flex space-x-8 px-6" aria-label="Tabs">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === tab.id
                                        ? 'border-indigo-500 text-indigo-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                        }`}
                                >
                                    <Icon className="w-5 h-5" />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </nav>
                </div>

                <div className="p-6">
                    {/* Profile Tab */}
                    {activeTab === 'profile' && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900 mb-4">Organization Profile</h2>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Organization Name *
                                        </label>
                                        <input
                                            type="text"
                                            value={settings.name}
                                            onChange={(e) => handleInputChange('name', e.target.value)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                            placeholder="ACME HVAC Services"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Organization ID
                                        </label>
                                        <input
                                            type="text"
                                            value={organization?.id || ''}
                                            disabled
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
                                        />
                                        <p className="text-xs text-gray-400 mt-1">This is your unique organization identifier</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Current Plan
                                        </label>
                                        <div className="flex items-center gap-3">
                                            {getPlanBadge()}
                                            {plan === 'trial' && (
                                                <span className="text-sm text-gray-600">
                                                    {getDaysUntilTrialExpires()} days remaining
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Email Settings Tab */}
                    {activeTab === 'email' && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900 mb-4">Email Configuration</h2>

                                <div className="space-y-4">
                                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                        <div className="flex items-start gap-3">
                                            <Mail className="w-5 h-5 text-blue-600 mt-0.5" />
                                            <div>
                                                <h3 className="font-medium text-blue-900">Service Email Address</h3>
                                                <p className="text-sm text-blue-700 mt-1">
                                                    {settings.emailPrefix ? (
                                                        <>Your service email: <span className="font-mono font-semibold">{settings.emailPrefix}@service.dispatch-box.com</span></>
                                                    ) : (
                                                        'No email prefix configured. Contact support to set up your service email.'
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            From Name (Outbound Emails)
                                        </label>
                                        <input
                                            type="text"
                                            value={settings.fromName}
                                            onChange={(e) => handleInputChange('fromName', e.target.value)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                            placeholder="ACME HVAC Support"
                                        />
                                        <p className="text-xs text-gray-400 mt-1">This name will appear in emails sent to customers</p>
                                    </div>

                                    <div className="border-t pt-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <div>
                                                <label className="text-sm font-medium text-gray-700">
                                                    Auto-Reply
                                                </label>
                                                <p className="text-xs text-gray-500">Send automatic confirmation when customers email you</p>
                                            </div>
                                            <button
                                                onClick={() => handleInputChange('autoReplyEnabled', !settings.autoReplyEnabled)}
                                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.autoReplyEnabled ? 'bg-indigo-600' : 'bg-gray-200'
                                                    }`}
                                            >
                                                <span
                                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.autoReplyEnabled ? 'translate-x-6' : 'translate-x-1'
                                                        }`}
                                                />
                                            </button>
                                        </div>

                                        {settings.autoReplyEnabled && (
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                                    Auto-Reply Template
                                                </label>
                                                <textarea
                                                    value={settings.autoReplyTemplate}
                                                    onChange={(e) => handleInputChange('autoReplyTemplate', e.target.value)}
                                                    rows={4}
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                                    placeholder="Thank you for contacting us..."
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Branding Tab */}
                    {activeTab === 'branding' && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900 mb-4">Brand Customization</h2>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Logo URL
                                        </label>
                                        <input
                                            type="text"
                                            value={settings.logoUrl}
                                            onChange={(e) => handleInputChange('logoUrl', e.target.value)}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                            placeholder="https://example.com/logo.png"
                                        />
                                        {settings.logoUrl && (
                                            <div className="mt-3 p-4 border border-gray-200 rounded-lg bg-gray-50">
                                                <p className="text-xs text-gray-500 mb-2">Logo Preview:</p>
                                                <img src={settings.logoUrl} alt="Logo preview" className="h-16 object-contain" onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                }} />
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Primary Color
                                        </label>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="color"
                                                value={settings.primaryColor}
                                                onChange={(e) => handleInputChange('primaryColor', e.target.value)}
                                                className="h-10 w-20 border border-gray-300 rounded cursor-pointer"
                                            />
                                            <input
                                                type="text"
                                                value={settings.primaryColor}
                                                onChange={(e) => handleInputChange('primaryColor', e.target.value)}
                                                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono"
                                                placeholder="#6366f1"
                                            />
                                        </div>
                                        <p className="text-xs text-gray-400 mt-1">Used for buttons, links, and accents in customer-facing pages</p>
                                    </div>

                                    <div className="mt-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
                                        <h3 className="text-sm font-medium text-gray-900 mb-3">Preview</h3>
                                        <div className="space-y-2">
                                            <button
                                                style={{ backgroundColor: settings.primaryColor }}
                                                className="px-4 py-2 rounded-lg text-white font-medium"
                                            >
                                                Sample Button
                                            </button>
                                            <p className="text-sm text-gray-600">
                                                This is how your primary color will appear in the customer portal
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Financial Settings Tab */}
                    {activeTab === 'financial' && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900 mb-4">Financial Settings</h2>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Default Tax Rate (%)
                                        </label>
                                        <div className="relative max-w-xs">
                                            <input
                                                type="number"
                                                value={settings.defaultTaxRate}
                                                onChange={(e) => handleInputChange('defaultTaxRate', parseFloat(e.target.value) || 0)}
                                                step="0.001"
                                                min="0"
                                                max="100"
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                                            />
                                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                                <span className="text-gray-500">%</span>
                                            </div>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">This rate will be applied to new quotes and invoices by default.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Billing Tab */}
                    {activeTab === 'billing' && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900 mb-4">Plan & Billing</h2>

                                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg p-6 mb-6">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <h3 className="text-xl font-bold text-gray-900">Current Plan</h3>
                                            <div className="flex items-center gap-3 mt-2">
                                                {getPlanBadge()}
                                                {organization?.maxTechs && (
                                                    <span className="text-sm text-gray-600 flex items-center gap-1">
                                                        <Users className="w-4 h-4" />
                                                        Up to {organization.maxTechs} technicians
                                                    </span>
                                                )}
                                            </div>
                                            {plan === 'trial' && (
                                                <p className="text-sm text-gray-600 mt-2">
                                                    Trial expires in {getDaysUntilTrialExpires()} days
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid md:grid-cols-2 gap-4">
                                    {/* Individual Plan Card */}
                                    <div className={`border-2 rounded-lg p-5 ${plan === 'individual' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}>
                                        <h3 className="font-bold text-lg">Individual</h3>
                                        <p className="text-sm text-gray-600 mt-1">For solo technicians</p>
                                        <ul className="mt-4 space-y-2 text-sm">
                                            <li className="flex items-start gap-2">
                                                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                                                Ticket management
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                                                Customer database
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                                                Invoicing
                                            </li>
                                        </ul>
                                        {plan !== 'individual' && (
                                            <button className="mt-4 w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                                                Downgrade
                                            </button>
                                        )}
                                    </div>

                                    {/* Small Business Card */}
                                    <div className={`border-2 rounded-lg p-5 ${plan === 'small_business' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-bold text-lg">Small Business</h3>
                                            <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs font-semibold rounded">POPULAR</span>
                                        </div>
                                        <p className="text-sm text-gray-600 mt-1">For teams of 2-5</p>
                                        <ul className="mt-4 space-y-2 text-sm">
                                            <li className="flex items-start gap-2">
                                                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                                                Everything in Individual
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                                                Team management
                                            </li>
                                            <li className="flex items-start gap-2">
                                                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                                                Dispatcher console
                                            </li>
                                        </ul>
                                        {plan === 'individual' && (
                                            <button className="mt-4 w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition">
                                                Upgrade
                                            </button>
                                        )}
                                    </div>

                                    {/* Enterprise Card */}
                                    <div className={`border-2 rounded-lg p-5 md:col-span-2 ${plan === 'enterprise' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}>
                                        <div className="flex items-center gap-2">
                                            <Crown className="w-5 h-5 text-yellow-600" />
                                            <h3 className="font-bold text-lg">Enterprise</h3>
                                        </div>
                                        <p className="text-sm text-gray-600 mt-1">For larger organizations</p>
                                        <div className="grid md:grid-cols-2 gap-4 mt-4">
                                            <ul className="space-y-2 text-sm">
                                                <li className="flex items-start gap-2">
                                                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                                                    Everything in Small Business
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                                                    Unlimited technicians
                                                </li>
                                            </ul>
                                            <ul className="space-y-2 text-sm">
                                                <li className="flex items-start gap-2">
                                                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                                                    Advanced analytics
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                                                    Custom integrations
                                                </li>
                                            </ul>
                                        </div>
                                        {plan !== 'enterprise' && (
                                            <button className="mt-4 px-6 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition">
                                                Contact Sales
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="mt-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-start gap-2">
                            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Save Button */}
                    {activeTab !== 'billing' && (
                        <div className="flex items-center justify-end gap-3 pt-6 border-t">
                            {saveSuccess && (
                                <div className="flex items-center gap-2 text-green-600 text-sm">
                                    <CheckCircle className="w-5 h-5" />
                                    Settings saved successfully
                                </div>
                            )}
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-5 h-5" />
                                        Save Changes
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
