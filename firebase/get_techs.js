const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

async function run() {
  console.log("=== TECHNICIANS ===");
  const techs = await db.collection("technicians").get();
  for (const doc of techs.docs) {
    console.log(`Tech ID: ${doc.id}, Name: ${doc.data().name}, Org ID: ${doc.data().org_id || doc.data().orgId}`);
  }

  console.log("\n=== USERS WITH ROLE ==");
  const users = await db.collection("users")
    .where("org_id", "==", "demo-org")
    .get();
  for (const doc of users.docs) {
    console.log(`User ID: ${doc.id}, Email: ${doc.data().email}, Role: ${doc.data().role}`);
  }

  process.exit(0);
}
run();
