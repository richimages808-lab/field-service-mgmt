/**
 * Production User Setup Script
 * Sets up test@example.com user with proper Firestore document and permissions
 * Run with: node setup-production-user.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./firebase/serviceAccountKey.json');

// Initialize Firebase Admin
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

const ORG_ID = 'demo-org';
const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'test123456';

async function setupProductionUser() {
    console.log('🚀 Setting up production user:', TEST_EMAIL);
    console.log('');

    try {
        // Step 1: Create or get Firebase Auth user
        let userRecord;
        try {
            userRecord = await auth.getUserByEmail(TEST_EMAIL);
            console.log('✓ User already exists in Firebase Auth');
            console.log('  UID:', userRecord.uid);
        } catch (error) {
            console.log('Creating new Firebase Auth user...');
            userRecord = await auth.createUser({
                email: TEST_EMAIL,
                password: TEST_PASSWORD,
                displayName: 'Test Admin'
            });
            console.log('✓ Created Firebase Auth user');
            console.log('  UID:', userRecord.uid);
        }

        // Step 2: Set custom claims for role-based access
        console.log('\nSetting custom claims...');
        await auth.setCustomUserClaims(userRecord.uid, {
            role: 'dispatcher',
            org_id: ORG_ID
        });
        console.log('✓ Custom claims set');
        console.log('  Role: dispatcher');
        console.log('  Org ID:', ORG_ID);

        // Step 3: Create/update Firestore user document
        console.log('\nCreating Firestore user document...');
        await db.collection('users').doc(userRecord.uid).set({
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
        console.log('✓ Firestore user document created');

        // Step 4: Create/verify organization document
        console.log('\nCreating organization document...');
        const orgRef = db.collection('organizations').doc(ORG_ID);
        const orgDoc = await orgRef.get();

        if (!orgDoc.exists()) {
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
            console.log('✓ Organization document created');
        } else {
            console.log('✓ Organization document already exists');
        }

        // Step 5: Add sample test data
        console.log('\nAdding sample test data...');

        // Add a sample job
        const jobData = {
            customer: {
                name: 'Test Customer',
                address: '456 Test Ave, Honolulu, HI 96814',
                phone: '555-999-0001',
                email: 'customer@test.com'
            },
            request: {
                description: 'Test HVAC repair for production testing',
                type: 'HVAC',
                photos: [],
                availability: []
            },
            location: { lat: 21.3099, lng: -157.8581 },
            status: 'pending',
            priority: 'high',
            estimated_duration: 120,
            complexity: 'medium',
            parts_needed: false,
            org_id: ORG_ID,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const jobRef = await db.collection('jobs').add(jobData);
        console.log('✓ Sample job created (ID:', jobRef.id + ')');

        // Add a sample quote
        const quoteData = {
            jobId: jobRef.id,
            customer: {
                name: 'Test Customer',
                email: 'customer@test.com'
            },
            lineItems: [
                {
                    description: 'HVAC System Inspection',
                    quantity: 1,
                    unitPrice: 150,
                    total: 150
                },
                {
                    description: 'Labor (2 hours)',
                    quantity: 2,
                    unitPrice: 75,
                    total: 150
                }
            ],
            subtotal: 300,
            tax: 15,
            total: 315,
            status: 'draft',
            org_id: ORG_ID,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            validUntil: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
        };

        const quoteRef = await db.collection('quotes').add(quoteData);
        console.log('✓ Sample quote created (ID:', quoteRef.id + ')');

        // Add a sample material
        const materialData = {
            name: 'HVAC Filter - 16x20',
            sku: 'HVAC-FILTER-001',
            category: 'HVAC Parts',
            quantity: 25,
            unitPrice: 12.99,
            reorderPoint: 10,
            supplier: 'HVAC Supply Co.',
            org_id: ORG_ID,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('materials').add(materialData);
        console.log('✓ Sample material created');

        console.log('\n═══════════════════════════════════════════════════════');
        console.log('🎉 Production User Setup Complete!');
        console.log('');
        console.log('Login Credentials:');
        console.log('  Email:', TEST_EMAIL);
        console.log('  Password:', TEST_PASSWORD);
        console.log('');
        console.log('User Details:');
        console.log('  UID:', userRecord.uid);
        console.log('  Role: dispatcher');
        console.log('  Organization:', ORG_ID);
        console.log('');
        console.log('Test Data Created:');
        console.log('  - 1 sample job');
        console.log('  - 1 sample quote');
        console.log('  - 1 sample material');
        console.log('');
        console.log('Login at: https://maintenancemanager-c5533.web.app/login');
        console.log('═══════════════════════════════════════════════════════');

    } catch (error) {
        console.error('\n❌ Setup failed:', error);
        throw error;
    }
}

async function main() {
    try {
        await setupProductionUser();
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    }
}

main();
