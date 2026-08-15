import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, Tooltip } from 'react-leaflet';
import { Job, UserProfile } from '../../types';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
    format,
    isSameDay,
    startOfDay,
    endOfDay,
    startOfWeek,
    endOfWeek,
    startOfMonth,
    endOfMonth,
    addDays,
    subDays,
    addWeeks,
    subWeeks,
    addMonths,
    subMonths,
    isToday,
    isWithinInterval
} from 'date-fns';
import {
    DefaultIcon,
    createStopMarkerIcon,
    createTechBaseMarkerIcon,
    createArrowIcon,
    getTechColor,
    getBearing
} from '../../lib/mapUtils';
import {
    Calendar,
    CalendarDays,
    LayoutGrid,
    Sun,
    ChevronLeft,
    ChevronRight,
    Users,
    MapPin,
    Clock,
    Phone,
    ExternalLink,
    Wrench,
    CheckCircle2,
    Eye,
    EyeOff
} from 'lucide-react';
import { Link } from 'react-router-dom';

L.Marker.prototype.options.icon = DefaultIcon;

export type MapTimeframe = 'day' | 'week' | 'month';

interface TechnicianMapProps {
    technicians: UserProfile[];
    jobs: Job[];
    viewDate: Date;
    selectedTechIds: string[];
    onDateChange?: (newDate: Date) => void;
    onTechSelectionChange?: (selectedIds: string[]) => void;
}

// Timestamp extractor helper
const parseJobDate = (ts: any): Date | null => {
    if (!ts) return null;
    if (typeof ts.toDate === 'function') {
        try { return ts.toDate(); } catch {}
    }
    if (ts instanceof Date) return ts;
    if (ts.seconds !== undefined && ts.seconds !== null) {
        const secs = Number(ts.seconds);
        if (!isNaN(secs)) return new Date(secs * 1000);
    }
    if (ts._seconds !== undefined && ts._seconds !== null) {
        const secs = Number(ts._seconds);
        if (!isNaN(secs)) return new Date(secs * 1000);
    }
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
};

// Robust coordinates extractor helper
const getJobLatLng = (job: Job): [number, number] | null => {
    if (job.location?.lat && job.location?.lng) {
        const lat = Number(job.location.lat);
        const lng = Number(job.location.lng);
        if (!isNaN(lat) && !isNaN(lng)) return [lat, lng];
    }
    if ((job as any).lat && (job as any).lng) {
        const lat = Number((job as any).lat);
        const lng = Number((job as any).lng);
        if (!isNaN(lat) && !isNaN(lng)) return [lat, lng];
    }
    if ((job.customer as any)?.location?.lat && (job.customer as any)?.location?.lng) {
        const lat = Number((job.customer as any).location.lat);
        const lng = Number((job.customer as any).location.lng);
        if (!isNaN(lat) && !isNaN(lng)) return [lat, lng];
    }
    return null;
};

// Helper to center map bounds
const MapBoundsUpdater: React.FC<{ bounds: L.LatLngBoundsExpression | null }> = ({ bounds }) => {
    const map = useMap();

    useEffect(() => {
        if (bounds) {
            try {
                map.fitBounds(bounds as L.LatLngBoundsExpression, { padding: [50, 50], maxZoom: 15 });
            } catch (err) {
                console.warn('Map bounds fit error:', err);
            }
        }
    }, [bounds, map]);

    return null;
};

export const TechnicianMap: React.FC<TechnicianMapProps> = ({
    technicians,
    jobs,
    viewDate: initialViewDate,
    selectedTechIds: initialSelectedTechIds,
    onDateChange,
    onTechSelectionChange
}) => {
    const [timeframe, setTimeframe] = useState<MapTimeframe>('day');
    const [currentDate, setCurrentDate] = useState<Date>(initialViewDate || new Date());
    const [activeTechIds, setActiveTechIds] = useState<string[]>(
        initialSelectedTechIds && initialSelectedTechIds.length > 0
            ? initialSelectedTechIds
            : technicians.map(t => t.id)
    );
    const [isLegendOpen, setIsLegendOpen] = useState(true);
    const [hoveredTechId, setHoveredTechId] = useState<string | null>(null);

    // Sync when props change
    useEffect(() => {
        if (initialViewDate) setCurrentDate(initialViewDate);
    }, [initialViewDate]);

    useEffect(() => {
        if (initialSelectedTechIds && initialSelectedTechIds.length > 0) {
            setActiveTechIds(initialSelectedTechIds);
        }
    }, [initialSelectedTechIds]);

    // Calculate Date Range based on timeframe
    const dateRange = useMemo(() => {
        if (timeframe === 'day') {
            return {
                start: startOfDay(currentDate),
                end: endOfDay(currentDate),
                label: format(currentDate, 'EEEE, MMMM d, yyyy')
            };
        } else if (timeframe === 'week') {
            const start = startOfWeek(currentDate, { weekStartsOn: 1 });
            const end = endOfWeek(currentDate, { weekStartsOn: 1 });
            return {
                start,
                end,
                label: `Week of ${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`
            };
        } else {
            const start = startOfMonth(currentDate);
            const end = endOfMonth(currentDate);
            return {
                start,
                end,
                label: format(currentDate, 'MMMM yyyy')
            };
        }
    }, [timeframe, currentDate]);

    // Navigation Controls
    const handlePrev = () => {
        let newDate: Date;
        if (timeframe === 'day') newDate = subDays(currentDate, 1);
        else if (timeframe === 'week') newDate = subWeeks(currentDate, 1);
        else newDate = subMonths(currentDate, 1);

        setCurrentDate(newDate);
        if (onDateChange) onDateChange(newDate);
    };

    const handleNext = () => {
        let newDate: Date;
        if (timeframe === 'day') newDate = addDays(currentDate, 1);
        else if (timeframe === 'week') newDate = addWeeks(currentDate, 1);
        else newDate = addMonths(currentDate, 1);

        setCurrentDate(newDate);
        if (onDateChange) onDateChange(newDate);
    };

    const handleToday = () => {
        const today = new Date();
        setCurrentDate(today);
        if (onDateChange) onDateChange(today);
    };

    // Filter jobs within selected date range
    const timeframeJobs = useMemo(() => {
        return jobs.filter(job => {
            if (!job.scheduled_at) return false;
            const schedDate = parseJobDate(job.scheduled_at);
            if (!schedDate) return false;

            return isWithinInterval(schedDate, {
                start: dateRange.start,
                end: dateRange.end
            });
        }).sort((a, b) => {
            const dateA = parseJobDate(a.scheduled_at)?.getTime() || 0;
            const dateB = parseJobDate(b.scheduled_at)?.getTime() || 0;
            return dateA - dateB;
        });
    }, [jobs, dateRange]);

    // Group jobs by technician
    const techRoutes = useMemo(() => {
        return technicians.map((tech, index) => {
            const color = getTechColor(tech.id, index);
            const techJobs = timeframeJobs.filter(j => 
                j.assigned_tech_id === tech.id || 
                j.assigned_tech_email === tech.email
            );

            // Extract valid coordinate stops
            const stops = techJobs.map((job, stopIdx) => {
                const latLng = getJobLatLng(job);
                const schedDate = parseJobDate(job.scheduled_at);
                const stopLabel = timeframe === 'day' 
                    ? `${stopIdx + 1}` 
                    : `${schedDate ? format(schedDate, 'EEE') : ''} #${stopIdx + 1}`;

                return {
                    job,
                    latLng,
                    stopNumber: stopIdx + 1,
                    stopLabel,
                    schedDate
                };
            }).filter(s => s.latLng !== null) as Array<{
                job: Job;
                latLng: [number, number];
                stopNumber: number;
                stopLabel: string;
                schedDate: Date | null;
            }>;

            return {
                tech,
                color,
                stops,
                jobCount: techJobs.length,
                validStopsCount: stops.length
            };
        });
    }, [technicians, timeframeJobs, timeframe]);

    // Toggle Tech Filter
    const toggleTech = (techId: string) => {
        let updated: string[];
        if (activeTechIds.includes(techId)) {
            updated = activeTechIds.filter(id => id !== techId);
        } else {
            updated = [...activeTechIds, techId];
        }
        setActiveTechIds(updated);
        if (onTechSelectionChange) onTechSelectionChange(updated);
    };

    const selectSoloTech = (techId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const updated = [techId];
        setActiveTechIds(updated);
        if (onTechSelectionChange) onTechSelectionChange(updated);
    };

    const selectAllTechs = () => {
        const allIds = technicians.map(t => t.id);
        setActiveTechIds(allIds);
        if (onTechSelectionChange) onTechSelectionChange(allIds);
    };

    const deselectAllTechs = () => {
        setActiveTechIds([]);
        if (onTechSelectionChange) onTechSelectionChange([]);
    };

    // Calculate map bounding box
    const bounds = useMemo(() => {
        const activeStops = techRoutes
            .filter(r => activeTechIds.includes(r.tech.id))
            .flatMap(r => r.stops.map(s => s.latLng));

        if (activeStops.length === 0) return null;
        return L.latLngBounds(activeStops);
    }, [techRoutes, activeTechIds]);

    const totalVisibleJobs = useMemo(() => {
        return techRoutes
            .filter(r => activeTechIds.includes(r.tech.id))
            .reduce((sum, r) => sum + r.jobCount, 0);
    }, [techRoutes, activeTechIds]);

    return (
        <div className="h-full w-full relative overflow-hidden flex flex-col select-none">
            
            {/* Top Interactive Controls Floating Bar */}
            <div className="absolute top-4 left-4 right-4 z-[1000] flex flex-wrap items-center justify-between gap-3 pointer-events-none">
                
                {/* Left: Timeframe & Date Navigation */}
                <div className="bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-2xl shadow-lg border border-slate-200/80 flex items-center gap-3 pointer-events-auto">
                    
                    {/* Timeframe selector: Day / Week / Month */}
                    <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                        <button
                            type="button"
                            onClick={() => setTimeframe('day')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                timeframe === 'day'
                                    ? 'bg-white text-blue-600 shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <Sun className="w-3.5 h-3.5" />
                            Day
                        </button>
                        <button
                            type="button"
                            onClick={() => setTimeframe('week')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                timeframe === 'week'
                                    ? 'bg-white text-blue-600 shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <CalendarDays className="w-3.5 h-3.5" />
                            Week
                        </button>
                        <button
                            type="button"
                            onClick={() => setTimeframe('month')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                timeframe === 'month'
                                    ? 'bg-white text-blue-600 shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            <LayoutGrid className="w-3.5 h-3.5" />
                            Month
                        </button>
                    </div>

                    <div className="h-4 w-px bg-slate-200" />

                    {/* Date Navigation */}
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={handlePrev}
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Previous"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            onClick={handleToday}
                            className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-colors ${
                                isToday(currentDate)
                                    ? 'bg-blue-50 text-blue-600 border-blue-200'
                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                        >
                            Today
                        </button>
                        <button
                            type="button"
                            onClick={handleNext}
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Next"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>

                    <span className="text-xs font-bold text-slate-800 tracking-tight pl-1">
                        {dateRange.label}
                    </span>
                </div>

                {/* Right: Route Summary & Legend Toggle */}
                <div className="bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-2xl shadow-lg border border-slate-200/80 flex items-center gap-3 pointer-events-auto">
                    <div className="text-xs font-semibold text-slate-700 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span><strong>{totalVisibleJobs}</strong> stops shown</span>
                        <span className="text-slate-400">|</span>
                        <span><strong>{activeTechIds.length}</strong>/{technicians.length} techs active</span>
                    </div>

                    <button
                        type="button"
                        onClick={() => setIsLegendOpen(!isLegendOpen)}
                        className={`p-1.5 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors ${
                            isLegendOpen
                                ? 'bg-blue-50 text-blue-600 border-blue-200'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                        title="Toggle Tech Routes Legend"
                    >
                        <Users className="w-3.5 h-3.5" />
                        {isLegendOpen ? 'Hide Routes' : 'Show Routes'}
                    </button>
                </div>
            </div>

            {/* Floating Technician Route Filter Legend */}
            {isLegendOpen && (
                <div className="absolute top-20 right-4 z-[1000] w-72 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200/80 overflow-hidden flex flex-col max-h-[calc(100vh-220px)] animate-in fade-in zoom-in-95">
                    
                    {/* Header */}
                    <div className="p-3 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-indigo-600" />
                            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                                Technician Routes
                            </h4>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                            <button
                                type="button"
                                onClick={selectAllTechs}
                                className="text-blue-600 hover:text-blue-800 hover:underline px-1"
                            >
                                All
                            </button>
                            <span className="text-slate-300">/</span>
                            <button
                                type="button"
                                onClick={deselectAllTechs}
                                className="text-slate-500 hover:text-slate-800 hover:underline px-1"
                            >
                                None
                            </button>
                        </div>
                    </div>

                    {/* Tech List */}
                    <div className="p-2 overflow-y-auto space-y-1.5 flex-1">
                        {techRoutes.map(({ tech, color, jobCount }) => {
                            const isSelected = activeTechIds.includes(tech.id);
                            return (
                                <div
                                    key={tech.id}
                                    onClick={() => toggleTech(tech.id)}
                                    className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 ${
                                        isSelected
                                            ? 'bg-white border-slate-300 shadow-xs ring-1 ring-slate-200'
                                            : 'bg-slate-50/60 border-transparent opacity-60 hover:opacity-100 hover:bg-slate-100/80'
                                    }`}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div
                                            className="w-3.5 h-3.5 rounded-full flex-shrink-0 border-2 border-white shadow-xs"
                                            style={{ backgroundColor: color }}
                                        />
                                        <div className="truncate">
                                            <p className="text-xs font-bold text-slate-800 truncate leading-tight">
                                                {tech.name || tech.email}
                                            </p>
                                            <p className="text-[10px] text-slate-400">
                                                {jobCount} {jobCount === 1 ? 'stop' : 'stops'} scheduled
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <button
                                            type="button"
                                            onClick={(e) => selectSoloTech(tech.id, e)}
                                            className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 border border-slate-200 transition-colors"
                                            title="Isolate this technician route only"
                                        >
                                            Solo
                                        </button>
                                        <div className={`p-1 rounded-md ${isSelected ? 'text-blue-600' : 'text-slate-400'}`}>
                                            {isSelected ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Leaflet Map */}
            <div className="flex-1 w-full h-full">
                <MapContainer
                    center={[21.3069, -157.8583]}
                    zoom={10}
                    style={{ height: '100%', width: '100%' }}
                    scrollWheelZoom={true}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {/* Draw Tech Home / Base Locations */}
                    {technicians.map((tech, index) => {
                        if (!activeTechIds.includes(tech.id)) return null;
                        const color = getTechColor(tech.id, index);
                        const baseLocation = tech.homeLocation;
                        if (!baseLocation?.lat || !baseLocation?.lng) return null;

                        return (
                            <Marker
                                key={`base-${tech.id}`}
                                position={[baseLocation.lat, baseLocation.lng]}
                                icon={createTechBaseMarkerIcon(tech.name || 'Tech', color)}
                            >
                                <Popup>
                                    <div className="p-1 space-y-1 text-xs">
                                        <div className="font-bold text-slate-900 flex items-center gap-1">
                                            <span>🏠</span> {tech.name}'s Home / Dispatch Base
                                        </div>
                                        <p className="text-slate-500 text-[11px]">{(baseLocation as any).address || tech.address || 'Base Location'}</p>
                                    </div>
                                </Popup>
                            </Marker>
                        );
                    })}

                    {/* Draw Routes & Arrows per Technician */}
                    {techRoutes.map(({ tech, color, stops }) => {
                        if (!activeTechIds.includes(tech.id)) return null;
                        if (stops.length < 2) return null;

                        const polylinePositions = stops.map(s => s.latLng);

                        return (
                            <React.Fragment key={`route-${tech.id}`}>
                                {/* Route Polyline */}
                                <Polyline
                                    positions={polylinePositions}
                                    pathOptions={{
                                        color: color,
                                        weight: hoveredTechId === tech.id ? 7 : 4.5,
                                        opacity: hoveredTechId && hoveredTechId !== tech.id ? 0.35 : 0.9,
                                        dashArray: timeframe === 'day' ? undefined : '8, 8',
                                        lineCap: 'round',
                                        lineJoin: 'round'
                                    }}
                                    eventHandlers={{
                                        mouseover: () => setHoveredTechId(tech.id),
                                        mouseout: () => setHoveredTechId(null),
                                        click: () => {
                                            setActiveTechIds([tech.id]);
                                            if (onTechSelectionChange) onTechSelectionChange([tech.id]);
                                        }
                                    }}
                                >
                                    <Tooltip sticky>
                                        <div className="text-xs font-bold p-0.5 leading-tight">
                                            <span style={{ color }}>{tech.name || 'Technician'}</span>'s Route
                                            <div className="text-[10px] text-slate-500 font-normal mt-0.5">
                                                {stops.length} stops ({timeframe} view) • Click to isolate
                                            </div>
                                        </div>
                                    </Tooltip>
                                </Polyline>

                                {/* Directional Arrows */}
                                {stops.map((stop, i) => {
                                    if (i === stops.length - 1) return null;
                                    const nextStop = stops[i + 1];

                                    const bearing = getBearing(
                                        stop.latLng[0],
                                        stop.latLng[1],
                                        nextStop.latLng[0],
                                        nextStop.latLng[1]
                                    );
                                    const midLat = (stop.latLng[0] + nextStop.latLng[0]) / 2;
                                    const midLng = (stop.latLng[1] + nextStop.latLng[1]) / 2;

                                    return (
                                        <Marker
                                            key={`arrow-${tech.id}-${stop.job.id}-${nextStop.job.id}`}
                                            position={[midLat, midLng]}
                                            icon={createArrowIcon(bearing - 90, color)}
                                            zIndexOffset={-100}
                                        />
                                    );
                                })}
                            </React.Fragment>
                        );
                    })}

                    {/* Draw Numbered Stop Pins */}
                    {techRoutes.map(({ tech, color, stops }) => {
                        if (!activeTechIds.includes(tech.id)) return null;

                        return stops.map(({ job, latLng, stopLabel, schedDate }) => {
                            const timeFormatted = schedDate ? format(schedDate, 'h:mm a') : 'Scheduled';
                            const dateFormatted = schedDate ? format(schedDate, 'EEE, MMM d') : '';
                            const customerName = job.customer?.name || 'Customer';
                            const serviceTitle = (job as any).title || job.request?.description || (job as any).description || 'Field Service Job';
                            const address = (job.location as any)?.address || job.customer?.address || 'Service Location';
                            const isCompleted = job.status === 'completed';

                            return (
                                <Marker
                                    key={`stop-${tech.id}-${job.id}`}
                                    position={latLng}
                                    icon={createStopMarkerIcon(stopLabel, color, job.status)}
                                >
                                    <Tooltip direction="top" offset={[0, -36]} opacity={0.95}>
                                        <div className="text-[11px] font-bold leading-tight">
                                            <span style={{ color }}>{tech.name}</span> • Stop {stopLabel}
                                            <div className="font-normal text-slate-700">{customerName} ({timeFormatted})</div>
                                        </div>
                                    </Tooltip>

                                    <Popup className="custom-job-popup">
                                        <div className="p-2 space-y-2 max-w-[240px]">
                                            {/* Stop Header */}
                                            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
                                                <div className="flex items-center gap-1.5">
                                                    <div
                                                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                                        style={{ backgroundColor: color }}
                                                    />
                                                    <span className="text-xs font-bold text-slate-900 truncate">
                                                        {tech.name}
                                                    </span>
                                                </div>
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">
                                                    Stop #{stopLabel}
                                                </span>
                                            </div>

                                            {/* Customer & Service Info */}
                                            <div>
                                                <h4 className="text-xs font-bold text-slate-900">{customerName}</h4>
                                                <p className="text-[11px] text-slate-600 line-clamp-2 mt-0.5">{serviceTitle}</p>
                                            </div>

                                            {/* Timing & Location */}
                                            <div className="space-y-1 text-[10px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                <div className="flex items-center gap-1.5">
                                                    <Clock className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                                    <span className="font-semibold text-slate-700">{dateFormatted} at {timeFormatted}</span>
                                                </div>
                                                <div className="flex items-start gap-1.5">
                                                    <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0 mt-0.5" />
                                                    <span className="truncate">{address}</span>
                                                </div>
                                                {job.customer?.phone && (
                                                    <div className="flex items-center gap-1.5">
                                                        <Phone className="w-3 h-3 text-slate-400 flex-shrink-0" />
                                                        <span>{job.customer.phone}</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Status Badge & Actions */}
                                            <div className="flex items-center justify-between pt-1">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                                                    isCompleted
                                                        ? 'bg-emerald-100 text-emerald-800'
                                                        : job.status === 'in_progress'
                                                            ? 'bg-amber-100 text-amber-800'
                                                            : 'bg-blue-100 text-blue-800'
                                                }`}>
                                                    {job.status?.replace('_', ' ')}
                                                </span>

                                                <div className="flex items-center gap-1.5">
                                                    <a
                                                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-[10px] font-semibold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-0.5"
                                                    >
                                                        Maps <ExternalLink className="w-2.5 h-2.5" />
                                                    </a>
                                                    <span className="text-slate-300">|</span>
                                                    <Link
                                                        to={`/jobs?selected=${job.id}`}
                                                        className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-0.5"
                                                    >
                                                        Details
                                                    </Link>
                                                </div>
                                            </div>
                                        </div>
                                    </Popup>
                                </Marker>
                            );
                        });
                    })}

                    <MapBoundsUpdater bounds={bounds} />
                </MapContainer>
            </div>
        </div>
    );
};
