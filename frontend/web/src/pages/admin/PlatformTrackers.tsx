/**
 * PlatformTrackers.tsx - Site admin: tracker broker & gateway logins
 *
 * - Broker status (EMQX API configured), public broker address customers see
 * - Prepare gateways before shipping (creates a per-gateway login, org claims it on registration)
 * - Every gateway login across orgs: claimed by, last message, reveal settings, remove unclaimed
 * - Broker → DispatchBox forwarding rule settings + platform key rotation
 * - Accepted payload formats, curl test, history policy (moved here from the customer UI)
 */
import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
    ArrowLeft, Radio, Server, KeyRound, PackagePlus, Copy, Loader2, CheckCircle2, AlertTriangle, RefreshCw,
    Eye, Trash2, Clock, Save, X
} from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { functions } from '../../firebase';
import { TRACKING_POLICY, formatRelative } from '../../lib/trackerDevices';
import { trackerPlatformAdmin, PlatformOverview, GatewayConnectionSettings, callableErrorMessage } from '../../lib/trackerConnection';

const RULE_SQL = 'SELECT topic, clientid, username, payload FROM "#"';

const SAMPLE_NORMALIZED = `{
  "gateway": { "mac": "AC:23:3F:C0:12:34", "lat": 21.3245, "lng": -157.884,
               "speedKph": 42, "ignition": true, "battery": 100 },
  "tags": [
    { "mac": "AC:23:3F:88:99:A1", "rssi": -61, "battery": 82 },
    { "mac": "AC:23:3F:88:99:A2", "rssi": -70 }
  ]
}`;

const SAMPLE_MINEW = `[
  { "type": "Gateway", "mac": "AC233FC01234",
    "latitude": 21.3245, "longitude": -157.884, "timestamp": "2026-10-21T14:05:00Z" },
  { "type": "iBeacon", "mac": "AC233F8899A1", "rssi": -61, "battery": 2950 },
  { "type": "iBeacon", "mac": "AC233F8899A2", "rssi": -70 }
]`;

const settingsText = (s: GatewayConnectionSettings) =>
    `Server address: ${s.host}\nPort: ${s.port}\nEncryption (SSL/TLS): On\nUsername: ${s.username}\nPassword: ${s.password}\nClient ID: ${s.clientId}`;

export const PlatformTrackers: React.FC = () => {
    const { user } = useAuth();
    const isSiteAdmin = (user as any)?.site_admin === true || user?.email?.toLowerCase() === 'rich@richheaton.com';

    const [overview, setOverview] = useState<PlatformOverview | null>(null);
    const [loading, setLoading] = useState(true);
    const [host, setHost] = useState('');
    const [port, setPort] = useState('8883');
    const [savingBroker, setSavingBroker] = useState(false);
    const [macInput, setMacInput] = useState('');
    const [batchLabel, setBatchLabel] = useState('');
    const [preparing, setPreparing] = useState(false);
    const [prepared, setPrepared] = useState<Array<GatewayConnectionSettings & { alreadyExisted: boolean }>>([]);
    const [revealed, setRevealed] = useState<GatewayConnectionSettings | null>(null);
    const [busyMac, setBusyMac] = useState<string | null>(null);
    const [newKey, setNewKey] = useState<string | null>(null);
    const [rotating, setRotating] = useState(false);
    const [tab, setTab] = useState<'normalized' | 'minew'>('minew');

    const load = async () => {
        setLoading(true);
        try {
            const o = await trackerPlatformAdmin<PlatformOverview>('overview');
            setOverview(o);
            setHost(o.broker.host || '');
            setPort(String(o.broker.port || 8883));
        } catch (err) {
            toast.error(callableErrorMessage(err, 'Could not load tracker platform status'));
        }
        setLoading(false);
    };

    useEffect(() => { if (isSiteAdmin) load(); }, [isSiteAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!isSiteAdmin) return <Navigate to="/" replace />;

    const projectId = functions.app.options.projectId;
    const endpoint = `https://us-central1-${projectId}.cloudfunctions.net/ingestTrackerTelemetry`;

    const copy = (text: string, what: string) => { navigator.clipboard.writeText(text); toast.success(`${what} copied`); };

    const saveBroker = async () => {
        setSavingBroker(true);
        try {
            await trackerPlatformAdmin('saveBroker', { host, port: Number(port) });
            toast.success('Broker address saved');
            load();
        } catch (err) { toast.error(callableErrorMessage(err, 'Could not save')); }
        setSavingBroker(false);
    };

    const prepare = async () => {
        const macs = macInput.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
        if (!macs.length) return toast.error('Enter at least one MAC address');
        setPreparing(true);
        try {
            const res = await trackerPlatformAdmin<{ prepared: Array<GatewayConnectionSettings & { alreadyExisted: boolean }> }>('prepare', { macs, label: batchLabel || null });
            setPrepared(res.prepared);
            setMacInput('');
            toast.success(`${res.prepared.length} gateway login(s) ready`);
            load();
        } catch (err) { toast.error(callableErrorMessage(err, 'Could not prepare gateways')); }
        setPreparing(false);
    };

    const reveal = async (mac: string) => {
        setBusyMac(mac);
        try { setRevealed(await trackerPlatformAdmin<GatewayConnectionSettings>('reveal', { mac })); }
        catch (err) { toast.error(callableErrorMessage(err, 'Could not load settings')); }
        setBusyMac(null);
    };

    const remove = async (mac: string) => {
        if (!window.confirm(`Delete the login for ${mac}? A unit loaded with these settings will stop connecting.`)) return;
        setBusyMac(mac);
        try { await trackerPlatformAdmin('remove', { mac }); toast.success('Login removed'); load(); }
        catch (err) { toast.error(callableErrorMessage(err, 'Could not remove')); }
        setBusyMac(null);
    };

    const rotateKey = async () => {
        if (overview?.platformKey && !window.confirm('Generate a new forwarding key? The current key stops working immediately. You must paste the new key into the EMQX rule\'s x-dispatchbox-key header right away, or no gateway data will arrive.')) return;
        setRotating(true);
        try {
            const res = await trackerPlatformAdmin<{ key: string }>('rotatePlatformKey');
            setNewKey(res.key);
            toast.success('New forwarding key generated');
            load();
        } catch (err) { toast.error(callableErrorMessage(err, 'Could not generate key')); }
        setRotating(false);
    };

    const curl = `curl -X POST "${endpoint}" \\\n  -H "Content-Type: application/json" \\\n  -H "x-dispatchbox-key: ${newKey || 'YOUR_KEY'}" \\\n  -d '${(tab === 'normalized' ? SAMPLE_NORMALIZED : SAMPLE_MINEW).replace(/\n\s*/g, ' ')}'`;

    const card = 'bg-white rounded-2xl border border-gray-200 shadow-sm p-5';
    const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500';

    const SettingsBlock: React.FC<{ s: GatewayConnectionSettings; note?: string }> = ({ s, note }) => (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-xs font-black text-gray-900 font-mono">{s.clientId}{note && <span className="ml-2 font-sans font-bold text-amber-600">{note}</span>}</p>
                <button onClick={() => copy(settingsText(s), 'Settings')} className="text-[11px] font-bold text-indigo-600 hover:underline flex items-center gap-1"><Copy className="w-3 h-3" /> Copy</button>
            </div>
            <pre className="text-[11px] font-mono text-gray-700 whitespace-pre-wrap">{settingsText(s)}</pre>
        </div>
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/40">
            <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200/60 sticky top-0 z-10">
                <div className="px-4 sm:px-5 lg:px-6 py-4 flex items-center gap-4">
                    <Link to="/site-admin" className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-5 h-5" /></Link>
                    <div className="bg-gradient-to-br from-indigo-500 to-cyan-600 p-2.5 rounded-xl shadow-lg shadow-indigo-200/50"><Radio className="w-6 h-6 text-white" /></div>
                    <div>
                        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-cyan-600">Tracker Platform</h1>
                        <p className="text-sm text-gray-500">Broker, gateway logins, and the data feed into DispatchBox</p>
                    </div>
                    <button onClick={load} disabled={loading} className="ml-auto px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium flex items-center gap-1.5 disabled:opacity-50">
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
                    </button>
                </div>
            </div>

            <div className="px-4 sm:px-5 lg:px-6 py-6 space-y-6 max-w-6xl">
                {/* Status */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className={card}>
                        <p className="text-[11px] font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5"><Server className="w-3.5 h-3.5" /> Broker API</p>
                        {loading && !overview ? <Loader2 className="w-5 h-5 animate-spin text-indigo-500 mt-3" /> : overview?.apiConfigured ? (
                            <p className="mt-2 text-sm font-bold text-emerald-700 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Connected</p>
                        ) : (
                            <p className="mt-2 text-sm font-bold text-red-700 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Not configured</p>
                        )}
                        <p className="text-[11px] text-gray-500 mt-1">Set EMQX_API_BASE, EMQX_API_KEY and EMQX_API_SECRET in <code>functions/.env.{projectId}</code>, then redeploy functions.</p>
                    </div>
                    <div className={card}>
                        <p className="text-[11px] font-black uppercase tracking-wider text-gray-400">Broker address customers see</p>
                        <div className="mt-2 grid grid-cols-[1fr_5rem] gap-2">
                            <input id="trkp-host" className={inputCls} value={host} onChange={e => setHost(e.target.value)} placeholder="xxxx.emqxsl.com" />
                            <input id="trkp-port" className={inputCls} value={port} onChange={e => setPort(e.target.value)} placeholder="8883" />
                        </div>
                        <button id="trkp-save-broker" onClick={saveBroker} disabled={savingBroker} className="mt-2 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50">
                            {savingBroker ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
                        </button>
                    </div>
                    <div className={card}>
                        <p className="text-[11px] font-black uppercase tracking-wider text-gray-400 flex items-center gap-1.5"><KeyRound className="w-3.5 h-3.5" /> Forwarding key</p>
                        {overview?.platformKey ? (
                            <>
                                <p className="mt-2 text-sm font-bold text-gray-900">{overview.platformKey.last4 ? `Ends in …${overview.platformKey.last4}` : 'Active'}</p>
                                <p className="text-[11px] text-gray-500">Last used {overview.platformKey.lastUsedAt ? formatRelative(new Date(overview.platformKey.lastUsedAt)) : 'never'}</p>
                            </>
                        ) : <p className="mt-2 text-sm font-bold text-amber-700">No platform key yet</p>}
                        <button id="trkp-rotate-key" onClick={rotateKey} disabled={rotating} className="mt-2 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50">
                            {rotating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />} {overview?.platformKey ? 'Rotate key' : 'Generate key'}
                        </button>
                    </div>
                </div>

                {newKey && (
                    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
                        <p className="text-sm font-bold text-amber-900">Copy this key now. It won't be shown again.</p>
                        <div className="mt-2 flex items-center gap-2">
                            <code className="flex-1 px-3 py-2 rounded-xl bg-white border border-amber-200 text-xs font-mono break-all">{newKey}</code>
                            <button onClick={() => copy(newKey, 'Key')} className="p-2 rounded-lg border border-amber-200 bg-white hover:bg-amber-100"><Copy className="w-4 h-4" /></button>
                        </div>
                        <p className="text-[11px] text-amber-800 mt-2">Paste it into the EMQX rule action's <code>x-dispatchbox-key</code> header (see "Broker → DispatchBox forwarding" below).</p>
                    </div>
                )}

                {/* Prepare */}
                <div className={card}>
                    <h2 className="text-base font-bold text-gray-900 flex items-center gap-2"><PackagePlus className="w-5 h-5 text-indigo-600" /> Prepare gateways for shipping</h2>
                    <p className="text-xs text-gray-500 mt-1">Creates a login for each unit. Load the settings into the unit with Minew's setup tool before it ships. When the customer adds that MAC address, the gateway joins their account automatically, and they only need to power it on.</p>
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-[1fr_16rem] gap-3">
                        <textarea id="trkp-macs" rows={3} className={`${inputCls} font-mono`} value={macInput} onChange={e => setMacInput(e.target.value)} placeholder={'AC:23:3F:C0:12:34\nAC:23:3F:C0:12:35'} />
                        <div className="space-y-2">
                            <input id="trkp-batch-label" className={inputCls} value={batchLabel} onChange={e => setBatchLabel(e.target.value)} placeholder="Note (optional), e.g. Island Flow order #12" />
                            <button id="trkp-prepare" onClick={prepare} disabled={preparing || !overview?.apiConfigured} className="w-full px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                                {preparing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackagePlus className="w-4 h-4" />} Create logins
                            </button>
                        </div>
                    </div>
                    {prepared.length > 0 && (
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                            {prepared.map(p => <SettingsBlock key={p.username} s={p} note={p.alreadyExisted ? 'already existed' : undefined} />)}
                        </div>
                    )}
                </div>

                {/* Logins table */}
                <div className={card}>
                    <h2 className="text-base font-bold text-gray-900">Gateway logins ({overview?.gateways.length ?? 0})</h2>
                    {revealed && (
                        <div className="mt-3 relative">
                            <button onClick={() => setRevealed(null)} className="absolute top-2 right-2 p-1 rounded hover:bg-gray-200" aria-label="Close"><X className="w-3.5 h-3.5" /></button>
                            <SettingsBlock s={revealed} />
                        </div>
                    )}
                    <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b">
                                    <th className="py-2 pr-3">MAC</th><th className="py-2 pr-3">Set up by</th><th className="py-2 pr-3">Organization</th>
                                    <th className="py-2 pr-3">Gateway</th><th className="py-2 pr-3">Last message</th><th className="py-2" />
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {(overview?.gateways || []).map(g => (
                                    <tr key={g.username}>
                                        <td className="py-2 pr-3 font-mono text-xs">{g.mac}{g.label && <p className="font-sans text-[10px] text-gray-400">{g.label}</p>}</td>
                                        <td className="py-2 pr-3 text-xs">{g.source === 'prepared' ? <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold">DispatchBox</span> : <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-bold">Customer</span>}</td>
                                        <td className="py-2 pr-3 text-xs">{g.orgName || <span className="text-amber-600 font-bold">Not claimed yet</span>}</td>
                                        <td className="py-2 pr-3 text-xs">{g.deviceLabel || '-'}</td>
                                        <td className="py-2 pr-3 text-xs text-gray-500"><Clock className="w-3 h-3 inline mr-1" />{g.lastMessageAt ? formatRelative(new Date(g.lastMessageAt)) : 'never'}</td>
                                        <td className="py-2 text-right whitespace-nowrap">
                                            <button onClick={() => reveal(g.mac)} disabled={busyMac === g.mac} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Show settings"><Eye className="w-4 h-4" /></button>
                                            {!g.orgId && <button onClick={() => remove(g.mac)} disabled={busyMac === g.mac} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500" title="Delete login"><Trash2 className="w-4 h-4" /></button>}
                                        </td>
                                    </tr>
                                ))}
                                {!loading && (overview?.gateways.length ?? 0) === 0 && (
                                    <tr><td colSpan={6} className="py-6 text-center text-xs text-gray-400">No gateway logins yet.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Forwarding rule */}
                <div className={card}>
                    <h2 className="text-base font-bold text-gray-900 flex items-center gap-2"><Server className="w-5 h-5 text-emerald-600" /> Broker → DispatchBox forwarding (EMQX rule)</h2>
                    <p className="text-xs text-gray-500 mt-1">One rule for all customers. DispatchBox works out which company each message belongs to from the gateway's own login (<code>username</code>), never from the message content.</p>
                    <div className="mt-3 space-y-2">
                        {[
                            { label: 'Rule SQL', value: RULE_SQL },
                            { label: 'Action → HTTP Server → URL', value: endpoint },
                            { label: 'Method', value: 'POST' },
                            { label: 'Headers', value: `content-type: application/json\nx-dispatchbox-key: ${newKey || '<forwarding key>'}` },
                            { label: 'Body', value: '(leave empty: EMQX sends topic, clientid, username & payload as JSON)' },
                        ].map(row => (
                            <div key={row.label} className="grid grid-cols-[170px_1fr_auto] gap-2 items-start">
                                <span className="text-[11px] font-bold text-gray-700 pt-1.5">{row.label}</span>
                                <code className="px-2 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-[11px] font-mono text-gray-800 whitespace-pre-wrap break-all">{row.value}</code>
                                <button onClick={() => copy(row.value, row.label)} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50" aria-label={`Copy ${row.label}`}><Copy className="w-3.5 h-3.5" /></button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Payloads */}
                <div className={card}>
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-base font-bold text-gray-900">Accepted payloads</h2>
                        <div className="flex bg-gray-100 p-1 rounded-lg text-[11px] font-bold">
                            <button onClick={() => setTab('minew')} className={`px-2.5 py-1 rounded-md ${tab === 'minew' ? 'bg-white shadow-sm text-indigo-700' : 'text-gray-500'}`}>Minew Array</button>
                            <button onClick={() => setTab('normalized')} className={`px-2.5 py-1 rounded-md ${tab === 'normalized' ? 'bg-white shadow-sm text-indigo-700' : 'text-gray-500'}`}>Normalized</button>
                        </div>
                    </div>
                    <pre className="px-4 py-3 rounded-xl bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto">{tab === 'normalized' ? SAMPLE_NORMALIZED : SAMPLE_MINEW}</pre>
                    <div className="mt-2 flex items-start gap-2">
                        <pre className="flex-1 px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-gray-700 text-[10px] font-mono overflow-x-auto whitespace-pre-wrap break-all">{curl}</pre>
                        <button onClick={() => copy(curl, 'Test command')} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50" title="Copy curl test"><Copy className="w-4 h-4" /></button>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-2">Direct HTTP posts (no broker) use an organization key and match gateways by the MAC in the payload.</p>
                </div>

                {/* Policy */}
                <div className="rounded-2xl bg-indigo-50 border border-indigo-200 p-5">
                    <p className="text-sm font-bold text-indigo-900 flex items-center gap-1.5"><Clock className="w-4 h-4" /> History policy</p>
                    <ul className="mt-2 text-xs text-indigo-900/80 space-y-1 list-disc pl-5">
                        <li>Gateways: a point every <strong>{TRACKING_POLICY.gatewayMovingIntervalMin} min</strong> while moving, every <strong>{TRACKING_POLICY.gatewayStationaryIntervalMin} min</strong> while parked.</li>
                        <li>Tags: a point every <strong>{TRACKING_POLICY.tagMovingIntervalMin} min</strong> while moving, every <strong>{TRACKING_POLICY.tagStationaryIntervalMin} min</strong> while parked.</li>
                        <li>History is kept for <strong>{TRACKING_POLICY.retentionDays} days</strong>, then deleted automatically.</li>
                        <li>Unregistered tags a gateway hears appear under it as "Detected Nearby".</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default PlatformTrackers;
