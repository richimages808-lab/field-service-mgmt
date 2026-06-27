import React, { useState, useEffect } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { db } from '../../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import {
    CalendarCheck, Package, PackageCheck, Truck, CheckCircle2, ArrowLeft,
    Settings, Info, Loader2
} from 'lucide-react';
import { Link } from 'react-router-dom';

type MaterialSchedulingMode = 'allow_all' | 'estimated_availability' | 'in_stock_only';
type DefaultSchedulingChannel = 'phone' | 'text' | 'email';

export const SchedulingRules: React.FC = () => {
    const { user } = useAuth();
    const orgId = user?.org_id;
    const [loading, setLoading] = useState(true);

    // Material scheduling mode
    const [materialSchedulingMode, setMaterialSchedulingMode] = useState<MaterialSchedulingMode>('allow_all');
    const [savingMaterialMode, setSavingMaterialMode] = useState(false);

    // Default scheduling channel
    const [defaultChannel, setDefaultChannel] = useState<DefaultSchedulingChannel>('email');
    const [savingChannel, setSavingChannel] = useState(false);

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

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-8">
            {/* Header */}
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
