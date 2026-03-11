/**
 * Auth Functions - Firebase Auth custom claims for multi-tenant security
 * 
 * Custom claims are embedded in the user's JWT token and checked by Firestore rules.
 * Claims include: org_id, role, customer_id (for portal users)
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// Initialize admin if not already done
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

// =============================================================================
// USER ROLES & CLAIMS
// =============================================================================

export interface UserClaims {
    org_id: string;
    role: 'owner' | 'admin' | 'dispatcher' | 'technician' | 'customer';
    customer_id?: string; // Only for customer portal users
}

// =============================================================================
// ON USER CREATED - Set initial claims from user profile
// =============================================================================

export const onUserCreated = functions.auth.user().onCreate(async (user) => {
    console.log(`🔐 New user created: ${user.email} (${user.uid})`);

    try {
        // Wait a moment for the user doc to be created by the frontend
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Look up user's profile in Firestore
        const userDoc = await db.collection('users').doc(user.uid).get();

        if (userDoc.exists) {
            const userData = userDoc.data();

            const claims: UserClaims = {
                org_id: userData?.org_id || '',
                role: userData?.role || 'technician'
            };

            // If it's a customer portal user, add customer_id
            if (userData?.role === 'customer' && userData?.customer_id) {
                claims.customer_id = userData.customer_id;
            }

            await admin.auth().setCustomUserClaims(user.uid, claims);

            console.log(`✅ Claims set for ${user.email}:`, claims);

            // Update user doc to mark claims as set
            await userDoc.ref.update({
                claimsSet: true,
                claimsSetAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } else {
            console.warn(`⚠️ No user document found for ${user.uid}, will retry on profile creation`);
        }
    } catch (error) {
        console.error(`❌ Error setting claims for ${user.uid}:`, error);
    }
});

// =============================================================================
// ON USER PROFILE UPDATED - Sync claims when role or org changes
// =============================================================================

export const onUserProfileUpdated = functions.firestore
    .document('users/{userId}')
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();
        const userId = context.params.userId;

        // Check if relevant fields changed
        const orgChanged = before.org_id !== after.org_id;
        const roleChanged = before.role !== after.role;
        const customerIdChanged = before.customer_id !== after.customer_id;

        if (!orgChanged && !roleChanged && !customerIdChanged) {
            return; // No relevant changes
        }

        console.log(`🔄 Updating claims for user ${userId} due to profile change`);

        try {
            const claims: UserClaims = {
                org_id: after.org_id || '',
                role: after.role || 'technician'
            };

            if (after.role === 'customer' && after.customer_id) {
                claims.customer_id = after.customer_id;
            }

            await admin.auth().setCustomUserClaims(userId, claims);

            console.log(`✅ Claims updated for ${userId}:`, claims);

            // Update timestamp
            await change.after.ref.update({
                claimsUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error(`❌ Error updating claims for ${userId}:`, error);
        }
    });

// =============================================================================
// CALLABLE: SET USER CLAIMS (Admin only)
// =============================================================================

export const setUserClaims = functions.https.onCall(async (data, context) => {
    // Must be authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'Must be authenticated to call this function.'
        );
    }

    // Must be an admin or owner
    const callerRole = context.auth.token.role;
    if (callerRole !== 'admin' && callerRole !== 'owner') {
        throw new functions.https.HttpsError(
            'permission-denied',
            'Only admins can set user claims.'
        );
    }

    const { userId, orgId, role, customerId } = data;

    if (!userId || !orgId || !role) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'userId, orgId, and role are required.'
        );
    }

    // Validate role
    const validRoles = ['owner', 'admin', 'dispatcher', 'technician', 'customer'];
    if (!validRoles.includes(role)) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            `Invalid role. Must be one of: ${validRoles.join(', ')}`
        );
    }

    // Caller can only set claims for users in their own org
    const callerOrgId = context.auth.token.org_id;
    if (callerOrgId !== orgId) {
        throw new functions.https.HttpsError(
            'permission-denied',
            'Cannot set claims for users in a different organization.'
        );
    }

    try {
        const claims: UserClaims = {
            org_id: orgId,
            role: role
        };

        if (role === 'customer' && customerId) {
            claims.customer_id = customerId;
        }

        await admin.auth().setCustomUserClaims(userId, claims);

        // Update user doc
        await db.collection('users').doc(userId).update({
            org_id: orgId,
            role: role,
            customer_id: customerId || null,
            claimsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            claimsUpdatedBy: context.auth.uid
        });

        console.log(`✅ Admin ${context.auth.uid} set claims for ${userId}:`, claims);

        return { success: true, claims };
    } catch (error) {
        console.error(`❌ Error setting claims:`, error);
        throw new functions.https.HttpsError(
            'internal',
            'Failed to set user claims.'
        );
    }
});

// =============================================================================
// CALLABLE: INVITE CUSTOMER TO PORTAL
// =============================================================================

export const inviteCustomerToPortal = functions.https.onCall(async (data, context) => {
    // Must be authenticated staff
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'Must be authenticated.'
        );
    }

    const callerRole = context.auth.token.role;
    if (!['owner', 'admin', 'dispatcher'].includes(callerRole)) {
        throw new functions.https.HttpsError(
            'permission-denied',
            'Only staff can invite customers.'
        );
    }

    const { customerId, email } = data;

    if (!customerId || !email) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'customerId and email are required.'
        );
    }

    const callerOrgId = context.auth.token.org_id;

    try {
        // Verify customer exists and belongs to caller's org
        const customerDoc = await db.collection('customers').doc(customerId).get();
        if (!customerDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Customer not found.');
        }

        const customer = customerDoc.data();
        if (customer?.org_id !== callerOrgId) {
            throw new functions.https.HttpsError(
                'permission-denied',
                'Customer belongs to a different organization.'
            );
        }

        // Check if customer already has portal access
        if (customer?.portalAccess?.enabled) {
            throw new functions.https.HttpsError(
                'already-exists',
                'Customer already has portal access.'
            );
        }

        // Generate password reset link (acts as magic link)
        // First, create the user account if it doesn't exist
        let userRecord;
        try {
            userRecord = await admin.auth().getUserByEmail(email);
        } catch {
            // User doesn't exist, create it
            userRecord = await admin.auth().createUser({
                email: email,
                displayName: customer?.name,
                emailVerified: false
            });
        }

        // Set customer claims
        await admin.auth().setCustomUserClaims(userRecord.uid, {
            org_id: callerOrgId,
            role: 'customer',
            customer_id: customerId
        });

        // Create user doc for the customer
        await db.collection('users').doc(userRecord.uid).set({
            email: email,
            name: customer?.name,
            role: 'customer',
            org_id: callerOrgId,
            customer_id: customerId,
            status: 'pending_verification',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: context.auth.uid
        });

        // Update customer record with portal access
        await customerDoc.ref.update({
            'portalAccess.enabled': true,
            'portalAccess.userId': userRecord.uid,
            'portalAccess.invitedAt': admin.firestore.FieldValue.serverTimestamp(),
            'portalAccess.invitedBy': context.auth.uid,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Generate password reset link to send to customer
        const resetLink = await admin.auth().generatePasswordResetLink(email, {
            url: `${process.env.APP_URL || 'https://maintenancemanager-c5533.web.app'}/portal/login`
        });

        console.log(`✅ Customer portal invite sent to ${email} for customer ${customerId}`);

        return {
            success: true,
            userId: userRecord.uid,
            resetLink: resetLink // Frontend can send this via email
        };
    } catch (error) {
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        console.error(`❌ Error inviting customer:`, error);
        throw new functions.https.HttpsError(
            'internal',
            'Failed to invite customer to portal.'
        );
    }
});

// =============================================================================
// CALLABLE: GET CURRENT USER CLAIMS
// =============================================================================

export const getCurrentUserClaims = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'Must be authenticated.'
        );
    }

    return {
        org_id: context.auth.token.org_id || null,
        role: context.auth.token.role || null,
        customer_id: context.auth.token.customer_id || null
    };
});

// =============================================================================
// CALLABLE: REFRESH USER TOKEN (Force re-fetch claims)
// =============================================================================

export const refreshUserClaims = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'Must be authenticated.'
        );
    }

    const userId = context.auth.uid;

    try {
        // Get fresh data from user doc
        const userDoc = await db.collection('users').doc(userId).get();

        if (!userDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'User profile not found.');
        }

        const userData = userDoc.data();

        const claims: UserClaims = {
            org_id: userData?.org_id || '',
            role: userData?.role || 'technician'
        };

        if (userData?.role === 'customer' && userData?.customer_id) {
            claims.customer_id = userData.customer_id;
        }

        await admin.auth().setCustomUserClaims(userId, claims);

        console.log(`🔄 Refreshed claims for ${userId}:`, claims);

        return { success: true, claims };
    } catch (error) {
        console.error(`❌ Error refreshing claims:`, error);
        throw new functions.https.HttpsError(
            'internal',
            'Failed to refresh claims.'
        );
    }
});
