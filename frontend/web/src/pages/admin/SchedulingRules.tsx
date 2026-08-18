import React, { useState, useEffect } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { db } from '../../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import {
    CalendarCheck, Package, PackageCheck, Truck, CheckCircle2, ArrowLeft,
    Settings, Info, Loader2, Sliders, Sparkles, Navigation
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { SchedulingMetricId } from '../../types';
import { MetricPriorityRanker, DEFAULT_METRIC_PRIORITIES } from '../../components/scheduling/MetricPriorityRanker';

type MaterialSchedulingMode = 'allow_all' | 'estimated_availability' | 'in_stock_only';
type DefaultSchedulingChannel = 'phone' | 'text' | 'email';

interface SchedulingRulesProps {
    isEmbedded?: boolean;
}

export const SchedulingRules: React.FC<SchedulingRulesProps> = ({ isEmbedded }) => {
    const { user } = useAuth();
    const orgId = user?.org_id;
    const [loading, setLoading] = useState(true);

    // Metric Priorities
    const [metricPriorities, setMetricPriorities] = useState<SchedulingMetricId[]>(DEFAULT_METRIC_PRIORITIES);
    const [savingPriorities, setSavingPriorities] = useState(false);

    // Material scheduling mode
    const [materialSchedulingMode, setMaterialSchedulingMode] = useState<MaterialSchedulingMode>('allow_all');
    const [savingMaterialMode, setSavingMaterialMode] = useState(false);

    // Material buffer days
    const [materialBufferDays, setMaterialBufferDays] = useState<number>(0);
    const [savingBufferDays, setSavingBufferDays] = useState(false);

    // Default scheduling channel
    const [defaultChannel, setDefaultChannel] = useState<DefaultSchedulingChannel>('email');
    const [savingChannel, setSavingChannel] = useState(false);

    // Full auto-scheduling
    const [autoApproveScheduling, setAutoApproveScheduling] = useState<boolean>(false);
    const [savingAutoApprove, setSavingAutoApprove] = useState(false);

    // Load org settings
    useEffect(() => {
        const load = async () => {
            if (!orgId) return;
            try {
                const orgDoc = await getDoc(doc(db, 'organizations', orgId));
                if (orgDoc.exists()) {
                    const data = orgDoc.data();
                    setMaterialSchedulingMode(data.materialSchedulingMode || 'allow_all');
                    setDefaultChannel(data.defaultSchedulingChannel || 'email');
                    setMaterialBufferDays(data.materialBufferDays != null ? Number(data.materialBufferDays) : 0);
                    setAutoApproveScheduling(!!data.autoApproveScheduling);
                    if (data.metricPriorities && Array.isArray(data.metricPriorities)) {
                        setMetricPriorities(data.metricPriorities);
                    }
                }
            } catch (err) {
                console.error('[SchedulingRules] Failed to load settings:', err);
                toast.error('Failed to load scheduling settings');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [orgId]);

    const saveMetricPriorities = async (newPriorities: SchedulingMetricId[]) => {
        if (!orgId) return;
        setMetricPriorities(newPriorities);
        setSavingPriorities(true);
        try {
            await updateDoc(doc(db, 'organizations', orgId), {
                metricPriorities: newPriorities
            });
            toast.success('Scheduling metric priorities updated!');
        } catch (err) {
            console.error('Failed to save metric priorities:', err);
            toast.error('Failed to save metric priorities');
        } finally {
            setSavingPriorities(false);
        }
    };

    const saveMaterialMode = async (mode: MaterialSchedulingMode) => {
        if (!orgId) return;
        setSavingMaterialMode(true);
        try {
            await updateDoc(doc(db, 'organizations', orgId), {
                materialSchedulingMode: mode
            });
            setMaterialSchedulingMode(mode);
            const labels: Record<MaterialSchedulingMode, string> = {
                'allow_all': 'Schedule Anytime',
                'estimated_availability': 'Wait for Materials',
                'in_stock_only': 'In-Stock Only'
            };
            toast.success(`Material scheduling: ${labels[mode]}`);
        } catch {
            toast.error('Failed to update');
        } finally {
            setSavingMaterialMode(false);
        }
    };

    const saveMaterialBufferDays = async (days: number) => {
        if (!orgId) return;
        setSavingBufferDays(true);
        try {
            await updateDoc(doc(db, 'organizations', orgId), {
                materialBufferDays: days
            });
            setMaterialBufferDays(days);
            toast.success(`Material buffer set to ${days} day(s)`);
        } catch {
            toast.error('Failed to update material buffer');
        } finally {
            setSavingBufferDays(false);
        }
    };

    const saveChannel = async (channel: DefaultSchedulingChannel) => {
        if (!orgId) return;
        setSavingChannel(true);
        try {
            await updateDoc(doc(db, 'organizations', orgId), {
                defaultSchedulingChannel: channel
            });
            setDefaultChannel(channel);
            toast.success(`Default scheduling channel: ${channel}`);
        } catch {
            toast.error('Failed to update');
        } finally {
            setSavingChannel(false);
        }
    };

    const saveAutoApproveScheduling = async (enabled: boolean) => {
        if (!orgId) return;
        setSavingAutoApprove(true);
        try {
            await updateDoc(doc(db, 'organizations', orgId), {
                autoApproveScheduling: enabled
            });
            setAutoApproveScheduling(enabled);
            toast.success(`Full auto-scheduling: ${enabled ? 'Enabled' : 'Disabled'}`);
        } catch {
            toast.error('Failed to update scheduling automation');
        } finally {
            setSavingAutoApprove(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
        );
    }

    return (
        <div className={isEmbedded ? "space-y-6" : "max-w-4xl mx-auto p-6 space-y-8"}>
            {/* Header */}
            {!isEmbedded && (
                <div className="flex items-center gap-4">
                    <Link
                        to="/admin/communications"
                        className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-gray-500" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                            <div className="p-2.5 bg-gradient-to-br from-violet-100 to-indigo-100 rounded-xl">
                                <Settings className="w-6 h-6 text-violet-600" />
                            </div>
                            Scheduling Rules
                        </h1>
                        <p className="text-sm text-gray-500 mt-1 ml-14">
                            Organization-level defaults for how appointments are offered and scheduled.
                            Individual jobs can override these settings.
                        </p>
                    </div>
                </div>
            )}
            
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex gap-3 shadow-sm">
                <Info className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" />
                <div>
                    <h4 className="font-semibold text-indigo-900 text-sm">Scheduling Rules & Automation</h4>
                    <p className="text-xs text-indigo-700 mt-1 leading-relaxed">
                        Control how appointments are offered and confirmed. Use Material-Aware Scheduling to align bookings with parts delivery lead times, set safety buffers for receiving, select your default outreach channel (email, text, or AI callback), prioritize scheduling metrics, and configure auto-scheduling rules.
                    </p>
                </div>
            </div>

            {/* ─── AI Scheduling Metric Priorities (Drag & Drop) ─── */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="px-6 py-5">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 text-indigo-700">
                                <Sliders className="w-6 h-6" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-lg font-bold text-gray-900">AI Scheduling Metric Priorities</h2>
                                    <span className="text-[11px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full">
                                        Drag & Drop
                                    </span>
                                </div>
                                <p className="text-sm text-gray-500 mt-0.5">
                                    Define the operational hierarchy used by the AI engine to score and sequence appointments
                                </p>
                            </div>
                        </div>

                        {savingPriorities && (
                            <div className="flex items-center gap-2 text-xs text-indigo-600 font-semibold">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Saving...
                            </div>
                        )}
                    </div>

                    <div className="mt-4">
                        <MetricPriorityRanker
                            priorities={metricPriorities}
                            onChange={saveMetricPriorities}
                            compact={false}
                            showPresets={true}
                        />
                    </div>

                    <div className="mt-4 flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
                        <Navigation className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div className="text-xs text-blue-800 leading-relaxed">
                            <strong>Shortest Driving Route:</strong> By default, the system routes technicians to the next closest site to eliminate crisscrossing and minimize drive time. Dispatchers and technicians can customize or reorder these priorities at any time.
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── Material-Aware Scheduling ─── */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="px-6 py-5">
                    <div className="flex items-center gap-4 mb-2">
                        <div className={`p-3 rounded-xl transition-colors ${
                            materialSchedulingMode === 'allow_all' ? 'bg-gray-100' :
                            materialSchedulingMode === 'estimated_availability' ? 'bg-gradient-to-br from-orange-100 to-amber-100' :
                            'bg-gradient-to-br from-emerald-100 to-green-100'
                        }`}>
                            <Package className={`w-6 h-6 ${
                                materialSchedulingMode === 'allow_all' ? 'text-gray-500' :
                                materialSchedulingMode === 'estimated_availability' ? 'text-orange-600' :
                                'text-emerald-600'
                            }`} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Material-Aware Scheduling</h2>
                            <p className="text-sm text-gray-500 mt-0.5">
                                Controls whether scheduling considers inventory stock and vendor lead times
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
                        {/* Allow All */}
                        <button
                            onClick={() => saveMaterialMode('allow_all')}
                            disabled={savingMaterialMode}
                            className={`relative text-left p-4 rounded-xl border-2 transition-all ${
                                materialSchedulingMode === 'allow_all'
                                    ? 'border-gray-500 bg-gray-50 shadow-md shadow-gray-100'
                                    : 'border-gray-200 hover:border-gray-400 bg-white'
                            }`}
                        >
                            {materialSchedulingMode === 'allow_all' && (
                                <div className="absolute top-2 right-2">
                                    <CheckCircle2 className="w-5 h-5 text-gray-500" />
                                </div>
                            )}
                            <CalendarCheck className={`w-5 h-5 mb-2 ${materialSchedulingMode === 'allow_all' ? 'text-gray-600' : 'text-gray-400'}`} />
                            <h4 className="font-bold text-sm text-gray-900 mb-1">Schedule Anytime</h4>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                Offer all available time slots regardless of material stock levels
                            </p>
                        </button>

                        {/* Estimated Availability */}
                        <button
                            onClick={() => saveMaterialMode('estimated_availability')}
                            disabled={savingMaterialMode}
                            className={`relative text-left p-4 rounded-xl border-2 transition-all ${
                                materialSchedulingMode === 'estimated_availability'
                                    ? 'border-orange-500 bg-orange-50/50 shadow-md shadow-orange-100'
                                    : 'border-gray-200 hover:border-orange-300 bg-white'
                            }`}
                        >
                            {materialSchedulingMode === 'estimated_availability' && (
                                <div className="absolute top-2 right-2">
                                    <CheckCircle2 className="w-5 h-5 text-orange-500" />
                                </div>
                            )}
                            <Truck className={`w-5 h-5 mb-2 ${materialSchedulingMode === 'estimated_availability' ? 'text-orange-600' : 'text-gray-400'}`} />
                            <h4 className="font-bold text-sm text-gray-900 mb-1">Wait for Materials</h4>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                Only offer slots after materials are estimated to arrive based on vendor lead times
                            </p>
                        </button>

                        {/* In-Stock Only */}
                        <button
                            onClick={() => saveMaterialMode('in_stock_only')}
                            disabled={savingMaterialMode}
                            className={`relative text-left p-4 rounded-xl border-2 transition-all ${
                                materialSchedulingMode === 'in_stock_only'
                                    ? 'border-emerald-500 bg-emerald-50/50 shadow-md shadow-emerald-100'
                                    : 'border-gray-200 hover:border-emerald-300 bg-white'
                            }`}
                        >
                            {materialSchedulingMode === 'in_stock_only' && (
                                <div className="absolute top-2 right-2">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                </div>
                            )}
                            <PackageCheck className={`w-5 h-5 mb-2 ${materialSchedulingMode === 'in_stock_only' ? 'text-emerald-600' : 'text-gray-400'}`} />
                            <h4 className="font-bold text-sm text-gray-900 mb-1">In-Stock Only</h4>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                Block scheduling until all required materials are physically in stock
                            </p>
                        </button>
                    </div>

                    <div className="mt-4 flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
                        <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                        <div className="text-xs text-blue-700 leading-relaxed">
                            <strong>Per-job override:</strong> Technicians can override this setting on individual jobs
                            from the job details panel. When overridden, the job-level setting takes priority over this
                            organization default.
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── Material Lead Time Buffer ─── */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="px-6 py-5">
                    <div className="flex items-center gap-4 mb-2">
                        <div className="p-3 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100">
                            <Truck className="w-6 h-6 text-orange-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Material Lead Time Buffer</h2>
                            <p className="text-sm text-gray-500 mt-0.5">
                                Additional buffer days added to parts delivery times to account for receiving, inspection, and preparation.
                            </p>
                        </div>
                    </div>

                    <div className="mt-4 max-w-xs">
                        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                            Additional Buffer (Business Days)
                        </label>
                        <div className="flex items-center gap-3">
                            <input
                                type="number"
                                min="0"
                                max="30"
                                value={materialBufferDays}
                                onChange={(e) => saveMaterialBufferDays(parseInt(e.target.value) || 0)}
                                disabled={savingBufferDays}
                                className="w-24 px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm font-medium text-gray-900"
                            />
                            <span className="text-sm text-gray-600 font-medium">day(s) buffer</span>
                            {savingBufferDays && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── Default Scheduling Channel ─── */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="px-6 py-5">
                    <div className="flex items-center gap-4 mb-2">
                        <div className="p-3 rounded-xl bg-gradient-to-br from-blue-100 to-cyan-100">
                            <CalendarCheck className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Default Scheduling Channel</h2>
                            <p className="text-sm text-gray-500 mt-0.5">
                                How the system contacts customers to schedule after quote approval
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
                        {(['email', 'text', 'phone'] as DefaultSchedulingChannel[]).map((channel) => {
                            const config = {
                                email: {
                                    label: 'Email',
                                    description: 'Send scheduling link via email',
                                    activeColor: 'border-blue-500 bg-blue-50/50 shadow-md shadow-blue-100',
                                    hoverColor: 'hover:border-blue-300',
                                    checkColor: 'text-blue-500',
                                    iconColor: 'text-blue-600',
                                },
                                text: {
                                    label: 'SMS / Text',
                                    description: 'Send scheduling options via text message',
                                    activeColor: 'border-green-500 bg-green-50/50 shadow-md shadow-green-100',
                                    hoverColor: 'hover:border-green-300',
                                    checkColor: 'text-green-500',
                                    iconColor: 'text-green-600',
                                },
                                phone: {
                                    label: 'AI Phone Call',
                                    description: 'AI calls the customer to schedule over the phone',
                                    activeColor: 'border-violet-500 bg-violet-50/50 shadow-md shadow-violet-100',
                                    hoverColor: 'hover:border-violet-300',
                                    checkColor: 'text-violet-500',
                                    iconColor: 'text-violet-600',
                                },
                            }[channel];

                            return (
                                <button
                                    key={channel}
                                    onClick={() => saveChannel(channel)}
                                    disabled={savingChannel}
                                    className={`relative text-left p-4 rounded-xl border-2 transition-all ${
                                        defaultChannel === channel
                                            ? config.activeColor
                                            : `border-gray-200 ${config.hoverColor} bg-white`
                                    }`}
                                >
                                    {defaultChannel === channel && (
                                        <div className="absolute top-2 right-2">
                                            <CheckCircle2 className={`w-5 h-5 ${config.checkColor}`} />
                                        </div>
                                    )}
                                    <h4 className="font-bold text-sm text-gray-900 mb-1">{config.label}</h4>
                                    <p className="text-xs text-gray-500 leading-relaxed">
                                        {config.description}
                                    </p>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* ─── Scheduling Automation ─── */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="px-6 py-5">
                    <div className="flex items-center gap-4 mb-2">
                        <div className="p-3 rounded-xl bg-gradient-to-br from-violet-100 to-indigo-100">
                            <Settings className="w-6 h-6 text-violet-600" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Scheduling Automation</h2>
                            <p className="text-sm text-gray-500 mt-0.5">
                                Automate the transition from job intake/analysis to customer scheduling.
                            </p>
                        </div>
                    </div>

                    <div className="mt-5 space-y-4">
                        <label className="flex items-start gap-3 cursor-pointer p-4 rounded-xl border-2 transition-all border-gray-200 hover:border-violet-300 bg-white">
                            <input
                                type="checkbox"
                                checked={autoApproveScheduling}
                                onChange={(e) => saveAutoApproveScheduling(e.target.checked)}
                                disabled={savingAutoApprove}
                                className="w-4 h-4 text-violet-600 border-gray-300 rounded focus:ring-violet-500 mt-1"
                            />
                            <div className="flex-1">
                                <h4 className="font-bold text-sm text-gray-900 mb-1">Full Auto-Scheduling (No Dispatcher Review)</h4>
                                <p className="text-xs text-gray-500 leading-relaxed">
                                    When a new job is created, automatically generate the AI quote/recommendation and immediately contact the customer to schedule.
                                </p>
                            </div>
                            {savingAutoApprove && <Loader2 className="w-4 h-4 animate-spin text-gray-400 mt-1" />}
                        </label>

                        {autoApproveScheduling && (
                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 space-y-2 animate-fadeIn">
                                <div className="flex gap-2.5 items-start">
                                    <span className="text-lg leading-none">⚠️</span>
                                    <div>
                                        <h5 className="font-bold text-sm text-amber-900">Warning: Risk of Inaccurate Estimates</h5>
                                        <p className="text-xs text-amber-800 leading-relaxed mt-0.5">
                                            Enabling this option bypasses human dispatcher review. AI-generated quotes, material requirements, and estimated labor pricing will be approved automatically and sent directly to the customer. Any AI hallucinations or cost calculation errors will not be caught before contacting the customer.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* How It Works */}
            <div className="bg-gradient-to-br from-gray-50 to-slate-50 rounded-xl border border-gray-200 p-6">
                <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    How Material-Aware Scheduling Works
                </h3>
                <div className="space-y-3 text-xs text-gray-600 leading-relaxed">
                    <div className="flex gap-3">
                        <span className="font-bold text-gray-800 w-5 text-center flex-shrink-0">1.</span>
                        <span>When a quote is approved, the system checks each material line item against your inventory stock levels.</span>
                    </div>
                    <div className="flex gap-3">
                        <span className="font-bold text-gray-800 w-5 text-center flex-shrink-0">2.</span>
                        <span>For out-of-stock items, it uses the vendor's <strong>Estimated Delivery Days</strong> to calculate when materials will arrive.</span>
                    </div>
                    <div className="flex gap-3">
                        <span className="font-bold text-gray-800 w-5 text-center flex-shrink-0">3.</span>
                        <span>In <strong>Wait for Materials</strong> mode, slots start from the latest estimated arrival date. In <strong>In-Stock Only</strong> mode, scheduling is blocked and the customer is notified.</span>
                    </div>
                    <div className="flex gap-3">
                        <span className="font-bold text-gray-800 w-5 text-center flex-shrink-0">4.</span>
                        <span>When blocked jobs' materials arrive (stock is updated), the system automatically unblocks the job and re-initiates scheduling.</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
