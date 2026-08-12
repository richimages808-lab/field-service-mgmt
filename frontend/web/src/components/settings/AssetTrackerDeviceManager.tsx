/**
 * AssetTrackerDeviceManager.tsx - Complete Hardware Tracker Catalog (20+ Ecosystems) & Advanced Alert Rules
 * 
 * Features:
 * - Displays ALL 20+ specific hardware tracker models from TOP_TRACKER_CATALOG (Apple AirTag, Milwaukee TICK, DeWalt Tool Connect, Samsung SmartTag2, Tile Pro, Samsara, LandAirSea, Minew, etc.)
 * - Customer Traffic & En-Route Late Arrival SMS Alert Configuration Engine
 * - Dual Technician & Dispatcher Left-Behind Tool Alert Dispatch Configuration
 * - Advanced Business Tracker Use Cases Grid (After-Hours Theft, Engine Idle, Safety Inspections, Automated Jobsite Check-In)
 */
import React, { useState } from 'react';
import {
    Tag,
    Shield,
    CheckCircle,
    AlertTriangle,
    Bell,
    Smartphone,
    MapPin,
    Wifi,
    Compass,
    Radio,
    Settings,
    Info,
    Check,
    Send,
    HelpCircle,
    ExternalLink,
    Zap,
    Users,
    Car,
    Clock,
    Filter,
    Search,
    ShieldAlert,
    Navigation,
    HardHat,
    Package,
    Wrench,
    MessageSquare,
    Truck
} from 'lucide-react';
import toast from 'react-hot-toast';
import { TOP_TRACKER_CATALOG, TrackerDeviceModel } from '../../utils/trackerCatalog';

export interface AssetTrackerDeviceManagerProps {
    settings: any;
    onUpdateSettings: (newSettings: Partial<any>) => void;
}

export const AssetTrackerDeviceManager: React.FC<AssetTrackerDeviceManagerProps> = ({
    settings,
    onUpdateSettings
}) => {
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [selectedDevice, setSelectedDevice] = useState<TrackerDeviceModel>(TOP_TRACKER_CATALOG[0]);
    const [isSimulatingAlert, setIsSimulatingAlert] = useState(false);
    const [isSimulatingTrafficAlert, setIsSimulatingTrafficAlert] = useState(false);

    // Active enabled tracker models in org settings
    const activeTrackers: string[] = settings.activeTrackerTypes || ['apple_airtag', 'tile_pro', 'minew_ble_tag', 'samsara_ag52'];

    // Notification settings
    const notifyTechSms = settings.trackerAlertsTechSms ?? true;
    const notifyDispatcherConsole = settings.trackerAlertsDispatcherConsole ?? true;
    const notifyFleetManager = settings.trackerAlertsFleetManager ?? false;
    const alertDistanceFt = settings.trackerAlertDistanceFt || 500;

    // Traffic Customer SMS Alert Settings
    const customerTrafficSmsEnabled = settings.trackerAlertsCustomerTrafficSms ?? true;
    const trafficThresholdMin = settings.trackerAlertCustomerTrafficThresholdMin || 10;

    // Advanced Operational Workflows & Operational Modes Settings
    const afterHoursTheftEnabled = settings.trackerAlertsAfterHoursTheft ?? true;
    const afterHoursWindow = settings.trackerAlertsAfterHoursWindow || '8pm_6am';
    const engineIdleEnabled = settings.trackerAlertsEngineIdle ?? true;
    const engineIdleThresholdMin = settings.trackerAlertsEngineIdleThresholdMin || 15;
    const jobsiteArrivalEnabled = settings.trackerAlertsJobsiteArrivalCheckin ?? true;
    const jobsiteArrivalRadiusFt = settings.trackerAlertsJobsiteArrivalRadiusFt || 250;
    const safetyInspectionEnabled = settings.trackerAlertsSafetyInspectionDue ?? true;
    const safetyLeadDays = settings.trackerAlertsSafetyLeadDays || 14;
    const lockboxAntiTheftEnabled = settings.trackerAlertsLockboxAntiTheft ?? true;
    const lockboxSensitivity = settings.trackerAlertsLockboxSensitivity || 'high';

    const toggleTrackerType = (id: string) => {
        const updated = activeTrackers.includes(id)
            ? activeTrackers.filter(t => t !== id)
            : [...activeTrackers, id];
        onUpdateSettings({ activeTrackerTypes: updated });
        toast.success(`Updated hardware tracker catalog preferences.`);
    };

    // Test Left-Behind Alert Workflow
    const handleSimulateAlert = () => {
        setIsSimulatingAlert(true);
        toast.loading('Simulating Left-Behind Tool Geofence Departure Alert...', { id: 'test-alert' });

        setTimeout(() => {
            setIsSimulatingAlert(false);
            toast.dismiss('test-alert');
            toast.custom((t) => (
                <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-slate-900 text-white shadow-2xl rounded-2xl p-4 border border-red-500 flex items-start gap-3`}>
                    <div className="p-2 bg-red-600 rounded-xl text-white shrink-0">
                        <AlertTriangle className="w-6 h-6 animate-bounce" />
                    </div>
                    <div className="space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                            <span className="font-black text-red-400 uppercase tracking-wider">Test Left-Behind Tool Alert</span>
                            <span className="text-[10px] text-slate-400">Just Now</span>
                        </div>
                        <p className="font-extrabold text-sm text-white">Technician Linda Park left jobsite without Recovery Machine #2</p>
                        <p className="text-slate-300">Geofence distance: 620 ft from site boundary. SMS text dispatched to tech & alert banner active on Dispatcher Console.</p>
                    </div>
                </div>
            ), { duration: 6000 });
        }, 1200);
    };

    // Test Customer Traffic Alert SMS Workflow
    const handleSimulateTrafficAlert = () => {
        setIsSimulatingTrafficAlert(true);
        toast.loading('Simulating Customer En-Route Traffic SMS Alert...', { id: 'traffic-sms' });

        setTimeout(() => {
            setIsSimulatingTrafficAlert(false);
            toast.dismiss('traffic-sms');
            toast.custom((t) => (
                <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-blue-950 text-white shadow-2xl rounded-2xl p-4 border border-blue-400 flex items-start gap-3`}>
                    <div className="p-2 bg-blue-600 rounded-xl text-white shrink-0">
                        <MessageSquare className="w-6 h-6" />
                    </div>
                    <div className="space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                            <span className="font-black text-blue-300 uppercase tracking-wider">Customer Traffic Alert Sent</span>
                            <span className="text-[10px] text-slate-400">Just Now</span>
                        </div>
                        <p className="font-bold text-sm text-white">SMS Sent to Customer (John Doe):</p>
                        <p className="text-blue-100 bg-blue-900/60 p-2 rounded-lg border border-blue-700 italic">
                            "DispatchBox Notice: Hi John, technician Linda encountered heavy traffic on I-95. Estimated arrival updated to 10:25 AM (+15 min delay). Track live arrival: https://dispatchbox.app/track/job-8842"
                        </p>
                    </div>
                </div>
            ), { duration: 7000 });
        }, 1200);
    };

    // Filter catalog items
    const filteredCatalog = TOP_TRACKER_CATALOG.filter(item => {
        const matchesCategory = selectedCategory === 'all' || item.type === selectedCategory;
        const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              item.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              item.recommendedUse.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    return (
        <div className="space-y-8">
            {/* Header Callout */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-2xl shadow-xl border border-indigo-900 relative overflow-hidden">
                <div className="relative z-10 max-w-3xl space-y-2">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-200 text-xs font-bold border border-indigo-400/30">
                        <Tag className="w-3.5 h-3.5 text-indigo-400" /> Multi-Ecosystem Fleet & Tool Hardware Tracking
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-extrabold">Hardware Trackers & Advanced Operational Alerting</h2>
                    <p className="text-indigo-100 text-sm leading-relaxed">
                        Configure all top Bluetooth, Cellular 4G GPS, and tool brand trackers. Set up left-behind equipment departure alerts and automated customer traffic arrival SMS text updates.
                    </p>
                </div>
            </div>

            {/* SECTION 1: Customer En-Route Traffic & Late Arrival SMS Notifications */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <Navigation className="w-5 h-5 text-blue-600" />
                            Customer En-Route Traffic & Late Arrival SMS Notifications
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Automatically text customers when live vehicle/phone GPS detects traffic delays exceeding your threshold.
                        </p>
                    </div>
                    <button
                        onClick={handleSimulateTrafficAlert}
                        disabled={isSimulatingTrafficAlert}
                        className="px-4 py-2 bg-blue-600 text-white rounded-xl font-extrabold text-xs hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2 shrink-0 disabled:opacity-50"
                    >
                        <MessageSquare className="w-4 h-4" />
                        {isSimulatingTrafficAlert ? 'Sending Test SMS...' : 'Test Customer Traffic Alert SMS'}
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Toggle Traffic SMS */}
                    <label className={`p-4 rounded-xl border cursor-pointer transition-all ${
                        customerTrafficSmsEnabled ? 'bg-blue-50/70 border-blue-200 ring-2 ring-blue-500/20' : 'bg-slate-50 border-slate-200'
                    }`}>
                        <div className="flex items-start gap-3">
                            <input
                                type="checkbox"
                                checked={customerTrafficSmsEnabled}
                                onChange={(e) => onUpdateSettings({ trackerAlertsCustomerTrafficSms: e.target.checked })}
                                className="mt-1 rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                            />
                            <div>
                                <span className="font-bold text-slate-900 text-sm block">Auto SMS Customer on Traffic Delays</span>
                                <p className="text-xs text-slate-500 mt-1">
                                    Dispatches polite SMS text to customer with updated ETA when tech is stuck in traffic.
                                </p>
                            </div>
                        </div>
                    </label>

                    {/* Delay Threshold Select */}
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                        <span className="font-bold text-slate-900 text-sm block flex items-center gap-1.5">
                            <Clock className="w-4 h-4 text-blue-600" /> Delay Threshold Trigger
                        </span>
                        <select
                            value={trafficThresholdMin}
                            onChange={(e) => onUpdateSettings({ trackerAlertCustomerTrafficThresholdMin: parseInt(e.target.value) })}
                            className="w-full px-3 py-2 border rounded-lg text-xs font-bold text-slate-800 bg-white"
                        >
                            <option value={5}>5 Minutes Delay (Strict)</option>
                            <option value={10}>10 Minutes Delay (Standard Default)</option>
                            <option value={15}>15 Minutes Delay (Moderate Traffic)</option>
                            <option value={20}>20 Minutes Delay (Major Highway Delay)</option>
                        </select>
                        <p className="text-[11px] text-slate-500">Triggers automated customer text when GPS delay exceeds this time.</p>
                    </div>

                    {/* Customer SMS Template Preview */}
                    <div className="p-4 bg-blue-900/10 rounded-xl border border-blue-200/80 space-y-1">
                        <span className="font-extrabold text-blue-900 text-xs uppercase tracking-wider block">Customer SMS Template Preview</span>
                        <p className="text-[11px] text-blue-950 leading-relaxed font-medium italic">
                            "DispatchBox Notice: Hi [Customer], tech [Name] encountered unexpected traffic. Updated arrival estimated at [New ETA]. Track live arrival: [Link]"
                        </p>
                    </div>
                </div>
            </div>

            {/* SECTION 2: Left-Behind Tool Alert Dispatch Configuration Box */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <Bell className="w-5 h-5 text-red-600" />
                            Left-Behind Tool Alert Dispatch Configuration
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">Configure who gets notified when a tool or equipment piece is left at a job location.</p>
                    </div>
                    <button
                        onClick={handleSimulateAlert}
                        disabled={isSimulatingAlert}
                        className="px-4 py-2 bg-red-600 text-white rounded-xl font-extrabold text-xs hover:bg-red-700 transition-colors shadow-sm flex items-center gap-2 shrink-0 disabled:opacity-50"
                    >
                        <Zap className="w-4 h-4" />
                        {isSimulatingAlert ? 'Firing Test Alert...' : 'Test Left-Behind Alert Workflow'}
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Tech SMS Check */}
                    <label className={`p-4 rounded-xl border cursor-pointer transition-all ${
                        notifyTechSms ? 'bg-red-50/70 border-red-200 ring-2 ring-red-500/20' : 'bg-slate-50 border-slate-200'
                    }`}>
                        <div className="flex items-start gap-3">
                            <input
                                type="checkbox"
                                checked={notifyTechSms}
                                onChange={(e) => onUpdateSettings({ trackerAlertsTechSms: e.target.checked })}
                                className="mt-1 rounded text-red-600 focus:ring-red-500 w-4 h-4"
                            />
                            <div>
                                <span className="font-bold text-slate-900 text-xs block">Technician SMS & Push</span>
                                <p className="text-[11px] text-slate-500 mt-0.5">Dispatches immediate SMS text & phone push alert to technician when leaving job site without tool.</p>
                            </div>
                        </div>
                    </label>

                    {/* Dispatcher Console Check */}
                    <label className={`p-4 rounded-xl border cursor-pointer transition-all ${
                        notifyDispatcherConsole ? 'bg-blue-50/70 border-blue-200 ring-2 ring-blue-500/20' : 'bg-slate-50 border-slate-200'
                    }`}>
                        <div className="flex items-start gap-3">
                            <input
                                type="checkbox"
                                checked={notifyDispatcherConsole}
                                onChange={(e) => onUpdateSettings({ trackerAlertsDispatcherConsole: e.target.checked })}
                                className="mt-1 rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                            />
                            <div>
                                <span className="font-bold text-slate-900 text-xs block">Dispatcher Console Banner</span>
                                <p className="text-[11px] text-slate-500 mt-0.5">Fires urgent red alert banner on Dispatcher Console with tech name & missing tool details.</p>
                            </div>
                        </div>
                    </label>

                    {/* Fleet Manager Notification */}
                    <label className={`p-4 rounded-xl border cursor-pointer transition-all ${
                        notifyFleetManager ? 'bg-amber-50/70 border-amber-200 ring-2 ring-amber-500/20' : 'bg-slate-50 border-slate-200'
                    }`}>
                        <div className="flex items-start gap-3">
                            <input
                                type="checkbox"
                                checked={notifyFleetManager}
                                onChange={(e) => onUpdateSettings({ trackerAlertsFleetManager: e.target.checked })}
                                className="mt-1 rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                            />
                            <div>
                                <span className="font-bold text-slate-900 text-xs block">Fleet Manager SMS</span>
                                <p className="text-[11px] text-slate-500 mt-0.5">Alerts shop/fleet manager for unassigned or high-value equipment movement.</p>
                            </div>
                        </div>
                    </label>

                    {/* Geofence Distance Setting */}
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                        <span className="font-bold text-slate-900 text-xs block">Geofence Distance Threshold</span>
                        <select
                            value={alertDistanceFt}
                            onChange={(e) => onUpdateSettings({ trackerAlertDistanceFt: parseInt(e.target.value) })}
                            className="w-full px-2.5 py-1.5 border rounded-lg text-xs font-bold text-slate-800 bg-white"
                        >
                            <option value={250}>250 Feet (Tight Site Boundary)</option>
                            <option value={500}>500 Feet (Standard Property Boundary)</option>
                            <option value={1000}>1,000 Feet (0.2 Miles - Departure)</option>
                        </select>
                        <p className="text-[10px] text-slate-500">Triggers alert when tech moves beyond this distance from tag.</p>
                    </div>
                </div>
            </div>

            {/* SECTION 3: Supported Hardware Tracker Ecosystems (All Models Grid) */}
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <Tag className="w-5 h-5 text-blue-600" />
                            Supported Hardware Tracker Catalog (All {TOP_TRACKER_CATALOG.length} Top Models)
                        </h3>
                        <p className="text-xs text-slate-500">
                            Select which specific tracker models your company deploys across tools, trucks, and safety gear.
                        </p>
                    </div>

                    {/* Search & Filter Toolbar */}
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative w-48">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search models or brand..."
                                className="w-full pl-8 pr-2.5 py-1.5 border rounded-xl text-xs font-medium bg-slate-50"
                            />
                        </div>

                        <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="px-3 py-1.5 border rounded-xl text-xs font-bold text-slate-700 bg-white"
                        >
                            <option value="all">All Ecosystems ({TOP_TRACKER_CATALOG.length})</option>
                            <option value="find_my">Apple Find My</option>
                            <option value="tool_brand">Trade Tool Mesh (Milwaukee/DeWalt)</option>
                            <option value="tile">Tile Bluetooth</option>
                            <option value="ble_beacon">Industrial BLE Beacons</option>
                            <option value="gps_cellular">Cellular 4G / Satellite GPS</option>
                            <option value="android_find">Android Find My Device</option>
                        </select>
                    </div>
                </div>

                {/* All Hardware Models Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {filteredCatalog.map(device => {
                        const isActive = activeTrackers.includes(device.id);
                        const isSelected = selectedDevice.id === device.id;

                        return (
                            <div
                                key={device.id}
                                onClick={() => setSelectedDevice(device)}
                                className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between relative overflow-hidden ${
                                    isSelected
                                        ? 'bg-white border-blue-600 ring-2 ring-blue-500/20 shadow-md'
                                        : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                                }`}
                            >
                                <div className="space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <div className={`p-2 rounded-xl text-white font-extrabold text-xs flex items-center gap-1 ${
                                            device.type === 'find_my' ? 'bg-slate-900' :
                                            device.type === 'tool_brand' ? 'bg-red-600' :
                                            device.type === 'tile' ? 'bg-emerald-600' :
                                            device.type === 'ble_beacon' ? 'bg-amber-600' :
                                            device.type === 'gps_cellular' ? 'bg-blue-600' : 'bg-purple-600'
                                        }`}>
                                            <Tag className="w-3.5 h-3.5" />
                                            <span>{device.brand}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleTrackerType(device.id);
                                            }}
                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                                                isActive ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                            }`}
                                        >
                                            {isActive ? '✓ Active' : '+ Enable'}
                                        </button>
                                    </div>

                                    <div>
                                        <h4 className="font-extrabold text-slate-900 text-sm leading-snug line-clamp-1">{device.name}</h4>
                                        <span className="text-[10px] font-extrabold text-blue-600 block pt-0.5">{device.network}</span>
                                        <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{device.recommendedUse}</p>
                                    </div>
                                </div>

                                <div className="mt-3 pt-2 border-t text-[11px] flex items-center justify-between text-slate-600">
                                    <span className="font-extrabold text-slate-900">{device.costEstimate}</span>
                                    <span className="text-[10px] text-slate-500">{device.batteryLife}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* SECTION 4: Interactive Field Service Tracker Alert Workflows & Operational Modes Options */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
                <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Zap className="w-5 h-5 text-indigo-600" />
                        Custom Operational Alert Workflows & Anti-Theft Modes
                    </h3>
                    <p className="text-xs text-slate-500">
                        Enable and configure business rules right from this page to automate alerts across your fleet, tools, and safety equipment.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {/* Mode 1: En-Route Traffic Customer Text */}
                    <div className={`p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                        customerTrafficSmsEnabled ? 'bg-blue-50/50 border-blue-300 ring-2 ring-blue-500/10 shadow-sm' : 'bg-slate-50 border-slate-200 opacity-75'
                    }`}>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-blue-700 font-extrabold text-xs uppercase tracking-wider">
                                    <Navigation className="w-4 h-4" /> En-Route Traffic Customer Text
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${customerTrafficSmsEnabled ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-600'}`}>
                                    {customerTrafficSmsEnabled ? '✓ Enabled' : 'Disabled'}
                                </span>
                            </div>
                            <p className="text-xs text-slate-600 leading-relaxed font-medium">
                                Automatically dispatches SMS text to customers with updated arrival times when truck GPS detects unexpected traffic delays.
                            </p>
                        </div>
                        <div className="pt-3 border-t border-slate-200/80 space-y-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={customerTrafficSmsEnabled}
                                    onChange={(e) => {
                                        onUpdateSettings({ trackerAlertsCustomerTrafficSms: e.target.checked });
                                        toast.success(e.target.checked ? 'En-Route Traffic Alerts enabled.' : 'En-Route Traffic Alerts disabled.');
                                    }}
                                    className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                                />
                                <span className="text-xs font-extrabold text-slate-800">Enable Customer Traffic SMS</span>
                            </label>
                            {customerTrafficSmsEnabled && (
                                <div className="space-y-1">
                                    <span className="text-[11px] font-bold text-slate-500">Delay Threshold:</span>
                                    <select
                                        value={trafficThresholdMin}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            onUpdateSettings({ trackerAlertCustomerTrafficThresholdMin: val });
                                            toast.success(`Traffic threshold set to ${val} mins.`);
                                        }}
                                        className="w-full px-2.5 py-1.5 border rounded-lg text-xs font-bold text-slate-800 bg-white"
                                    >
                                        <option value={5}>5 Minutes Delay</option>
                                        <option value={10}>10 Minutes Delay (Standard)</option>
                                        <option value={15}>15 Minutes Delay</option>
                                        <option value={20}>20 Minutes Delay</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Mode 2: After-Hours Theft Geofence Alert */}
                    <div className={`p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                        afterHoursTheftEnabled ? 'bg-red-50/50 border-red-300 ring-2 ring-red-500/10 shadow-sm' : 'bg-slate-50 border-slate-200 opacity-75'
                    }`}>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-red-700 font-extrabold text-xs uppercase tracking-wider">
                                    <ShieldAlert className="w-4 h-4" /> After-Hours Theft Geofence
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${afterHoursTheftEnabled ? 'bg-red-100 text-red-800' : 'bg-slate-200 text-slate-600'}`}>
                                    {afterHoursTheftEnabled ? '✓ Enabled' : 'Disabled'}
                                </span>
                            </div>
                            <p className="text-xs text-slate-600 leading-relaxed font-medium">
                                Dispatches emergency SMS to owner & dispatcher if a service van or trailer moves outside standard operational hours.
                            </p>
                        </div>
                        <div className="pt-3 border-t border-slate-200/80 space-y-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={afterHoursTheftEnabled}
                                    onChange={(e) => {
                                        onUpdateSettings({ trackerAlertsAfterHoursTheft: e.target.checked });
                                        toast.success(e.target.checked ? 'After-Hours Theft Alerts enabled.' : 'After-Hours Theft Alerts disabled.');
                                    }}
                                    className="rounded text-red-600 focus:ring-red-500 w-4 h-4"
                                />
                                <span className="text-xs font-extrabold text-slate-800">Enable After-Hours Theft Alert</span>
                            </label>
                            {afterHoursTheftEnabled && (
                                <div className="space-y-1">
                                    <span className="text-[11px] font-bold text-slate-500">Monitoring Window:</span>
                                    <select
                                        value={afterHoursWindow}
                                        onChange={(e) => {
                                            onUpdateSettings({ trackerAlertsAfterHoursWindow: e.target.value });
                                            toast.success('Updated After-Hours monitoring window.');
                                        }}
                                        className="w-full px-2.5 py-1.5 border rounded-lg text-xs font-bold text-slate-800 bg-white"
                                    >
                                        <option value="8pm_6am">8 PM - 6 AM (Nightly)</option>
                                        <option value="6pm_6am">6 PM - 6 AM (Extended)</option>
                                        <option value="24_7_weekend">24/7 Weekends & Nights</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Mode 3: Engine Idle & Telemetry Alert */}
                    <div className={`p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                        engineIdleEnabled ? 'bg-amber-50/50 border-amber-300 ring-2 ring-amber-500/10 shadow-sm' : 'bg-slate-50 border-slate-200 opacity-75'
                    }`}>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-amber-700 font-extrabold text-xs uppercase tracking-wider">
                                    <Truck className="w-4 h-4" /> Engine Idle & Telemetry
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${engineIdleEnabled ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-600'}`}>
                                    {engineIdleEnabled ? '✓ Enabled' : 'Disabled'}
                                </span>
                            </div>
                            <p className="text-xs text-slate-600 leading-relaxed font-medium">
                                Monitors vehicle cellular telemetry and alerts fleet managers when service trucks idle continuously beyond allowed threshold.
                            </p>
                        </div>
                        <div className="pt-3 border-t border-slate-200/80 space-y-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={engineIdleEnabled}
                                    onChange={(e) => {
                                        onUpdateSettings({ trackerAlertsEngineIdle: e.target.checked });
                                        toast.success(e.target.checked ? 'Engine Idle Alerts enabled.' : 'Engine Idle Alerts disabled.');
                                    }}
                                    className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                                />
                                <span className="text-xs font-extrabold text-slate-800">Enable Engine Idle Alert</span>
                            </label>
                            {engineIdleEnabled && (
                                <div className="space-y-1">
                                    <span className="text-[11px] font-bold text-slate-500">Max Idle Threshold:</span>
                                    <select
                                        value={engineIdleThresholdMin}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            onUpdateSettings({ trackerAlertsEngineIdleThresholdMin: val });
                                            toast.success(`Max idle threshold set to ${val} mins.`);
                                        }}
                                        className="w-full px-2.5 py-1.5 border rounded-lg text-xs font-bold text-slate-800 bg-white"
                                    >
                                        <option value={10}>10 Minutes Max</option>
                                        <option value={15}>15 Minutes Max (Standard)</option>
                                        <option value={30}>30 Minutes Max</option>
                                        <option value={45}>45 Minutes Max</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Mode 4: Auto Jobsite Arrival Check-In */}
                    <div className={`p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                        jobsiteArrivalEnabled ? 'bg-emerald-50/50 border-emerald-300 ring-2 ring-emerald-500/10 shadow-sm' : 'bg-slate-50 border-slate-200 opacity-75'
                    }`}>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-emerald-700 font-extrabold text-xs uppercase tracking-wider">
                                    <MapPin className="w-4 h-4" /> Auto Jobsite Arrival Check-In
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${jobsiteArrivalEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                                    {jobsiteArrivalEnabled ? '✓ Enabled' : 'Disabled'}
                                </span>
                            </div>
                            <p className="text-xs text-slate-600 leading-relaxed font-medium">
                                Automatically timestamps technician job start & completion when truck GPS crosses customer property geofence.
                            </p>
                        </div>
                        <div className="pt-3 border-t border-slate-200/80 space-y-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={jobsiteArrivalEnabled}
                                    onChange={(e) => {
                                        onUpdateSettings({ trackerAlertsJobsiteArrivalCheckin: e.target.checked });
                                        toast.success(e.target.checked ? 'Auto Jobsite Check-In enabled.' : 'Auto Jobsite Check-In disabled.');
                                    }}
                                    className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                                />
                                <span className="text-xs font-extrabold text-slate-800">Enable Auto Check-In</span>
                            </label>
                            {jobsiteArrivalEnabled && (
                                <div className="space-y-1">
                                    <span className="text-[11px] font-bold text-slate-500">Geofence Check-In Radius:</span>
                                    <select
                                        value={jobsiteArrivalRadiusFt}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            onUpdateSettings({ trackerAlertsJobsiteArrivalRadiusFt: val });
                                            toast.success(`Check-in radius set to ${val} ft.`);
                                        }}
                                        className="w-full px-2.5 py-1.5 border rounded-lg text-xs font-bold text-slate-800 bg-white"
                                    >
                                        <option value={100}>100 Feet (Tight Gate)</option>
                                        <option value={250}>250 Feet (Standard Property)</option>
                                        <option value={500}>500 Feet (Large Industrial Site)</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Mode 5: Safety Inspection Due Alert */}
                    <div className={`p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                        safetyInspectionEnabled ? 'bg-purple-50/50 border-purple-300 ring-2 ring-purple-500/10 shadow-sm' : 'bg-slate-50 border-slate-200 opacity-75'
                    }`}>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-purple-700 font-extrabold text-xs uppercase tracking-wider">
                                    <HardHat className="w-4 h-4" /> Safety Inspection Due Alert
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${safetyInspectionEnabled ? 'bg-purple-100 text-purple-800' : 'bg-slate-200 text-slate-600'}`}>
                                    {safetyInspectionEnabled ? '✓ Enabled' : 'Disabled'}
                                </span>
                            </div>
                            <p className="text-xs text-slate-600 leading-relaxed font-medium">
                                Auto-alerts technician & safety officer when tagged gas detectors, safety harnesses, or ladders are due for calibration.
                            </p>
                        </div>
                        <div className="pt-3 border-t border-slate-200/80 space-y-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={safetyInspectionEnabled}
                                    onChange={(e) => {
                                        onUpdateSettings({ trackerAlertsSafetyInspectionDue: e.target.checked });
                                        toast.success(e.target.checked ? 'Safety Inspection Alerts enabled.' : 'Safety Inspection Alerts disabled.');
                                    }}
                                    className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4"
                                />
                                <span className="text-xs font-extrabold text-slate-800">Enable Safety Inspection Alert</span>
                            </label>
                            {safetyInspectionEnabled && (
                                <div className="space-y-1">
                                    <span className="text-[11px] font-bold text-slate-500">Advance Lead Time Notice:</span>
                                    <select
                                        value={safetyLeadDays}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            onUpdateSettings({ trackerAlertsSafetyLeadDays: val });
                                            toast.success(`Safety lead time set to ${val} days notice.`);
                                        }}
                                        className="w-full px-2.5 py-1.5 border rounded-lg text-xs font-bold text-slate-800 bg-white"
                                    >
                                        <option value={7}>7 Days Notice</option>
                                        <option value={14}>14 Days Notice (Standard)</option>
                                        <option value={30}>30 Days Notice</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Mode 6: Jobsite Lockbox Anti-Theft Sensor */}
                    <div className={`p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                        lockboxAntiTheftEnabled ? 'bg-indigo-50/50 border-indigo-300 ring-2 ring-indigo-500/10 shadow-sm' : 'bg-slate-50 border-slate-200 opacity-75'
                    }`}>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-indigo-700 font-extrabold text-xs uppercase tracking-wider">
                                    <Package className="w-4 h-4" /> Jobsite Lockbox Anti-Theft
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${lockboxAntiTheftEnabled ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200 text-slate-600'}`}>
                                    {lockboxAntiTheftEnabled ? '✓ Enabled' : 'Disabled'}
                                </span>
                            </div>
                            <p className="text-xs text-slate-600 leading-relaxed font-medium">
                                Triggers high-frequency satellite GPS tracking if a jobsite equipment lockbox is opened without an active job dispatch.
                            </p>
                        </div>
                        <div className="pt-3 border-t border-slate-200/80 space-y-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={lockboxAntiTheftEnabled}
                                    onChange={(e) => {
                                        onUpdateSettings({ trackerAlertsLockboxAntiTheft: e.target.checked });
                                        toast.success(e.target.checked ? 'Lockbox Anti-Theft enabled.' : 'Lockbox Anti-Theft disabled.');
                                    }}
                                    className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                                />
                                <span className="text-xs font-extrabold text-slate-800">Enable Lockbox Sensor</span>
                            </label>
                            {lockboxAntiTheftEnabled && (
                                <div className="space-y-1">
                                    <span className="text-[11px] font-bold text-slate-500">Sensor Sensitivity:</span>
                                    <select
                                        value={lockboxSensitivity}
                                        onChange={(e) => {
                                            onUpdateSettings({ trackerAlertsLockboxSensitivity: e.target.value });
                                            toast.success('Updated lockbox sensor sensitivity.');
                                        }}
                                        className="w-full px-2.5 py-1.5 border rounded-lg text-xs font-bold text-slate-800 bg-white"
                                    >
                                        <option value="low">Low (Standard Access)</option>
                                        <option value="medium">Medium (Vibration Sensor)</option>
                                        <option value="high">High (Instant Satellite Emergency)</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

