/**
 * Phase 4 Tester Setup Script
 * Sets up phase4tester@test.com with proper custom claims and sample data
 * Run with: node setup-phase4-tester.js
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
const TEST_EMAIL = 'phase4tester@test.com';

async function setup() {
    console.log('🚀 Setting up Phase 4 tester:', TEST_EMAIL);

    try {
        // Step 1: Get the user
        const userRecord = await auth.getUserByEmail(TEST_EMAIL);
        console.log('✓ Found user:', userRecord.uid);

        // Step 2: Set custom claims for solopreneur role
        console.log('\nSetting custom claims...');
        await auth.setCustomUserClaims(userRecord.uid, {
            role: 'technician',
            org_id: ORG_ID,
            techType: 'solopreneur'
        });
        console.log('✓ Custom claims set: role=technician, techType=solopreneur, org_id=' + ORG_ID);

        // Step 3: Update Firestore user document
        console.log('\nUpdating Firestore user document...');
        await db.collection('users').doc(userRecord.uid).set({
            email: TEST_EMAIL,
            name: 'Phase 4 Tester',
            role: 'technician',
            techType: 'solopreneur',
            org_id: ORG_ID,
            phone: '808-555-9999',
            specialties: ['HVAC', 'Plumbing', 'Electrical'],
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        console.log('✓ Firestore user document updated');

        // Step 4: Create sample jobs for testing
        console.log('\nCreating sample jobs...');

        const jobs = [
            {
                customer: {
                    name: 'Alice Johnson',
                    address: '789 Beach Rd, Honolulu, HI 96815',
                    phone: '808-555-1001',
                    email: 'alice@example.com'
                },
                request: {
                    description: 'AC unit not cooling properly. Makes a loud humming noise. Started 2 days ago.',
                    photos: [],
                    availability: [],
                    communicationPreference: 'email'
                },
                status: 'pending',
                priority: 'high',
                estimated_duration: 90,
                category: 'repair',
                site_name: 'Johnson Residence',
                org_id: ORG_ID,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                createdBy: userRecord.uid
            },
            {
                customer: {
                    name: 'Bob Williams',
                    address: '321 Mountain View Dr, Honolulu, HI 96816',
                    phone: '808-555-1002',
                    email: 'bob@example.com'
                },
                request: {
                    description: 'Annual furnace maintenance due. System running but making rattling sounds.',
                    photos: [],
                    availability: [],
                    communicationPreference: 'phone'
                },
                status: 'pending',
                priority: 'medium',
                estimated_duration: 60,
                category: 'maintenance',
                site_name: 'Williams Home',
                org_id: ORG_ID,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                createdBy: userRecord.uid
            },
            {
                customer: {
                    name: 'Carol Davis',
                    address: '555 Seaside Blvd, Honolulu, HI 96814',
                    phone: '808-555-1003',
                    email: 'carol@example.com'
                },
                request: {
                    description: 'Water heater leaking from the base. Need urgent inspection and possible replacement.',
                    photos: [],
                    availability: [],
                    communicationPreference: 'text'
                },
                status: 'pending',
                priority: 'critical',
                estimated_duration: 120,
                category: 'repair',
                site_name: 'Davis Condo',
                org_id: ORG_ID,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                createdBy: userRecord.uid
            }
        ];

        const jobIds = [];
        for (const jobData of jobs) {
            const ref = await db.collection('jobs').add(jobData);
            jobIds.push(ref.id);
            console.log(`  ✓ Created job: ${jobData.customer.name} (${ref.id})`);
        }

        // Step 5: Create sample materials for inventory
        console.log('\nCreating sample materials...');

        const materials = [
            {
                name: 'HVAC Filter 16x20',
                sku: 'HVAC-FILTER-1620',
                category: 'parts',
                quantity: 15,
                unitCost: 12.99,
                reorderPoint: 5,
                location: 'truck',
                supplier: 'HVAC Supply Co.',
                org_id: ORG_ID,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            },
            {
                name: 'Copper Pipe 1/2" (10ft)',
                sku: 'PIPE-CU-050-10',
                category: 'parts',
                quantity: 8,
                unitCost: 24.50,
                reorderPoint: 3,
                location: 'truck',
                supplier: 'Plumbing Depot',
                org_id: ORG_ID,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            },
            {
                name: 'Electrical Wire 14 AWG (50ft)',
                sku: 'WIRE-14AWG-50',
                category: 'materials',
                quantity: 20,
                unitCost: 18.75,
                reorderPoint: 5,
                location: 'truck',
                supplier: 'Electrical Warehouse',
                org_id: ORG_ID,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            },
            {
                name: 'Thermostat - Smart WiFi',
                sku: 'THERMO-WIFI-001',
                category: 'equipment',
                quantity: 3,
                unitCost: 89.99,
                reorderPoint: 2,
                location: 'warehouse',
                supplier: 'HVAC Supply Co.',
                org_id: ORG_ID,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            },
            {
                name: 'Pipe Sealant Tape',
                sku: 'TAPE-SEAL-001',
                category: 'materials',
                quantity: 30,
                unitCost: 3.49,
                reorderPoint: 10,
                location: 'truck',
                supplier: 'Plumbing Depot',
                org_id: ORG_ID,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            }
        ];

        for (const mat of materials) {
            await db.collection('materials').add(mat);
            console.log(`  ✓ Created material: ${mat.name}`);
        }

        console.log('\n═══════════════════════════════════════════════════════');
        console.log('🎉 Phase 4 Tester Setup Complete!');
        console.log('');
        console.log('User:', TEST_EMAIL);
        console.log('UID:', userRecord.uid);
        console.log('Role: technician (solopreneur)');
        console.log('Org:', ORG_ID);
        console.log('');
        console.log('Created:');
        console.log('  - 3 sample jobs (pending)');
        console.log('  - 5 inventory materials');
        console.log('');
        console.log('Job IDs:', jobIds.join(', '));
        console.log('');
        console.log('IMPORTANT: The user must log out and log back in');
        console.log('for custom claims to take effect!');
        console.log('═══════════════════════════════════════════════════════');

    } catch (error) {
        console.error('\n❌ Setup failed:', error);
        throw error;
    }
}

setup().then(() => process.exit(0)).catch(() => process.exit(1));
