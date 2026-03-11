import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp({
    projectId: 'maintenancemanager-c5533'
});

const db = admin.firestore();

async function mockBillingHistory() {
    const monthKey = '2026-03';
    const today = '2026-03-04';

    // Create daily cost
    await db.collection('billing_history').doc(monthKey).collection('daily_costs').doc(today).set({
        date: today,
        bigqueryComputeCost: 0.1500,
        bigqueryStorageCost: 0.0500,
        bigqueryTotalCost: 0.2000,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    // Create monthly summary
    await db.collection('billing_history').doc(monthKey).set({
        month: monthKey,
        twilioTotalCost: 23.45,
        sendgridTotalCost: 1.50,
        geminiTotalCost: 1.25,
        bigqueryTotalCost: 0.2000,
        mapsTotalCost: 5.00,
        functionsTotalCost: 0.00,
        fixedTotalCost: 14.30,
        grandTotalCost: 45.70,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('Mocked billing history for', monthKey);
}

mockBillingHistory().then(() => process.exit(0)).catch(console.error);
