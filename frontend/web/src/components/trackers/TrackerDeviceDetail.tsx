/**
 * TrackerDeviceDetail.tsx - Drill-down view for a single tracker device
 *
 * - Assignment, estimated/live battery, last known location, signal, parent/children
 * - Location history map with selectable range (24h / 7d / 30d / 90d) + trip stats
 * - Recent history table + CSV export
 * - Gateways: tags on board + "detected nearby, not registered" quick registration
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
    User, Truck, Wrench, MapPin, Battery, BatteryCharging, BatteryWarning, Plug, Radio, Router,
    Tag as TagIcon, Clock, Navigation, ExternalLink, Edit2, Trash2, Download, Loader2, Crosshair,
    RefreshCw, Route, Gauge, PauseCircle, Signal, AlertTriangle, ChevronRight, Plus, X, Copy, Wifi
} from 'lucide-react';
import toast from 'react-hot-toast';
import { TrackerDevice, TrackerLocationPoint } from '../../types/trackerDevices';
import {
    getModel, getDeviceStatus, estimateDeviceBattery, fetchLocationHistory, toDateSafe, formatRelative,
    haversineM, updateTrackerDevice, deleteTrackerDevice, logManualLocation, dismissUnregisteredTag,
    TRACKING_POLICY
} from '../../lib/trackerDevices';
import { TrackerHistoryMap, TrackerStop } from './TrackerHistoryMap';
import { StatusPill, BatteryMini } from './trackerUi';

type RangeKey = '24h' | '7d' | '30d' | '90d';
const RANGES: Array<{ key: RangeKey; label: string; hours: number }> = [
    { key: '24h', label: '24 Hours', hours: 24 },
    { key: '7d', label: '7 Days', hours: 24 * 7 },
    { key: '30d', label: '30 Days', hours: 24 * 30 },
    { key: '90d', label: '90 Days', hours: 24 * 90 }
];

interface Props {
    device: TrackerDevice;
    parent: TrackerDevice | null;
    childTags: TrackerDevice[];
    gateways: TrackerDevice[];
    onEdit: (d: TrackerDevice) => void;
    onSelect: (id: string) => void;
    onRegisterDetected: (mac: string, gatewayId: string) => void;
    /** Gateways only: open the connect / connection settings flow */
    onConnect?: (gatewayId: string) => void;
    onDeleted: () => void;
}

function computeStops(points: TrackerLocationPoint[]): TrackerStop[] {
    const stops: TrackerStop[] = [];
    let i = 0;
    while (i < points.length) {
        const anchor = points[i];
        let j = i + 1;
        while (j < points.length && haversineM(anchor, points[j]) < 150) j++;
        const start = toDateSafe(anchor.recordedAt)!;
        const end = toDateSafe(points[j - 1].recordedAt)!;
        const minutes = (end.getTime() - start.getTime()) / 60000;
        if (minutes >= 20) stops.push({ lat: anchor.lat, lng: anchor.lng, start, end, minutes });
        i = j > i + 1 ? j : i + 1;
    }
    return stops;
}

function computeTripStats(points: TrackerLocationPoint[]) {
    let meters = 0;
    let movingMin = 0;
    let maxSpeed = 0;
    for (let k = 1; k < points.length; k++) {
        const a = points[k - 1];
        const b = points[k];
        const gapMin = ((toDateSafe(b.recordedAt)?.getTime() || 0) - (toDateSafe(a.recordedAt)?.getTime() || 0)) / 60000;
        const d = haversineM(a, b);
        if (gapMin <= 120) meters += d;
        if ((b.speedKph ?? 0) >= TRACKING_POLICY.movingSpeedKph || (d > TRACKING_POLICY.movementThresholdM && gapMin <= 30)) movingMin += gapMin;
        maxSpeed = Math.max(maxSpeed, b.speedKph ?? 0);
    }
    return { miles: meters / 1609.34, movingHours: movingMin / 60, maxSpeedMph: maxSpeed * 0.621371 };
}

export const TrackerDeviceDetail: React.FC<Props> = ({
    device, parent, childTags, gateways, onEdit, onSelect, onRegisterDetected, onConnect, onDeleted
}) => {
    const model = getModel(device.modelId);
    const status = getDeviceStatus(device, parent);
    const battery = estimateDeviceBattery(device, model);
    const [range, setRange] = useState<RangeKey>('7d');
    const [points, setPoints] = useState<TrackerLocationPoint[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const [busy, setBusy] = useState<string | null>(null);
    const [showAllRows, setShowAllRows] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const hours = RANGES.find(r => r.key === range)!.hours;
        setLoadingHistory(true);
        fetchLocationHistory(device.id, new Date(Date.now() - hours * 3600000))
            .then(p => { if (!cancelled) setPoints(p); })
            .catch(err => {
                console.error('History load failed', err);
                if (!cancelled) { setPoints([]); toast.error('Could not load location history'); }
            })
            .finally(() => { if (!cancelled) setLoadingHistory(false); });
        return () => { cancelled = true; };
    }, [device.id, range, reloadKey]);

    const stops = useMemo(() => computeStops(points), [points]);
    const trip = useMemo(() => computeTripStats(points), [points]);
    const accent = status.status === 'separated' ? '#dc2626' : device.role === 'gateway' ? '#4f46e5' : '#0891b2';
    const lastSeen = toDateSafe(device.lastSeenAt);
    const loc = device.lastLocation;
    const lastSeenBy = device.lastSeenByDeviceId ? gateways.find(g => g.id === device.lastSeenByDeviceId) : null;

    const AssigneeIcon = device.assignedToType === 'tech' ? User : device.assignedToType === 'vehicle' ? Truck : device.assignedToType === 'tool' ? Wrench : MapPin;
    const RoleIcon = device.role === 'gateway' ? Router : device.role === 'tag' ? TagIcon : Radio;

    const handleBatteryReplaced = async () => {
        setBusy('battery');
        try {
            await updateTrackerDevice(device.id, { batteryInstalledDate: new Date().toISOString(), reportedBatteryLevel: null });
            toast.success('Battery marked as replaced — estimate reset.');
        } catch { toast.error('Could not update battery'); }
        setBusy(null);
    };

    const handleLogLocation = () => {
        if (!navigator.geolocation) return toast.error('Geolocation is not available in this browser');
        setBusy('locate');
        navigator.geolocation.getCurrentPosition(async pos => {
            try {
                await logManualLocation(device, pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
                toast.success('Location logged from this device');
                setReloadKey(k => k + 1);
            } catch { toast.error('Could not log location'); }
            setBusy(null);
        }, err => {
            toast.error(err.message || 'Location permission denied');
            setBusy(null);
        }, { enableHighAccuracy: true, timeout: 15000 });
    };

    const handleMoveTag = async (gatewayId: string) => {
        const gw = gateways.find(g => g.id === gatewayId);
        try {
            await updateTrackerDevice(device.id, { parentDeviceId: gatewayId || null });
            toast.success(gw ? `Moved to ${gw.label}` : 'Removed from gateway');
        } catch { toast.error('Could not move tag'); }
    };

    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deleteChildrenToo, setDeleteChildrenToo] = useState(Boolean(device.isDemo));
    const [tagToDelete, setTagToDelete] = useState<TrackerDevice | null>(null);
    const [deletingChildId, setDeletingChildId] = useState<string | null>(null);

    const confirmDeleteDevice = async () => {
        setBusy('delete');
        try {
            await deleteTrackerDevice(device, childTags, deleteChildrenToo);
            toast.success(device.role === 'tag' ? 'Tag deleted' : 'Device deleted');
            setDeleteModalOpen(false);
            onDeleted();
        } catch (err: any) {
            console.error('Delete tracker failed:', err);
            toast.error(err?.message || 'Could not delete device');
            setBusy(null);
        }
    };

    const confirmDeleteChildTag = async () => {
        if (!tagToDelete) return;
        setDeletingChildId(tagToDelete.id);
        try {
            await deleteTrackerDevice(tagToDelete, [], false);
            toast.success(`Tag "${tagToDelete.label}" deleted`);
            setTagToDelete(null);
        } catch (err: any) {
            console.error('Failed to delete tag:', err);
            toast.error(err?.message || 'Could not delete tag');
        } finally {
            setDeletingChildId(null);
        }
    };

    const exportCsv = () => {
        const rows = [['recorded_at', 'lat', 'lng', 'speed_mph', 'source', 'via_device']];
        points.forEach(p => rows.push([
            toDateSafe(p.recordedAt)?.toISOString() || '', String(p.lat), String(p.lng),
            p.speedKph != null ? (p.speedKph * 0.621371).toFixed(1) : '', p.source, p.viaDeviceId || ''
        ]));
        const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${device.label.replace(/[^a-z0-9]+/gi, '_')}_${range}_history.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    const rows = [...points].reverse();
    const visibleRows = showAllRows ? rows.slice(0, 500) : rows.slice(0, 12);

    const BatteryIcon = battery.kind === 'powered' ? Plug : battery.status === 'good' ? Battery : battery.status === 'due_soon' ? BatteryCharging : BatteryWarning;
    const batteryTone = battery.status === 'powered' ? 'text-emerald-600 bg-emerald-50' : battery.status === 'good' ? 'text-emerald-600 bg-emerald-50' : battery.status === 'due_soon' ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50';

    return (
        <div className="space-y-5 animate-[fadeIn_.25s_ease-out]">
            {/* Header */}
            <div className="rounded-2xl p-5 text-white shadow-xl relative overflow-hidden"
                style={{ background: `linear-gradient(135deg, #0f172a 0%, ${device.role === 'gateway' ? '#312e81' : '#164e63'} 60%, #0f172a 100%)` }}>
                <div className="absolute -right-10 -top-10 w-48 h-48 rounded-full opacity-20 blur-2xl" style={{ background: accent }} />
                <div className="relative flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                        <div className="p-3 rounded-2xl bg-white/10 border border-white/10"><RoleIcon className="w-6 h-6" /></div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-xl font-black truncate text-white">{device.label}</h2>
                                <StatusPill status={status.status} label={status.label} dark />
                                {device.isDemo && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-200 border border-amber-300/30">DEMO</span>}
                            </div>
                            <p className="text-xs text-slate-300 mt-0.5">{model.name}</p>
                            <button
                                type="button"
                                onClick={() => { navigator.clipboard.writeText(device.identifier); toast.success('Identifier copied'); }}
                                className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-mono text-slate-200 bg-white/10 hover:bg-white/20 px-2 py-0.5 rounded-md"
                                title="Copy identifier"
                            >
                                {device.identifier} <Copy className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {device.role === 'gateway' && !device.isDemo && onConnect && (
                            <button id="trk-detail-connect" onClick={() => onConnect(device.id)} className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold flex items-center gap-1.5"><Wifi className="w-3.5 h-3.5" /> Connection</button>
                        )}
                        <button id="trk-detail-edit" onClick={() => onEdit(device)} className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold flex items-center gap-1.5"><Edit2 className="w-3.5 h-3.5" /> Edit</button>
                        <button id="trk-detail-locate" onClick={handleLogLocation} disabled={busy === 'locate'} className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50">
                            {busy === 'locate' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crosshair className="w-3.5 h-3.5" />} Log My Location
                        </button>
                        <button id="trk-detail-delete" type="button" onClick={() => setDeleteModalOpen(true)} disabled={busy === 'delete'} className="px-3 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/40 text-red-100 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                    </div>
                </div>
                {status.status === 'separated' && (
                    <div className="relative mt-4 flex items-start gap-2 rounded-xl bg-red-500/20 border border-red-400/40 p-3 text-xs text-red-100">
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span><strong>Possible left-behind tool.</strong> {status.detail}. Last known position is shown on the map below.</span>
                    </div>
                )}
                {device.role === 'gateway' && !device.isDemo && !lastSeen && onConnect && (
                    <div className="relative mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-indigo-400/15 border border-indigo-300/30 p-3 text-xs text-indigo-100">
                        <span className="flex items-start gap-2"><Wifi className="w-4 h-4 shrink-0 mt-0.5" /><span><strong>This gateway hasn't checked in yet.</strong> Connect it to start seeing its location and the tags near it.</span></span>
                        <button id="trk-detail-connect-banner" onClick={() => onConnect(device.id)} className="px-3 py-1.5 rounded-lg bg-white text-indigo-900 font-black hover:bg-indigo-50">Connect it</button>
                    </div>
                )}
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-400"><AssigneeIcon className="w-3.5 h-3.5" /> Assigned To</div>
                    <p className="mt-2 text-base font-extrabold text-slate-900 truncate">{device.assignedToName || 'Unassigned'}</p>
                    <p className="text-[11px] text-slate-500 capitalize">{device.assignedToType === 'none' ? 'No owner set' : device.assignedToType}</p>
                    {device.linkedToolName && <p className="mt-1 text-[11px] text-slate-600 flex items-center gap-1"><Wrench className="w-3 h-3" /> {device.linkedToolName}</p>}
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-400"><BatteryIcon className="w-3.5 h-3.5" /> Battery</div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${batteryTone}`}>
                            {battery.kind === 'powered' ? 'Powered' : battery.kind === 'live' ? 'Live' : 'Estimated'}
                        </span>
                    </div>
                    {battery.kind === 'powered' ? (
                        <p className="mt-2 text-base font-extrabold text-slate-900">Vehicle Power</p>
                    ) : (
                        <div className="mt-2"><BatteryMini percent={battery.percent ?? 0} large /></div>
                    )}
                    <p className="text-[11px] text-slate-500 mt-1">{battery.summary}</p>
                    {battery.kind !== 'powered' && (
                        <button id="trk-battery-replaced" onClick={handleBatteryReplaced} disabled={busy === 'battery'} className="mt-2 text-[11px] font-bold text-blue-600 hover:underline flex items-center gap-1">
                            <RefreshCw className={`w-3 h-3 ${busy === 'battery' ? 'animate-spin' : ''}`} /> Mark battery replaced
                        </button>
                    )}
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-400"><MapPin className="w-3.5 h-3.5" /> Last Known Location</div>
                    {loc ? (
                        <>
                            <p className="mt-2 text-sm font-extrabold text-slate-900 font-mono">{loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}</p>
                            <p className="text-[11px] text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" /> {lastSeen ? `${formatRelative(lastSeen)} · ${lastSeen.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : '—'}</p>
                            {typeof loc.speedKph === 'number' && loc.speedKph > 0 && <p className="text-[11px] text-slate-500 flex items-center gap-1"><Gauge className="w-3 h-3" /> {(loc.speedKph * 0.621371).toFixed(0)} mph</p>}
                            <a href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`} target="_blank" rel="noreferrer" className="mt-1 text-[11px] font-bold text-blue-600 hover:underline inline-flex items-center gap-1">
                                Open in Google Maps <ExternalLink className="w-3 h-3" />
                            </a>
                        </>
                    ) : (
                        <p className="mt-2 text-sm font-bold text-slate-500">No location yet</p>
                    )}
                </div>

                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
                    {device.role === 'gateway' ? (
                        <>
                            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-400"><TagIcon className="w-3.5 h-3.5" /> Tags On This Gateway</div>
                            <p className="mt-2 text-2xl font-black text-slate-900">{childTags.length}</p>
                            <p className="text-[11px] text-slate-500">
                                {childTags.filter(t => getDeviceStatus(t, device).status === 'online').length} heard recently ·{' '}
                                <span className="text-red-600 font-bold">{childTags.filter(t => getDeviceStatus(t, device).status === 'separated').length} not in vehicle</span>
                            </p>
                            {typeof device.ignitionOn === 'boolean' && <p className="text-[11px] text-slate-500 mt-1">Ignition: <strong>{device.ignitionOn ? 'On' : 'Off'}</strong></p>}
                        </>
                    ) : device.role === 'tag' ? (
                        <>
                            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-400"><Router className="w-3.5 h-3.5" /> Gateway</div>
                            <select
                                id="trk-move-tag"
                                value={device.parentDeviceId || ''}
                                onChange={e => handleMoveTag(e.target.value)}
                                className="mt-2 w-full px-2 py-1.5 border border-slate-300 rounded-lg text-xs font-bold bg-white"
                            >
                                <option value="">— Not assigned —</option>
                                {gateways.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
                            </select>
                            <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                                <Signal className="w-3 h-3" /> {device.lastRssi != null ? `${device.lastRssi} dBm` : 'No signal reading'}
                                {lastSeenBy && lastSeenBy.id !== device.parentDeviceId && <span className="text-amber-600 font-bold"> · heard by {lastSeenBy.label}</span>}
                            </p>
                            {parent && (
                                <button onClick={() => onSelect(parent.id)} className="mt-1 text-[11px] font-bold text-blue-600 hover:underline inline-flex items-center gap-1">
                                    View {parent.label} <ChevronRight className="w-3 h-3" />
                                </button>
                            )}
                        </>
                    ) : (
                        <>
                            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-400"><Radio className="w-3.5 h-3.5" /> Network</div>
                            <p className="mt-2 text-sm font-extrabold text-slate-900">{model.network}</p>
                            {device.serial && <p className="text-[11px] text-slate-500 mt-1">S/N {device.serial}</p>}
                        </>
                    )}
                </div>
            </div>

            {/* Location history */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h3 className="text-base font-black text-slate-900 flex items-center gap-2"><Navigation className="w-4 h-4 text-indigo-600" /> Location History</h3>
                        <p className="text-[11px] text-slate-500">
                            {device.role === 'tag'
                                ? `Logged every ${TRACKING_POLICY.tagMovingIntervalMin} min while moving, ${TRACKING_POLICY.tagStationaryIntervalMin} min while parked`
                                : `Logged every ${TRACKING_POLICY.gatewayMovingIntervalMin} min while moving, ${TRACKING_POLICY.gatewayStationaryIntervalMin} min while parked`}
                            {' '}· kept {TRACKING_POLICY.retentionDays} days
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                            {RANGES.map(r => (
                                <button key={r.key} id={`trk-range-${r.key}`} onClick={() => setRange(r.key)}
                                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${range === r.key ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                                    {r.label}
                                </button>
                            ))}
                        </div>
                        <button onClick={() => setReloadKey(k => k + 1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" title="Refresh"><RefreshCw className={`w-4 h-4 ${loadingHistory ? 'animate-spin' : ''}`} /></button>
                        <button id="trk-export-csv" onClick={exportCsv} disabled={!points.length} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-40" title="Export CSV"><Download className="w-4 h-4" /></button>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        { icon: MapPin, label: 'Points', value: points.length.toLocaleString() },
                        { icon: Route, label: 'Distance', value: `${trip.miles.toFixed(1)} mi` },
                        { icon: PauseCircle, label: 'Stops (20+ min)', value: String(stops.length) },
                        { icon: Gauge, label: 'Top Speed', value: trip.maxSpeedMph ? `${trip.maxSpeedMph.toFixed(0)} mph` : '—' }
                    ].map(s => (
                        <div key={s.label} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400"><s.icon className="w-3 h-3" /> {s.label}</div>
                            <p className="text-lg font-black text-slate-900 mt-0.5">{loadingHistory ? '…' : s.value}</p>
                        </div>
                    ))}
                </div>

                <div className="relative">
                    <TrackerHistoryMap points={points} stops={stops} lastLocation={loc} accent={accent} heightClass="h-[22rem]" />
                    {loadingHistory && (
                        <div className="absolute inset-0 z-[500] flex items-center justify-center bg-white/50 rounded-2xl">
                            <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                        </div>
                    )}
                </div>

                {rows.length > 0 && (
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                        <table className="w-full text-xs">
                            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px]">
                                <tr>
                                    <th className="text-left px-3 py-2">Time</th>
                                    <th className="text-left px-3 py-2">Coordinates</th>
                                    <th className="text-left px-3 py-2">Speed</th>
                                    <th className="text-left px-3 py-2">Source</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {visibleRows.map(p => {
                                    const t = toDateSafe(p.recordedAt);
                                    return (
                                        <tr key={p.id} className="hover:bg-slate-50">
                                            <td className="px-3 py-1.5 font-semibold text-slate-700">{t?.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                                            <td className="px-3 py-1.5 font-mono text-slate-600">
                                                <a className="hover:text-blue-600" href={`https://www.google.com/maps?q=${p.lat},${p.lng}`} target="_blank" rel="noreferrer">{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</a>
                                            </td>
                                            <td className="px-3 py-1.5 text-slate-600">{p.speedKph ? `${(p.speedKph * 0.621371).toFixed(0)} mph` : 'Parked'}</td>
                                            <td className="px-3 py-1.5"><span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold text-[10px] uppercase">{p.source.replace('_', ' ')}</span></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {rows.length > 12 && (
                            <button onClick={() => setShowAllRows(s => !s)} className="w-full py-2 text-[11px] font-bold text-blue-600 bg-slate-50 hover:bg-slate-100 border-t border-slate-200">
                                {showAllRows ? 'Show fewer' : `Show ${Math.min(rows.length, 500) - 12} more`}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Gateway children + discovered tags */}
            {device.role === 'gateway' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                        <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 mb-3"><TagIcon className="w-4 h-4 text-cyan-600" /> Tags Assigned to {device.label}</h3>
                        {childTags.length === 0 ? (
                            <p className="text-xs text-slate-500">No tags assigned yet. Register a BLE tag and choose this gateway.</p>
                        ) : (
                            <div className="space-y-2">
                                {childTags.map(t => {
                                    const st = getDeviceStatus(t, device);
                                    const bt = estimateDeviceBattery(t);
                                    const isDeletingThis = deletingChildId === t.id;
                                    return (
                                        <div
                                            key={t.id}
                                            className="w-full flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 hover:border-cyan-300 hover:bg-cyan-50/40 transition-all bg-white"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => onSelect(t.id)}
                                                className="min-w-0 flex-1 text-left"
                                            >
                                                <div className="flex items-center gap-1.5">
                                                    <p className="text-sm font-bold text-slate-900 truncate hover:text-cyan-700">{t.label}</p>
                                                    {t.isDemo && <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">DEMO</span>}
                                                </div>
                                                <p className="text-[11px] text-slate-500 truncate">{t.linkedToolName || t.identifier} · {st.detail}</p>
                                            </button>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {bt.percent != null && <BatteryMini percent={bt.percent} />}
                                                <StatusPill status={st.status} label={st.label} />
                                                <button
                                                    type="button"
                                                    id={`trk-card-delete-${t.id}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setTagToDelete(t);
                                                    }}
                                                    disabled={isDeletingThis}
                                                    title={`Delete ${t.label}`}
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                >
                                                    {isDeletingThis ? <Loader2 className="w-4 h-4 animate-spin text-red-500" /> : <Trash2 className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                        <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 mb-1"><Radio className="w-4 h-4 text-amber-600" /> Detected Nearby — Not Registered</h3>
                        <p className="text-[11px] text-slate-500 mb-3">BLE tags this gateway heard that aren't in your registry yet.</p>
                        {(device.unregisteredTagsSeen || []).length === 0 ? (
                            <p className="text-xs text-slate-500">Nothing new detected.</p>
                        ) : (
                            <div className="space-y-2">
                                {device.unregisteredTagsSeen!.map(u => (
                                    <div key={u.mac} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-amber-200 bg-amber-50/50">
                                        <div>
                                            <p className="text-sm font-mono font-bold text-slate-900">{u.mac}</p>
                                            <p className="text-[11px] text-slate-500">{u.rssi != null ? `${u.rssi} dBm · ` : ''}{formatRelative(toDateSafe(u.seenAt))}</p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => onRegisterDetected(u.mac, device.id)} className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold flex items-center gap-1"><Plus className="w-3 h-3" /> Register</button>
                                            <button onClick={() => dismissUnregisteredTag(device, u.mac)} className="p-1.5 rounded-lg hover:bg-amber-100 text-slate-500" title="Dismiss"><X className="w-3.5 h-3.5" /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {device.notes && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600"><strong className="text-slate-800">Notes:</strong> {device.notes}</div>
            )}

            {/* Confirmation Modal for Current Device / Tag */}
            {deleteModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-[fadeIn_.15s_ease-out]">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-red-100 text-red-600">
                                    <Trash2 className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-extrabold text-slate-900">
                                        Delete {device.role === 'tag' ? 'Tag' : 'Device'}?
                                    </h3>
                                    <p className="text-xs text-slate-500 font-mono mt-0.5">{device.label}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setDeleteModalOpen(false)}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <p className="text-xs text-slate-600 leading-relaxed">
                            This will permanently remove <strong>{device.label}</strong> and erase its recorded location history from your sandbox database.
                        </p>

                        {device.role === 'gateway' && childTags.length > 0 && (
                            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-amber-900">
                                    <input
                                        type="checkbox"
                                        checked={deleteChildrenToo}
                                        onChange={e => setDeleteChildrenToo(e.target.checked)}
                                        className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                                    />
                                    <span>Also delete all {childTags.length} tag(s) assigned to this gateway</span>
                                </label>
                                <p className="text-[11px] text-amber-700/90 pl-5">
                                    {deleteChildrenToo
                                        ? 'All child tags and their history will also be permanently removed.'
                                        : 'If unchecked, child tags will be moved to Unassigned Tags.'}
                                </p>
                            </div>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setDeleteModalOpen(false)}
                                disabled={busy === 'delete'}
                                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                id="trk-confirm-delete-btn"
                                onClick={confirmDeleteDevice}
                                disabled={busy === 'delete'}
                                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-red-600/30 transition-all"
                            >
                                {busy === 'delete' ? (
                                    <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Deleting…
                                    </>
                                ) : (
                                    <>
                                        <Trash2 className="w-3.5 h-3.5" /> Delete {device.role === 'tag' ? 'Tag' : 'Device'}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmation Modal for Child Tag on Card */}
            {tagToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-[fadeIn_.15s_ease-out]">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-red-100 text-red-600">
                                    <Trash2 className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-extrabold text-slate-900">Delete Tag?</h3>
                                    <p className="text-xs text-slate-500 font-mono mt-0.5">{tagToDelete.label}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setTagToDelete(null)}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <p className="text-xs text-slate-600 leading-relaxed">
                            Are you sure you want to permanently delete <strong>{tagToDelete.label}</strong> ({tagToDelete.identifier}) and all of its recorded location history?
                        </p>

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setTagToDelete(null)}
                                disabled={!!deletingChildId}
                                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                id="trk-confirm-tag-delete-btn"
                                onClick={confirmDeleteChildTag}
                                disabled={!!deletingChildId}
                                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-red-600/30 transition-all"
                            >
                                {deletingChildId ? (
                                    <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Deleting…
                                    </>
                                ) : (
                                    <>
                                        <Trash2 className="w-3.5 h-3.5" /> Delete Tag
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

export default TrackerDeviceDetail;
