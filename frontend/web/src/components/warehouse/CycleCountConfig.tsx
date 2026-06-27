import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../auth/AuthProvider';
import {
    RefreshCcw, Save, Clock, BarChart3, Settings,
    Loader2, Info, CheckCircle2, Tag
} from 'lucide-react';
import toast from 'react-hot-toast';

/* ═══════════════════════════════════════════════════════════
 *  CYCLE COUNT CONFIG
 *  ABC classification setup and scheduling.
 *  Inspired by Fishbowl's cycle count scheduler and
 *  NetSuite's ABC classification system.
 * ═══════════════════════════════════════════════════════════ */

interface CycleCountConfigProps {
    currentConfig?: {
        enabled: boolean;
        classificationMethod: 'unit_cost' | 'monthly_usage' | 'manual';
        aFrequencyDays: number;
        bFrequencyDays: number;
        cFrequencyDays: number;
        scheduleDay?: number;
        varianceThreshold: number;
    };
    materialCounts?: { a: number; b: number; c: number; unclassified: number };
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const CycleCountConfig: React.FC<CycleCountConfigProps> = ({ currentConfig, materialCounts }) => {
    const { user } = useAuth();
    const [saving, setSaving] = useState(false);
    const [config, setConfig] = useState({
        enabled: currentConfig?.enabled ?? false,
        classificationMethod: currentConfig?.classificationMethod ?? 'unit_cost' as 'unit_cost' | 'monthly_usage' | 'manual',
        aFrequencyDays: currentConfig?.aFrequencyDays ?? 7,
        bFrequencyDays: currentConfig?.bFrequencyDays ?? 30,
        cFrequencyDays: currentConfig?.cFrequencyDays ?? 90,
        scheduleDay: currentConfig?.scheduleDay ?? 1,
        varianceThreshold: currentConfig?.varianceThreshold ?? 5,
    });

    useEffect(() => {
        if (currentConfig) {
            setConfig({
                enabled: currentConfig.enabled,
                classificationMethod: currentConfig.classificationMethod,
                aFrequencyDays: currentConfig.aFrequencyDays,
                bFrequencyDays: currentConfig.bFrequencyDays,
                cFrequencyDays: currentConfig.cFrequencyDays,
                scheduleDay: currentConfig.scheduleDay ?? 1,
                varianceThreshold: currentConfig.varianceThreshold,
            });
        }
    }, [currentConfig]);

    const handleSave = async () => {
        if (!user?.org_id) return;
        setSaving(true);
        try {
            await updateDoc(doc(db, 'organizations', user.org_id), {
                cycleCountConfig: config,
            });
            toast.success('Cycle count configuration saved');
        } catch (err: any) {
            toast.error(`Save failed: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const counts = materialCounts || { a: 0, b: 0, c: 0, unclassified: 0 };

    return (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-gray-200">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                            <RefreshCcw className="w-5 h-5 text-teal-600" />
                            Cycle Count Schedule
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">Configure automatic cycle count scheduling using ABC analysis</p>
                    </div>
                    <button
                        onClick={() => setConfig({ ...config, enabled: !config.enabled })}
                        className={`w-12 h-6 rounded-full transition-colors flex items-center ${config.enabled ? 'bg-teal-600' : 'bg-gray-300'}`}
                    >
                        <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${config.enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
                    </button>
                </div>
            </div>

            {config.enabled && (
                <div className="p-5 space-y-6">
                    {/* ABC Classification Method */}
                    <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-2">Classification Method</label>
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { value: 'unit_cost', label: 'By Unit Cost', desc: 'High-cost items counted most often' },
                                { value: 'monthly_usage', label: 'By Monthly Usage', desc: 'Fast-moving items counted most often' },
                                { value: 'manual', label: 'Manual Assignment', desc: 'You assign A/B/C per material' },
                            ].map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setConfig({ ...config, classificationMethod: opt.value as any })}
                                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                                        config.classificationMethod === opt.value
                                            ? 'border-teal-500 bg-teal-50'
                                            : 'border-gray-200 hover:border-gray-300'
                                    }`}
                                >
                                    <p className="text-sm font-semibold text-gray-900">{opt.label}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ABC Frequency Settings */}
                    <div>
                        <label className="text-xs font-semibold text-gray-600 block mb-3">Count Frequency by Class</label>
                        <div className="space-y-3">
                            {[
                                { key: 'aFrequencyDays', cls: 'A', color: 'red', desc: 'High-value / High-velocity', count: counts.a },
                                { key: 'bFrequencyDays', cls: 'B', color: 'amber', desc: 'Medium-value / Medium-velocity', count: counts.b },
                                { key: 'cFrequencyDays', cls: 'C', color: 'emerald', desc: 'Low-value / Slow-moving', count: counts.c },
                            ].map(item => (
                                <div key={item.cls} className="flex items-center gap-4 bg-gray-50 rounded-xl p-4">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-lg bg-${item.color}-100 text-${item.color}-700`}>
                                        {item.cls}
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-semibold text-gray-900">{item.desc}</p>
                                        <p className="text-xs text-gray-500">{item.count} material{item.count !== 1 ? 's' : ''}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-500">Every</span>
                                        <input
                                            type="number"
                                            value={(config as any)[item.key]}
                                            onChange={e => setConfig({ ...config, [item.key]: parseInt(e.target.value) || 1 })}
                                            className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center font-mono"
                                            min={1} max={365}
                                        />
                                        <span className="text-xs text-gray-500">days</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Schedule Day */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-semibold text-gray-600 block mb-1">
                                <Clock className="w-3 h-3 inline mr-1" />Preferred Count Day
                            </label>
                            <select
                                value={config.scheduleDay}
                                onChange={e => setConfig({ ...config, scheduleDay: parseInt(e.target.value) })}
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white"
                            >
                                {DAY_NAMES.map((day, i) => (
                                    <option key={i} value={i}>{day}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-600 block mb-1">
                                <BarChart3 className="w-3 h-3 inline mr-1" />Variance Recount Threshold
                            </label>
                            <div className="relative">
                                <input
                                    type="number"
                                    value={config.varianceThreshold}
                                    onChange={e => setConfig({ ...config, varianceThreshold: parseInt(e.target.value) || 0 })}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm pr-8"
                                    min={0} max={100}
                                />
                                <span className="absolute right-3 top-3 text-xs text-gray-400">%</span>
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">Variances above this % will be flagged for recount</p>
                        </div>
                    </div>

                    {/* Unclassified Warning */}
                    {counts.unclassified > 0 && config.classificationMethod === 'manual' && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                            <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium text-amber-800">
                                    {counts.unclassified} material{counts.unclassified !== 1 ? 's' : ''} not classified
                                </p>
                                <p className="text-xs text-amber-600">
                                    Assign an ABC class in the Materials Inventory to include them in cycle counts.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Save */}
                    <div className="flex justify-end">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex items-center gap-2 px-6 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white rounded-lg text-sm font-bold transition-colors"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Save Configuration
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
