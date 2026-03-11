const admin = require('firebase-admin');
const serviceAccount = require('./firebase/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const auth = admin.auth();
const db = admin.firestore();

async function verifyAccounts() {
  console.log('🔍 Verifying test accounts...\n');
  
  const emails = ['dispatcher@test.com', 'tech@test.com', 'solo@test.com'];
  
  for (const email of emails) {
    try {
      // Check Auth
      const userRecord = await auth.getUserByEmail(email);
      console.log(`\n✓ Auth User: ${email}`);
      console.log(`  UID: ${userRecord.uid}`);
      console.log(`  Display Name: ${userRecord.displayName}`);
      console.log(`  Custom Claims:`, userRecord.customClaims);
      
      // Check Firestore
      const userDoc = await db.collection('users').doc(userRecord.uid).get();
      if (userDoc.exists) {
        console.log(`  Firestore Doc: EXISTS`);
        console.log(`  Data:`, userDoc.data());
      } else {
        console.log(`  Firestore Doc: MISSING ❌`);
      }
    } catch (error) {
      console.error(`❌ Error checking ${email}:`, error.message);
    }
  }
  
  process.exit(0);
}

verifyAccounts();
