import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin using default credentials (ADC)
initializeApp({
    projectId: 'maintenancemanager-c5533'
});

const db = getFirestore();

async function clearDemoData() {
    console.log("Starting data deletion for demo-org...");
    const orgId = "demo-org";

    const collectionsToDelete = ['jobs', 'invoices', 'customers', 'tickets'];
    let totalDeleted = 0;

    for (const coll of collectionsToDelete) {
        console.log(`Querying ${coll} for org_id: ${orgId}...`);
        
        let snapshot;
        if (coll === 'tickets') {
            // tickets use organizationId instead of org_id sometimes, or they have no org at all
            snapshot = await db.collection(coll).get(); // We might delete ALL tickets for a clean slate, or just demo-org
        } else {
            snapshot = await db.collection(coll).where('org_id', '==', orgId).get();
        }

        const batch = db.batch();
        let count = 0;
        
        snapshot.docs.forEach(doc => {
            // For tickets, filter manually if we only want demo-org
            if (coll === 'tickets') {
                const data = doc.data();
                if (data.organizationId === orgId || data.orgId === orgId || data.org_id === orgId) {
                    batch.delete(doc.ref);
                    count++;
                }
            } else {
                batch.delete(doc.ref);
                count++;
            }
        });

        if (count > 0) {
            await batch.commit();
            console.log(`Deleted ${count} documents from ${coll}.`);
            totalDeleted += count;
        } else {
            console.log(`No documents found in ${coll}.`);
        }
    }

    // Also delete any quotes associated with demo-org jobs
    console.log(`Querying quotes...`);
    const quotesSnap = await db.collection('quotes').where('org_id', '==', orgId).get();
    if (!quotesSnap.empty) {
        const batch = db.batch();
        quotesSnap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        console.log(`Deleted ${quotesSnap.size} documents from quotes.`);
        totalDeleted += quotesSnap.size;
    }

    console.log(`Data clearing complete. Total documents deleted: ${totalDeleted}`);
}

clearDemoData().catch(console.error);
