import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth, Organization } from '../auth/AuthProvider';

/**
 * Resolves the canonical URL slug for an organization.
 * Priority: organization.slug > sanitized organization.name > organization.id > 'hitop'
 */
export function getOrgSlug(organization?: Organization | null, fallback = 'hitop'): string {
    if (!organization) return fallback;
    if (organization.slug && organization.slug.trim()) {
        return organization.slug.toLowerCase().trim();
    }
    if (organization.name && organization.name.trim()) {
        const sanitized = organization.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        if (sanitized) return sanitized;
    }
    if (organization.id && organization.id.trim()) {
        return organization.id.toLowerCase().trim();
    }
    return fallback;
}

/**
 * Prepends the organization slug to an internal route path.
 * If the path already begins with /:slug/ or is an external URL, it is returned cleanly.
 */
export function buildOrgPath(path: string, orgSlug?: string): string {
    if (!path) return '/';
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('mailto:') || path.startsWith('tel:')) {
        return path;
    }

    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const slug = orgSlug || 'hitop';

    // If already prefixed with this slug or another slug pattern, don't double prefix
    if (cleanPath.startsWith(`/${slug}/`) || cleanPath === `/${slug}`) {
        return cleanPath;
    }

    return `/${slug}${cleanPath}`;
}

/**
 * Hook providing the active organization slug and a bound `orgPath` helper function.
 */
export function useOrgPath() {
    const { organization } = useAuth();
    const params = useParams<{ orgSlug?: string }>();

    const activeSlug = useMemo(() => {
        // If URL currently has an orgSlug param, prioritize it
        if (params.orgSlug && params.orgSlug.trim()) {
            return params.orgSlug.toLowerCase().trim();
        }
        return getOrgSlug(organization);
    }, [params.orgSlug, organization]);

    const orgPath = useMemo(() => {
        return (path: string) => buildOrgPath(path, activeSlug);
    }, [activeSlug]);

    return {
        orgSlug: activeSlug,
        orgPath
    };
}
