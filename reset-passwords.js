/**
 * Reset Password Script
 * Resets passwords for test accounts so they can log in directly via Firebase
 * Run with: node reset-passwords.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./firebase/serviceAccountKey.json');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const auth = admin.auth();

async function resetPasswords() {
  console.log('🔑 Resetting passwords for test accounts...\n');

  const accounts = [
    { email: 'dispatcher@test.com', newPassword: 'Test123!' },
    { email: 'tech@test.com', newPassword: 'Test123!' },
    { email: 'solo@test.com', newPassword: 'Test123!' }
  ];

  for (const account of accounts) {
    try {
      const userRecord = await auth.getUserByEmail(account.email);

      // Update password
      await auth.updateUser(userRecord.uid, {
        password: account.newPassword
      });

      console.log(`✓ Reset password for: ${account.email}`);
      console.log(`  New password: ${account.newPassword}`);

    } catch (error) {
      console.error(`❌ Error resetting ${account.email}:`, error.message);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('✅ Password reset complete!\n');
  console.log('You can now log in at: https://maintenancemanager-c5533.web.app/login');
  console.log('═══════════════════════════════════════════════════════\n');

  process.exit(0);
}

resetPasswords();
