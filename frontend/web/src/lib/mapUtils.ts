import L from 'leaflet';

// Fix for default marker icons in React Leaflet
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

export const DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

// Vibrant, distinct high-contrast color palette for technicians
export const ROUTE_COLORS = [
    '#2563eb', // Electric Blue
    '#059669', // Emerald Green
    '#7c3aed', // Royal Violet
    '#d97706', // Warm Amber
    '#e11d48', // Crimson Rose
    '#0891b2', // Teal / Cyan
    '#ea580c', // Bright Orange
    '#4f46e5', // Deep Indigo
    '#0d9488', // Aqua Marine
    '#c026d3', // Fuchsia Magenta
    '#475569', // Steel Slate
    '#854d0e', // Bronze Ochre
];

// Helper to assign a deterministic color per technician
export const getTechColor = (techId: string, fallbackIndex: number = 0): string => {
    if (!techId) return ROUTE_COLORS[fallbackIndex % ROUTE_COLORS.length];
    let hash = 0;
    for (let i = 0; i < techId.length; i++) {
        hash = techId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colorIndex = Math.abs(hash) % ROUTE_COLORS.length;
    return ROUTE_COLORS[colorIndex];
};

// Custom Stop Pin with sequence number and status border
export const createStopMarkerIcon = (
    stopLabel: string,
    color: string,
    status: string = 'scheduled'
) => {
    const isCompleted = status === 'completed';
    const isInProgress = status === 'in_progress';
    const borderColor = isCompleted ? '#10B981' : isInProgress ? '#F59E0B' : '#FFFFFF';

    return L.divIcon({
        className: 'custom-stop-pin',
        html: `
            <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer;">
                <div style="
                    background: ${color};
                    color: #FFFFFF;
                    font-weight: 700;
                    font-size: 11px;
                    min-width: 26px;
                    height: 26px;
                    padding: 0 6px;
                    border-radius: 9999px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.35);
                    border: 2px solid ${borderColor};
                    white-space: nowrap;
                    font-family: ui-sans-serif, system-ui, sans-serif;
                ">
                    ${isCompleted ? '✓ ' : ''}${stopLabel}
                </div>
                <div style="
                    width: 0; 
                    height: 0; 
                    border-left: 5px solid transparent;
                    border-right: 5px solid transparent;
                    border-top: 6px solid ${color};
                    margin-top: -1px;
                "></div>
            </div>
        `,
        iconSize: [36, 34],
        iconAnchor: [18, 34],
        popupAnchor: [0, -34]
    });
};

// Custom Tech Base / Home Location Icon
export const createTechBaseMarkerIcon = (techName: string, color: string) => {
    return L.divIcon({
        className: 'custom-tech-base-pin',
        html: `
            <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
                <div style="
                    background: #0f172a;
                    color: #f8fafc;
                    border: 2px solid ${color};
                    font-weight: 700;
                    font-size: 10px;
                    padding: 3px 8px;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.45);
                    white-space: nowrap;
                    font-family: ui-sans-serif, system-ui, sans-serif;
                ">
                    <span style="font-size: 12px;">🏠</span>
                    <span style="color: ${color}; font-weight: 800;">${techName}</span>
                </div>
                <div style="
                    width: 0; 
                    height: 0; 
                    border-left: 4px solid transparent;
                    border-right: 4px solid transparent;
                    border-top: 5px solid #0f172a;
                "></div>
            </div>
        `,
        iconSize: [50, 26],
        iconAnchor: [25, 26],
        popupAnchor: [0, -26]
    });
};

// Arrow Icon Helper for Directional Routes
export const createArrowIcon = (bearing: number, color: string) => {
    return L.divIcon({
        className: 'arrow-icon',
        html: `<div style="transform: rotate(${bearing}deg); color: ${color}; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 22L12 18L22 22L12 2Z" />
            </svg>
        </div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11]
    });
};

// Helper to calculate bearing between two points
export const getBearing = (startLat: number, startLng: number, destLat: number, destLng: number) => {
    const startLatRad = (startLat * Math.PI) / 180;
    const startLngRad = (startLng * Math.PI) / 180;
    const destLatRad = (destLat * Math.PI) / 180;
    const destLngRad = (destLng * Math.PI) / 180;

    const y = Math.sin(destLngRad - startLngRad) * Math.cos(destLatRad);
    const x = Math.cos(startLatRad) * Math.sin(destLatRad) -
        Math.sin(startLatRad) * Math.cos(destLatRad) * Math.cos(destLngRad - startLngRad);
    const brng = (Math.atan2(y, x) * 180) / Math.PI;
    return (brng + 360) % 360;
};
