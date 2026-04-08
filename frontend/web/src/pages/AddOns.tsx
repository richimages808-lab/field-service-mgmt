import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../auth/AuthProvider';
import {
    Globe, Mail, MessageSquare, Mic, ArrowRight, Check, X,
    Loader2, ExternalLink, Settings, Zap, Shield, Crown
} from 'lucide-react';

interface AddonStatus {
    domain: { enabled: boolean; domain?: string };
    email: { enabled: boolean; tier?: string; aliases?: string[] };
    sms: { enabled: boolean; tier?: string; phoneNumber?: string };
    aiPhone: { enabled: boolean; tier?: string };
}

const ADDON_CARDS = [
    {
        id: 'domain',
        title: 'Custom Domain',
        description: 'Professional web presence with your own domain name',
        icon: Globe,
        color: 'from-blue-500 to-cyan-500',
        bgLight: 'bg-blue-50',
        textColor: 'text-blue-700',
        borderColor: 'border-blue-200',
        accentColor: 'text-blue-600',
        price: '$14.99/mo',
        features: [
            'Custom domain registration',
            'Automatic DNS setup',
            'Customer portal on your domain',
            'SSL certificate included'
        ],
        managePath: '/settings',
        example: 'billsplumbing.com',
    },
    {
        id: 'email',
        title: 'Business Email',
        description: 'Professional email forwarding at your domain',
        icon: Mail,
        color: 'from-teal-500 to-emerald-500',
        bgLight: 'bg-teal-50',
        textColor: 'text-teal-700',
        borderColor: 'border-teal-200',
        accentColor: 'text-teal-600',
        price: 'From $4.99/mo',
        features: [
            'Email aliases (info@, support@, etc.)',
            'Forward to your existing inbox',
            'No new email app needed',
            'Catch-all forwarding (Pro tier)'
        ],
        managePath: '/settings',
        requiresDomain: true,
        example: 'info@billsplumbing.com',
    },
    {
        id: 'sms',
        title: 'Text Communications',
        description: 'Send & receive SMS with your customers',
        icon: MessageSquare,
        color: 'from-violet-500 to-amber-500',
        bgLight: 'bg-violet-50',
        textColor: 'text-violet-700',
        borderColor: 'border-violet-200',
        accentColor: 'text-violet-600',
        price: 'From $24.99/mo',
        features: [
            'Dedicated business phone number',
            'Appointment reminders',
            'Two-way messaging',
            'Automated follow-ups (Pro tier)'
        ],
        managePath: '/admin/texting',
        example: '(555) 123-4567',
    },
    {
        id: 'aiPhone',
        title: 'AI Phone Agent',
        description: '24/7 AI-powered call answering & booking',
        icon: Mic,
        color: 'from-amber-500 to-orange-500',
        bgLight: 'bg-amber-50',
        textColor: 'text-amber-700',
        borderColor: 'border-amber-200',
        accentColor: 'text-amber-600',
        price: 'From $49.99/mo',
        features: [
            'AI answers calls 24/7',
            'Books appointments automatically',
            'Takes detailed messages',
            'Custom voice & routing (Pro tier)'
        ],
        managePath: '/admin/ai-phone-agent',
        example: 'AI Receptionist',
    },
];

export const AddOns: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [addonStatus, setAddonStatus] = useState<AddonStatus>({
        domain: { enabled: false },
        email: { enabled: false },
        sms: { enabled: false },
        aiPhone: { enabled: false },
    });

    useEffect(() => {
        const loadAddonStatus = async () => {
            try {
                const orgId = (user as any)?.organizationId;
                if (!orgId) {
                    setLoading(false);
                    return;
                }
                const orgDoc = await getDoc(doc(db, 'organizations', orgId));
                if (orgDoc.exists()) {
                    const data = orgDoc.data();
                    setAddonStatus({
                        domain: {
                            enabled: !!data.customDomain,
                            domain: data.customDomain,
                        },
                        email: {
                            enabled: !!data.emailEnabled,
                            tier: data.emailTier,
                            aliases: data.emailAliases,
                        },
                        sms: {
                            enabled: !!data.smsEnabled || !!data.twilioPhoneNumber,
                            tier: data.smsTier,
                            phoneNumber: data.twilioPhoneNumber,
                        },
                        aiPhone: {
                            enabled: !!data.aiPhoneEnabled,
                            tier: data.aiPhoneTier,
                        },
                    });
                }
            } catch (err) {
                console.error('Error loading addon status:', err);
            } finally {
                setLoading(false);
            }
        };
        loadAddonStatus();
    }, [user]);

    const getStatus = (id: string) => {
        const status = addonStatus[id as keyof AddonStatus];
        return status?.enabled || false;
    };

    const getStatusDetail = (id: string): string => {
        const s = addonStatus[id as keyof AddonStatus] as any;
        if (!s?.enabled) return 'Not configured';
        switch (id) {
            case 'domain': return s.domain || 'Active';
            case 'email': return `${s.tier || 'Starter'} — ${s.aliases?.length || 0} aliases`;
            case 'sms': return s.phoneNumber || `${s.tier || 'Basic'} plan`;
            case 'aiPhone': return `${s.tier || 'Starter'} plan`;
            default: return 'Active';
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Hero Header */}
            <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white">
                <div className="max-w-5xl mx-auto px-4 py-10">
                    <div className="flex items-center gap-4 mb-2">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-amber-500 flex items-center justify-center shadow-lg">
                            <Zap className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold">Add-ons & Services</h1>
                            <p className="text-blue-300 text-sm">Supercharge your business with premium add-ons</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-6 mt-6 text-sm">
                        <div className="flex items-center gap-2 bg-white/10 backdrop-blur px-4 py-2 rounded-lg">
                            <Shield className="w-4 h-4 text-green-400" />
                            <span className="text-blue-200">
                                {Object.values(addonStatus).filter(s => s.enabled).length} active add-ons
                            </span>
                        </div>
                        <div className="flex items-center gap-2 bg-white/10 backdrop-blur px-4 py-2 rounded-lg">
                            <Crown className="w-4 h-4 text-amber-400" />
                            <span className="text-blue-200">
                                Plan: {(user as any)?.plan || 'Small Business'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Cards Grid */}
            <div className="max-w-5xl mx-auto px-4 -mt-6 pb-12">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {ADDON_CARDS.map(card => {
                            const Icon = card.icon;
                            const isActive = getStatus(card.id);
                            const statusDetail = getStatusDetail(card.id);
                            const needsDomain = card.requiresDomain && !addonStatus.domain.enabled;

                            return (
                                <div
                                    key={card.id}
                                    className={`relative bg-white rounded-2xl shadow-lg border-2 overflow-hidden transition-all duration-300 hover:shadow-xl ${isActive ? card.borderColor : 'border-gray-100'
                                        } ${needsDomain ? 'opacity-70' : ''}`}
                                >
                                    {/* Card Header */}
                                    <div className={`bg-gradient-to-r ${card.color} p-5 text-white`}>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-lg bg-white/20 backdrop-blur flex items-center justify-center">
                                                    <Icon className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <h3 className="text-lg font-bold">{card.title}</h3>
                                                    <p className="text-white/80 text-xs">{card.description}</p>
                                                </div>
                                            </div>
                                            <div className={`px-3 py-1 rounded-full text-xs font-bold ${isActive
                                                ? 'bg-white/30 text-white'
                                                : 'bg-black/20 text-white/80'
                                                }`}>
                                                {isActive ? '● Active' : '○ Inactive'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Card Body */}
                                    <div className="p-5">
                                        {/* Status Line */}
                                        <div className={`flex items-center gap-2 mb-4 px-3 py-2 rounded-lg ${card.bgLight}`}>
                                            {isActive ? (
                                                <Check className={`w-4 h-4 ${card.accentColor}`} />
                                            ) : (
                                                <X className="w-4 h-4 text-gray-400" />
                                            )}
                                            <span className={`text-sm font-medium ${isActive ? card.textColor : 'text-gray-500'}`}>
                                                {needsDomain ? 'Requires Custom Domain' : statusDetail}
                                            </span>
                                        </div>

                                        {/* Example */}
                                        {card.example && (
                                            <div className="mb-4 px-3 py-2 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                                <span className="text-xs text-gray-400 block mb-0.5">Example</span>
                                                <span className="text-sm font-mono text-gray-700">{card.example}</span>
                                            </div>
                                        )}

                                        {/* Features */}
                                        <ul className="space-y-1.5 mb-5">
                                            {card.features.map((f, i) => (
                                                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                                                    <Check className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${isActive ? card.accentColor : 'text-gray-300'}`} />
                                                    {f}
                                                </li>
                                            ))}
                                        </ul>

                                        {/* Bottom */}
                                        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                                            <span className="text-lg font-bold text-gray-900">{card.price}</span>
                                            <button
                                                onClick={() => navigate(card.managePath)}
                                                disabled={needsDomain}
                                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${needsDomain
                                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                    : isActive
                                                        ? `${card.bgLight} ${card.textColor} hover:opacity-80`
                                                        : 'bg-blue-600 text-white hover:bg-blue-700'
                                                    }`}
                                            >
                                                {needsDomain ? 'Enable Domain First' : isActive ? 'Manage' : 'Get Started'}
                                                <ArrowRight className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Domain required overlay hint */}
                                    {needsDomain && (
                                        <div className="absolute top-0 right-0 m-3">
                                            <div className="bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1">
                                                <Globe className="w-3 h-3" />
                                                Needs Domain
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Bottom Info Section */}
                <div className="mt-8 bg-gradient-to-r from-blue-50 to-amber-50 rounded-2xl p-6 border border-blue-100">
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                            <Settings className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-900 mb-1">Need help choosing?</h3>
                            <p className="text-sm text-gray-600 mb-3">
                                Start with a <strong>Custom Domain</strong> for your professional web presence, then add <strong>Business Email</strong> for branded communication. <strong>Text Communications</strong> and <strong>AI Phone Agent</strong> can be activated anytime as your business grows.
                            </p>
                            <button
                                onClick={() => navigate('/help')}
                                className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
                            >
                                View add-on guides in Help Center
                                <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
