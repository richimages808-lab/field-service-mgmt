const admin = require('firebase-admin');
const serviceAccount = require('./firebase/serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

const targetOrgs = ['demo-org', '2oJOsvh81ObANLcuiVui'];
const collectionsToDelete = ['jobs', 'quotes', 'invoices', 'customers'];

async function deleteCollectionForOrgs(collectionPath, orgs) {
    console.log(`\nDeleting from ${collectionPath}...`);
    for (const orgId of orgs) {
        let batch = db.batch();
        let count = 0;
        
        const snapshot = await db.collection(collectionPath).where('org_id', '==', orgId).get();
        snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
            count++;
        });

        if (count > 0) {
            await batch.commit();
            console.log(`- Deleted ${count} documents for org '${orgId}' in '${collectionPath}'.`);
        } else {
            console.log(`- No documents found for org '${orgId}' in '${collectionPath}'.`);
        }
    }
}

async function run() {
    console.log('Starting data cleanup...');
    try {
        for (const col of collectionsToDelete) {
            await deleteCollectionForOrgs(col, targetOrgs);
        }
        console.log('\nData cleanup completed successfully!');
    } catch (e) {
        console.error('Error during cleanup:', e);
    }
}

run();
