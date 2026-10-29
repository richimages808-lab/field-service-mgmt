/**
 * GatewayConnectModal.tsx - Plain-language "get this gateway online" flow for customers
 *
 * - Fetches (claims or creates) the gateway's own broker login via the gatewayConnection callable
 * - Two paths:
 *     "DispatchBox set it up"  → just power it on (default when the unit was prepared before shipping)
 *     "I'll set it up myself"  → the 6 settings to enter in Minew's setup tool, with copy buttons
 * - Live status: watches the gateway's lastSeenAt and turns green on the first message
 */
import React, { useEffect, useState } from 'react';
import {
    X, Router, Loader2, CheckCircle2, Copy, Eye, EyeOff, PackageCheck, Wrench, Plug, Sun, Clock,
    Smartphone, Save, AlertTriangle, ChevronDown, ChevronRight, RefreshCw, Wifi, Download, Shield
} from 'lucide-react';
import toast from 'react-hot-toast';
import { TrackerDevice } from '../../types/trackerDevices';
import { toDateSafe, formatRelative } from '../../lib/trackerDevices';
import { getGatewayConnection, GatewayConnectionSettings, callableErrorMessage } from '../../lib/trackerConnection';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    /** Live gateway document (kept up to date by the registry subscription) */
    gateway: TrackerDevice | null;
    /** True right after the gateway was registered — shows a short success header */
    justRegistered?: boolean;
}

type Mode = 'prepared' | 'self';

const ONLINE_WINDOW_MS = 15 * 60 * 1000;

interface StepProps {
    n: number;
    icon: React.ElementType;
    title: string;
    children: React.ReactNode;
}

const Step: React.FC<StepProps> = ({ n, icon: Icon, title, children }) => (
    <li className="flex gap-3">
        <div className="flex flex-col items-center">
            <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-black flex items-center justify-center shrink-0">{n}</span>
            <span className="flex-1 w-px bg-indigo-100 mt-1" />
        </div>
        <div className="pb-4 min-w-0 flex-1">
            <p className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5"><Icon className="w-4 h-4 text-indigo-600" /> {title}</p>
            <div className="text-xs text-slate-600 mt-1 leading-relaxed">{children}</div>
        </div>
    </li>
);

export const GatewayConnectModal: React.FC<Props> = ({ isOpen, onClose, gateway, justRegistered }) => {
    const [settings, setSettings] = useState<GatewayConnectionSettings | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mode, setMode] = useState<Mode>('prepared');
    const [showPassword, setShowPassword] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [confirmResetOpen, setConfirmResetOpen] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);
    const [, setTick] = useState(0);

    const gatewayId = gateway?.id;
    const isDemo = !!gateway?.isDemo;

    useEffect(() => {
        if (!isOpen || !gatewayId || isDemo) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        setSettings(null);
        setShowPassword(false);
        setHelpOpen(false);
        setConfirmResetOpen(false);
        getGatewayConnection(gatewayId)
            .then(s => {
                if (cancelled) return;
                setSettings(s);
                setMode(s.source === 'prepared' ? 'prepared' : 'self');
            })
            .catch(err => { if (!cancelled) setError(callableErrorMessage(err, 'Could not load the connection settings. Please try again.')); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [isOpen, gatewayId, isDemo]);

    // Re-render every 20s so "last heard" stays fresh
    useEffect(() => {
        if (!isOpen) return;
        const t = setInterval(() => setTick(n => n + 1), 20000);
        return () => clearInterval(t);
    }, [isOpen]);

    // Return null AFTER all hooks have executed
    if (!isOpen) return null;

    const lastSeen = toDateSafe(gateway?.lastSeenAt);
    const online = !!lastSeen && Date.now() - lastSeen.getTime() < ONLINE_WINDOW_MS;

    const copy = (text: string, what: string) => {
        navigator.clipboard.writeText(text);
        toast.success(`${what} copied`);
    };

    const executeResetPassword = async () => {
        if (!gatewayId) return;
        setResetting(true);
        try {
            const s = await getGatewayConnection(gatewayId, 'reset');
            setSettings(s);
            setShowPassword(true);
            setConfirmResetOpen(false);
            toast.success('New password created — enter it on the gateway');
        } catch (err) {
            toast.error(callableErrorMessage(err, 'Could not reset the password'));
        }
        setResetting(false);
    };

    const rows: Array<{ label: string; value: string; display?: string; hint?: string; secret?: boolean }> = settings ? [
        { label: 'Server address', value: settings.host, hint: 'Sometimes called "Host" or "Broker"' },
        { label: 'Port', value: String(settings.port) },
        { label: 'Encryption (SSL/TLS)', value: 'On', hint: 'Must be turned on' },
        { label: 'SSL Mode / Auth', value: 'One-Way / Server Auth', hint: 'Do NOT select Two-Way / Mutual' },
        { label: 'Username', value: settings.username },
        { label: 'Password', value: settings.password, display: showPassword ? settings.password : '•'.repeat(14), secret: true },
        { label: 'Client ID', value: settings.clientId, hint: 'The gateway\'s MAC address' },
    ] : [];

    const copyAll = () => copy(rows.map(r => `${r.label}: ${r.value}`).join('\n'), 'All settings');

    const StatusPanel = (
        <div className={`rounded-2xl border p-4 flex items-center gap-3 transition-colors ${online ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
            {online ? (
                <span className="p-2 rounded-full bg-emerald-500 text-white"><CheckCircle2 className="w-5 h-5" /></span>
            ) : (
                <span className="relative flex w-9 h-9 items-center justify-center">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-30 animate-ping" />
                    <span className="relative p-2 rounded-full bg-indigo-600 text-white"><Wifi className="w-5 h-5" /></span>
                </span>
            )}
            <div className="min-w-0">
                <p className={`text-sm font-black ${online ? 'text-emerald-900' : 'text-slate-900'}`}>
                    {online ? 'Connected — it\'s working!' : 'Waiting for the first signal…'}
                </p>
                <p className="text-xs text-slate-600">
                    {online
                        ? `Last heard ${formatRelative(lastSeen)}. Its location and nearby tags will now update automatically.`
                        : lastSeen
                            ? `Last heard ${formatRelative(lastSeen)}. This updates by itself — no need to refresh.`
                            : 'This updates by itself as soon as the gateway checks in — no need to refresh.'}
                </p>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <div onClick={e => e.stopPropagation()} className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
                <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-xl bg-white/10"><Router className="w-5 h-5" /></div>
                        <div className="min-w-0">
                            <h2 className="text-lg font-black text-white truncate">Connect {gateway?.label || 'Gateway'}</h2>
                            <p className="text-xs text-indigo-200">{justRegistered ? 'Gateway added. Now let\'s get it online.' : 'Get this gateway reporting its location'}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10" aria-label="Close"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-6 space-y-5 overflow-y-auto">
                    {!gateway ? (
                        <div className="py-12 flex flex-col items-center gap-3 text-sm text-slate-500">
                            <Loader2 className="w-7 h-7 animate-spin text-indigo-600" /> Getting this gateway ready…
                        </div>
                    ) : isDemo ? (
                        <p className="text-sm text-slate-600">This is a demo gateway with sample data, so there's nothing to connect.</p>
                    ) : loading ? (
                        <div className="py-12 flex flex-col items-center gap-3 text-sm text-slate-500">
                            <Loader2 className="w-7 h-7 animate-spin text-indigo-600" /> Getting this gateway's connection ready…
                        </div>
                    ) : error ? (
                        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                            <div className="text-sm text-red-800">
                                <p className="font-bold">We couldn't set up the connection</p>
                                <p className="text-xs mt-1">{error}</p>
                            </div>
                        </div>
                    ) : settings && (
                        <>
                            {StatusPanel}

                            <div>
                                <p className="text-xs font-bold text-slate-600 mb-2">How was this gateway set up?</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {([
                                        { key: 'prepared' as Mode, icon: PackageCheck, title: 'DispatchBox set it up', body: 'It arrived ready to go. You just need to power it on.' },
                                        { key: 'self' as Mode, icon: Wrench, title: 'I\'ll set it up myself', body: 'I bought it elsewhere, or need to enter the settings again.' },
                                    ]).map(o => (
                                        <button key={o.key} id={`gw-mode-${o.key}`} type="button" onClick={() => setMode(o.key)}
                                            className={`text-left p-4 rounded-2xl border-2 transition-all ${mode === o.key ? 'border-indigo-500 bg-indigo-50/60 shadow-sm' : 'border-slate-200 hover:border-slate-300'}`}>
                                            <o.icon className={`w-5 h-5 ${mode === o.key ? 'text-indigo-600' : 'text-slate-400'}`} />
                                            <p className="mt-2 text-sm font-extrabold text-slate-900">{o.title}</p>
                                            <p className="text-[11px] text-slate-600 mt-0.5">{o.body}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {mode === 'prepared' ? (
                                <div className="space-y-3">
                                    {settings.source !== 'prepared' && (
                                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
                                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                            <span>
                                                We don't have a record of setting up a gateway with MAC <strong className="font-mono">{settings.clientId}</strong>.
                                                Check that it matches the label on the gateway (edit the gateway to fix it), or choose <button type="button" className="font-bold underline" onClick={() => setMode('self')}>I'll set it up myself</button>.
                                            </span>
                                        </div>
                                    )}
                                    <ol>
                                        <Step n={1} icon={Plug} title="Power it on">Connect the gateway to power in the vehicle. A light on the gateway shows it's on.</Step>
                                        <Step n={2} icon={Sun} title="Park outside">Give it a clear view of the sky so it can find its GPS position. Garages and tunnels block the signal.</Step>
                                        <Step n={3} icon={Clock} title="Wait a few minutes">The box at the top turns green when the first signal arrives, usually within 5 minutes.</Step>
                                    </ol>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <ol>
                                        <Step n={1} icon={Smartphone} title="Open Minew's setup tool">Use the setup app or tool from Minew (see the gateway's box or Minew's website) and connect to the gateway. Stand close to it.</Step>
                                        <Step n={2} icon={Wrench} title="Find the MQTT or server settings, and enter these">
                                            <div className="mt-2 rounded-xl border border-slate-200 divide-y overflow-hidden">
                                                {rows.map(r => (
                                                    <div key={r.label} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] gap-2 items-center px-3 py-2 bg-white">
                                                        <div>
                                                            <p className="text-[11px] font-bold text-slate-700">{r.label}</p>
                                                            {r.hint && <p className="text-[10px] text-slate-400 leading-tight">{r.hint}</p>}
                                                        </div>
                                                        <code className="text-xs font-mono text-slate-900 break-all">{r.display ?? r.value}</code>
                                                        <div className="flex items-center gap-1">
                                                            {r.secret && (
                                                                <button type="button" onClick={() => setShowPassword(s => !s)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                                                                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                                </button>
                                                            )}
                                                            {r.label !== 'Encryption (SSL/TLS)' && (
                                                                <button type="button" onClick={() => copy(r.value, r.label)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" aria-label={`Copy ${r.label}`}>
                                                                    <Copy className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                                <button id="gw-copy-all" type="button" onClick={copyAll} className="text-[11px] font-bold text-indigo-600 hover:underline flex items-center gap-1"><Copy className="w-3 h-3" /> Copy all settings</button>
                                                <button id="gw-reset-password" type="button" onClick={() => setConfirmResetOpen(true)} disabled={resetting} className="text-[11px] font-bold text-slate-500 hover:text-slate-700 hover:underline flex items-center gap-1 disabled:opacity-50">
                                                    <RefreshCw className={`w-3 h-3 ${resetting ? 'animate-spin' : ''}`} /> Reset password
                                                </button>
                                            </div>

                                            <div className="mt-3 p-3 rounded-xl bg-blue-50/90 border border-blue-200 text-xs text-blue-950 space-y-2">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <span className="font-extrabold flex items-center gap-1.5 text-blue-900">
                                                        <Shield className="w-4 h-4 text-blue-600 shrink-0" />
                                                        Did Minew ask for a CA Certificate?
                                                    </span>
                                                    <a
                                                        href="/emqx-ca.crt"
                                                        download="emqx-ca.crt"
                                                        id="gw-download-ca-cert"
                                                        className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] flex items-center gap-1 shadow-sm transition-colors"
                                                    >
                                                        <Download className="w-3.5 h-3.5" /> Download Root CA (.crt)
                                                    </a>
                                                </div>
                                                <p className="text-[11px] text-blue-800 leading-relaxed">
                                                    <strong>Option 1 (Fastest):</strong> In Minew SSL settings, check for <em>Verify CA</em> or <em>Verify Server</em> and toggle it <strong>OFF / None</strong>. The gateway will connect with encryption immediately.
                                                    <br />
                                                    <strong>Option 2 (Upload CA):</strong> If Minew requires a file, download the official DigiCert Global Root G2 certificate button above and select it in Minew. (Never select Two-Way / Client Certificate).
                                                </p>
                                            </div>
                                            {confirmResetOpen && (
                                                <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-2">
                                                    <p className="font-bold">Create a new password for this gateway?</p>
                                                    <p className="text-[11px] text-amber-700">The gateway will stop reporting until you enter the new password in Minew's setup tool.</p>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            id="gw-confirm-reset-password-btn"
                                                            onClick={executeResetPassword}
                                                            disabled={resetting}
                                                            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center gap-1"
                                                        >
                                                            {resetting ? <RefreshCw className="w-3 h-3 animate-spin" /> : null} Yes, Reset Password
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setConfirmResetOpen(false)}
                                                            className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-amber-100 font-bold text-xs"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </Step>
                                        <Step n={3} icon={Save} title="Save and restart the gateway">Save the settings in the app, then restart the gateway. The box at the top turns green when it connects.</Step>
                                    </ol>
                                    <p className="text-[11px] text-slate-500">These settings only work for this gateway. Keep them private.</p>
                                </div>
                            )}

                            <div className="rounded-2xl border border-slate-200">
                                <button type="button" onClick={() => setHelpOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 text-xs font-bold text-slate-700">
                                    Still waiting after 10 minutes?
                                    {helpOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                </button>
                                {helpOpen && (
                                    <ul className="px-4 pb-4 text-xs text-slate-600 space-y-1.5 list-disc pl-8">
                                        <li>Check that the gateway has power and its light is on.</li>
                                        <li>Move the vehicle outside, away from garages and metal roofs.</li>
                                        <li>Make sure the gateway has cell service (an active SIM card).</li>
                                        <li>Make sure the MAC address in DispatchBox matches the label on the gateway: <strong className="font-mono">{settings.clientId}</strong>.</li>
                                        {mode === 'self' && <li>Re-check each setting, especially that SSL/TLS is <strong>on</strong> and the password has no extra spaces.</li>}
                                        <li>Still stuck? Contact DispatchBox support and tell us the MAC address above.</li>
                                    </ul>
                                )}
                            </div>
                        </>
                    )}
                </div>

                <div className="px-6 py-4 border-t bg-slate-50 flex justify-end">
                    <button id="gw-connect-done" type="button" onClick={onClose} className={`px-5 py-2 rounded-xl text-sm font-bold ${online ? 'text-white bg-emerald-600 hover:bg-emerald-700' : 'text-slate-700 hover:bg-slate-200'}`}>
                        {online ? 'Done' : 'I\'ll finish this later'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GatewayConnectModal;
