/**
 * TrackerAlertsAndLogsReport.tsx - Comprehensive Tracker Alerts, SMS & Telemetry Audit Report
 *
 * Combines:
 *   1. Server-side 24/7 rule alerts (`tracker_alerts` collection)
 *   2. Live & historical gateway GPS + BLE tag telemetry (`tracker_devices` + `tracker_locations`)
 *   3. Automated tracker SMS dispatches (`sms_messages` collection)
 *
 * Provides multi-dimensional filtering, clickable column sorting, expandable row inspection,
 * 1-click alert acknowledgement/resolution, and CSV export.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle, Bell, CheckCircle, Clock, Download, ExternalLink, Filter, MapPin,
    MessageSquare, Navigation, RefreshCw, Router, Search, ShieldAlert, Signal,
    SlidersHorizontal, Tag as TagIcon, Trash2, Truck, ArrowUpDown, ArrowUp, ArrowDown,
    ChevronDown, ChevronRight, Battery, Gauge, Check, X, Zap
} from 'lucide-react';
import {
    collection, query, where, limit as fsLimit, onSnapshot, updateDoc, deleteDoc, doc, writeBatch
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import toast from 'react-hot-toast';
import { db, functions } from '../../firebase';
import { useAuth } from '../../auth/AuthProvider';
import { TrackerDevice, TrackerLocationPoint } from '../../types/trackerDevices';
import {
    subscribeTrackerDevices, fetchLocationHistory, toDateSafe, formatRelative, getModel
} from '../../lib/trackerDevices';

export type ReportCategory =
    | 'all'
    | 'alerts_only'
    | 'left_behind'
    | 'recovered'
    | 'customer_messaging'
    | 'theft_idle'
    | 'gps_telemetry'
    | 'ble_tag_scan'
    | 'sms_log';

export type ReportStatusFilter = 'all' | 'active' | 'resolved' | 'critical_warning' | 'telemetry';
export type DatePreset = 'all' | 'today' | '24h' | '7d' | '30d' | '90d' | 'custom';
export type SortField = 'timestamp' | 'severity' | 'category' | 'device' | 'gateway' | 'person' | 'metric';
export type SortDir = 'asc' | 'desc';

export interface TrackerReportRow {
    id: string;
    timestamp: Date;
    category: Exclude<ReportCategory, 'all' | 'alerts_only'>;
    categoryLabel: string;
    severity: 'critical' | 'warning' | 'success' | 'info';
    severityRank: number;
    status: 'active' | 'resolved' | 'logged';
    deviceId: string | null;
    deviceLabel: string;
    deviceIdentifier: string;
    gatewayId: string | null;
    gatewayLabel: string;
    personName: string;
    detail: string;
    lat: number | null;
    lng: number | null;
    mapsUrl: string | null;
    rssi: number | null;
    batteryLevel: number | null;
    speedMph: number | null;
    distanceFt: number | null;
    isTest: boolean;
    rawSource: 'tracker_alerts' | 'tracker_locations' | 'tracker_devices' | 'sms_messages';
    alertDocId?: string;
}

export const TrackerAlertsAndLogsReport: React.FC = () => {
    const { user } = useAuth();
    const orgId: string = (user as any)?.org_id || user?.uid || '';

    // Raw data streams
    const [devices, setDevices] = useState<TrackerDevice[]>([]);
    const [alerts, setAlerts] = useState<any[]>([]);
    const [smsLogs, setSmsLogs] = useState<any[]>([]);
    const [historyByDevice, setHistoryByDevice] = useState<Record<string, TrackerLocationPoint[]>>({});
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [runningServerRules, setRunningServerRules] = useState(false);

    // Filter states
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<ReportCategory>('all');
    const [statusFilter, setStatusFilter] = useState<ReportStatusFilter>('all');
    const [deviceFilter, setDeviceFilter] = useState<string>('all');
    const [gatewayFilter, setGatewayFilter] = useState<string>('all');
    const [datePreset, setDatePreset] = useState<DatePreset>('30d');
    const [customStartDate, setCustomStartDate] = useState<string>('');
    const [customEndDate, setCustomEndDate] = useState<string>('');
    const [sourceMode, setSourceMode] = useState<'all' | 'live_only' | 'test_only'>('all');

    // Sorting & pagination states
    const [sortField, setSortField] = useState<SortField>('timestamp');
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [pageSize, setPageSize] = useState<number>(50);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

    // 1. Subscribe to registered devices
    useEffect(() => {
        if (!orgId) return;
        const unsub = subscribeTrackerDevices(orgId, list => {
            setDevices(list);
        });
        return () => unsub();
    }, [orgId]);

    // 2. Subscribe to server-side tracker_alerts
    useEffect(() => {
        if (!orgId) return;
        const q = query(
            collection(db, 'tracker_alerts'),
            where('org_id', '==', orgId),
            fsLimit(500)
        );
        const unsub = onSnapshot(q, snap => {
            setAlerts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, () => undefined);
        return () => unsub();
    }, [orgId]);

    // 3. Subscribe to tracker-related SMS messages
    useEffect(() => {
        if (!orgId) return;
        const q = query(
            collection(db, 'sms_messages'),
            where('orgId', '==', orgId),
            fsLimit(250)
        );
        const unsub = onSnapshot(q, snap => {
            const trackerSms = snap.docs
                .map(d => ({ id: d.id, ...d.data() } as any))
                .filter(m => {
                    const b = String(m.body || '').toLowerCase();
                    return (
                        b.includes('left-behind') ||
                        b.includes('tool recovered') ||
                        b.includes('encountered traffic') ||
                        b.includes('has arrived on-site') ||
                        b.includes('is approaching') ||
                        b.includes('after-hours movement') ||
                        b.includes('engine idle')
                    );
                });
            setSmsLogs(trackerSms);
        }, () => undefined);
        return () => unsub();
    }, [orgId]);

    // 4. Load location history points for registered devices
    const loadTelemetryHistory = async (devs: TrackerDevice[]) => {
        if (!devs.length) return;
        setLoadingHistory(true);
        const since = new Date(Date.now() - 90 * 86400000);
        const map: Record<string, TrackerLocationPoint[]> = {};
        await Promise.all(
            devs.map(async d => {
                try {
                    const pts = await fetchLocationHistory(d.id, since, 400);
                    map[d.id] = pts;
                } catch {
                    map[d.id] = [];
                }
            })
        );
        setHistoryByDevice(map);
        setLoadingHistory(false);
    };

    useEffect(() => {
        if (devices.length > 0) {
            loadTelemetryHistory(devices);
        }
    }, [devices.length]); // eslint-disable-line react-hooks/exhaustive-deps

    const deviceById = useMemo(() => new Map(devices.map(d => [d.id, d])), [devices]);
    const gateways = useMemo(() => devices.filter(d => d.role === 'gateway'), [devices]);

    // Build unified report rows
    const allRows = useMemo<TrackerReportRow[]>(() => {
        const rows: TrackerReportRow[] = [];

        // A. Server-Side Rule Alerts (tracker_alerts)
        for (const a of alerts) {
            const ts = toDateSafe(a.createdAt) || new Date();
            const typeStr = String(a.type || 'left_behind');
            const dev = a.deviceId ? deviceById.get(a.deviceId) : null;
            const gw = a.gatewayId ? deviceById.get(a.gatewayId) : null;

            let category: TrackerReportRow['category'] = 'left_behind';
            let categoryLabel = 'Left-Behind Tool Alert';
            let severity: TrackerReportRow['severity'] = a.status === 'active' ? 'critical' : 'warning';
            let severityRank = a.status === 'active' ? 4 : 2;

            if (typeStr === 'recovered') {
                category = 'recovered';
                categoryLabel = 'Tool Recovered';
                severity = 'success';
                severityRank = 2;
            } else if (typeStr === 'jobsite_arrival' || typeStr === 'customer_traffic_delay' || typeStr === 'customer_approaching') {
                category = 'customer_messaging';
                categoryLabel = typeStr === 'jobsite_arrival'
                    ? 'Auto Jobsite Arrival'
                    : typeStr === 'customer_approaching'
                    ? 'Customer Approaching SMS'
                    : 'Customer Traffic ETA SMS';
                severity = typeStr === 'customer_traffic_delay' ? 'warning' : 'success';
                severityRank = typeStr === 'customer_traffic_delay' ? 3 : 2;
            } else if (typeStr === 'after_hours_theft' || typeStr === 'engine_idle') {
                category = 'theft_idle';
                categoryLabel = typeStr === 'after_hours_theft' ? 'After-Hours Movement' : 'Engine Idle Alert';
                severity = typeStr === 'after_hours_theft' ? 'critical' : 'warning';
                severityRank = typeStr === 'after_hours_theft' ? 4 : 3;
            }

            const lat = typeof a.lastLocation?.lat === 'number' ? a.lastLocation.lat : null;
            const lng = typeof a.lastLocation?.lng === 'number' ? a.lastLocation.lng : null;

            rows.push({
                id: `alert-${a.id}`,
                timestamp: ts,
                category,
                categoryLabel,
                severity,
                severityRank,
                status: a.status === 'active' ? 'active' : 'resolved',
                deviceId: a.deviceId || gw?.id || null,
                deviceLabel: a.deviceLabel || dev?.label || a.gatewayLabel || gw?.label || 'System Rule',
                deviceIdentifier: dev?.identifier || gw?.identifier || '—',
                gatewayId: a.gatewayId || gw?.id || null,
                gatewayLabel: a.gatewayLabel || gw?.label || '—',
                personName: a.techName || a.customerName || dev?.assignedToName || gw?.assignedToName || '—',
                detail: a.detail || `${categoryLabel} triggered`,
                lat,
                lng,
                mapsUrl: a.mapsUrl || (lat !== null && lng !== null ? `https://www.google.com/maps?q=${lat.toFixed(5)},${lng.toFixed(5)}` : null),
                rssi: dev?.lastRssi ?? null,
                batteryLevel: dev?.reportedBatteryLevel ?? gw?.reportedBatteryLevel ?? null,
                speedMph: null,
                distanceFt: typeof a.distanceFt === 'number' ? a.distanceFt : null,
                isTest: !!a.isTest,
                rawSource: 'tracker_alerts',
                alertDocId: a.id,
            });
        }

        // B. Live Device Heartbeats (tracker_devices.lastSeenAt)
        for (const d of devices) {
            const seenAt = toDateSafe(d.lastSeenAt);
            if (!seenAt) continue;
            const parentGw = d.parentDeviceId ? deviceById.get(d.parentDeviceId) : (d.lastSeenByDeviceId ? deviceById.get(d.lastSeenByDeviceId) : null);
            const loc = d.lastLocation && typeof d.lastLocation.lat === 'number' ? d.lastLocation : null;
            const speedMph = loc && typeof loc.speedKph === 'number' ? Math.round(loc.speedKph * 0.621371) : null;
            const model = getModel(d.modelId);

            rows.push({
                id: `heartbeat-${d.id}-${seenAt.getTime()}`,
                timestamp: seenAt,
                category: d.role === 'tag' ? 'ble_tag_scan' : 'gps_telemetry',
                categoryLabel: d.role === 'tag' ? 'Live BLE Tag Sighting' : 'Live Gateway Heartbeat',
                severity: 'info',
                severityRank: 1,
                status: 'logged',
                deviceId: d.id,
                deviceLabel: d.label,
                deviceIdentifier: d.identifier,
                gatewayId: d.role === 'gateway' ? d.id : (parentGw?.id || null),
                gatewayLabel: d.role === 'gateway' ? d.label : (parentGw?.label || '—'),
                personName: d.assignedToName || parentGw?.assignedToName || 'Unassigned',
                detail: d.role === 'tag'
                    ? `BLE beacon detected by ${parentGw?.label || 'gateway'}${d.lastRssi != null ? ` at ${d.lastRssi} dBm` : ''}${d.reportedBatteryLevel != null ? ` · Battery ${Math.round(d.reportedBatteryLevel)}%` : ''}`
                    : `${model.name} LTE check-in${d.reportedBatteryLevel != null ? ` · Backup battery ${Math.round(d.reportedBatteryLevel)}%` : ''}${typeof d.ignitionOn === 'boolean' ? ` · Ignition ${d.ignitionOn ? 'On' : 'Off'}` : ''}${loc ? ` · GPS (${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)})` : ' · Stationary eco sleep mode (awaiting GPS fix)'}`,
                lat: loc ? loc.lat : null,
                lng: loc ? loc.lng : null,
                mapsUrl: loc ? `https://www.google.com/maps?q=${loc.lat.toFixed(5)},${loc.lng.toFixed(5)}` : null,
                rssi: d.lastRssi ?? null,
                batteryLevel: typeof d.reportedBatteryLevel === 'number' ? Math.round(d.reportedBatteryLevel) : null,
                speedMph,
                distanceFt: null,
                isTest: !!d.isDemo,
                rawSource: 'tracker_devices',
            });
        }

        // C. Historical GPS & BLE Relay Points (tracker_locations)
        for (const d of devices) {
            const pts = historyByDevice[d.id] || [];
            const parentGw = d.parentDeviceId ? deviceById.get(d.parentDeviceId) : null;
            for (const pt of pts) {
                const recAt = toDateSafe(pt.recordedAt);
                if (!recAt) continue;
                const viaGw = pt.viaDeviceId ? deviceById.get(pt.viaDeviceId) : parentGw;
                const speedMph = typeof pt.speedKph === 'number' ? Math.round(pt.speedKph * 0.621371) : null;
                const isRelay = pt.source === 'gateway_relay' || d.role === 'tag';

                rows.push({
                    id: `loc-${d.id}-${pt.id}`,
                    timestamp: recAt,
                    category: isRelay ? 'ble_tag_scan' : 'gps_telemetry',
                    categoryLabel: pt.source === 'manual'
                        ? 'Manual Location Pin'
                        : isRelay
                        ? 'BLE Tag Relay Point'
                        : 'Vehicle GPS Breadcrumb',
                    severity: 'info',
                    severityRank: 1,
                    status: 'logged',
                    deviceId: d.id,
                    deviceLabel: d.label,
                    deviceIdentifier: d.identifier,
                    gatewayId: d.role === 'gateway' ? d.id : (viaGw?.id || null),
                    gatewayLabel: d.role === 'gateway' ? d.label : (viaGw?.label || '—'),
                    personName: d.assignedToName || viaGw?.assignedToName || 'Unassigned',
                    detail: `${pt.source === 'manual' ? 'Manual location logged' : isRelay ? `Relayed via ${viaGw?.label || 'gateway'}` : 'GPS coordinate logged'} (${pt.lat.toFixed(5)}, ${pt.lng.toFixed(5)})${speedMph ? ` · ${speedMph} mph` : ' · Parked'}${pt.rssi != null ? ` · ${pt.rssi} dBm` : ''}`,
                    lat: pt.lat,
                    lng: pt.lng,
                    mapsUrl: `https://www.google.com/maps?q=${pt.lat.toFixed(5)},${pt.lng.toFixed(5)}`,
                    rssi: pt.rssi ?? null,
                    batteryLevel: typeof pt.batteryLevel === 'number' ? Math.round(pt.batteryLevel) : null,
                    speedMph,
                    distanceFt: null,
                    isTest: !!d.isDemo || pt.source === 'demo',
                    rawSource: 'tracker_locations',
                });
            }
        }

        // D. Dispatched Tracker SMS Logs (sms_messages)
        for (const m of smsLogs) {
            const ts = toDateSafe(m.createdAt || m.sentAt || m.timestamp) || new Date();
            rows.push({
                id: `sms-${m.id}`,
                timestamp: ts,
                category: 'sms_log',
                categoryLabel: 'Dispatched SMS Text',
                severity: 'info',
                severityRank: 2,
                status: 'logged',
                deviceId: null,
                deviceLabel: m.customerName || 'SMS Notification',
                deviceIdentifier: m.to || m.toPhone || '—',
                gatewayId: null,
                gatewayLabel: 'Twilio SMS Gateway',
                personName: m.customerName || m.to || 'Recipient',
                detail: String(m.body || ''),
                lat: null,
                lng: null,
                mapsUrl: null,
                rssi: null,
                batteryLevel: null,
                speedMph: null,
                distanceFt: null,
                isTest: false,
                rawSource: 'sms_messages',
            });
        }

        return rows;
    }, [alerts, devices, historyByDevice, smsLogs, deviceById]);

    // Filter rows
    const filteredRows = useMemo(() => {
        const now = Date.now();
        const q = searchQuery.trim().toLowerCase();

        let minTime: number | null = null;
        let maxTime: number | null = null;
        if (datePreset === 'today') {
            const start = new Date();
            start.setHours(0, 0, 0, 0);
            minTime = start.getTime();
        } else if (datePreset === '24h') {
            minTime = now - 24 * 3600 * 1000;
        } else if (datePreset === '7d') {
            minTime = now - 7 * 86400 * 1000;
        } else if (datePreset === '30d') {
            minTime = now - 30 * 86400 * 1000;
        } else if (datePreset === '90d') {
            minTime = now - 90 * 86400 * 1000;
        } else if (datePreset === 'custom') {
            if (customStartDate) minTime = new Date(customStartDate + 'T00:00:00').getTime();
            if (customEndDate) maxTime = new Date(customEndDate + 'T23:59:59').getTime();
        }

        return allRows.filter(r => {
            const t = r.timestamp.getTime();
            if (minTime !== null && t < minTime) return false;
            if (maxTime !== null && t > maxTime) return false;

            if (sourceMode === 'live_only' && r.isTest) return false;
            if (sourceMode === 'test_only' && !r.isTest) return false;

            if (categoryFilter === 'alerts_only') {
                if (!['left_behind', 'recovered', 'customer_messaging', 'theft_idle'].includes(r.category)) return false;
            } else if (categoryFilter !== 'all' && r.category !== categoryFilter) {
                return false;
            }

            if (statusFilter === 'active' && r.status !== 'active') return false;
            if (statusFilter === 'resolved' && r.status !== 'resolved') return false;
            if (statusFilter === 'critical_warning' && !['critical', 'warning'].includes(r.severity)) return false;
            if (statusFilter === 'telemetry' && r.status !== 'logged') return false;

            if (deviceFilter !== 'all' && r.deviceId !== deviceFilter && r.gatewayId !== deviceFilter) return false;
            if (gatewayFilter !== 'all' && r.gatewayId !== gatewayFilter && r.deviceId !== gatewayFilter) return false;

            if (q) {
                const hay = [
                    r.deviceLabel,
                    r.deviceIdentifier,
                    r.gatewayLabel,
                    r.personName,
                    r.categoryLabel,
                    r.detail,
                    r.lat !== null ? `${r.lat.toFixed(5)}, ${r.lng?.toFixed(5)}` : ''
                ].join(' ').toLowerCase();
                if (!hay.includes(q)) return false;
            }

            return true;
        });
    }, [allRows, searchQuery, categoryFilter, statusFilter, deviceFilter, gatewayFilter, datePreset, customStartDate, customEndDate, sourceMode]);

    // Sort rows
    const sortedRows = useMemo(() => {
        const copy = [...filteredRows];
        const mul = sortDir === 'asc' ? 1 : -1;
        copy.sort((a, b) => {
            switch (sortField) {
                case 'timestamp':
                    return (a.timestamp.getTime() - b.timestamp.getTime()) * mul;
                case 'severity':
                    return ((a.severityRank - b.severityRank) || (a.timestamp.getTime() - b.timestamp.getTime())) * mul;
                case 'category':
                    return a.categoryLabel.localeCompare(b.categoryLabel) * mul;
                case 'device':
                    return a.deviceLabel.localeCompare(b.deviceLabel) * mul;
                case 'gateway':
                    return a.gatewayLabel.localeCompare(b.gatewayLabel) * mul;
                case 'person':
                    return a.personName.localeCompare(b.personName) * mul;
                case 'metric': {
                    const mA = a.distanceFt ?? a.speedMph ?? a.batteryLevel ?? a.rssi ?? -999;
                    const mB = b.distanceFt ?? b.speedMph ?? b.batteryLevel ?? b.rssi ?? -999;
                    return (mA - mB) * mul;
                }
                default:
                    return (a.timestamp.getTime() - b.timestamp.getTime()) * mul;
            }
        });
        return copy;
    }, [filteredRows, sortField, sortDir]);

    // KPI counts
    const kpis = useMemo(() => {
        const activeAlerts = allRows.filter(r => r.status === 'active').length;
        const leftBehindCount = allRows.filter(r => r.category === 'left_behind' || r.category === 'theft_idle').length;
        const customerMsgCount = allRows.filter(r => r.category === 'customer_messaging' || r.category === 'sms_log').length;
        const telemetryCount = allRows.filter(r => r.category === 'gps_telemetry' || r.category === 'ble_tag_scan').length;
        return {
            total: allRows.length,
            activeAlerts,
            leftBehindCount,
            customerMsgCount,
            telemetryCount,
        };
    }, [allRows]);

    const toggleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDir('desc');
        }
        setCurrentPage(1);
    };

    const resetFilters = () => {
        setSearchQuery('');
        setCategoryFilter('all');
        setStatusFilter('all');
        setDeviceFilter('all');
        setGatewayFilter('all');
        setDatePreset('30d');
        setCustomStartDate('');
        setCustomEndDate('');
        setSourceMode('all');
        setSortField('timestamp');
        setSortDir('desc');
        setCurrentPage(1);
    };

    const handleResolveAlert = async (alertDocId: string) => {
        try {
            await updateDoc(doc(db, 'tracker_alerts', alertDocId), {
                status: 'resolved',
                resolvedReason: 'acknowledged_in_report',
            });
            toast.success('Alert acknowledged & marked resolved');
        } catch {
            toast.error('Could not resolve alert');
        }
    };

    const handleResolveAllActive = async () => {
        const activeList = alerts.filter(a => a.status === 'active');
        if (!activeList.length) return;
        try {
            const b = writeBatch(db);
            activeList.forEach(a => {
                b.update(doc(db, 'tracker_alerts', a.id), {
                    status: 'resolved',
                    resolvedReason: 'bulk_acknowledged_in_report',
                });
            });
            await b.commit();
            toast.success(`Resolved ${activeList.length} active alert(s)`);
        } catch {
            toast.error('Could not resolve active alerts');
        }
    };

    const handleDeleteAlert = async (alertDocId: string) => {
        try {
            await deleteDoc(doc(db, 'tracker_alerts', alertDocId));
            toast.success('Alert entry deleted');
        } catch {
            toast.error('Could not delete alert entry');
        }
    };

    const handleRunServerCheck = async () => {
        setRunningServerRules(true);
        toast.loading('Running 24/7 server rule engine across all gateways & tags...', { id: 'srv-check' });
        try {
            const fn = httpsCallable(functions, 'triggerTrackerRuleAlert');
            const res: any = await fn({ orgId, mode: 'evaluate_all' });
            const triggered: string[] = res?.data?.triggered || [];
            toast.dismiss('srv-check');
            if (triggered.length) {
                toast.success(`Server triggered ${triggered.length} rule event(s): ${triggered.join(', ')}`);
            } else {
                toast.success('Server rule check complete — all devices in range and on schedule');
            }
        } catch (err: any) {
            toast.dismiss('srv-check');
            toast.error(err?.message || 'Rule check failed');
        } finally {
            setRunningServerRules(false);
        }
    };

    const exportCsv = () => {
        if (!sortedRows.length) {
            toast.error('No rows to export for current filter');
            return;
        }
        const headers = [
            'Timestamp',
            'Category',
            'Severity',
            'Status',
            'Device / Tag',
            'MAC / IMEI',
            'Gateway / Vehicle',
            'Technician / Customer',
            'Detail',
            'Latitude',
            'Longitude',
            'RSSI (dBm)',
            'Battery (%)',
            'Speed (mph)',
            'Distance (ft)',
            'Google Maps URL'
        ];
        const escapeCell = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const csvLines = [
            headers.map(escapeCell).join(','),
            ...sortedRows.map(r => [
                r.timestamp.toISOString(),
                r.categoryLabel,
                r.severity.toUpperCase(),
                r.status.toUpperCase(),
                r.deviceLabel,
                r.deviceIdentifier,
                r.gatewayLabel,
                r.personName,
                r.detail,
                r.lat ?? '',
                r.lng ?? '',
                r.rssi ?? '',
                r.batteryLevel ?? '',
                r.speedMph ?? '',
                r.distanceFt ?? '',
                r.mapsUrl ?? ''
            ].map(escapeCell).join(','))
        ];
        const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dispatchbox-tracker-alerts-logs-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success(`Exported ${sortedRows.length} rows to CSV`);
    };

    const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(sortedRows.length / pageSize));
    const visibleRows = useMemo(() => {
        if (pageSize === 0) return sortedRows;
        const start = (currentPage - 1) * pageSize;
        return sortedRows.slice(start, start + pageSize);
    }, [sortedRows, currentPage, pageSize]);

    const SortIcon: React.FC<{ field: SortField }> = ({ field }) => {
        if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-slate-400" />;
        return sortDir === 'asc'
            ? <ArrowUp className="w-3 h-3 text-indigo-600" />
            : <ArrowDown className="w-3 h-3 text-indigo-600" />;
    };

    return (
        <div className="space-y-6">
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-2xl shadow-xl border border-indigo-900/60 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1.5">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-200 text-xs font-bold border border-emerald-400/30">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        24/7 Cloud Audit Trail · Alerts, Customer SMS & Hardware Telemetry
                    </div>
                    <h2 className="text-2xl font-black tracking-tight">Tracker Alerts, SMS & Telemetry Logs Report</h2>
                    <p className="text-xs text-indigo-200 max-w-2xl">
                        Filter, sort, and export every left-behind tool alert, automated customer arrival/traffic SMS, and gateway/BLE tag check-in recorded across your fleet.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => loadTelemetryHistory(devices)}
                        disabled={loadingHistory}
                        className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 border border-white/15 disabled:opacity-50"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
                        Refresh Logs
                    </button>
                    <button
                        type="button"
                        onClick={handleRunServerCheck}
                        disabled={runningServerRules}
                        className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                    >
                        <Zap className="w-3.5 h-3.5" />
                        {runningServerRules ? 'Checking Rules...' : 'Run Server Rule Check'}
                    </button>
                    <button
                        type="button"
                        onClick={exportCsv}
                        className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black flex items-center gap-1.5 shadow-sm"
                    >
                        <Download className="w-3.5 h-3.5" />
                        Export CSV ({sortedRows.length})
                    </button>
                </div>
            </div>

            {/* Interactive KPI Quick-Filter Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <button
                    type="button"
                    onClick={() => { setCategoryFilter('all'); setStatusFilter('all'); setCurrentPage(1); }}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                        categoryFilter === 'all' && statusFilter === 'all'
                            ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                            : 'bg-white text-slate-900 border-slate-200 hover:border-slate-300 shadow-sm'
                    }`}
                >
                    <div className="text-[10px] font-black uppercase tracking-wider opacity-75">Total Logged Events</div>
                    <div className="text-2xl font-black mt-1">{kpis.total}</div>
                    <div className="text-[11px] opacity-75 mt-0.5">All alerts, texts & check-ins</div>
                </button>

                <button
                    type="button"
                    onClick={() => { setStatusFilter(statusFilter === 'active' ? 'all' : 'active'); setCurrentPage(1); }}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                        statusFilter === 'active'
                            ? 'bg-red-600 text-white border-red-600 shadow-md'
                            : 'bg-white text-slate-900 border-slate-200 hover:border-red-300 shadow-sm'
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider opacity-75">Active Alerts</span>
                        <AlertTriangle className={`w-4 h-4 ${statusFilter === 'active' ? 'text-white' : 'text-red-600'}`} />
                    </div>
                    <div className="text-2xl font-black mt-1">{kpis.activeAlerts}</div>
                    <div className="text-[11px] opacity-75 mt-0.5">Unresolved rule triggers</div>
                </button>

                <button
                    type="button"
                    onClick={() => { setCategoryFilter(categoryFilter === 'left_behind' ? 'all' : 'left_behind'); setStatusFilter('all'); setCurrentPage(1); }}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                        categoryFilter === 'left_behind'
                            ? 'bg-amber-600 text-white border-amber-600 shadow-md'
                            : 'bg-white text-slate-900 border-slate-200 hover:border-amber-300 shadow-sm'
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider opacity-75">Left-Behind & Theft</span>
                        <ShieldAlert className={`w-4 h-4 ${categoryFilter === 'left_behind' ? 'text-white' : 'text-amber-600'}`} />
                    </div>
                    <div className="text-2xl font-black mt-1">{kpis.leftBehindCount}</div>
                    <div className="text-[11px] opacity-75 mt-0.5">Tool separation & movement</div>
                </button>

                <button
                    type="button"
                    onClick={() => { setCategoryFilter(categoryFilter === 'customer_messaging' ? 'all' : 'customer_messaging'); setStatusFilter('all'); setCurrentPage(1); }}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                        categoryFilter === 'customer_messaging'
                            ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                            : 'bg-white text-slate-900 border-slate-200 hover:border-blue-300 shadow-sm'
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider opacity-75">Customer ETA & SMS</span>
                        <MessageSquare className={`w-4 h-4 ${categoryFilter === 'customer_messaging' ? 'text-white' : 'text-blue-600'}`} />
                    </div>
                    <div className="text-2xl font-black mt-1">{kpis.customerMsgCount}</div>
                    <div className="text-[11px] opacity-75 mt-0.5">Arrival & traffic delay texts</div>
                </button>

                <button
                    type="button"
                    onClick={() => { setCategoryFilter(categoryFilter === 'gps_telemetry' ? 'all' : 'gps_telemetry'); setStatusFilter('all'); setCurrentPage(1); }}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                        categoryFilter === 'gps_telemetry'
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                            : 'bg-white text-slate-900 border-slate-200 hover:border-emerald-300 shadow-sm'
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider opacity-75">GPS & BLE Check-Ins</span>
                        <Router className={`w-4 h-4 ${categoryFilter === 'gps_telemetry' ? 'text-white' : 'text-emerald-600'}`} />
                    </div>
                    <div className="text-2xl font-black mt-1">{kpis.telemetryCount}</div>
                    <div className="text-[11px] opacity-75 mt-0.5">Gateway & tag breadcrumbs</div>
                </button>
            </div>

            {/* Multi-Dimensional Filter & Sort Control Panel */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-700">
                        <Filter className="w-4 h-4 text-indigo-600" />
                        Filter & Sort Controls
                        <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px]">
                            Showing {sortedRows.length} of {allRows.length} events
                        </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {kpis.activeAlerts > 0 && (
                            <button
                                type="button"
                                onClick={handleResolveAllActive}
                                className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-1"
                            >
                                <Check className="w-3.5 h-3.5" /> Acknowledge All Active ({kpis.activeAlerts})
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1"
                        >
                            <X className="w-3.5 h-3.5" /> Reset All Filters
                        </button>
                    </div>
                </div>

                {/* Row 1: Search + Date Presets */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                    <div className="lg:col-span-5 relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            placeholder="Search device, MAC/IMEI, vehicle, tech, customer, coordinates, or message..."
                            className="w-full pl-9 pr-8 py-2 border border-slate-300 rounded-xl text-xs font-semibold bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    <div className="lg:col-span-7 flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                        {(
                            [
                                { id: 'today', label: 'Today' },
                                { id: '24h', label: 'Last 24h' },
                                { id: '7d', label: '7 Days' },
                                { id: '30d', label: '30 Days' },
                                { id: '90d', label: '90 Days' },
                                { id: 'all', label: 'All Time' },
                                { id: 'custom', label: 'Custom Dates' },
                            ] as Array<{ id: DatePreset; label: string }>
                        ).map(p => (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => { setDatePreset(p.id); setCurrentPage(1); }}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                                    datePreset === p.id
                                        ? 'bg-white text-indigo-700 shadow-sm'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>

                {datePreset === 'custom' && (
                    <div className="flex flex-wrap items-center gap-3 p-3 bg-indigo-50/50 rounded-xl border border-indigo-200 text-xs">
                        <label className="flex items-center gap-2 font-bold text-slate-700">
                            From:
                            <input
                                type="date"
                                value={customStartDate}
                                onChange={e => { setCustomStartDate(e.target.value); setCurrentPage(1); }}
                                className="px-2.5 py-1 border border-slate-300 rounded-lg bg-white font-semibold"
                            />
                        </label>
                        <label className="flex items-center gap-2 font-bold text-slate-700">
                            To:
                            <input
                                type="date"
                                value={customEndDate}
                                onChange={e => { setCustomEndDate(e.target.value); setCurrentPage(1); }}
                                className="px-2.5 py-1 border border-slate-300 rounded-lg bg-white font-semibold"
                            />
                        </label>
                    </div>
                )}

                {/* Row 2: Dropdown Filters & Explicit Sort Selector */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Event Category</label>
                        <select
                            value={categoryFilter}
                            onChange={e => { setCategoryFilter(e.target.value as ReportCategory); setCurrentPage(1); }}
                            className="w-full px-2.5 py-2 border border-slate-300 rounded-xl text-xs font-bold bg-white"
                        >
                            <option value="all">All Categories</option>
                            <option value="alerts_only">🚨 All Rule Alerts Only</option>
                            <option value="left_behind">⚠️ Left-Behind Tool Alerts</option>
                            <option value="recovered">✅ Tool Recoveries</option>
                            <option value="customer_messaging">💬 Customer Arrival & Traffic SMS</option>
                            <option value="theft_idle">🛡️ After-Hours Theft & Idle</option>
                            <option value="gps_telemetry">📍 Gateway GPS Check-Ins</option>
                            <option value="ble_tag_scan">🏷️ BLE Tag Sightings & Relays</option>
                            <option value="sms_log">📱 Dispatched SMS Texts</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Status / Severity</label>
                        <select
                            value={statusFilter}
                            onChange={e => { setStatusFilter(e.target.value as ReportStatusFilter); setCurrentPage(1); }}
                            className="w-full px-2.5 py-2 border border-slate-300 rounded-xl text-xs font-bold bg-white"
                        >
                            <option value="all">All Statuses</option>
                            <option value="active">🔴 Active / Unresolved Only</option>
                            <option value="critical_warning">🟠 Critical & Warning Alerts</option>
                            <option value="resolved">🟢 Resolved / Acknowledged</option>
                            <option value="telemetry">🔵 Telemetry & Check-In Logs</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Device / Tag</label>
                        <select
                            value={deviceFilter}
                            onChange={e => { setDeviceFilter(e.target.value); setCurrentPage(1); }}
                            className="w-full px-2.5 py-2 border border-slate-300 rounded-xl text-xs font-bold bg-white"
                        >
                            <option value="all">All Devices ({devices.length})</option>
                            {devices.map(d => (
                                <option key={d.id} value={d.id}>
                                    {d.role === 'gateway' ? '📡 ' : '🏷️ '}
                                    {d.label} ({d.identifier})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Gateway / Vehicle</label>
                        <select
                            value={gatewayFilter}
                            onChange={e => { setGatewayFilter(e.target.value); setCurrentPage(1); }}
                            className="w-full px-2.5 py-2 border border-slate-300 rounded-xl text-xs font-bold bg-white"
                        >
                            <option value="all">All Gateways ({gateways.length})</option>
                            {gateways.map(g => (
                                <option key={g.id} value={g.id}>
                                    {g.label} ({g.identifier})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Event Source</label>
                        <select
                            value={sourceMode}
                            onChange={e => { setSourceMode(e.target.value as any); setCurrentPage(1); }}
                            className="w-full px-2.5 py-2 border border-slate-300 rounded-xl text-xs font-bold bg-white"
                        >
                            <option value="all">Live Hardware + Test Simulations</option>
                            <option value="live_only">Live Hardware Events Only</option>
                            <option value="test_only">Test Simulations Only</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1">Sort By & Direction</label>
                        <div className="flex items-center gap-1">
                            <select
                                value={sortField}
                                onChange={e => { setSortField(e.target.value as SortField); setCurrentPage(1); }}
                                className="w-full px-2.5 py-2 border border-slate-300 rounded-xl text-xs font-bold bg-white"
                            >
                                <option value="timestamp">Timestamp (Date/Time)</option>
                                <option value="severity">Severity / Priority</option>
                                <option value="category">Event Category</option>
                                <option value="device">Device / Tag Name</option>
                                <option value="gateway">Gateway / Vehicle</option>
                                <option value="person">Tech / Customer</option>
                                <option value="metric">Distance / Speed / Signal</option>
                            </select>
                            <button
                                type="button"
                                onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))}
                                className="px-2.5 py-2 border border-slate-300 rounded-xl bg-slate-50 hover:bg-slate-100 text-xs font-black shrink-0"
                                title={sortDir === 'desc' ? 'Descending (Newest / Highest first)' : 'Ascending (Oldest / Lowest first)'}
                            >
                                {sortDir === 'desc' ? '↓' : '↑'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Sortable Audit Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-black uppercase tracking-wider text-slate-500">
                                <th className="py-3 px-4 cursor-pointer hover:text-slate-900 select-none" onClick={() => toggleSort('timestamp')}>
                                    <div className="flex items-center gap-1.5">Date & Time <SortIcon field="timestamp" /></div>
                                </th>
                                <th className="py-3 px-4 cursor-pointer hover:text-slate-900 select-none" onClick={() => toggleSort('category')}>
                                    <div className="flex items-center gap-1.5">Category & Type <SortIcon field="category" /></div>
                                </th>
                                <th className="py-3 px-4 cursor-pointer hover:text-slate-900 select-none" onClick={() => toggleSort('device')}>
                                    <div className="flex items-center gap-1.5">Device / Asset <SortIcon field="device" /></div>
                                </th>
                                <th className="py-3 px-4 cursor-pointer hover:text-slate-900 select-none" onClick={() => toggleSort('gateway')}>
                                    <div className="flex items-center gap-1.5">Gateway / Vehicle <SortIcon field="gateway" /></div>
                                </th>
                                <th className="py-3 px-4 cursor-pointer hover:text-slate-900 select-none" onClick={() => toggleSort('person')}>
                                    <div className="flex items-center gap-1.5">Tech / Customer <SortIcon field="person" /></div>
                                </th>
                                <th className="py-3 px-4">Event Details & Telemetry</th>
                                <th className="py-3 px-4 cursor-pointer hover:text-slate-900 select-none" onClick={() => toggleSort('metric')}>
                                    <div className="flex items-center gap-1.5">Signal / Metrics <SortIcon field="metric" /></div>
                                </th>
                                <th className="py-3 px-4 cursor-pointer hover:text-slate-900 select-none text-right" onClick={() => toggleSort('severity')}>
                                    <div className="flex items-center justify-end gap-1.5">Status / Action <SortIcon field="severity" /></div>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                            {visibleRows.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="py-12 text-center text-slate-500">
                                        <Bell className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                        <p className="font-bold text-slate-800 text-sm">No tracker alerts or telemetry logs match your active filters.</p>
                                        <p className="text-xs text-slate-500 mt-1">Try widening the date range or clicking "Reset All Filters".</p>
                                    </td>
                                </tr>
                            ) : (
                                visibleRows.map(row => {
                                    const isExpanded = expandedRowId === row.id;
                                    const badgeTone =
                                        row.severity === 'critical' ? 'bg-red-100 text-red-800 border-red-200' :
                                        row.severity === 'warning' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                                        row.severity === 'success' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                                        'bg-slate-100 text-slate-700 border-slate-200';

                                    return (
                                        <React.Fragment key={row.id}>
                                            <tr
                                                onClick={() => setExpandedRowId(isExpanded ? null : row.id)}
                                                className={`hover:bg-slate-50/90 transition-colors cursor-pointer ${
                                                    row.status === 'active' ? 'bg-red-50/30' : ''
                                                }`}
                                            >
                                                <td className="py-3 px-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-1.5 font-bold text-slate-900">
                                                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                                                        {row.timestamp.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 pl-5">{formatRelative(row.timestamp)}</div>
                                                </td>

                                                <td className="py-3 px-4 whitespace-nowrap">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase border ${badgeTone}`}>
                                                        {row.categoryLabel}
                                                    </span>
                                                    {row.isTest && (
                                                        <span className="ml-1.5 px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-[9px] font-black uppercase">
                                                            Test
                                                        </span>
                                                    )}
                                                </td>

                                                <td className="py-3 px-4">
                                                    <div className="font-extrabold text-slate-900">{row.deviceLabel}</div>
                                                    <div className="text-[10px] font-mono text-slate-500">{row.deviceIdentifier}</div>
                                                </td>

                                                <td className="py-3 px-4">
                                                    <div className="font-bold text-slate-800">{row.gatewayLabel}</div>
                                                </td>

                                                <td className="py-3 px-4">
                                                    <div className="font-semibold text-slate-800">{row.personName}</div>
                                                </td>

                                                <td className="py-3 px-4 max-w-md">
                                                    <p className="text-slate-700 font-medium line-clamp-2">{row.detail}</p>
                                                    {row.mapsUrl && (
                                                        <a
                                                            href={row.mapsUrl}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            onClick={e => e.stopPropagation()}
                                                            className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:underline"
                                                        >
                                                            <MapPin className="w-3 h-3" />
                                                            {row.lat !== null && row.lng !== null ? `${row.lat.toFixed(5)}, ${row.lng.toFixed(5)}` : 'Open Map'}
                                                            <ExternalLink className="w-2.5 h-2.5" />
                                                        </a>
                                                    )}
                                                </td>

                                                <td className="py-3 px-4 whitespace-nowrap">
                                                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                                        {row.distanceFt != null && (
                                                            <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-bold border border-red-200">
                                                                {row.distanceFt} ft
                                                            </span>
                                                        )}
                                                        {row.rssi != null && (
                                                            <span className="px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-800 font-mono font-bold border border-cyan-200">
                                                                {row.rssi} dBm
                                                            </span>
                                                        )}
                                                        {row.batteryLevel != null && (
                                                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 font-bold border border-emerald-200">
                                                                {row.batteryLevel}%
                                                            </span>
                                                        )}
                                                        {row.speedMph != null && row.speedMph > 0 && (
                                                            <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 font-bold border border-indigo-200">
                                                                {row.speedMph} mph
                                                            </span>
                                                        )}
                                                        {row.distanceFt == null && row.rssi == null && row.batteryLevel == null && !row.speedMph && (
                                                            <span className="text-slate-400">—</span>
                                                        )}
                                                    </div>
                                                </td>

                                                <td className="py-3 px-4 whitespace-nowrap text-right" onClick={e => e.stopPropagation()}>
                                                    <div className="inline-flex items-center gap-1.5">
                                                        {row.status === 'active' ? (
                                                            <>
                                                                <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-black uppercase">
                                                                    Active
                                                                </span>
                                                                {row.alertDocId && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleResolveAlert(row.alertDocId!)}
                                                                        className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-700 text-white text-[10px] font-bold"
                                                                    >
                                                                        Acknowledge
                                                                    </button>
                                                                )}
                                                            </>
                                                        ) : row.status === 'resolved' ? (
                                                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                                                Resolved
                                                            </span>
                                                        ) : (
                                                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
                                                                Logged
                                                            </span>
                                                        )}
                                                        {row.alertDocId && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteAlert(row.alertDocId!)}
                                                                className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                                                                title="Delete alert log entry"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>

                                            {isExpanded && (
                                                <tr className="bg-slate-50/80 border-b border-slate-200">
                                                    <td colSpan={8} className="p-4">
                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                                                            <div className="space-y-1 bg-white p-3 rounded-xl border border-slate-200">
                                                                <div className="text-[10px] font-black uppercase text-slate-400">Event & Source Metadata</div>
                                                                <div><strong>Full Timestamp:</strong> {row.timestamp.toISOString()}</div>
                                                                <div><strong>Source Collection:</strong> <span className="font-mono">{row.rawSource}</span></div>
                                                                <div><strong>Category:</strong> {row.categoryLabel} ({row.severity})</div>
                                                            </div>
                                                            <div className="space-y-1 bg-white p-3 rounded-xl border border-slate-200">
                                                                <div className="text-[10px] font-black uppercase text-slate-400">Hardware & Assignment</div>
                                                                <div><strong>Device / Asset:</strong> {row.deviceLabel} (<span className="font-mono">{row.deviceIdentifier}</span>)</div>
                                                                <div><strong>Gateway / Relay:</strong> {row.gatewayLabel}</div>
                                                                <div><strong>Assigned / Recipient:</strong> {row.personName}</div>
                                                            </div>
                                                            <div className="space-y-1 bg-white p-3 rounded-xl border border-slate-200">
                                                                <div className="text-[10px] font-black uppercase text-slate-400">Full Message & Coordinates</div>
                                                                <p className="text-slate-700 font-medium">{row.detail}</p>
                                                                {row.mapsUrl && (
                                                                    <a
                                                                        href={row.mapsUrl}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        className="inline-flex items-center gap-1 text-blue-600 font-bold hover:underline pt-1"
                                                                    >
                                                                        View Exact Pin on Google Maps <ExternalLink className="w-3 h-3" />
                                                                    </a>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Footer */}
                <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2 font-semibold text-slate-600">
                        <span>Rows per page:</span>
                        <select
                            value={pageSize}
                            onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                            className="px-2 py-1 border border-slate-300 rounded-lg bg-white font-bold"
                        >
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                            <option value={0}>All ({sortedRows.length})</option>
                        </select>
                        <span className="text-slate-400">·</span>
                        <span>
                            Showing {sortedRows.length === 0 ? 0 : (currentPage - 1) * (pageSize || sortedRows.length) + 1}–
                            {pageSize === 0 ? sortedRows.length : Math.min(currentPage * pageSize, sortedRows.length)} of {sortedRows.length}
                        </span>
                    </div>

                    {pageSize > 0 && totalPages > 1 && (
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                disabled={currentPage <= 1}
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                className="px-3 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 font-bold disabled:opacity-40"
                            >
                                Previous
                            </button>
                            <span className="px-2 font-bold text-slate-700">
                                Page {currentPage} of {totalPages}
                            </span>
                            <button
                                type="button"
                                disabled={currentPage >= totalPages}
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                className="px-3 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 font-bold disabled:opacity-40"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

