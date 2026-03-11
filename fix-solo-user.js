/**
 * Fix solo@test.com user - create Firestore user document
 */

const admin = require('firebase-admin');
const serviceAccount = require('./firebase/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

async function fixSoloUser() {
  console.log('🔧 Fixing solo@test.com user account...\n');

  try {
    // Get solo user from Firebase Auth
    const soloUser = await auth.getUserByEmail('solo@test.com');
    console.log(`✓ Found Auth user: ${soloUser.uid}\n`);

    // Create/update Firestore user document
    const userData = {
      email: 'solo@test.com',
      displayName: 'Solo Tech',
      role: 'technician',
      techType: 'solopreneur',  // This is the critical field!
      org_id: 'demo-org',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      active: true
    };

    await db.collection('users').doc(soloUser.uid).set(userData, { merge: true });

    console.log('✅ Created Firestore user document with:');
    console.log(JSON.stringify(userData, null, 2));
    console.log('\n✅ Solo user should now see SoloDashboard on login!\n');

  } catch (error) {
    console.error('Error:', error);
  }

  process.exit(0);
}

fixSoloUser();
