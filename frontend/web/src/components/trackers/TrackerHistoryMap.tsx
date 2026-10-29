/**
 * TrackerHistoryMap.tsx - Leaflet map of a tracker's location history
 *
 * - Polyline trail of history points (color shifts from faded → vivid as it approaches "now")
 * - Start / last-known markers and dwell (stop) markers
 * - Auto-fits bounds whenever the point set changes
 */
import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { TrackerLocationPoint, TrackerLatLng } from '../../types/trackerDevices';
import { toDateSafe } from '../../lib/trackerDevices';

export interface TrackerStop {
    lat: number;
    lng: number;
    start: Date;
    end: Date;
    minutes: number;
}

interface TrackerHistoryMapProps {
    points: TrackerLocationPoint[];
    stops: TrackerStop[];
    lastLocation?: TrackerLatLng | null;
    accent?: string;
    heightClass?: string;
}

const lastIcon = (color: string) => L.divIcon({
    className: '',
    html: `<div style="position:relative;width:22px;height:22px">
             <span style="position:absolute;inset:0;border-radius:9999px;background:${color};opacity:.35;animation:trkPulse 1.8s ease-out infinite"></span>
             <span style="position:absolute;inset:4px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></span>
           </div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
});

const FitBounds: React.FC<{ coords: [number, number][] }> = ({ coords }) => {
    const map = useMap();
    useEffect(() => {
        if (coords.length === 0) return;
        if (coords.length === 1) {
            map.setView(coords[0], 14);
            return;
        }
        map.fitBounds(L.latLngBounds(coords), { padding: [28, 28], maxZoom: 15 });
    }, [coords, map]);
    return null;
};

export const TrackerHistoryMap: React.FC<TrackerHistoryMapProps> = ({
    points,
    stops,
    lastLocation,
    accent = '#2563eb',
    heightClass = 'h-80'
}) => {
    const coords = useMemo<[number, number][]>(() => points.map(p => [p.lat, p.lng]), [points]);

    // Split the trail into 4 segments with increasing opacity so direction of travel is readable
    const segments = useMemo(() => {
        if (coords.length < 2) return [];
        const n = 4;
        const size = Math.ceil(coords.length / n);
        return Array.from({ length: n }, (_, i) => ({
            positions: coords.slice(Math.max(0, i * size - 1), (i + 1) * size),
            opacity: 0.35 + (i / (n - 1)) * 0.6
        })).filter(s => s.positions.length > 1);
    }, [coords]);

    const fitCoords = useMemo<[number, number][]>(() => {
        const list = [...coords];
        if (lastLocation) list.push([lastLocation.lat, lastLocation.lng]);
        return list;
    }, [coords, lastLocation]);

    const center: [number, number] = fitCoords[fitCoords.length - 1] || [21.3069, -157.8583];
    const first = points[0];

    return (
        <div className={`relative w-full ${heightClass} rounded-2xl overflow-hidden border border-slate-200 shadow-inner`}>
            <style>{`@keyframes trkPulse{0%{transform:scale(.6);opacity:.55}100%{transform:scale(1.9);opacity:0}}`}</style>
            <MapContainer center={center} zoom={12} scrollWheelZoom className="w-full h-full z-0">
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    maxZoom={19}
                />
                <FitBounds coords={fitCoords} />

                {segments.map((s, i) => (
                    <Polyline key={i} positions={s.positions} pathOptions={{ color: accent, weight: 4, opacity: s.opacity, lineCap: 'round', lineJoin: 'round' }} />
                ))}

                {stops.map((s, i) => (
                    <CircleMarker
                        key={`stop-${i}`}
                        center={[s.lat, s.lng]}
                        radius={Math.min(12, 5 + s.minutes / 40)}
                        pathOptions={{ color: '#f59e0b', fillColor: '#fbbf24', fillOpacity: 0.55, weight: 2 }}
                    >
                        <Tooltip direction="top">
                            <div className="text-xs">
                                <div className="font-bold">Stopped {Math.round(s.minutes)} min</div>
                                <div>{s.start.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })} – {s.end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
                            </div>
                        </Tooltip>
                    </CircleMarker>
                ))}

                {first && (
                    <CircleMarker center={[first.lat, first.lng]} radius={6} pathOptions={{ color: '#fff', fillColor: '#64748b', fillOpacity: 1, weight: 2 }}>
                        <Tooltip direction="top">Start of range · {toDateSafe(first.recordedAt)?.toLocaleString()}</Tooltip>
                    </CircleMarker>
                )}

                {lastLocation && (
                    <Marker position={[lastLocation.lat, lastLocation.lng]} icon={lastIcon(accent)}>
                        <Tooltip direction="top" permanent={false}>Last known location</Tooltip>
                    </Marker>
                )}
            </MapContainer>

            {points.length === 0 && !lastLocation && (
                <div className="absolute inset-0 z-[400] flex items-center justify-center bg-slate-50/90 backdrop-blur-sm">
                    <div className="text-center px-6">
                        <p className="text-sm font-bold text-slate-700">No location history in this range</p>
                        <p className="text-xs text-slate-500 mt-1">Points appear here once the device checks in through the ingest endpoint.</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TrackerHistoryMap;
