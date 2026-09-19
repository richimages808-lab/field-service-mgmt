/**
 * Navigation & Driving Directions Helper for Field Service Technicians
 */

export type MapAppType = 'google_maps' | 'apple_maps' | 'waze';

/**
 * Generate Google Maps Turn-by-Turn Directions URL
 * Supports origin override (e.g. supply house or depot address)
 */
export function getGoogleMapsDirectionsUrl(destinationAddress: string, originAddress?: string): string {
    const encodedDest = encodeURIComponent(destinationAddress.trim());
    if (originAddress && originAddress.trim()) {
        const encodedOrigin = encodeURIComponent(originAddress.trim());
        return `https://www.google.com/maps/dir/?api=1&origin=${encodedOrigin}&destination=${encodedDest}&travelmode=driving&dir_action=navigate`;
    }
    return `https://www.google.com/maps/dir/?api=1&destination=${encodedDest}&travelmode=driving&dir_action=navigate`;
}

/**
 * Generate Apple Maps Directions URL
 */
export function getAppleMapsUrl(destinationAddress: string): string {
    const encodedDest = encodeURIComponent(destinationAddress.trim());
    return `https://maps.apple.com/?daddr=${encodedDest}&dirflg=d`;
}

/**
 * Generate Waze Navigation URL
 */
export function getWazeUrl(destinationAddress: string): string {
    const encodedDest = encodeURIComponent(destinationAddress.trim());
    return `https://waze.com/ul?q=${encodedDest}&navigate=yes`;
}

/**
 * Universal Navigation App Launcher
 * Detects device OS and respects user preference
 */
export function getDirectionsUrl(destinationAddress: string, app: MapAppType = 'google_maps', originAddress?: string): string {
    if (!destinationAddress) return '#';
    switch (app) {
        case 'apple_maps':
            return getAppleMapsUrl(destinationAddress);
        case 'waze':
            return getWazeUrl(destinationAddress);
        case 'google_maps':
        default:
            return getGoogleMapsDirectionsUrl(destinationAddress, originAddress);
    }
}

/**
 * Launch the navigation URL in a new window/app
 */
export function launchNavigation(destinationAddress: string, app: MapAppType = 'google_maps', originAddress?: string): Window | null {
    if (!destinationAddress) return null;
    const url = getDirectionsUrl(destinationAddress, app, originAddress);
    return window.open(url, '_blank', 'noopener,noreferrer');
}
