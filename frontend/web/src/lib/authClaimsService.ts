/**
 * AuthClaimsService - Client-side utilities for working with Firebase Auth custom claims
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { User } from 'firebase/auth';

// =============================================================================
// TYPES
// =============================================================================

export interface UserClaims {
    org_id: string;
    role: 'owner' | 'admin' | 'dispatcher' | 'technician' | 'customer';
    customer_id?: string;
}

// =============================================================================
// GET CLAIMS FROM CURRENT TOKEN
// =============================================================================

/**
 * Get claims from the current user's ID token
 * Note: Token must be refreshed to get updated claims
 */
export async function getClaimsFromToken(user: User): Promise<UserClaims | null> {
    try {
        const tokenResult = await user.getIdTokenResult();

        return {
            org_id: tokenResult.claims.org_id as string || '',
            role: tokenResult.claims.role as UserClaims['role'] || 'technician',
            customer_id: tokenResult.claims.customer_id as string | undefined
        };
    } catch (error) {
        console.error('Error getting token claims:', error);
        return null;
    }
}

/**
 * Force refresh the ID token to get latest claims
 */
export async function refreshToken(user: User): Promise<UserClaims | null> {
    try {
        // Force token refresh
        await user.getIdToken(true);
        return getClaimsFromToken(user);
    } catch (error) {
        console.error('Error refreshing token:', error);
        return null;
    }
}

// =============================================================================
// CLOUD FUNCTION CALLS
// =============================================================================

/**
 * Set claims for a user (admin only)
 */
export async function setUserClaims(params: {
    userId: string;
    orgId: string;
    role: UserClaims['role'];
    customerId?: string;
}): Promise<{ success: boolean; claims: UserClaims }> {
    const setClaimsFn = httpsCallable(functions, 'setUserClaims');
    const result = await setClaimsFn(params);
    return result.data as { success: boolean; claims: UserClaims };
}

/**
 * Invite a customer to the portal
 */
export async function inviteCustomerToPortal(params: {
    customerId: string;
    email: string;
}): Promise<{ success: boolean; userId: string; resetLink: string }> {
    const inviteFn = httpsCallable(functions, 'inviteCustomerToPortal');
    const result = await inviteFn(params);
    return result.data as { success: boolean; userId: string; resetLink: string };
}

/**
 * Get current user's claims from server
 */
export async function getCurrentUserClaims(): Promise<UserClaims> {
    const getClaimsFn = httpsCallable(functions, 'getCurrentUserClaims');
    const result = await getClaimsFn({});
    return result.data as UserClaims;
}

/**
 * Force server to refresh claims and sync with user profile
 */
export async function refreshUserClaimsOnServer(): Promise<{ success: boolean; claims: UserClaims }> {
    const refreshFn = httpsCallable(functions, 'refreshUserClaims');
    const result = await refreshFn({});
    return result.data as { success: boolean; claims: UserClaims };
}

// =============================================================================
// ROLE HELPERS
// =============================================================================

/**
 * Check if user has a specific role
 */
export function hasRole(claims: UserClaims | null, role: UserClaims['role']): boolean {
    return claims?.role === role;
}

/**
 * Check if user is staff (not a customer)
 */
export function isStaff(claims: UserClaims | null): boolean {
    const staffRoles = ['owner', 'admin', 'dispatcher', 'technician'];
    return claims ? staffRoles.includes(claims.role) : false;
}

/**
 * Check if user is an admin (owner or admin)
 */
export function isAdmin(claims: UserClaims | null): boolean {
    return claims ? ['owner', 'admin'].includes(claims.role) : false;
}

/**
 * Check if user is a customer portal user
 */
export function isCustomer(claims: UserClaims | null): boolean {
    return claims?.role === 'customer';
}

/**
 * Check if user can dispatch (owner, admin, or dispatcher)
 */
export function canDispatch(claims: UserClaims | null): boolean {
    return claims ? ['owner', 'admin', 'dispatcher'].includes(claims.role) : false;
}

// =============================================================================
// ORG HELPERS
// =============================================================================

/**
 * Check if user belongs to a specific org
 */
export function belongsToOrg(claims: UserClaims | null, orgId: string): boolean {
    return claims?.org_id === orgId;
}

/**
 * Get the user's org ID
 */
export function getOrgId(claims: UserClaims | null): string | null {
    return claims?.org_id || null;
}
