const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

async function run() {
  console.log("=== USER DETAILS ===");
  const userId = "FcLmpTbixIU0zZIVXALiuNRJFqz2";
  const userDoc = await db.collection("users").doc(userId).get();
  if (userDoc.exists) {
    console.log(JSON.stringify(userDoc.data(), null, 2));
  } else {
    console.log(`User with ID ${userId} not found`);
  }
  process.exit(0);
}
run();
