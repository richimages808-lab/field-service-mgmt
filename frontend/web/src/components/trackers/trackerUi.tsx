/**
 * trackerUi.tsx - Small shared visual primitives for the tracker registry
 */
import React from 'react';
import { DeviceConnectivity } from '../../lib/trackerDevices';

const STATUS_STYLES: Record<DeviceConnectivity, { dot: string; light: string; dark: string }> = {
    online: { dot: 'bg-emerald-500', light: 'bg-emerald-50 text-emerald-700 border-emerald-200', dark: 'bg-emerald-400/20 text-emerald-200 border-emerald-300/30' },
    idle: { dot: 'bg-amber-400', light: 'bg-amber-50 text-amber-700 border-amber-200', dark: 'bg-amber-400/20 text-amber-200 border-amber-300/30' },
    offline: { dot: 'bg-slate-400', light: 'bg-slate-100 text-slate-600 border-slate-200', dark: 'bg-white/10 text-slate-200 border-white/20' },
    never: { dot: 'bg-slate-300', light: 'bg-slate-50 text-slate-500 border-slate-200', dark: 'bg-white/10 text-slate-300 border-white/20' },
    separated: { dot: 'bg-red-500', light: 'bg-red-50 text-red-700 border-red-200', dark: 'bg-red-500/25 text-red-100 border-red-300/40' }
};

export const StatusDot: React.FC<{ status: DeviceConnectivity }> = ({ status }) => (
    <span className="relative inline-flex w-2.5 h-2.5 shrink-0">
        {(status === 'online' || status === 'separated') && (
            <span className={`absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping ${STATUS_STYLES[status].dot}`} />
        )}
        <span className={`relative inline-flex w-2.5 h-2.5 rounded-full ${STATUS_STYLES[status].dot}`} />
    </span>
);

export const StatusPill: React.FC<{ status: DeviceConnectivity; label: string; dark?: boolean }> = ({ status, label, dark }) => (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold whitespace-nowrap ${dark ? STATUS_STYLES[status].dark : STATUS_STYLES[status].light}`}>
        <StatusDot status={status} />
        {label}
    </span>
);

export const BatteryMini: React.FC<{ percent: number; large?: boolean }> = ({ percent, large }) => {
    const p = Math.max(0, Math.min(100, Math.round(percent)));
    const color = p > 40 ? 'bg-emerald-500' : p > 20 ? 'bg-amber-500' : 'bg-red-500';
    return (
        <span className="inline-flex items-center gap-1.5" title={`${p}% battery`}>
            <span className={`relative ${large ? 'w-24 h-3' : 'w-8 h-2'} rounded-full bg-slate-200 overflow-hidden`}>
                <span className={`absolute inset-y-0 left-0 ${color} rounded-full transition-all duration-700`} style={{ width: `${p}%` }} />
            </span>
            <span className={`${large ? 'text-lg font-black text-slate-900' : 'text-[10px] font-bold text-slate-600'}`}>{p}%</span>
        </span>
    );
};
