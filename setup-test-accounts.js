/**
 * Test Account Setup Script
 * Creates test accounts and seed data for DispatchBox
 * Run with: node setup-test-accounts.js
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

async function createTestAccounts() {
  console.log('🚀 Creating test accounts for DispatchBox...\n');

  const accounts = [
    {
      email: 'dispatcher@test.com',
      password: 'Test123!',
      displayName: 'Demo Dispatcher',
      role: 'dispatcher',
      techType: null,
      org_id: ORG_ID
    },
    {
      email: 'tech@test.com',
      password: 'Test123!',
      displayName: 'Demo Technician',
      role: 'technician',
      techType: 'corporate',
      org_id: ORG_ID
    },
    {
      email: 'solo@test.com',
      password: 'Test123!',
      displayName: 'Solo Tech',
      role: 'technician',
      techType: 'solopreneur',
      org_id: ORG_ID
    }
  ];

  for (const account of accounts) {
    try {
      // Create Firebase Auth user
      let userRecord;
      try {
        userRecord = await auth.getUserByEmail(account.email);
        console.log(`✓ User ${account.email} already exists in Auth`);
      } catch (error) {
        userRecord = await auth.createUser({
          email: account.email,
          password: account.password,
          displayName: account.displayName
        });
        console.log(`✓ Created Auth user: ${account.email}`);
      }

      // Set custom claims for role-based access
      await auth.setCustomUserClaims(userRecord.uid, {
        role: account.role,
        org_id: account.org_id
      });
      console.log(`✓ Set custom claims for ${account.email}`);

      // Create Firestore user document
      await db.collection('users').doc(userRecord.uid).set({
        email: account.email,
        name: account.displayName,
        role: account.role,
        techType: account.techType,
        org_id: account.org_id,
        phone: `555-000-${Math.floor(1000 + Math.random() * 9000)}`,
        specialties: account.role === 'technician' ? ['HVAC', 'Plumbing', 'Electrical'] : [],
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      console.log(`✓ Created Firestore document for ${account.email}\n`);

    } catch (error) {
      console.error(`❌ Error creating ${account.email}:`, error.message);
    }
  }
}

async function createTestData() {
  console.log('\n📊 Creating test data...\n');

  // Create 5 test jobs
  const jobs = [
    {
      customer: {
        name: 'Aloha Tower',
        address: '1 Aloha Tower Dr, Honolulu, HI 96813',
        phone: '808-555-0101',
        email: 'maintenance@alohatower.com'
      },
      request: {
        description: 'Air conditioning not cooling properly',
        type: 'HVAC',
        photos: [],
        availability: []
      },
      location: { lat: 21.3069, lng: -157.8630 },
      status: 'pending',
      priority: 'high',
      estimated_duration: 120,
      complexity: 'medium',
      parts_needed: false,
      org_id: ORG_ID,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    },
    {
      customer: {
        name: 'Dole Plantation',
        address: '64-1550 Kamehameha Hwy, Wahiawa, HI 96786',
        phone: '808-555-0102',
        email: 'facilities@dole.com'
      },
      request: {
        description: 'Leaking pipe in restroom',
        type: 'Plumbing',
        photos: [],
        availability: []
      },
      location: { lat: 21.5208, lng: -158.0390 },
      status: 'pending',
      priority: 'critical',
      estimated_duration: 90,
      complexity: 'simple',
      parts_needed: true,
      org_id: ORG_ID,
      createdAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)) // 3 days ago
    },
    {
      customer: {
        name: 'Waikiki Beach Hotel',
        address: '2570 Kalakaua Ave, Honolulu, HI 96815',
        phone: '808-555-0103',
        email: 'maintenance@waikikihotel.com'
      },
      request: {
        description: 'Electrical outlet not working in room 305',
        type: 'Electrical',
        photos: [],
        availability: []
      },
      location: { lat: 21.2765, lng: -157.8265 },
      status: 'scheduled',
      priority: 'medium',
      estimated_duration: 60,
      complexity: 'simple',
      parts_needed: false,
      org_id: ORG_ID,
      scheduled_at: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 2 * 60 * 60 * 1000)), // 2 hours from now
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    },
    {
      customer: {
        name: 'Pearl Harbor Visitor Center',
        address: '1 Arizona Memorial Pl, Honolulu, HI 96818',
        phone: '808-555-0104',
        email: 'facilities@pearlharbor.org'
      },
      request: {
        description: 'HVAC system making loud noises',
        type: 'HVAC',
        photos: [],
        availability: []
      },
      location: { lat: 21.3649, lng: -157.9423 },
      status: 'pending',
      priority: 'low',
      estimated_duration: 180,
      complexity: 'complex',
      parts_needed: false,
      org_id: ORG_ID,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    },
    {
      customer: {
        name: 'Diamond Head State Monument',
        address: 'Diamond Head Rd, Honolulu, HI 96815',
        phone: '808-555-0105',
        email: 'parks@hawaii.gov'
      },
      request: {
        description: 'Water fountain needs repair',
        type: 'Plumbing',
        photos: [],
        availability: []
      },
      location: { lat: 21.2592, lng: -157.8074 },
      status: 'pending',
      priority: 'medium',
      estimated_duration: 45,
      complexity: 'simple',
      parts_needed: true,
      org_id: ORG_ID,
      createdAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)) // 2 days ago
    }
  ];

  for (const job of jobs) {
    const jobRef = await db.collection('jobs').add(job);
    console.log(`✓ Created job: ${job.customer.name} - ${job.request.description.substring(0, 30)}...`);
  }

  // Create 3 test invoices
  const invoices = [
    {
      customer: {
        name: 'Aloha Tower',
        address: '1 Aloha Tower Dr, Honolulu, HI 96813',
        email: 'billing@alohatower.com'
      },
      items: [
        { description: 'HVAC Service Call', quantity: 1, unit_price: 150, total: 150 },
        { description: 'Labor (2 hours)', quantity: 2, unit_price: 75, total: 150 }
      ],
      total: 300,
      status: 'sent',
      org_id: ORG_ID,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      dueDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
    },
    {
      customer: {
        name: 'Waikiki Beach Hotel',
        address: '2570 Kalakaua Ave, Honolulu, HI 96815',
        email: 'accounts@waikikihotel.com'
      },
      items: [
        { description: 'Electrical Repair', quantity: 1, unit_price: 200, total: 200 }
      ],
      total: 200,
      status: 'paid',
      org_id: ORG_ID,
      createdAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)),
      dueDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000))
    },
    {
      customer: {
        name: 'Dole Plantation',
        address: '64-1550 Kamehameha Hwy, Wahiawa, HI 96786',
        email: 'finance@dole.com'
      },
      items: [
        { description: 'Emergency Plumbing Repair', quantity: 1, unit_price: 250, total: 250 },
        { description: 'Parts & Materials', quantity: 1, unit_price: 85, total: 85 }
      ],
      total: 335,
      status: 'overdue',
      org_id: ORG_ID,
      createdAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)),
      dueDate: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 15 * 24 * 60 * 60 * 1000))
    }
  ];

  for (const invoice of invoices) {
    await db.collection('invoices').add(invoice);
    console.log(`✓ Created invoice: ${invoice.customer.name} - $${invoice.total} (${invoice.status})`);
  }

  console.log('\n✅ Test data creation complete!\n');
}

async function main() {
  try {
    await createTestAccounts();
    await createTestData();

    console.log('═══════════════════════════════════════════════════════');
    console.log('🎉 Setup Complete! Here are your test accounts:\n');
    console.log('Dispatcher Account:');
    console.log('  Email: dispatcher@test.com');
    console.log('  Password: Test123!\n');
    console.log('Technician Account:');
    console.log('  Email: tech@test.com');
    console.log('  Password: Test123!\n');
    console.log('Solo Technician Account:');
    console.log('  Email: solo@test.com');
    console.log('  Password: Test123!\n');
    console.log('Login at: https://maintenancemanager-c5533.web.app/login');
    console.log('═══════════════════════════════════════════════════════\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  }
}

main();
