const admin = require('firebase-admin');
const serviceAccount = require('./firebase/serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

async function run() {
    const snaps = await db.collection("voice_sessions")
        .orderBy("createdAt", "desc")
        .limit(1)
        .get();
    
    if (snaps.empty) {
        console.log("No voice sessions found.");
        return;
    }
    
    const doc = snaps.docs[0];
    const data = doc.data();
    console.log("=== LATEST VOICE SESSION ===");
    console.log(`ID: ${doc.id}`);
    console.log(`Caller: ${data.callerPhone}`);
    console.log(`Status: ${data.status}`);
    console.log(`Intent: ${data.intent}`);
    console.log(`Turn: ${data.turn}`);
    console.log(`CreatedAt: ${data.createdAt ? data.createdAt.toDate().toISOString() : 'none'}`);
    console.log(`Transcript:`, data.transcript);
    console.log(`Available Slots:`, data.availableSlots);
    console.log(`Chosen Slot:`, data.chosenSlot);
    console.log(`Pending Slot:`, data.pendingSlot);
}

run().catch(console.error);
