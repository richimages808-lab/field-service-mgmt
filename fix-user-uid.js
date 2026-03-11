/**
 * Fix User UID Mismatch
 * Creates user document at the correct UID that matches Firebase Auth
 * Run with: node fix-user-uid.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./firebase/serviceAccountKey.json');

// Initialize Firebase Admin (only if not already initialized)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

// The CORRECT UID from console logs during login
const CORRECT_UID = 'MkkXHtkTG6Rqv3C636bkl2nzme53';
const ORG_ID = 'demo-org';
const TEST_EMAIL = 'test@example.com';

async function fixUserDocument() {
    console.log('🔧 Fixing user document UID mismatch...');
    console.log('');
    console.log('Creating user document at correct UID:', CORRECT_UID);
    console.log('Email:', TEST_EMAIL);
    console.log('');

    try {
        // Create user document at the CORRECT UID
        await db.collection('users').doc(CORRECT_UID).set({
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

        console.log('✅ User document created successfully!');
        console.log('');
        console.log('Document Path: users/' + CORRECT_UID);
        console.log('');
        console.log('You can now login with:');
        console.log('  Email:', TEST_EMAIL);
        console.log('  Password: test123456');
        console.log('');
        console.log('All Firestore permission errors should now be resolved.');
        console.log('Dashboard data, charts, and all features should work correctly.');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error fixing user document:', error);
        process.exit(1);
    }
}

fixUserDocument();
