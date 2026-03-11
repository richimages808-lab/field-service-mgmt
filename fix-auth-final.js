/**
 * Final Auth Fix - Delete Anonymous User and Setup Real Auth
 * Run with: node fix-auth-final.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./firebase/serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const auth = admin.auth();

const ANONYMOUS_UID = 'Zg6rqfwmmvTTASCq7hxDIw01dRv2';  // The anonymous user being used
const REAL_UID = 'OtxFkJNmU6Su5zTTqLtFKdqr4LI3';  // The real test@example.com user
const ORG_ID = 'demo-org';
const TEST_EMAIL = 'test@example.com';

async function fixAuth() {
    console.log('🔧 Final Auth Fix');
    console.log('==================\n');

    try {
        // Step 1: Delete the anonymous user that's being used
        console.log('Step 1: Deleting anonymous user...');
        try {
            await auth.deleteUser(ANONYMOUS_UID);
            console.log(`✓ Deleted anonymous user: ${ANONYMOUS_UID}`);
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                console.log('⚠️  Anonymous user already deleted');
            } else {
                throw error;
            }
        }

        // Step 2: Delete any other anonymous users (no email)
        console.log('\nStep 2: Cleaning up other anonymous users...');
        const listResult = await auth.listUsers(1000);
        let deletedCount = 0;
        for (const user of listResult.users) {
            if (!user.email && user.uid !== REAL_UID) {
                try {
                    await auth.deleteUser(user.uid);
                    deletedCount++;
                    console.log(`  Deleted anonymous user: ${user.uid}`);
                } catch (error) {
                    console.log(`  Failed to delete ${user.uid}:`, error.message);
                }
            }
        }
        console.log(`✓ Cleaned up ${deletedCount} anonymous user(s)`);

        // Step 3: Ensure the real user document exists
        console.log('\nStep 3: Creating Firestore user document...');
        await db.collection('users').doc(REAL_UID).set({
            email: TEST_EMAIL,
            name: 'Test Admin',
            role: 'dispatcher',
            techType: null,
            org_id: ORG_ID,
            phone: '555-123-4567',
            specialties: [],
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        console.log(`✓ User document created at: users/${REAL_UID}`);

        // Step 4: Verify the real user has custom claims
        console.log('\nStep 4: Verifying custom claims...');
        const userRecord = await auth.getUser(REAL_UID);
        if (!userRecord.customClaims || userRecord.customClaims.role !== 'dispatcher') {
            await auth.setCustomUserClaims(REAL_UID, {
                role: 'dispatcher',
                org_id: ORG_ID
            });
            console.log('✓ Custom claims updated');
        } else {
            console.log('✓ Custom claims already set');
        }

        console.log('\n╔════════════════════════════════════════════╗');
        console.log('║      ✅ AUTH FIX COMPLETE! ✅              ║');
        console.log('╚════════════════════════════════════════════╝');
        console.log('');
        console.log('⚠️  IMPORTANT: You must now:');
        console.log('   1. Clear browser cache and cookies for the site');
        console.log('   2. Clear localStorage');
        console.log('   3. Logout if currently logged in');
        console.log('   4. Login fresh with credentials:');
        console.log(`      Email: ${TEST_EMAIL}`);
        console.log('      Password: test123456');
        console.log('');
        console.log('Login at: https://maintenancemanager-c5533.web.app/login');
        console.log('');
        console.log('All permission errors should now be resolved!');
        console.log('═══════════════════════════════════════════════');

        process.exit(0);
    } catch (error) {
        console.error('\n❌ Fix failed:', error);
        process.exit(1);
    }
}

fixAuth();
