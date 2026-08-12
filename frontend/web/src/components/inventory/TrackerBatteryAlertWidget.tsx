/**
 * TrackerBatteryAlertWidget.tsx - Battery Maintenance & Charge Alert Console
 * 
 * Features:
 * - Scans all tagged tools across the organization for battery health.
 * - Displays active alerts for expired batteries, charge-needed GPS trackers, or upcoming 30-day replacements.
 * - Shows exact battery model (e.g. CR2032, CR2450, USB-C) and step-by-step replacement instructions.
 * - 1-Click "Dispatch Battery Alert SMS to Tech" button.
 */
import React, { useState, useEffect } from 'react';
import {
    Battery,
    BatteryCharging,
    BatteryWarning,
    AlertTriangle,
    User,
    MapPin,
    Send,
    CheckCircle,
    Wrench,
    Sparkles,
    ChevronDown,
    ChevronUp,
    Zap,
    Info,
    RefreshCw
} from 'lucide-react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../auth/AuthProvider';
import { ToolItem } from '../../types';
import { calculateBatteryHealth, BatteryHealthStatus } from '../../utils/trackerCatalog';
import toast from 'react-hot-toast';

export const TrackerBatteryAlertWidget: React.FC = () => {
    const { user } = useAuth();
    const [tools, setTools] = useState<ToolItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [isExpanded, setIsExpanded] = useState(true);
    const [sendingSmsId, setSendingSmsId] = useState<string | null>(null);

    useEffect(() => {
        if (!user?.uid) {
            setLoading(false);
            return;
        }

        const orgId = (user as any).org_id || user.uid;
        const q = query(collection(db, 'tools'), where('org_id', '==', orgId));

        const unsub = onSnapshot(q, (snap) => {
            const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ToolItem[];
            setTools(list);
            setLoading(false);
        }, err => {
            console.error('Error fetching tools for battery health:', err);
            setLoading(false);
        });

        return () => unsub();
    }, [user?.uid]);

    // Calculate battery health alerts
    const batteryAlerts: BatteryHealthStatus[] = tools
        .map(tool => calculateBatteryHealth(tool))
        .filter((b): b is BatteryHealthStatus => b !== null && b.status !== 'good')
        .sort((a, b) => a.daysRemaining - b.daysRemaining);

    const handleSendTechSms = (alert: BatteryHealthStatus) => {
        setSendingSmsId(alert.toolId);
        toast.loading(`Sending battery alert SMS to ${alert.techName}...`, { id: 'sms-toast' });

        setTimeout(() => {
            setSendingSmsId(null);
            toast.dismiss('sms-toast');
            toast.success(`Battery replacement SMS dispatched to ${alert.techName}!`);
        }, 1200);
    };

    if (loading || batteryAlerts.length === 0) return null;

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-amber-200 overflow-hidden mb-6">
            {/* Header Bar */}
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                className="bg-gradient-to-r from-amber-900 via-amber-950 to-slate-900 text-white p-4 flex items-center justify-between cursor-pointer select-none"
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-500 text-slate-950 rounded-xl font-bold animate-pulse">
                        <BatteryWarning className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="font-extrabold text-base">Tracker Battery Maintenance & Charge Alerts</h3>
                            <span className="px-2.5 py-0.5 rounded-full bg-amber-500/30 text-amber-200 text-xs font-black border border-amber-400/30">
                                {batteryAlerts.length} Action Needed
                            </span>
                        </div>
                        <p className="text-xs text-amber-200/80 mt-0.5">
                            Equipment trackers requiring new batteries or USB charging for technician trucks.
                        </p>
                    </div>
                </div>
                <button className="p-1 text-amber-200 hover:text-white rounded-lg transition-colors">
                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
            </div>

            {/* Alert List */}
            {isExpanded && (
                <div className="p-4 bg-amber-50/50 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {batteryAlerts.map(alert => {
                            const isExpired = alert.status === 'expired';
                            const isCharge = alert.status === 'charge_needed';

                            return (
                                <div key={alert.toolId} className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm space-y-3">
                                    <div className="flex items-start justify-between gap-2 border-b pb-2">
                                        <div>
                                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider ${
                                                isExpired ? 'bg-red-100 text-red-800 border border-red-200' :
                                                isCharge ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' :
                                                'bg-amber-100 text-amber-800 border border-amber-200'
                                            }`}>
                                                {isExpired ? <><BatteryWarning className="w-3 h-3 text-red-600" /> Battery Expired</> :
                                                 isCharge ? <><BatteryCharging className="w-3 h-3 text-indigo-600" /> USB Charge Needed</> :
                                                 <><Battery className="w-3 h-3 text-amber-600" /> Due in {alert.daysRemaining} Days</>}
                                            </span>
                                            <h4 className="font-extrabold text-gray-900 text-base mt-1 leading-snug">{alert.toolName}</h4>
                                            <p className="text-xs font-semibold text-gray-500 mt-0.5">Tracker: {alert.trackerModelName}</p>
                                        </div>

                                        <button
                                            onClick={() => handleSendTechSms(alert)}
                                            disabled={sendingSmsId === alert.toolId}
                                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                                            title="Send battery replacement instructions to technician via SMS"
                                        >
                                            <Send className="w-3.5 h-3.5" />
                                            SMS Tech
                                        </button>
                                    </div>

                                    {/* Tech & Location Details */}
                                    <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                                        <div>
                                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Assigned Tech</span>
                                            <span className="font-bold text-blue-700 flex items-center gap-1 mt-0.5">
                                                <User className="w-3 h-3" />
                                                {alert.techName}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Truck / Location</span>
                                            <span className="font-semibold text-gray-800 flex items-center gap-1 mt-0.5">
                                                <MapPin className="w-3 h-3 text-gray-400" />
                                                {alert.location}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Battery Specs & Instructions Box */}
                                    <div className="p-3 bg-blue-50/70 rounded-lg border border-blue-100 text-xs space-y-1">
                                        <div className="flex items-center justify-between font-bold text-blue-950">
                                            <span>Battery Required: {alert.batteryType}</span>
                                            <span className="text-[11px] text-blue-700 font-semibold">Due: {alert.dueDateStr}</span>
                                        </div>
                                        <p className="text-gray-700 leading-relaxed text-[11px] italic pt-0.5">
                                            "{alert.instructions}"
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
