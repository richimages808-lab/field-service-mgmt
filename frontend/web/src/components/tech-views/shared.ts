import React, { useState, useEffect } from 'react';
import { Job } from '../../types';
import {
    ClipboardList, Route, Zap, FileSearch, CalendarRange,
    MapPin, Phone, Play, CheckCircle, Clock, AlertTriangle,
    Wrench, Package, Navigation
} from 'lucide-react';

// ── Dashboard View Type ──────────────────────────────────────────────────────
export type TechDashboardViewId = 'mission_briefing' | 'route_planner' | 'smart_priority' | 'job_dossier' | 'week_glance';

export interface TechViewOption {
    id: TechDashboardViewId;
    label: string;
    shortLabel: string;
    icon: any; // lucide icon component
    description: string;
    emoji: string;
}

export const TECH_VIEW_OPTIONS: TechViewOption[] = [
    {
        id: 'mission_briefing',
        label: 'Mission Briefing',
        shortLabel: 'Briefing',
        icon: ClipboardList,
        description: 'Ops-style cards with tools & materials checklists',
        emoji: '📋'
    },
    {
        id: 'route_planner',
        label: 'Route Planner',
        shortLabel: 'Route',
        icon: Route,
        description: 'Sequential timeline with drive time between jobs',
        emoji: '🗺️'
    },
    {
        id: 'smart_priority',
        label: 'Smart Priority',
        shortLabel: 'Priority',
        icon: Zap,
        description: 'Kanban lanes sorted by job readiness',
        emoji: '🎯'
    },
    {
        id: 'job_dossier',
        label: 'Job Dossier',
        shortLabel: 'Dossier',
        icon: FileSearch,
        description: 'Deep single-job view with timer for on-site work',
        emoji: '📊'
    },
    {
        id: 'week_glance',
        label: 'Week at a Glance',
        shortLabel: 'Week',
        icon: CalendarRange,
        description: 'Mon–Fri columns with compact job cards',
        emoji: '📅'
    }
];

// ── Shared Props ─────────────────────────────────────────────────────────────
export interface TechViewProps {
    jobs: Job[];
    onStatusUpdate: (jobId: string, status: 'en_route' | 'in_progress' | 'completed') => void;
    onSelectJob: (job: Job) => void;
    dispatchMode?: 'assign_only' | 'assign_and_schedule';
    onRequestReschedule?: (job: Job) => void;
    onAcknowledgeJob?: (jobId: string) => void;
    onTogglePrepChecklist?: (jobId: string, itemLabel: string, checked: boolean) => void;
    onStartTransit?: (jobId: string, destinationAddress: string) => void;
    onCheckInJob?: (jobId: string) => Promise<void> | void;
    onNotifyDelay?: (jobId: string, delayMinutes?: number, reason?: string) => Promise<void> | void;
    autoOpenNav?: boolean;
    onToggleAutoOpenNav?: (enabled: boolean) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
export function getJobPriorityColor(priority: string): string {
    switch (priority) {
        case 'critical': return 'border-red-500 bg-red-50';
        case 'high': return 'border-orange-500 bg-orange-50';
        case 'medium': return 'border-blue-500 bg-blue-50';
        case 'low': return 'border-gray-400 bg-gray-50';
        default: return 'border-gray-300 bg-white';
    }
}

export function getJobPriorityDot(priority: string): string {
    switch (priority) {
        case 'critical': return 'bg-red-500 animate-pulse';
        case 'high': return 'bg-orange-500';
        case 'medium': return 'bg-blue-500';
        case 'low': return 'bg-gray-400';
        default: return 'bg-gray-300';
    }
}

export function getStatusBadge(status: string): { bg: string; text: string; label: string } {
    switch (status) {
        case 'scheduled': return { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Scheduled' };
        case 'en_route': return { bg: 'bg-purple-100', text: 'text-purple-800', label: '🚗 En Route' };
        case 'in_progress': return { bg: 'bg-amber-100', text: 'text-amber-800', label: '⚡ On Site' };
        case 'completed': return { bg: 'bg-green-100', text: 'text-green-800', label: 'Completed' };
        case 'pending': return { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Pending' };
        case 'cancelled': return { bg: 'bg-red-100', text: 'text-red-800', label: 'Cancelled' };
        default: return { bg: 'bg-gray-100', text: 'text-gray-600', label: status };
    }
}

export function getCategoryEmoji(category?: string): string {
    switch (category) {
        case 'repair': return '🔧';
        case 'maintenance': return '⚙️';
        case 'installation': return '📦';
        case 'inspection': return '🔍';
        case 'consultation': return '💬';
        case 'emergency': return '🚨';
        case 'warranty': return '🛡️';
        default: return '📋';
    }
}

export function formatJobTime(scheduled_at: any): string {
    if (!scheduled_at) return 'Unscheduled';
    try {
        const date = scheduled_at?.toDate?.() || new Date(scheduled_at);
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    } catch {
        return 'Unscheduled';
    }
}

export function getJobDate(scheduled_at: any): Date | null {
    if (!scheduled_at) return null;
    try {
        return scheduled_at?.toDate?.() || new Date(scheduled_at);
    } catch {
        return null;
    }
}

export function estimateDriveMinutes(originAddress?: string, destinationAddress?: string, departureTime: Date = new Date()): number {
    const hour = departureTime.getHours();
    const minute = departureTime.getMinutes();
    const timeVal = hour + minute / 60;

    let baseMinutes = 18;

    // After-school rush (1:45 PM - 3:30 PM): 1.35x multiplier
    if (timeVal >= 13.75 && timeVal < 15.5) {
        baseMinutes = Math.round(baseMinutes * 1.35);
    }
    // Peak evening freeway rush (3:30 PM - 6:45 PM): 1.65x multiplier
    else if (timeVal >= 15.5 && timeVal <= 18.75) {
        baseMinutes = Math.round(baseMinutes * 1.65);
    }
    // Morning rush hour (6:30 AM - 9:30 AM): 1.50x multiplier
    else if (timeVal >= 6.5 && timeVal <= 9.5) {
        baseMinutes = Math.round(baseMinutes * 1.50);
    }
    // Midday lunch traffic (11:30 AM - 1:15 PM): 1.20x multiplier
    else if (timeVal >= 11.5 && timeVal <= 13.25) {
        baseMinutes = Math.round(baseMinutes * 1.20);
    }

    return baseMinutes;
}

export function getJobReadiness(job: Job): 'ready' | 'needs_prep' | 'blocked' {
    if (job.status === 'pending' || job.status === 'unscheduled') return 'blocked';
    if (job.parts_needed && job.status !== 'in_progress') return 'needs_prep';
    if (job.status === 'quote_pending') return 'needs_prep';
    return 'ready';
}

// ── Google Maps Drive Time Service ───────────────────────────────────────────
export interface DriveTimeInfo {
    durationMinutes: number;
    distanceMiles: string;
    isFallback: boolean;
    loading: boolean;
}

// Cache to avoid redundant API calls within the same session
const driveTimeCache = new Map<string, { duration: number; distance: string; fallback: boolean }>();

function makeCacheKey(origin: string, destination: string): string {
    return `${origin}||${destination}`;
}

/**
 * Fetch real drive time from Google Maps via the calculateDriveTime Firebase Function.
 * Uses address strings directly — the Cloud Function handles geocoding.
 * Results are cached in-memory per session to minimize API costs.
 */
export async function fetchRealDriveTime(
    originAddress: string,
    destinationAddress: string
): Promise<{ durationMinutes: number; distanceMiles: string; isFallback: boolean }> {
    const key = makeCacheKey(originAddress, destinationAddress);
    const cached = driveTimeCache.get(key);
    if (cached) {
        return { durationMinutes: cached.duration, distanceMiles: cached.distance, isFallback: cached.fallback };
    }

    try {
        const { getFunctions, httpsCallable } = await import('firebase/functions');
        const functions = getFunctions();
        const calculateDriveTimeFn = httpsCallable<
            { origin: string; destination: string },
            { duration: number; distance: number | string; fallback: boolean }
        >(functions, 'calculateDriveTime');

        const result = await calculateDriveTimeFn({
            origin: originAddress,
            destination: destinationAddress
        });

        const data = result.data;
        const entry = {
            duration: data.duration,
            distance: typeof data.distance === 'number' ? data.distance.toFixed(1) : String(data.distance),
            fallback: data.fallback
        };
        driveTimeCache.set(key, entry);
        return { durationMinutes: entry.duration, distanceMiles: entry.distance, isFallback: entry.fallback };
    } catch (err) {
        console.warn('Drive time API failed, using fallback:', err);
        const fallback = { duration: 15, distance: '—', fallback: true };
        driveTimeCache.set(key, fallback);
        return { durationMinutes: 15, distanceMiles: '—', isFallback: true };
    }
}

/**
 * Live ticking work timer component for active on-site jobs
 */
export const LiveJobTimer: React.FC<{ startTime: any; className?: string }> = ({ startTime, className = '' }) => {
    const [seconds, setSeconds] = useState(0);

    useEffect(() => {
        if (!startTime) return;
        const start = startTime?.toDate ? startTime.toDate().getTime() : new Date(startTime).getTime();
        if (isNaN(start)) return;

        const updateTimer = () => {
            const now = Date.now();
            setSeconds(Math.max(0, Math.floor((now - start) / 1000)));
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [startTime]);

    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const formatted = `${h > 0 ? `${h}h ` : ''}${m}m ${s.toString().padStart(2, '0')}s`;

    return React.createElement(
        'span',
        {
            className: `inline-flex items-center gap-1 font-mono font-bold text-amber-900 bg-amber-200/80 px-2.5 py-0.5 rounded-lg border border-amber-300 shadow-2xs ${className}`
        },
        React.createElement(Clock, { className: 'w-3 h-3 text-amber-700 animate-pulse' }),
        React.createElement('span', null, formatted)
    );
};

export { MapPin, Phone, Play, CheckCircle, Clock, AlertTriangle, Wrench, Package, Navigation };

