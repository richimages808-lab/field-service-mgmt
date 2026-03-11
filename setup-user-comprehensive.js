/**
 * Comprehensive User Setup - Fixes all UID issues
 * This script properly handles existing users and creates/updates documents
 * Run with: node setup-user-comprehensive.js
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

const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'test123456';
const ORG_ID = 'demo-org';

async function setupUser() {
    console.log('🔧 Comprehensive User Setup');
    console.log('===========================\n');

    try {
        // Step 1: List ALL users with this email and delete duplicates
        console.log('Step 1: Checking for existing users...');
        const listResult = await auth.listUsers(1000);
        const existingUsers = listResult.users.filter(u => u.email === TEST_EMAIL);

        console.log(`Found ${existingUsers.length} user(s) with email ${TEST_EMAIL}`);

        if (existingUsers.length > 1) {
            console.log('\n⚠️  Multiple users found! Cleaning up duplicates...');
            // Keep the first one, delete others
            for (let i = 1; i < existingUsers.length; i++) {
                console.log(`  Deleting duplicate UID: ${existingUsers[i].uid}`);
                await auth.deleteUser(existingUsers[i].uid);
            }
            console.log('✓ Duplicates removed');
        }

        // Step 2: Get or create THE user
        let userRecord;
        if (existingUsers.length > 0) {
            userRecord = existingUsers[0];
            console.log(`\n✓ Using existing user: ${userRecord.uid}`);

            // Update password to ensure it's correct
            await auth.updateUser(userRecord.uid, {
                password: TEST_PASSWORD
            });
            console.log('✓ Password updated');
        } else {
            console.log('\nCreating new user...');
            userRecord = await auth.createUser({
                email: TEST_EMAIL,
                password: TEST_PASSWORD,
                displayName: 'Test Admin'
            });
            console.log(`✓ Created new user: ${userRecord.uid}`);
        }

        const FINAL_UID = userRecord.uid;

        // Step 3: Set custom claims
        console.log('\nStep 2: Setting custom claims...');
        await auth.setCustomUserClaims(FINAL_UID, {
            role: 'dispatcher',
            org_id: ORG_ID
        });
        console.log('✓ Custom claims set');

        // Step 4: Create/Update Firestore user document
        console.log('\nStep 3: Creating Firestore user document...');
        await db.collection('users').doc(FINAL_UID).set({
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
        console.log(`✓ User document created at: users/${FINAL_UID}`);

        // Step 5: Ensure organization exists
        console.log('\nStep 4: Verifying organization...');
        const orgRef = db.collection('organizations').doc(ORG_ID);
        const orgDoc = await orgRef.get();

        if (!orgDoc.exists) {
            await orgRef.set({
                name: 'Demo Organization',
                plan: 'enterprise',
                maxTechs: 10,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                email: TEST_EMAIL,
                phone: '555-123-4567',
                address: '123 Demo St, Honolulu, HI 96813',
                settings: {
                    timezone: 'Pacific/Honolulu',
                    currency: 'USD'
                }
            });
            console.log('✓ Organization created');
        } else {
            console.log('✓ Organization already exists');
        }

        // Step 6: Clean up any old user documents
        console.log('\nStep 5: Cleaning up old user documents...');
        const usersSnapshot = await db.collection('users')
            .where('email', '==', TEST_EMAIL)
            .get();

        let deleted = 0;
        for (const doc of usersSnapshot.docs) {
            if (doc.id !== FINAL_UID) {
                console.log(`  Deleting old document: users/${doc.id}`);
                await doc.ref.delete();
                deleted++;
            }
        }

        if (deleted > 0) {
            console.log(`✓ Removed ${deleted} old user document(s)`);
        } else {
            console.log('✓ No old documents to clean up');
        }

        console.log('\n╔════════════════════════════════════════════╗');
        console.log('║   ✅ SETUP COMPLETE - READY TO USE ✅     ║');
        console.log('╚════════════════════════════════════════════╝');
        console.log('');
        console.log('Login Credentials:');
        console.log(`  Email: ${TEST_EMAIL}`);
        console.log(`  Password: ${TEST_PASSWORD}`);
        console.log('');
        console.log('User Details:');
        console.log(`  UID: ${FINAL_UID}`);
        console.log('  Role: dispatcher');
        console.log(`  Organization: ${ORG_ID}`);
        console.log('');
        console.log('Login at: https://maintenancemanager-c5533.web.app/login');
        console.log('');
        console.log('All permission errors should now be resolved!');
        console.log('═══════════════════════════════════════════════');

        process.exit(0);
    } catch (error) {
        console.error('\n❌ Setup failed:', error);
        process.exit(1);
    }
}

setupUser();
