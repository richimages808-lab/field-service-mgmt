/**
 * TrackerDeviceRegistry.tsx - Hierarchical tracker registry (Type → Device → Tag)
 *
 * - Left: collapsible tree of tracker types in use, the org's registered devices under each type,
 *   and the BLE tags assigned under each gateway (plus an "Unassigned Tags" bucket)
 * - Right: drill-down detail for the selected device, a type summary, or a fleet overview
 * - Register / edit devices, connect gateways (per-gateway broker login), and load a sandbox demo fleet
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Router, Tag as TagIcon, Radio, ChevronRight, ChevronDown, Search, Plus, Sparkles, Loader2,
    Layers, AlertTriangle, BatteryWarning, WifiOff, Trash2, Boxes, Activity, Wrench, X
} from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { db } from '../../firebase';
import { useAuth } from '../../auth/AuthProvider';
import { TrackerDevice } from '../../types/trackerDevices';
import {
    subscribeTrackerDevices, getModel, getDeviceStatus, estimateDeviceBattery, seedDemoFleet, removeDemoFleet,
    deleteTrackerDevice, formatRelative, TRACKING_POLICY
} from '../../lib/trackerDevices';
import { TrackerDeviceDetail } from './TrackerDeviceDetail';
import { TrackerDeviceFormModal, TrackerFormPrefill } from './TrackerDeviceFormModal';
import { GatewayConnectModal } from './GatewayConnectModal';
import { StatusDot, StatusPill, BatteryMini } from './trackerUi';

type FilterKey = 'all' | 'gateways' | 'tags' | 'attention';

const TYPE_COLORS: Record<string, string> = {
    gps_cellular: 'from-indigo-500 to-blue-600',
    ble_beacon: 'from-cyan-500 to-teal-600',
    find_my: 'from-slate-700 to-slate-900',
    tool_brand: 'from-red-500 to-rose-600',
    tile: 'from-emerald-500 to-green-600',
    android_find: 'from-violet-500 to-purple-600'
};

export const TrackerDeviceRegistry: React.FC = () => {
    const { user } = useAuth();
    const orgId: string = (user as any)?.org_id || user?.uid || '';
    const [searchParams, setSearchParams] = useSearchParams();

    const [devices, setDevices] = useState<TrackerDevice[]>([]);
    const [loading, setLoading] = useState(true);
    const [people, setPeople] = useState<Array<{ id: string; name: string }>>([]);
    const [tools, setTools] = useState<Array<{ id: string; name: string }>>([]);

    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<FilterKey>('all');
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<TrackerDevice | null>(null);
    const [prefill, setPrefill] = useState<TrackerFormPrefill | null>(null);
    const [connect, setConnect] = useState<{ id: string; justRegistered: boolean } | null>(null);
    const [demoBusy, setDemoBusy] = useState<string | null>(null);
    const [confirmClearDemoOpen, setConfirmClearDemoOpen] = useState(false);
    const [deviceToDelete, setDeviceToDelete] = useState<TrackerDevice | null>(null);
    const [deleteRowChildrenToo, setDeleteRowChildrenToo] = useState(false);
    const [deletingDeviceId, setDeletingDeviceId] = useState<string | null>(null);

    const selectedId = searchParams.get('device');
    const selectedType = searchParams.get('type');

    const select = (params: { device?: string | null; type?: string | null }) => {
        const next = new URLSearchParams(searchParams);
        next.delete('device');
        next.delete('type');
        if (params.device) next.set('device', params.device);
        if (params.type) next.set('type', params.type);
        setSearchParams(next, { replace: false });
    };

    // ── Data subscriptions ──
    useEffect(() => {
        if (!orgId) { setLoading(false); return; }
        const unsub = subscribeTrackerDevices(orgId, list => { setDevices(list); setLoading(false); }, err => {
            console.error('tracker_devices subscribe failed', err);
            toast.error('Could not load tracker devices');
            setLoading(false);
        });
        return () => unsub();
    }, [orgId]);

    useEffect(() => {
        if (!orgId) return;
        const unsubUsers = onSnapshot(query(collection(db, 'users'), where('org_id', '==', orgId)), snap => {
            setPeople(snap.docs.map(d => ({ id: d.id, name: d.data().name || d.data().displayName || d.data().email || d.id }))
                .sort((a, b) => a.name.localeCompare(b.name)));
        }, () => undefined);
        const unsubTools = onSnapshot(query(collection(db, 'tools'), where('org_id', '==', orgId)), snap => {
            setTools(snap.docs.map(d => ({ id: d.id, name: d.data().name || d.id })).sort((a, b) => a.name.localeCompare(b.name)));
        }, () => undefined);
        return () => { unsubUsers(); unsubTools(); };
    }, [orgId]);

    // ── Derived structure ──
    const byId = useMemo(() => new Map(devices.map(d => [d.id, d])), [devices]);
    const gateways = useMemo(() => devices.filter(d => d.role === 'gateway').sort((a, b) => a.label.localeCompare(b.label)), [devices]);
    const childrenOf = useMemo(() => {
        const m = new Map<string, TrackerDevice[]>();
        devices.forEach(d => {
            if (d.role === 'tag' && d.parentDeviceId && byId.has(d.parentDeviceId)) {
                const arr = m.get(d.parentDeviceId) || [];
                arr.push(d);
                m.set(d.parentDeviceId, arr);
            }
        });
        m.forEach(arr => arr.sort((a, b) => a.label.localeCompare(b.label)));
        return m;
    }, [devices, byId]);

    const statusOf = (d: TrackerDevice) => getDeviceStatus(d, d.parentDeviceId ? byId.get(d.parentDeviceId) : null);
    const needsAttention = (d: TrackerDevice) => {
        const st = statusOf(d).status;
        const bt = estimateDeviceBattery(d);
        return st === 'separated' || st === 'offline' || bt.status === 'due_soon' || bt.status === 'replace';
    };

    const matches = (d: TrackerDevice) => {
        const q = search.trim().toLowerCase();
        const textOk = !q || [d.label, d.identifier, d.assignedToName, d.linkedToolName, getModel(d.modelId).name]
            .some(v => (v || '').toLowerCase().includes(q));
        if (!textOk) return false;
        if (filter === 'gateways') return d.role !== 'tag';
        if (filter === 'tags') return d.role === 'tag';
        if (filter === 'attention') return needsAttention(d);
        return true;
    };

    /** Top level = non-tag devices grouped by type; tags appear under their gateway or "Unassigned Tags" */
    const tree = useMemo(() => {
        const groups = new Map<string, TrackerDevice[]>();
        devices.filter(d => d.role !== 'tag').forEach(d => {
            const kids = childrenOf.get(d.id) || [];
            if (!matches(d) && !kids.some(matches)) return;
            const arr = groups.get(d.modelId) || [];
            arr.push(d);
            groups.set(d.modelId, arr);
        });
        const orphanTags = devices.filter(d => d.role === 'tag' && (!d.parentDeviceId || !byId.has(d.parentDeviceId)) && matches(d));
        const typeNodes = Array.from(groups.entries())
            .map(([modelId, list]) => ({ model: getModel(modelId), devices: list.sort((a, b) => a.label.localeCompare(b.label)) }))
            .sort((a, b) => Number(!!b.model.canRelayTags) - Number(!!a.model.canRelayTags) || a.model.name.localeCompare(b.model.name));
        return { typeNodes, orphanTags };
    }, [devices, childrenOf, byId, search, filter]); // eslint-disable-line react-hooks/exhaustive-deps

    const stats = useMemo(() => {
        const tags = devices.filter(d => d.role === 'tag');
        return {
            gateways: devices.filter(d => d.role !== 'tag').length,
            tags: tags.length,
            online: devices.filter(d => statusOf(d).status === 'online').length,
            separated: tags.filter(d => statusOf(d).status === 'separated').length,
            battery: devices.filter(d => ['due_soon', 'replace'].includes(estimateDeviceBattery(d).status)).length,
            offline: devices.filter(d => statusOf(d).status === 'offline').length
        };
    }, [devices]); // eslint-disable-line react-hooks/exhaustive-deps

    const selected = selectedId ? byId.get(selectedId) || null : null;
    const hasDemo = devices.some(d => d.isDemo || (d.notes && d.notes.toLowerCase().includes('demo')) || d.label.includes('DEMO'));

    // ── Actions ──
    const openRegister = (p?: TrackerFormPrefill) => { setEditing(null); setPrefill(p || null); setFormOpen(true); };
    const openEdit = (d: TrackerDevice) => { setEditing(d); setPrefill(null); setFormOpen(true); };

    const loadDemo = async () => {
        setDemoBusy('Preparing demo fleet…');
        try {
            await seedDemoFleet(orgId, people, msg => setDemoBusy(msg));
            toast.success('Demo fleet loaded — 2 MG5 gateways, 6 tags, 7 days of history');
        } catch (err: any) {
            console.error(err);
            toast.error(err?.message || 'Could not load demo fleet');
        }
        setDemoBusy(null);
    };

    const executeClearDemo = async () => {
        setDemoBusy('Removing demo data…');
        try {
            await removeDemoFleet(devices, msg => setDemoBusy(msg), orgId);
            select({});
            toast.success('All demo fleet data removed');
            setConfirmClearDemoOpen(false);
        } catch (err: any) {
            console.error('Remove demo fleet failed:', err);
            toast.error('Could not remove demo data');
        }
        setDemoBusy(null);
    };

    const executeDeleteRowDevice = async () => {
        if (!deviceToDelete) return;
        setDeletingDeviceId(deviceToDelete.id);
        try {
            const kids = childrenOf.get(deviceToDelete.id) || [];
            await deleteTrackerDevice(deviceToDelete, kids, deleteRowChildrenToo);
            toast.success(`${deviceToDelete.role === 'tag' ? 'Tag' : 'Device'} deleted`);
            if (selectedId === deviceToDelete.id) select({});
            setDeviceToDelete(null);
        } catch (err: any) {
            console.error('Delete row device error:', err);
            toast.error(err?.message || 'Could not delete device');
        } finally {
            setDeletingDeviceId(null);
        }
    };

    const toggle = (key: string) => setCollapsed(c => ({ ...c, [key]: !c[key] }));

    // ── Rendering helpers ──
    const DeviceRow: React.FC<{ d: TrackerDevice; depth: number }> = ({ d, depth }) => {
        const st = statusOf(d);
        const bt = estimateDeviceBattery(d);
        const kids = childrenOf.get(d.id) || [];
        const visibleKids = kids.filter(matches);
        const isOpen = !collapsed[d.id];
        const isSel = selectedId === d.id;
        const Icon = d.role === 'gateway' ? Router : d.role === 'tag' ? TagIcon : Radio;
        return (
            <div>
                <div
                    role="button"
                    tabIndex={0}
                    id={`trk-node-${d.id}`}
                    onClick={() => select({ device: d.id })}
                    onKeyDown={e => { if (e.key === 'Enter') select({ device: d.id }); }}
                    className={`group flex items-center gap-2 pr-2 py-2 rounded-xl cursor-pointer transition-all ${isSel ? 'bg-indigo-50 ring-1 ring-indigo-300' : 'hover:bg-slate-50'}`}
                    style={{ paddingLeft: 8 + depth * 18 }}
                >
                    {d.role === 'gateway' ? (
                        <button type="button" onClick={e => { e.stopPropagation(); toggle(d.id); }} className="p-0.5 rounded hover:bg-slate-200 text-slate-400" aria-label="Toggle tags">
                            {kids.length ? (isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />) : <span className="inline-block w-3.5" />}
                        </button>
                    ) : <span className="inline-block w-[18px]" />}
                    <Icon className={`w-4 h-4 shrink-0 ${d.role === 'gateway' ? 'text-indigo-600' : d.role === 'tag' ? 'text-cyan-600' : 'text-slate-500'}`} />
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                            <span className={`text-[13px] truncate ${isSel ? 'font-black text-indigo-900' : 'font-bold text-slate-800'}`}>{d.label}</span>
                            {d.isDemo && <span className="text-[9px] font-black text-amber-600">DEMO</span>}
                        </div>
                        <p className="text-[10px] text-slate-500 truncate">
                            {d.role === 'tag' ? (d.linkedToolName || d.identifier) : (d.assignedToName || 'Unassigned')} · {formatRelative(st.lastSeen)}
                        </p>
                    </div>
                    {bt.percent != null && <BatteryMini percent={bt.percent} />}
                    {d.role === 'gateway' && kids.length > 0 && (
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-cyan-100 text-cyan-800">{kids.length}</span>
                    )}
                    <StatusDot status={st.status} />
                    <button
                        type="button"
                        id={`trk-row-delete-${d.id}`}
                        title={`Delete ${d.label}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            setDeviceToDelete(d);
                            setDeleteRowChildrenToo(Boolean(d.isDemo));
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-100/60 transition-all shrink-0"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
                {d.role === 'gateway' && isOpen && visibleKids.length > 0 && (
                    <div className="relative">
                        <span className="absolute top-0 bottom-3 border-l border-dashed border-slate-300" style={{ left: 8 + depth * 18 + 25 }} />
                        {visibleKids.map(k => <DeviceRow key={k.id} d={k} depth={depth + 1} />)}
                    </div>
                )}
            </div>
        );
    };

    const renderRight = () => {
        if (selected) {
            const parent = selected.parentDeviceId ? byId.get(selected.parentDeviceId) || null : null;
            return (
                <TrackerDeviceDetail
                    key={selected.id}
                    device={selected}
                    parent={parent}
                    childTags={childrenOf.get(selected.id) || []}
                    gateways={gateways}
                    onEdit={openEdit}
                    onSelect={id => select({ device: id })}
                    onRegisterDetected={(mac, gatewayId) => openRegister({ modelId: 'minew_ble_tag', identifier: mac, parentDeviceId: gatewayId })}
                    onConnect={id => setConnect({ id, justRegistered: false })}
                    onDeleted={() => select({})}
                />
            );
        }

        if (selectedType) {
            const model = getModel(selectedType);
            const list = devices.filter(d => d.modelId === selectedType);
            return (
                <div className="space-y-4">
                    <div className={`rounded-2xl p-6 text-white shadow-xl bg-gradient-to-br ${TYPE_COLORS[model.type] || 'from-slate-700 to-slate-900'}`}>
                        <p className="text-[11px] font-black uppercase tracking-widest opacity-80">Tracker Type · {model.brand}</p>
                        <h2 className="text-2xl font-black mt-1 text-white">{model.name}</h2>
                        <p className="text-sm opacity-90 mt-1">{model.recommendedUse}</p>
                        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                            {[['Network', model.network], ['Power', model.batteryLife], ['Cost', model.costEstimate], ['Registered', String(list.length)]].map(([k, v]) => (
                                <div key={k} className="p-3 rounded-xl bg-white/10 border border-white/10"><p className="opacity-70 font-bold">{k}</p><p className="font-extrabold mt-0.5">{v}</p></div>
                            ))}
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y">
                        {list.map(d => {
                            const st = statusOf(d);
                            return (
                                <button key={d.id} onClick={() => select({ device: d.id })} className="w-full flex items-center justify-between gap-3 p-4 hover:bg-slate-50 text-left">
                                    <div className="min-w-0">
                                        <p className="font-bold text-slate-900 truncate">{d.label}</p>
                                        <p className="text-[11px] text-slate-500 truncate">{d.identifier} · {d.assignedToName || 'Unassigned'}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {d.role === 'gateway' && <span className="text-[11px] font-bold text-cyan-700">{(childrenOf.get(d.id) || []).length} tags</span>}
                                        <StatusPill status={st.status} label={st.label} />
                                        <ChevronRight className="w-4 h-4 text-slate-400" />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                    <p className="text-[11px] text-slate-500 px-1">{model.instructions}</p>
                </div>
            );
        }

        // Fleet overview
        const attention = devices.filter(needsAttention).slice(0, 12);
        return (
            <div className="space-y-4">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                    <h3 className="text-base font-black text-slate-900 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> Needs Attention</h3>
                    <p className="text-[11px] text-slate-500 mb-3">Tags not in their vehicle, devices offline for 24h+, and batteries due within 30 days.</p>
                    {attention.length === 0 ? (
                        <p className="text-sm text-emerald-700 font-bold">Everything is reporting normally. 🎉</p>
                    ) : (
                        <div className="space-y-2">
                            {attention.map(d => {
                                const st = statusOf(d);
                                const bt = estimateDeviceBattery(d);
                                const reason = st.status === 'separated' ? st.detail : st.status === 'offline' ? st.detail : `Battery ${bt.percent ?? 0}% — ${bt.summary}`;
                                return (
                                    <button key={d.id} onClick={() => select({ device: d.id })} className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 text-left transition-all">
                                        <div className="flex items-center gap-3 min-w-0">
                                            {st.status === 'separated' ? <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" /> : st.status === 'offline' ? <WifiOff className="w-4 h-4 text-slate-400 shrink-0" /> : <BatteryWarning className="w-4 h-4 text-amber-500 shrink-0" />}
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-slate-900 truncate">{d.label}</p>
                                                <p className="text-[11px] text-slate-500 truncate">{reason}</p>
                                            </div>
                                        </div>
                                        <StatusPill status={st.status} label={st.label} />
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
                <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 bg-white/60">
                    <Layers className="w-6 h-6 mx-auto text-slate-400" />
                    <p className="mt-2 font-bold text-slate-700">Select a tracker type, gateway, or tag on the left to drill in.</p>
                    <p className="text-xs mt-1">You'll see who it's assigned to, estimated battery, last known location, and up to {TRACKING_POLICY.retentionDays} days of location history.</p>
                </div>
            </div>
        );
    };

    if (loading) {
        return <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;
    }

    return (
        <div className="space-y-5">
            {/* Hero / stats */}
            <div className="relative overflow-hidden rounded-2xl p-6 text-white shadow-xl bg-gradient-to-br from-slate-950 via-indigo-950 to-cyan-950">
                <div className="absolute -top-24 -right-16 w-72 h-72 rounded-full bg-indigo-500/30 blur-3xl" />
                <div className="absolute -bottom-24 left-1/3 w-72 h-72 rounded-full bg-cyan-500/20 blur-3xl" />
                <div className="relative flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-cyan-300"><Boxes className="w-3.5 h-3.5" /> Device Registry</span>
                        <h2 className="text-2xl font-black mt-1 text-white">Gateways, Tags & Live Location</h2>
                        <p className="text-xs text-indigo-200 mt-1 max-w-xl">Tracker type → your registered devices → the tags each gateway carries. Drill into any device for assignment, battery, last location and history.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button id="trk-register" onClick={() => openRegister()} className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-xs font-black flex items-center gap-2 shadow-lg shadow-indigo-900/40"><Plus className="w-4 h-4" /> Add Gateway or Tag</button>
                    </div>
                </div>
                <div className="relative mt-5 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                    {[
                        { label: 'Gateways & GPS', value: stats.gateways, icon: Router, tone: 'text-indigo-200' },
                        { label: 'Tags', value: stats.tags, icon: TagIcon, tone: 'text-cyan-200' },
                        { label: 'Online Now', value: stats.online, icon: Activity, tone: 'text-emerald-300' },
                        { label: 'Not In Vehicle', value: stats.separated, icon: AlertTriangle, tone: stats.separated ? 'text-red-300' : 'text-slate-300', f: 'attention' as FilterKey },
                        { label: 'Battery Due', value: stats.battery, icon: BatteryWarning, tone: stats.battery ? 'text-amber-300' : 'text-slate-300', f: 'attention' as FilterKey },
                        { label: 'Offline 24h+', value: stats.offline, icon: WifiOff, tone: 'text-slate-300', f: 'attention' as FilterKey }
                    ].map(s => (
                        <button key={s.label} type="button" onClick={() => s.f && setFilter(s.f)}
                            className="text-left p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                            <div className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider ${s.tone}`}><s.icon className="w-3.5 h-3.5" /> {s.label}</div>
                            <p className="text-2xl font-black mt-0.5">{s.value}</p>
                        </button>
                    ))}
                </div>
            </div>

            {demoBusy && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-800">
                    <Loader2 className="w-4 h-4 animate-spin" /> {demoBusy}
                </div>
            )}

            {devices.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
                    <div className="max-w-3xl mx-auto text-center">
                        <h3 className="text-xl font-black text-slate-900">Build your tracker hierarchy</h3>
                        <p className="text-sm text-slate-500 mt-1">Register a gateway like the Minew MG5, then nest the BLE tags it carries underneath it.</p>
                        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
                            {[
                                { icon: Layers, t: 'Tracker Type', b: 'The hardware model — e.g. Minew MG5 Gateway or Minew BLE Tag.', c: 'from-slate-700 to-slate-900' },
                                { icon: Router, t: 'Registered Device', b: 'A physical unit your company owns, labeled and assigned — e.g. "Van 3 Gateway".', c: 'from-indigo-500 to-blue-600' },
                                { icon: TagIcon, t: 'Tag', b: 'A BLE tag assigned under a gateway — e.g. "Press Tool Tag". Its location comes from the gateway.', c: 'from-cyan-500 to-teal-600' }
                            ].map((s, i) => (
                                <div key={s.t} className="relative p-5 rounded-2xl border border-slate-200 bg-slate-50/60">
                                    <div className={`inline-flex p-2.5 rounded-xl text-white bg-gradient-to-br ${s.c}`}><s.icon className="w-5 h-5" /></div>
                                    <p className="mt-3 font-black text-slate-900">{i + 1}. {s.t}</p>
                                    <p className="text-xs text-slate-600 mt-1">{s.b}</p>
                                </div>
                            ))}
                        </div>
                        <div className="mt-6 flex flex-wrap justify-center gap-3">
                            <button onClick={() => openRegister()} className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold flex items-center gap-2"><Plus className="w-4 h-4" /> Add Your First Gateway</button>
                            <button id="trk-load-demo" onClick={loadDemo} disabled={!!demoBusy} className="px-5 py-2.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-sm font-bold flex items-center gap-2 disabled:opacity-60"><Sparkles className="w-4 h-4" /> Load Demo Fleet</button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-[22rem_minmax(0,1fr)] gap-5 items-start">
                    {/* Tree */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] flex flex-col">
                        <div className="relative">
                            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                            <input id="trk-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search label, MAC, IMEI, tech, tool…"
                                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
                        </div>
                        <div className="flex gap-1 mt-2 text-[11px] font-bold">
                            {([['all', 'All'], ['gateways', 'Devices'], ['tags', 'Tags'], ['attention', 'Attention']] as Array<[FilterKey, string]>).map(([k, l]) => (
                                <button key={k} id={`trk-filter-${k}`} onClick={() => setFilter(k)}
                                    className={`flex-1 py-1.5 rounded-lg transition-colors ${filter === k ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{l}</button>
                            ))}
                        </div>
                        <button onClick={() => select({})} className={`mt-2 text-left px-2 py-1.5 rounded-lg text-[11px] font-bold ${!selectedId && !selectedType ? 'text-indigo-700 bg-indigo-50' : 'text-slate-500 hover:bg-slate-50'}`}>
                            Fleet overview
                        </button>
                        <div className="mt-1 overflow-y-auto flex-1 -mx-1 px-1 space-y-2 pb-2">
                            {tree.typeNodes.map(node => {
                                const key = `type:${node.model.id}`;
                                const open = !collapsed[key];
                                return (
                                    <div key={node.model.id} className="rounded-xl border border-slate-100">
                                        <div className={`flex items-center gap-2 px-2 py-2 rounded-t-xl cursor-pointer ${selectedType === node.model.id ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
                                            onClick={() => select({ type: node.model.id })}>
                                            <button type="button" onClick={e => { e.stopPropagation(); toggle(key); }} className="p-0.5 rounded hover:bg-slate-200 text-slate-400">
                                                {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                            </button>
                                            <span className={`w-6 h-6 rounded-lg bg-gradient-to-br ${TYPE_COLORS[node.model.type] || 'from-slate-500 to-slate-700'} text-white flex items-center justify-center shrink-0`}>
                                                {node.model.canRelayTags ? <Router className="w-3.5 h-3.5" /> : <Radio className="w-3.5 h-3.5" />}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[11px] font-black text-slate-900 truncate uppercase tracking-wide">{node.model.name}</p>
                                                <p className="text-[10px] text-slate-500">{node.model.brand} · {node.devices.length} registered</p>
                                            </div>
                                        </div>
                                        {open && <div className="p-1">{node.devices.map(d => <DeviceRow key={d.id} d={d} depth={0} />)}</div>}
                                    </div>
                                );
                            })}

                            {tree.orphanTags.length > 0 && (
                                <div className="rounded-xl border border-dashed border-slate-200">
                                    <div className="flex items-center gap-2 px-2 py-2 cursor-pointer hover:bg-slate-50 rounded-t-xl" onClick={() => toggle('orphans')}>
                                        {collapsed.orphans ? <ChevronRight className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                                        <span className="w-6 h-6 rounded-lg bg-slate-200 text-slate-600 flex items-center justify-center"><TagIcon className="w-3.5 h-3.5" /></span>
                                        <div>
                                            <p className="text-[11px] font-black text-slate-700 uppercase tracking-wide">Unassigned Tags</p>
                                            <p className="text-[10px] text-slate-500">Not placed under a gateway</p>
                                        </div>
                                    </div>
                                    {!collapsed.orphans && <div className="p-1">{tree.orphanTags.map(d => <DeviceRow key={d.id} d={d} depth={0} />)}</div>}
                                </div>
                            )}

                            {tree.typeNodes.length === 0 && tree.orphanTags.length === 0 && (
                                <p className="text-xs text-slate-500 text-center py-6">No devices match.</p>
                            )}
                        </div>
                        <div className="pt-2 mt-1 border-t flex items-center justify-between gap-2 text-[11px]">
                            <span className="text-slate-400 flex items-center gap-1"><Wrench className="w-3 h-3" /> {tools.length} tools · {people.length} people</span>
                            {hasDemo ? (
                                <button
                                    type="button"
                                    id="trk-remove-demo"
                                    onClick={() => setConfirmClearDemoOpen(true)}
                                    disabled={!!demoBusy}
                                    className="font-bold text-red-600 hover:underline flex items-center gap-1 disabled:opacity-50"
                                >
                                    <Trash2 className="w-3 h-3" /> Remove demo
                                </button>
                            ) : (
                                <button onClick={loadDemo} disabled={!!demoBusy} className="font-bold text-amber-600 hover:underline flex items-center gap-1 disabled:opacity-50"><Sparkles className="w-3 h-3" /> Load demo</button>
                            )}
                        </div>
                    </div>

                    {/* Detail */}
                    <div className="min-w-0">{renderRight()}</div>
                </div>
            )}

            <TrackerDeviceFormModal
                isOpen={formOpen}
                onClose={() => setFormOpen(false)}
                onSaved={(id, info) => {
                    select({ device: id });
                    if (info.created && info.role === 'gateway') setConnect({ id, justRegistered: true });
                }}
                orgId={orgId}
                devices={devices}
                people={people}
                tools={tools}
                editing={editing}
                prefill={prefill}
            />
            <GatewayConnectModal
                isOpen={!!connect}
                onClose={() => setConnect(null)}
                gateway={connect ? byId.get(connect.id) || null : null}
                justRegistered={connect?.justRegistered}
            />

            {/* Modal: Confirm Clear Demo Fleet */}
            {confirmClearDemoOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-[fadeIn_.15s_ease-out]">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-red-100 text-red-600">
                                    <Trash2 className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-extrabold text-slate-900">Remove All Demo Data?</h3>
                                    <p className="text-xs text-slate-500 mt-0.5">Clear sandbox demo gateways and tags</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setConfirmClearDemoOpen(false)}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <p className="text-xs text-slate-600 leading-relaxed">
                            This will permanently remove all demo gateways (Van 1, Van 2), all simulated BLE tags, and their 7-day location history from your sandbox so you can test live physical devices.
                        </p>

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setConfirmClearDemoOpen(false)}
                                disabled={!!demoBusy}
                                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                id="trk-confirm-clear-demo-btn"
                                onClick={executeClearDemo}
                                disabled={!!demoBusy}
                                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-red-600/30 transition-all"
                            >
                                {demoBusy ? (
                                    <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Removing…
                                    </>
                                ) : (
                                    <>
                                        <Trash2 className="w-3.5 h-3.5" /> Remove Demo Fleet
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Confirm Delete Row Device */}
            {deviceToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-[fadeIn_.15s_ease-out]">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-red-100 text-red-600">
                                    <Trash2 className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-extrabold text-slate-900">
                                        Delete {deviceToDelete.role === 'tag' ? 'Tag' : 'Device'}?
                                    </h3>
                                    <p className="text-xs text-slate-500 font-mono mt-0.5">{deviceToDelete.label}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setDeviceToDelete(null)}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <p className="text-xs text-slate-600 leading-relaxed">
                            This will permanently delete <strong>{deviceToDelete.label}</strong> ({deviceToDelete.identifier}) and all of its recorded location history.
                        </p>

                        {deviceToDelete.role === 'gateway' && (childrenOf.get(deviceToDelete.id) || []).length > 0 && (
                            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-amber-900">
                                    <input
                                        type="checkbox"
                                        checked={deleteRowChildrenToo}
                                        onChange={e => setDeleteRowChildrenToo(e.target.checked)}
                                        className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                                    />
                                    <span>Also delete all {(childrenOf.get(deviceToDelete.id) || []).length} tag(s) under this gateway</span>
                                </label>
                                <p className="text-[11px] text-amber-700/90 pl-5">
                                    {deleteRowChildrenToo
                                        ? 'All child tags and their history will also be permanently removed.'
                                        : 'If unchecked, child tags will be moved to Unassigned Tags.'}
                                </p>
                            </div>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setDeviceToDelete(null)}
                                disabled={!!deletingDeviceId}
                                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                id="trk-confirm-row-delete-btn"
                                onClick={executeDeleteRowDevice}
                                disabled={!!deletingDeviceId}
                                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-red-600/30 transition-all"
                            >
                                {deletingDeviceId ? (
                                    <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Deleting…
                                    </>
                                ) : (
                                    <>
                                        <Trash2 className="w-3.5 h-3.5" /> Delete {deviceToDelete.role === 'tag' ? 'Tag' : 'Device'}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TrackerDeviceRegistry;
