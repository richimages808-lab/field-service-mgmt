const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function main() {
    console.log("=== QUOTES IN TECH_REVIEW ===");
    const snap = await db.collection('quotes').where('status', '==', 'tech_review').get();
    for (const doc of snap.docs) {
        console.log("ID:", doc.id);
        console.log(JSON.stringify(doc.data(), null, 2));
    }
    process.exit(0);
}

main().catch(console.error);
