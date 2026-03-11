/**
 * Diagnostic Script - List All Users
 * Lists all users in Firebase Auth to identify duplicates
 * Run with: node list-all-users.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./firebase/serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const auth = admin.auth();

async function listAllUsers() {
    console.log('📋 Listing all Firebase Auth users...\n');

    try {
        const listResult = await auth.listUsers(1000);

        console.log(`Total users found: ${listResult.users.length}\n`);
        console.log('═══════════════════════════════════════════════════════════');

        listResult.users.forEach((user, index) => {
            console.log(`\n${index + 1}. User:`, user.email || 'No email');
            console.log('   UID:', user.uid);
            console.log('   Created:', user.metadata.creationTime);
            console.log('   Last Sign In:', user.metadata.lastSignInTime || 'Never');

            if (user.customClaims) {
                console.log('   Custom Claims:', JSON.stringify(user.customClaims));
            }

            console.log('   ---');
        });

        console.log('\n═══════════════════════════════════════════════════════════');

        // Find duplicates by email
        const emailMap = {};
        listResult.users.forEach(user => {
            if (user.email) {
                if (!emailMap[user.email]) {
                    emailMap[user.email] = [];
                }
                emailMap[user.email].push(user.uid);
            }
        });

        const duplicates = Object.entries(emailMap).filter(([email, uids]) => uids.length > 1);

        if (duplicates.length > 0) {
            console.log('\n⚠️  Duplicate emails found:\n');
            duplicates.forEach(([email, uids]) => {
                console.log(`  ${email}:`);
                uids.forEach(uid => console.log(`     - ${uid}`));
            });
        } else {
            console.log('\n✓ No duplicate emails found');
        }

    } catch (error) {
        console.error('Error listing users:', error);
    }
}

listAllUsers();
