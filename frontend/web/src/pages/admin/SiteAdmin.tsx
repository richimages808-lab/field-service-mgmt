import React, { useState, useEffect } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { Link, Navigate } from 'react-router-dom';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, functions } from '../../firebase';
import { toast } from 'react-hot-toast';
import { httpsCallable } from 'firebase/functions';
import {
    ArrowLeft, ExternalLink, Shield, MessageSquare, Phone, Mail,
    Cloud, Database, Brain, MapPin, Save, DollarSign,
    CheckCircle2, AlertTriangle, Settings2, Server, Calculator, Calendar, Activity,
    History, ChevronDown, ChevronRight
} from 'lucide-react';
import { BillingService, LiveBillingStats } from '../../services/BillingService';

interface ServiceCard {
    name: string;
    description: string;
    icon: React.ReactNode;
    consoleUrl: string;
    consoleName: string;
    status: 'active' | 'configured' | 'not_configured';
    category: string;
    features: string[];
}

interface FeeConfig {
    defaultTaxRate: number;
    smsCostPerMessage: number;
    emailCostPerMessage: number;
    cloudFunctionCostPerInvocation: number;
    mapsCostPerRequest: number;
    monthlyHostingCost: number;
    monthlyFirestoreCost: number;
    monthlyStorageCost: number;
    twilioMonthlyPhoneCost: number;
    yearlyDomainCost: number;
    // Activity Estimates
    estimatedMonthlySms: number;
    estimatedMonthlyEmails: number;
    estimatedMonthlyFunctionInvocations: number;
    estimatedMonthlyMapsRequests: number;
    // Subscriptions
    twilioRenewalDate: string;
    sendGridRenewalDate: string;
    domainRenewalDate: string;
}

const DEFAULT_FEES: FeeConfig = {
    defaultTaxRate: 4.712,
    smsCostPerMessage: 0.0079,
    emailCostPerMessage: 0.0004,
    cloudFunctionCostPerInvocation: 0.0000004,
    mapsCostPerRequest: 0.005, // Default for Routes/Geocoding blends
    monthlyHostingCost: 0,
    monthlyFirestoreCost: 0,
    monthlyStorageCost: 0,
    twilioMonthlyPhoneCost: 1.15,
    yearlyDomainCost: 12.00, // Typical .com yearly rate
    estimatedMonthlySms: 500,
    estimatedMonthlyEmails: 1000,
    estimatedMonthlyFunctionInvocations: 10000,
    estimatedMonthlyMapsRequests: 1000,
    twilioRenewalDate: '',
    sendGridRenewalDate: '',
    domainRenewalDate: '',
};

export const SiteAdmin: React.FC = () => {
    const { user } = useAuth();
    const [fees, setFees] = useState<FeeConfig>(DEFAULT_FEES);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [liveStats, setLiveStats] = useState<LiveBillingStats | null>(null);
    const [loadingStats, setLoadingStats] = useState(true);

    // Historical Billing State
    const [historicalMonths, setHistoricalMonths] = useState<string[]>([]);
    const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
    const [dailyBreakdown, setDailyBreakdown] = useState<any[]>([]);
    const [monthSummary, setMonthSummary] = useState<any>(null);
    const [loadingHistory, setLoadingHistory] = useState(true);

    // Gate access: only site_admin
    const isSiteAdmin = (user as any)?.site_admin === true
        || user?.email?.toLowerCase() === 'rich@richheaton.com';

    useEffect(() => {
        loadFees();
        fetchLiveStats();
        fetchHistoricalMonths();
    }, []);

    const fetchLiveStats = async () => {
        setLoadingStats(true);
        const stats = await BillingService.getLiveBillingStats();
        setLiveStats(stats);
        setLoadingStats(false);
    };

    const fetchHistoricalMonths = async () => {
        setLoadingHistory(true);
        const months = await BillingService.getHistoricalMonths();
        setHistoricalMonths(months);
        if (months.length > 0) {
            handleSelectMonth(months[0]);
        }
        setLoadingHistory(false);
    };

    const handleSelectMonth = async (month: string) => {
        setSelectedMonth(month);
        const breakdown = await BillingService.getDailyBreakdown(month);
        setDailyBreakdown(breakdown);
        const summary = await BillingService.getMonthSummary(month);
        setMonthSummary(summary);
    };

    const loadFees = async () => {
        try {
            const configDoc = await getDoc(doc(db, 'site_config', 'fees'));
            if (configDoc.exists()) {
                setFees({ ...DEFAULT_FEES, ...configDoc.data() as FeeConfig });
            }
        } catch (error) {
            console.error('Error loading fee config:', error);
        }
        setLoading(false);
    };

    const saveFees = async () => {
        setSaving(true);
        try {
            await setDoc(doc(db, 'site_config', 'fees'), {
                ...fees,
                updatedAt: new Date(),
                updatedBy: user?.email
            });
            toast.success('Fee configuration saved');
        } catch (error) {
            console.error('Error saving fees:', error);
            toast.error('Failed to save fee configuration');
        }
        setSaving(false);
    };

    if (!isSiteAdmin) {
        return <Navigate to="/" replace />;
    }

    const services: ServiceCard[] = [
        // Communication
        {
            name: 'Twilio SMS',
            description: 'Send and receive SMS messages for customer notifications, appointment reminders, report delivery, and AI-powered inbound message processing.',
            icon: <MessageSquare className="w-6 h-6" />,
            consoleUrl: 'https://console.twilio.com/',
            consoleName: 'Twilio Console',
            status: 'active',
            category: 'Communication',
            features: ['Outbound SMS', 'Inbound SMS Parsing', 'Appointment Reminders', 'Report Delivery']
        },
        {
            name: 'Twilio Voice',
            description: 'Handle inbound voice calls with automated greetings, voicemail recording, and AI-powered transcription that creates jobs from voicemails.',
            icon: <Phone className="w-6 h-6" />,
            consoleUrl: 'https://console.twilio.com/',
            consoleName: 'Twilio Console',
            status: 'active',
            category: 'Communication',
            features: ['Inbound Calls', 'Voicemail Recording', 'AI Transcription', 'Auto-Job Creation']
        },
        {
            name: 'SendGrid Email',
            description: 'Transactional email delivery for customer communications, invoice emails, job status updates, report delivery, and carrier-gateway SMS.',
            icon: <Mail className="w-6 h-6" />,
            consoleUrl: 'https://app.sendgrid.com/',
            consoleName: 'SendGrid Dashboard',
            status: 'active',
            category: 'Communication',
            features: ['Customer Emails', 'Invoice Delivery', 'Inbound Email Parsing', 'Carrier SMS Gateway']
        },
        // Cloud Infrastructure
        {
            name: 'Firebase',
            description: 'Core platform providing authentication, Firestore database, Cloud Storage for file uploads, Cloud Functions for backend logic, and web hosting.',
            icon: <Cloud className="w-6 h-6" />,
            consoleUrl: 'https://console.firebase.google.com/project/maintenancemanager-c5533/overview',
            consoleName: 'Firebase Console',
            status: 'active',
            category: 'Cloud Infrastructure',
            features: ['Authentication', 'Firestore Database', 'Cloud Storage', 'Cloud Functions', 'Hosting']
        },
        {
            name: 'Google Cloud Platform',
            description: 'Underlying infrastructure powering Cloud Functions, BigQuery analytics, Cloud Build, and Artifact Registry for function deployments.',
            icon: <Server className="w-6 h-6" />,
            consoleUrl: 'https://console.cloud.google.com/home/dashboard?project=maintenancemanager-c5533',
            consoleName: 'GCP Console',
            status: 'active',
            category: 'Cloud Infrastructure',
            features: ['Cloud Functions Runtime', 'BigQuery Analytics', 'Cloud Build', 'Artifact Registry']
        },
        {
            name: 'BigQuery',
            description: 'Data warehouse for historical analytics. Syncs data from Firestore for advanced reporting on revenue trends, technician utilization, and business intelligence.',
            icon: <Database className="w-6 h-6" />,
            consoleUrl: 'https://console.cloud.google.com/bigquery?project=maintenancemanager-c5533',
            consoleName: 'BigQuery Console',
            status: 'configured',
            category: 'Cloud Infrastructure',
            features: ['Revenue Reports', 'Tech Utilization', 'Firestore Sync', 'Custom Queries']
        },
        // AI & Intelligence
        {
            name: 'Vertex AI / Gemini',
            description: 'AI-powered features including job analysis, material identification from photos, inbound SMS/email parsing, priority assignment, and smart scheduling.',
            icon: <Brain className="w-6 h-6" />,
            consoleUrl: 'https://console.cloud.google.com/vertex-ai?project=maintenancemanager-c5533',
            consoleName: 'Vertex AI Console',
            status: 'active',
            category: 'AI & Intelligence',
            features: ['Job Analysis', 'Photo Material ID', 'SMS/Email Parsing', 'Smart Scheduling']
        },
        // Maps & Location
        {
            name: 'Google Maps Platform',
            description: 'Address geocoding, drive time calculations between jobs, and location-based scheduling optimization for technician routing.',
            icon: <MapPin className="w-6 h-6" />,
            consoleUrl: 'https://console.cloud.google.com/google/maps-apis/overview?project=maintenancemanager-c5533',
            consoleName: 'Maps API Console',
            status: 'active',
            category: 'Maps & Location',
            features: ['Geocoding', 'Drive Time Matrix', 'Route Optimization', 'Distance Calculation']
        }
    ];

    const categories = [...new Set(services.map(s => s.category))];

    const statusConfig = {
        active: { color: 'text-emerald-600 bg-emerald-50 border-emerald-200', label: 'Active', icon: <CheckCircle2 className="w-4 h-4" /> },
        configured: { color: 'text-blue-600 bg-blue-50 border-blue-200', label: 'Configured', icon: <Settings2 className="w-4 h-4" /> },
        not_configured: { color: 'text-amber-600 bg-amber-50 border-amber-200', label: 'Not Configured', icon: <AlertTriangle className="w-4 h-4" /> }
    };

    const categoryIcons: Record<string, React.ReactNode> = {
        'Communication': <MessageSquare className="w-5 h-5 text-violet-500" />,
        'Cloud Infrastructure': <Cloud className="w-5 h-5 text-blue-500" />,
        'AI & Intelligence': <Brain className="w-5 h-5 text-pink-500" />,
        'Maps & Location': <MapPin className="w-5 h-5 text-green-500" />,
    };

    const categoryGradients: Record<string, string> = {
        'Communication': 'from-violet-500/10 to-amber-500/10',
        'Cloud Infrastructure': 'from-blue-500/10 to-cyan-500/10',
        'AI & Intelligence': 'from-pink-500/10 to-rose-500/10',
        'Maps & Location': 'from-green-500/10 to-emerald-500/10',
    };

    const handleRunCommsTest = async () => {
        if (!confirm("Are you sure you want to send 10 test emails and 10 test SMS messages?")) return;

        const sendCustomerQuestion = httpsCallable(functions, 'sendCustomerQuestion');
        let successCount = 0;

        for (let i = 1; i <= 10; i++) {
            console.log(`Sending test ${i}/10...`);
            try {
                // Email
                await sendCustomerQuestion({
                    jobId: `test-native-job-${Date.now()}`,
                    customerEmail: 'rich@richheaton.com',
                    customerPhone: '808-282-9726',
                    customerName: 'Rich Heaton',
                    question: `This is test question #${i} delivered via email natively from the app UI.`,
                    communicationMethod: 'email'
                });
                // SMS
                await sendCustomerQuestion({
                    jobId: `test-native-job-${Date.now()}`,
                    customerEmail: 'rich@richheaton.com',
                    customerPhone: '808-282-9726',
                    customerName: 'Rich Heaton',
                    question: `This is test question #${i} delivered via SMS natively from the app UI.`,
                    communicationMethod: 'text'
                });
                successCount++;
            } catch (error: any) {
                console.error("Test failed:", error);
            }
            // slight delay to prevent rate limit blocks
            await new Promise(r => setTimeout(r, 500));
        }
        alert(`Finished tests. Successfully sent ${successCount} pairs.`);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50">
            {/* Header */}
            <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200/60 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                    <div className="flex items-center gap-4">
                        <Link to="/" className="text-gray-400 hover:text-gray-600 transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div className="flex items-center gap-3">
                            <div className="bg-gradient-to-br from-blue-500 to-amber-600 p-2.5 rounded-xl shadow-lg shadow-blue-200/50">
                                <Shield className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-amber-600">
                                    Site Administration
                                </h1>
                                <p className="text-sm text-gray-500">Manage integrations, services, and platform configuration</p>
                            </div>
                        </div>
                        <div className="ml-auto flex items-center gap-3">
                            <button onClick={handleRunCommsTest} className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors cursor-pointer">
                                Run Comm Tests
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
                {/* Service Integrations */}
                {categories.map(category => (
                    <section key={category}>
                        <div className="flex items-center gap-2 mb-5">
                            {categoryIcons[category]}
                            <h2 className="text-lg font-semibold text-gray-800">{category}</h2>
                            <div className="flex-1 h-px bg-gradient-to-r from-gray-200 to-transparent ml-3" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                            {services.filter(s => s.category === category).map(service => {
                                const status = statusConfig[service.status];
                                return (
                                    <div
                                        key={service.name}
                                        className={`bg-white rounded-2xl border border-gray-200/80 shadow-sm hover:shadow-lg hover:border-gray-300/80 transition-all duration-300 overflow-hidden group`}
                                    >
                                        {/* Gradient accent bar */}
                                        <div className={`h-1 bg-gradient-to-r ${categoryGradients[category]}`} />

                                        <div className="p-5">
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-lg bg-gradient-to-br ${categoryGradients[category]}`}>
                                                        {service.icon}
                                                    </div>
                                                    <h3 className="font-semibold text-gray-900">{service.name}</h3>
                                                </div>
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${status.color}`}>
                                                    {status.icon}
                                                    {status.label}
                                                </span>
                                            </div>

                                            <p className="text-sm text-gray-600 leading-relaxed mb-4">
                                                {service.description}
                                            </p>

                                            {/* Feature pills */}
                                            <div className="flex flex-wrap gap-1.5 mb-4">
                                                {service.features.map(f => (
                                                    <span key={f} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                                        {f}
                                                    </span>
                                                ))}
                                            </div>

                                            {/* Console link */}
                                            <a
                                                href={service.consoleUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors group-hover:underline"
                                            >
                                                Open {service.consoleName}
                                                <ExternalLink className="w-3.5 h-3.5" />
                                            </a>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                ))}

                {/* Fee Management */}
                <section>
                    <div className="flex items-center gap-2 mb-5">
                        <DollarSign className="w-5 h-5 text-emerald-500" />
                        <h2 className="text-lg font-semibold text-gray-800">Fee & Cost Configuration</h2>
                        <div className="flex-1 h-px bg-gradient-to-r from-gray-200 to-transparent ml-3" />
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                            <FeeInput
                                label="Default Tax Rate"
                                value={fees.defaultTaxRate}
                                onChange={v => setFees(p => ({ ...p, defaultTaxRate: v }))}
                                suffix="%"
                                step={0.001}
                                helpText="Applied to invoices by default"
                            />
                            <FeeInput
                                label="SMS Cost per Message"
                                value={fees.smsCostPerMessage}
                                onChange={v => setFees(p => ({ ...p, smsCostPerMessage: v }))}
                                prefix="$"
                                step={0.0001}
                                helpText="Twilio outbound SMS rate"
                            />
                            <FeeInput
                                label="Email Cost per Message"
                                value={fees.emailCostPerMessage}
                                onChange={v => setFees(p => ({ ...p, emailCostPerMessage: v }))}
                                prefix="$"
                                step={0.0001}
                                helpText="SendGrid per-email rate"
                            />
                            <FeeInput
                                label="Function Cost per Invoke"
                                value={fees.cloudFunctionCostPerInvocation}
                                onChange={v => setFees(p => ({ ...p, cloudFunctionCostPerInvocation: v }))}
                                prefix="$"
                                step={0.0000001}
                                helpText="Cloud Function invocation cost"
                            />
                            <FeeInput
                                label="Maps API per Request"
                                value={fees.mapsCostPerRequest}
                                onChange={v => setFees(p => ({ ...p, mapsCostPerRequest: v }))}
                                prefix="$"
                                step={0.001}
                                helpText="Blended Maps/Routes API cost"
                            />
                            <FeeInput
                                label="Monthly Hosting"
                                value={fees.monthlyHostingCost}
                                onChange={v => setFees(p => ({ ...p, monthlyHostingCost: v }))}
                                prefix="$"
                                step={0.01}
                                helpText="Firebase Hosting monthly"
                            />
                            <FeeInput
                                label="Monthly Firestore"
                                value={fees.monthlyFirestoreCost}
                                onChange={v => setFees(p => ({ ...p, monthlyFirestoreCost: v }))}
                                prefix="$"
                                step={0.01}
                                helpText="Firestore database monthly"
                            />
                            <FeeInput
                                label="Monthly Storage"
                                value={fees.monthlyStorageCost}
                                onChange={v => setFees(p => ({ ...p, monthlyStorageCost: v }))}
                                prefix="$"
                                step={0.01}
                                helpText="Cloud Storage monthly"
                            />
                            <FeeInput
                                label="Twilio Phone Number"
                                value={fees.twilioMonthlyPhoneCost}
                                onChange={v => setFees(p => ({ ...p, twilioMonthlyPhoneCost: v }))}
                                prefix="$"
                                step={0.01}
                                helpText="Monthly number lease"
                            />
                            <FeeInput
                                label="Custom Domain Yearly"
                                value={fees.yearlyDomainCost}
                                onChange={v => setFees(p => ({ ...p, yearlyDomainCost: v }))}
                                prefix="$"
                                step={1.00}
                                helpText="Yearly DNS/Domain fee"
                            />
                        </div>

                        <div className="mt-6 pt-6 border-t border-gray-100 flex items-center justify-between">
                            <p className="text-sm text-gray-500">
                                Changes are saved to Firestore and apply globally.
                            </p>
                            <button
                                onClick={saveFees}
                                disabled={saving}
                                className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-amber-600 text-white px-5 py-2.5 rounded-xl font-medium shadow-lg shadow-blue-200/50 hover:shadow-xl hover:shadow-blue-300/50 transition-all duration-200 disabled:opacity-50"
                            >
                                <Save className="w-4 h-4" />
                                {saving ? 'Saving...' : 'Save Configuration'}
                            </button>
                        </div>
                    </div>
                </section>

                {/* Live Spends */}
                <section>
                    <div className="flex items-center gap-2 mb-5">
                        <Activity className="w-5 h-5 text-blue-500" />
                        <h2 className="text-lg font-semibold text-gray-800">Live Current Month Usage</h2>
                        <div className="flex-1 h-px bg-gradient-to-r from-gray-200 to-transparent ml-3" />
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-6">
                        {loadingStats ? (
                            <div className="text-center text-gray-500 py-6 animate-pulse">Loading real-time API metrics from Twilio, SendGrid, and Vertex AI...</div>
                        ) : liveStats ? (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Twilio Box */}
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-semibold text-slate-800">Twilio (SMS & Voice)</h3>
                                        <MessageSquare className="w-5 h-5 text-blue-500" />
                                    </div>
                                    <p className="text-3xl font-bold text-slate-900">${liveStats.twilio.totalCost.toFixed(2)}</p>
                                    <p className="text-sm text-slate-500 mt-1">Current month-to-date API cost</p>
                                </div>

                                {/* SendGrid Box */}
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-semibold text-slate-800">SendGrid (Email)</h3>
                                        <Mail className="w-5 h-5 text-blue-500" />
                                    </div>
                                    <p className="text-3xl font-bold text-slate-900">{liveStats.sendgrid.totalEmails.toLocaleString()}</p>
                                    <p className="text-sm text-slate-500 mt-1">Emails sent month-to-date</p>
                                    <div className="mt-3 pt-3 border-t border-slate-200">
                                        <p className="text-sm font-semibold text-blue-700">
                                            Est. Cost: ${(liveStats.sendgrid.totalEmails * fees.emailCostPerMessage).toFixed(4)}
                                        </p>
                                    </div>
                                </div>

                                {/* AI Box */}
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className="font-semibold text-slate-800">Gemini (AI Usage)</h3>
                                        <Brain className="w-5 h-5 text-blue-500" />
                                    </div>
                                    <p className="text-3xl font-bold text-slate-900">{liveStats.gemini.totalTokens.toLocaleString()}</p>
                                    <p className="text-sm text-slate-500 mt-1">Tokens consumed month-to-date</p>
                                    <div className="mt-3 pt-3 border-t border-slate-200">
                                        <p className="text-sm font-semibold text-blue-700">
                                            Est. Cost: ${liveStats.gemini.estimatedCost.toFixed(4)}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center text-red-500 py-4">Failed to load real-time statistics.</div>
                        )}
                    </div>
                </section>

                {/* Historical Billing */}
                <section>
                    <div className="flex items-center gap-2 mb-5">
                        <History className="w-5 h-5 text-amber-500" />
                        <h2 className="text-lg font-semibold text-gray-800">Historical Total Cost Breakdown</h2>
                        <div className="flex-1 h-px bg-gradient-to-r from-gray-200 to-transparent ml-3" />
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden flex flex-col md:flex-row min-h-[400px]">
                        {/* Sidebar: Month List */}
                        <div className="w-full md:w-64 bg-slate-50 border-r border-gray-200/80 p-4 space-y-2 flex-shrink-0">
                            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4 px-2">Billing Months</h3>
                            {loadingHistory ? (
                                <div className="animate-pulse space-y-3 px-2">
                                    <div className="h-8 bg-slate-200 rounded"></div>
                                    <div className="h-8 bg-slate-200 rounded"></div>
                                </div>
                            ) : historicalMonths.length === 0 ? (
                                <p className="text-sm text-slate-500 px-2">No historical data available yet. Costs are snapshotted daily.</p>
                            ) : (
                                historicalMonths.map(month => (
                                    <button
                                        key={month}
                                        onClick={() => handleSelectMonth(month)}
                                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${selectedMonth === month
                                            ? 'bg-amber-100 text-amber-700 shadow-sm'
                                            : 'text-slate-600 hover:bg-white hover:text-slate-900 border border-transparent'
                                            }`}
                                    >
                                        <span>{month}</span>
                                        {selectedMonth === month ? <ChevronRight className="w-4 h-4" /> : null}
                                    </button>
                                ))
                            )}
                        </div>

                        {/* Main Body: Daily Breakdown */}
                        <div className="flex-1 p-6 overflow-hidden">
                            {selectedMonth ? (
                                <div>
                                    <div className="flex items-center justify-between mb-6">
                                        <h3 className="text-xl font-bold text-gray-800">Breakdown for {selectedMonth}</h3>
                                        <div className="bg-amber-50 text-amber-700 px-4 py-1.5 rounded-full text-sm font-semibold border border-amber-200">
                                            Grand Total: ${(monthSummary?.grandTotalCost || dailyBreakdown.reduce((sum, day) => sum + (day.bigqueryTotalCost || 0), 0)).toFixed(4)}
                                        </div>
                                    </div>

                                    {/* Month Summary Cards */}
                                    {monthSummary && monthSummary.grandTotalCost !== undefined && (
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
                                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                                                <p className="text-xs text-slate-500 font-medium">Twilio</p>
                                                <p className="text-lg font-bold text-slate-900">${(monthSummary.twilioTotalCost || 0).toFixed(2)}</p>
                                            </div>
                                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                                                <p className="text-xs text-slate-500 font-medium">SendGrid</p>
                                                <p className="text-lg font-bold text-slate-900">${(monthSummary.sendgridTotalCost || 0).toFixed(4)}</p>
                                            </div>
                                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                                                <p className="text-xs text-slate-500 font-medium">Gemini AI</p>
                                                <p className="text-lg font-bold text-slate-900">${(monthSummary.geminiTotalCost || 0).toFixed(4)}</p>
                                            </div>
                                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                                                <p className="text-xs text-slate-500 font-medium">BigQuery</p>
                                                <p className="text-lg font-bold text-slate-900">${(monthSummary.bigqueryTotalCost || 0).toFixed(4)}</p>
                                            </div>
                                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                                                <p className="text-xs text-slate-500 font-medium">Functions</p>
                                                <p className="text-lg font-bold text-slate-900">${(monthSummary.functionsTotalCost || 0).toFixed(4)}</p>
                                            </div>
                                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                                                <p className="text-xs text-slate-500 font-medium">Maps API</p>
                                                <p className="text-lg font-bold text-slate-900">${(monthSummary.mapsTotalCost || 0).toFixed(2)}</p>
                                            </div>
                                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                                                <p className="text-xs text-slate-500 font-medium">Fixed Infrastructure</p>
                                                <p className="text-lg font-bold text-slate-900">${(monthSummary.fixedTotalCost || 0).toFixed(2)}</p>
                                            </div>
                                        </div>
                                    )}

                                    <h4 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wider">Daily BigQuery Cost History</h4>

                                    {dailyBreakdown.length > 0 ? (
                                        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm max-h-[400px]">
                                            <table className="w-full text-sm text-left">
                                                <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200 sticky top-0">
                                                    <tr>
                                                        <th className="px-6 py-3 font-semibold">Date</th>
                                                        <th className="px-6 py-3 font-semibold text-right">Compute Cost</th>
                                                        <th className="px-6 py-3 font-semibold text-right">Storage Cost</th>
                                                        <th className="px-6 py-3 font-semibold text-right text-blue-700">Total BQ Cost</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {dailyBreakdown.map(day => (
                                                        <tr key={day.date} className="hover:bg-slate-50 transition-colors">
                                                            <td className="px-6 py-3 font-medium text-gray-900">{day.date}</td>
                                                            <td className="px-6 py-3 text-right text-slate-600">${(day.bigqueryComputeCost || 0).toFixed(4)}</td>
                                                            <td className="px-6 py-3 text-right text-slate-600">${(day.bigqueryStorageCost || 0).toFixed(4)}</td>
                                                            <td className="px-6 py-3 text-right font-semibold text-blue-600">${(day.bigqueryTotalCost || 0).toFixed(4)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
                                            <p className="text-slate-500">No daily breakdowns recorded yet for this month.</p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                    <History className="w-12 h-12 mb-3 opacity-50" />
                                    <p>Select a month from the sidebar to view details</p>
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                {/* Cost Projections */}
                <section>
                    <div className="flex items-center gap-2 mb-5">
                        <Calculator className="w-5 h-5 text-blue-500" />
                        <h2 className="text-lg font-semibold text-gray-800">Manual Cost Projections</h2>
                        <div className="flex-1 h-px bg-gradient-to-r from-gray-200 to-transparent ml-3" />
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                            <FeeInput
                                label="Est. Monthly SMS Volume"
                                value={fees.estimatedMonthlySms}
                                onChange={v => setFees(p => ({ ...p, estimatedMonthlySms: v }))}
                                step={100}
                                helpText="Expected number of SMS sent/received"
                            />
                            <FeeInput
                                label="Est. Monthly Email Volume"
                                value={fees.estimatedMonthlyEmails}
                                onChange={v => setFees(p => ({ ...p, estimatedMonthlyEmails: v }))}
                                step={100}
                                helpText="Expected number of emails sent"
                            />
                            <FeeInput
                                label="Est. Function Invocations"
                                value={fees.estimatedMonthlyFunctionInvocations}
                                onChange={v => setFees(p => ({ ...p, estimatedMonthlyFunctionInvocations: v }))}
                                step={1000}
                                helpText="Expected backend triggers per month"
                            />
                            <FeeInput
                                label="Est. Maps Requests"
                                value={fees.estimatedMonthlyMapsRequests}
                                onChange={v => setFees(p => ({ ...p, estimatedMonthlyMapsRequests: v }))}
                                step={100}
                                helpText="Expected geocoding/routing requests"
                            />
                        </div>

                        <div className="bg-slate-50 rounded-xl p-5 border border-slate-200/60">
                            <h3 className="text-sm font-semibold text-slate-700 mb-4 uppercase tracking-wider">Estimated Monthly Breakdown</h3>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-600">SMS ({fees.estimatedMonthlySms})</span>
                                    <span className="font-medium text-slate-900">${(fees.estimatedMonthlySms * fees.smsCostPerMessage).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-600">Emails ({fees.estimatedMonthlyEmails})</span>
                                    <span className="font-medium text-slate-900">${(fees.estimatedMonthlyEmails * fees.emailCostPerMessage).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-600">Cloud Functions ({fees.estimatedMonthlyFunctionInvocations})</span>
                                    <span className="font-medium text-slate-900">${(fees.estimatedMonthlyFunctionInvocations * fees.cloudFunctionCostPerInvocation).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-600">Maps APIs ({fees.estimatedMonthlyMapsRequests})</span>
                                    <span className="font-medium text-slate-900">${(fees.estimatedMonthlyMapsRequests * fees.mapsCostPerRequest).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-600">Fixed Costs (Hosting, DB, Storage, Twilio, Domain)</span>
                                    <span className="font-medium text-slate-900">${(fees.monthlyHostingCost + fees.monthlyFirestoreCost + fees.monthlyStorageCost + fees.twilioMonthlyPhoneCost + (fees.yearlyDomainCost / 12)).toFixed(2)}</span>
                                </div>
                                <div className="h-px bg-slate-200 my-2" />
                                <div className="flex justify-between items-center">
                                    <span className="font-semibold text-slate-900">Total Estimated Monthly Cost</span>
                                    <span className="text-lg font-bold text-blue-600">
                                        ${((fees.estimatedMonthlySms * fees.smsCostPerMessage) +
                                            (fees.estimatedMonthlyEmails * fees.emailCostPerMessage) +
                                            (fees.estimatedMonthlyFunctionInvocations * fees.cloudFunctionCostPerInvocation) +
                                            (fees.estimatedMonthlyMapsRequests * fees.mapsCostPerRequest) +
                                            fees.monthlyHostingCost + fees.monthlyFirestoreCost + fees.monthlyStorageCost + fees.twilioMonthlyPhoneCost + (fees.yearlyDomainCost / 12)).toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Subscriptions & Renewals */}
                <section>
                    <div className="flex items-center gap-2 mb-5">
                        <Calendar className="w-5 h-5 text-rose-500" />
                        <h2 className="text-lg font-semibold text-gray-800">Subscriptions & Renewals</h2>
                        <div className="flex-1 h-px bg-gradient-to-r from-gray-200 to-transparent ml-3" />
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Twilio Renewal Date</label>
                                <input
                                    type="date"
                                    value={fees.twilioRenewalDate || ''}
                                    onChange={e => setFees(p => ({ ...p, twilioRenewalDate: e.target.value }))}
                                    className="w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                                <p className="mt-1 text-xs text-gray-400">Phone number billing cycle</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">SendGrid Renewal Date</label>
                                <input
                                    type="date"
                                    value={fees.sendGridRenewalDate || ''}
                                    onChange={e => setFees(p => ({ ...p, sendGridRenewalDate: e.target.value }))}
                                    className="w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                                <p className="mt-1 text-xs text-gray-400">Email plan billing cycle</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Domain & Hosting Renewal</label>
                                <input
                                    type="date"
                                    value={fees.domainRenewalDate || ''}
                                    onChange={e => setFees(p => ({ ...p, domainRenewalDate: e.target.value }))}
                                    className="w-full border border-gray-300 rounded-lg py-2 px-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                                <p className="mt-1 text-xs text-gray-400">Custom domain registration</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Account Info */}
                <section className="pb-10">
                    <div className="flex items-center gap-2 mb-5">
                        <Shield className="w-5 h-5 text-blue-500" />
                        <h2 className="text-lg font-semibold text-gray-800">Account Information</h2>
                        <div className="flex-1 h-px bg-gradient-to-r from-gray-200 to-transparent ml-3" />
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div>
                                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Email</label>
                                <p className="mt-1 text-sm font-medium text-gray-900">{user?.email}</p>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Role</label>
                                <p className="mt-1 text-sm font-medium text-gray-900 capitalize">{(user as any)?.role || 'admin'}</p>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Access Level</label>
                                <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 bg-blue-50 px-3 py-1 rounded-full">
                                    <Shield className="w-3.5 h-3.5" />
                                    Site Administrator
                                </p>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
};

// Fee input component
const FeeInput: React.FC<{
    label: string;
    value: number;
    onChange: (v: number) => void;
    prefix?: string;
    suffix?: string;
    step?: number;
    helpText?: string;
}> = ({ label, value, onChange, prefix, suffix, step = 0.01, helpText }) => (
    <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <div className="relative">
            {prefix && (
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{prefix}</span>
            )}
            <input
                type="number"
                step={step}
                value={value}
                onChange={e => onChange(parseFloat(e.target.value) || 0)}
                className={`w-full border border-gray-300 rounded-lg py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${prefix ? 'pl-7' : 'pl-3'} ${suffix ? 'pr-8' : 'pr-3'}`}
            />
            {suffix && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">{suffix}</span>
            )}
        </div>
        {helpText && <p className="mt-1 text-xs text-gray-400">{helpText}</p>}
    </div>
);
