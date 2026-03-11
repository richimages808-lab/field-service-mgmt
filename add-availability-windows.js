/**
 * Add availability windows to existing test jobs
 * This enables the AI scheduler to match customer availability
 */

const admin = require('firebase-admin');
const serviceAccount = require('./firebase/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function addAvailabilityWindows() {
  console.log('🕒 Adding customer availability windows to test jobs...\n');

  try {
    // Get all jobs for demo-org
    const jobsSnapshot = await db.collection('jobs')
      .where('org_id', '==', 'demo-org')
      .get();

    const batch = db.batch();
    let updateCount = 0;

    jobsSnapshot.docs.forEach((doc, index) => {
      const job = doc.data();

      // Define various availability patterns
      const availabilityPatterns = [
        // Morning preference
        {
          day: 'monday',
          startTime: '08:00',
          endTime: '12:00',
          preferredTime: 'morning'
        },
        // Afternoon preference
        {
          day: 'tuesday',
          startTime: '13:00',
          endTime: '17:00',
          preferredTime: 'afternoon'
        },
        // All day availability
        {
          day: 'wednesday',
          startTime: '08:00',
          endTime: '18:00',
          preferredTime: 'morning'
        },
        // Specific date (today)
        {
          day: new Date().toISOString().split('T')[0],
          startTime: '09:00',
          endTime: '16:00',
          preferredTime: 'afternoon'
        },
        // Evening availability
        {
          day: 'thursday',
          startTime: '14:00',
          endTime: '19:00',
          preferredTime: 'evening'
        }
      ];

      // Assign a random pattern to each job
      const pattern = availabilityPatterns[index % availabilityPatterns.length];

      batch.update(doc.ref, {
        'request.availabilityWindows': [pattern],
        'request.availability': [`${pattern.preferredTime || 'any time'} on ${pattern.day}`]
      });

      updateCount++;
      console.log(`✓ Added ${pattern.preferredTime} availability for: ${job.customer.name}`);
    });

    await batch.commit();

    console.log(`\n✅ Updated ${updateCount} jobs with availability windows!`);
    console.log('\nThe AI scheduler can now:');
    console.log('  • Match customer availability preferences');
    console.log('  • Optimize route based on time windows');
    console.log('  • Score jobs based on preference matching');
    console.log('\nLogin at: https://maintenancemanager-c5533.web.app/solo-scheduler\n');

  } catch (error) {
    console.error('Error:', error);
  }

  process.exit(0);
}

addAvailabilityWindows();
