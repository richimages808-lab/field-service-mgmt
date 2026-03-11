import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, Tooltip } from 'react-leaflet';
import { Job, UserProfile } from '../../types';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { isSameDay } from 'date-fns';
import { DefaultIcon, TechIcon, JobIcon, CompletedJobIcon, createArrowIcon, ROUTE_COLORS, getBearing } from '../../lib/mapUtils';

L.Marker.prototype.options.icon = DefaultIcon;

interface TechnicianMapProps {
    technicians: UserProfile[];
    jobs: Job[];
    viewDate: Date;
    selectedTechIds: string[];
}

// Helper to center map on points
const MapUpdater: React.FC<{ bounds: L.LatLngBoundsExpression | null }> = ({ bounds }) => {
    const map = useMap();

    useEffect(() => {
        if (bounds) {
            map.fitBounds(bounds as L.LatLngBoundsExpression, { padding: [50, 50] });
        }
    }, [bounds, map]);

    return null;
};

export const TechnicianMap: React.FC<TechnicianMapProps> = ({ technicians, jobs, viewDate, selectedTechIds }) => {
    // Filter jobs for the view date
    const dailyJobs = useMemo(() => {
        return jobs.filter(job => {
            if (!job.scheduled_at) return false;
            return isSameDay(job.scheduled_at.toDate(), viewDate);
        }).sort((a, b) => (a.scheduled_at?.toDate().getTime() || 0) - (b.scheduled_at?.toDate().getTime() || 0));
    }, [jobs, viewDate]);

    // Calculate Map Bounds
    const bounds = useMemo(() => {
        const visibleJobs = dailyJobs.filter(j => j.assigned_tech_id && selectedTechIds.includes(j.assigned_tech_id));
        if (visibleJobs.length === 0) return null;
        const latLngs = visibleJobs
            .filter(j => j.location)
            .map(j => [j.location!.lat, j.location!.lng] as [number, number]);

        if (latLngs.length === 0) return null;
        return L.latLngBounds(latLngs);
    }, [dailyJobs, selectedTechIds]);

    return (
        <div className="h-full w-full rounded-lg overflow-hidden shadow-inner border border-gray-200 relative">

            {/* Header Info */}
            <div className="absolute top-4 right-4 z-[1000] bg-white p-2 rounded shadow text-xs font-medium">
                Showing routes for {viewDate.toLocaleDateString()}
            </div>

            <MapContainer center={[21.3069, -157.8583]} zoom={10} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* Draw Routes per Technician */}
                {technicians.map((tech, index) => {
                    if (!selectedTechIds.includes(tech.id)) return null;

                    const techJobs = dailyJobs.filter(j => j.assigned_tech_id === tech.id && j.location);
                    if (techJobs.length === 0) return null;

                    const routePoints = techJobs.map(j => [j.location!.lat, j.location!.lng] as [number, number]);
                    const color = ROUTE_COLORS[index % ROUTE_COLORS.length];

                    // Determine "Current" Position (Simulated: Last completed job or first scheduled)
                    const lastJob = techJobs[techJobs.length - 1];

                    return (
                        <React.Fragment key={tech.id}>
                            <Polyline
                                positions={routePoints}
                                pathOptions={{ color: color, weight: 4, opacity: 0.7, dashArray: '10, 10' }}
                            />

                            {/* Directional Arrows */}
                            {techJobs.map((job, i) => {
                                if (i === techJobs.length - 1) return null; // No arrow after last job
                                const nextJob = techJobs[i + 1];
                                if (!job.location || !nextJob.location) return null;

                                const bearing = getBearing(job.location.lat, job.location.lng, nextJob.location.lat, nextJob.location.lng);
                                const midLat = (job.location.lat + nextJob.location.lat) / 2;
                                const midLng = (job.location.lng + nextJob.location.lng) / 2;

                                return (
                                    <Marker
                                        key={`arrow-${job.id}-${nextJob.id}`}
                                        position={[midLat, midLng]}
                                        icon={createArrowIcon(bearing - 90, color)} // -90 adjustment for ➤ character
                                        zIndexOffset={-100} // Keep arrows below other markers
                                    />
                                );
                            })}

                            {/* Tech Marker (Simulated at last job location) */}
                            {lastJob && lastJob.location && (
                                <Marker position={[lastJob.location.lat, lastJob.location.lng]} icon={TechIcon}>
                                    <Popup>
                                        <div className="font-bold">{tech.name}</div>
                                        <div className="text-xs text-gray-500">Current Location (Simulated)</div>
                                    </Popup>
                                </Marker>
                            )}
                        </React.Fragment>
                    );
                })}

                {/* Job Markers */}
                {dailyJobs.map(job => {
                    if (!job.location || (job.assigned_tech_id && !selectedTechIds.includes(job.assigned_tech_id))) return null;
                    const isCompleted = job.status === 'completed' || job.status === 'in_progress';
                    const timeString = job.scheduled_at?.toDate().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

                    return (
                        <Marker
                            key={job.id}
                            position={[job.location.lat, job.location.lng]}
                            icon={isCompleted ? CompletedJobIcon : JobIcon}
                        >
                            <Tooltip direction="top" offset={[0, -40]} opacity={1} permanent>
                                <span className="font-bold text-xs">{timeString}</span>
                            </Tooltip>
                            <Popup>
                                <div className="font-bold">{job.customer.name}</div>
                                <div className="text-xs">{job.request.description}</div>
                                <div className="text-xs text-gray-500 mt-1">
                                    {timeString}
                                </div>
                                <div className={`text-xs mt-1 font-semibold ${job.status === 'pending' ? 'text-yellow-600' :
                                    job.status === 'scheduled' ? 'text-blue-600' : 'text-green-600'
                                    }`}>
                                    {job.status.toUpperCase()}
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}

                <MapUpdater bounds={bounds} />
            </MapContainer>
        </div >
    );
};
