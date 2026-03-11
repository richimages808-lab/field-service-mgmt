/**
 * Assign jobs to solo technician for testing
 */

const admin = require('firebase-admin');
const serviceAccount = require('./firebase/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = admin.auth();

async function assignJobs() {
  console.log('📋 Assigning jobs to solo technician...\n');

  try {
    // Get solo tech user
    const soloUser = await auth.getUserByEmail('solo@test.com');
    console.log(`✓ Found solo tech: ${soloUser.uid}\n`);

    // Get pending jobs (first 10)
    const jobsSnapshot = await db.collection('jobs')
      .where('org_id', '==', 'demo-org')
      .where('status', '==', 'pending')
      .limit(10)
      .get();

    console.log(`Found ${jobsSnapshot.size} pending jobs to assign\n`);

    const batch = db.batch();
    let count = 0;

    jobsSnapshot.docs.forEach(doc => {
      const job = doc.data();
      batch.update(doc.ref, {
        assigned_tech_id: soloUser.uid,
        assigned_tech_name: 'Solo Tech',
        assigned_tech_email: 'solo@test.com'
      });
      count++;
      console.log(`✓ Assigned: ${job.customer.name}`);
    });

    await batch.commit();

    console.log(`\n✅ Assigned ${count} jobs to solo@test.com`);
    console.log('\nNow you can:');
    console.log('1. Login as solo@test.com');
    console.log('2. Go to AI Route Optimizer');
    console.log('3. Click "Auto-Schedule" to optimize the route');
    console.log('\nURL: https://maintenancemanager-c5533.web.app/solo-scheduler\n');

  } catch (error) {
    console.error('Error:', error);
  }

  process.exit(0);
}

assignJobs();
