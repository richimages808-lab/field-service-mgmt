/**
 * Fix all test user accounts - create Firestore user documents
 */

const admin = require('firebase-admin');
const serviceAccount = require('./firebase/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

async function fixAllTestUsers() {
  console.log('🔧 Fixing all test user accounts...\n');

  const testUsers = [
    {
      email: 'dispatcher@test.com',
      displayName: 'Test Dispatcher',
      role: 'dispatcher',
      techType: null,
      org_id: 'demo-org'
    },
    {
      email: 'tech@test.com',
      displayName: 'Test Tech',
      role: 'technician',
      techType: 'corporate',
      org_id: 'demo-org'
    },
    {
      email: 'solo@test.com',
      displayName: 'Solo Tech',
      role: 'technician',
      techType: 'solopreneur',
      org_id: 'demo-org'
    }
  ];

  for (const userConfig of testUsers) {
    try {
      // Get user from Firebase Auth
      const authUser = await auth.getUserByEmail(userConfig.email);
      console.log(`\n✓ Found ${userConfig.email}: ${authUser.uid}`);

      // Create/update Firestore user document
      const userData = {
        email: userConfig.email,
        displayName: userConfig.displayName,
        role: userConfig.role,
        techType: userConfig.techType,
        org_id: userConfig.org_id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        active: true
      };

      await db.collection('users').doc(authUser.uid).set(userData, { merge: true });

      console.log(`  ✓ Created Firestore doc with role: ${userConfig.role}, techType: ${userConfig.techType}`);

    } catch (error) {
      console.error(`  ✗ Error fixing ${userConfig.email}:`, error.message);
    }
  }

  console.log('\n✅ All test users fixed!\n');
  console.log('Login routing should now work:');
  console.log('  • dispatcher@test.com → AdminDashboard (Dispatcher Console)');
  console.log('  • tech@test.com → TechDashboard (Corporate Technician)');
  console.log('  • solo@test.com → SoloDashboard (Solo Technician with AI Scheduler)\n');

  process.exit(0);
}

fixAllTestUsers();
