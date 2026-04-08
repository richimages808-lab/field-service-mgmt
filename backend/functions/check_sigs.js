const admin = require('firebase-admin');
const serviceAccount = require('../../firebase/serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

async function checkSignatures() {
    try {
        console.log(`Querying job_signatures...`);
        const sigsSnapshot = await db.collection('job_signatures')
            .orderBy('signedAt', 'desc')
            .limit(10)
            .get();
        if (sigsSnapshot.empty) {
            console.log('No signatures found.');
            return;
        }

        sigsSnapshot.forEach(doc => {
            const data = doc.data();
            let sigUrl = data.signatureDataUrl;
            if (sigUrl && sigUrl.length > 50) {
                sigUrl = sigUrl.substring(0, 50) + '...';
            }
            console.log(`Signature ID: ${doc.id}`);
            console.log(`Job ID: ${data.job_id}`);
            console.log(`Signer: ${data.signerName}`);
            console.log(`signatureDataUrl: ${sigUrl}`);
            console.log(`signatureUrl: ${data.signatureUrl ? (data.signatureUrl.length > 50 ? data.signatureUrl.substring(0,50)+'...' : data.signatureUrl) : 'undefined'}`);
            console.log(`Signed At: ${data.signedAt ? data.signedAt.toDate().toISOString() : 'Unknown'}`);
            console.log('---');
        });
    } catch (e) {
        console.error(e);
    }
}
checkSignatures();
