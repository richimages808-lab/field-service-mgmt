const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const orgId = "demo-org";
const customerPhone = "+18082829726";
const customerEmail = "rich@example.com";

const testJobs = [
  {
    name: "Rich (HiTop Test 1)",
    desc: "Emergency drain cleaning service for clogged bathroom sink.",
    price: 185.00,
    lineItems: [
      { type: "labor", description: "Drain cleaning labor", quantity: 1, unitPrice: 125, total: 125 },
      { type: "material", description: "Drain opener chemical solution", quantity: 1, unitPrice: 60, total: 60 }
    ]
  },
  {
    name: "Rich (HiTop Test 2)",
    desc: "Standard water heater checkup and anode rod replacement.",
    price: 240.00,
    lineItems: [
      { type: "labor", description: "Water heater safety inspection labor", quantity: 1, unitPrice: 90, total: 90 },
      { type: "material", description: "Magnesium anode rod replacement parts", quantity: 1, unitPrice: 150, total: 150 }
    ]
  },
  {
    name: "Rich (HiTop Test 3)",
    desc: "Kitchen sink faucet installation and vanity plumbing check.",
    price: 320.00,
    lineItems: [
      { type: "labor", description: "Kitchen faucet installation labor", quantity: 1, unitPrice: 200, total: 200 },
      { type: "material", description: "Flex supply lines and sealant tape kit", quantity: 1, unitPrice: 120, total: 120 }
    ]
  }
];

async function createJobAndQuote(testJob, index) {
  const jobRef = db.collection("jobs").doc();
  const quoteRef = db.collection("quotes").doc();

  // 1. Create quote
  const quoteDoc = {
    orgId,
    jobId: jobRef.id,
    customer: {
      name: testJob.name,
      phone: customerPhone,
      email: customerEmail
    },
    presentationMode: "single_price",
    status: "pending",
    total: testJob.price,
    lineItems: testJob.lineItems,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };
  await quoteRef.set(quoteDoc);

  // 2. Create job
  const jobDoc = {
    org_id: orgId,
    org_name: "HiTopPlumbers",
    customer: {
      name: testJob.name,
      phone: customerPhone,
      email: customerEmail
    },
    request: {
      description: testJob.desc,
      category: "plumbing"
    },
    quoteId: quoteRef.id,
    quoteStatus: "pending",
    status: "quote_pending",
    schedulingPreference: "phone",
    archived: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };
  await jobRef.set(jobDoc);

  console.log(`[Job ${index + 1}] Created successfully. Job ID: ${jobRef.id}, Quote ID: ${quoteRef.id}`);
  return { jobId: jobRef.id, quoteId: quoteRef.id };
}

async function triggerApproval(jobId, index) {
  console.log(`[Job ${index + 1}] Triggering quote approval for job ${jobId}...`);
  const jobRef = db.collection("jobs").doc(jobId);
  await jobRef.update({
    quoteStatus: "approved",
    status: "pending",
    approvedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log(`[Job ${index + 1}] Quote approval triggered successfully.`);
}

async function run() {
  console.log("=== CREATING 3 TEST JOBS & QUOTES ===");
  const jobIds = [];
  for (let i = 0; i < testJobs.length; i++) {
    const refs = await createJobAndQuote(testJobs[i], i);
    jobIds.push(refs.jobId);
  }

  // 1. Trigger first call immediately
  console.log("\n=== TRIGGERING CALL 1 (IMMEDIATE) ===");
  await triggerApproval(jobIds[0], 0);

  // 2. Trigger second call in 5 minutes (300 seconds)
  const delay2 = 5 * 60 * 1000;
  console.log(`\n=== SCHEDULING CALL 2 IN 5 MINUTES (${delay2}ms) ===`);
  setTimeout(async () => {
    console.log("\n=== TRIGGERING CALL 2 ===");
    await triggerApproval(jobIds[1], 1);
  }, delay2);

  // 3. Trigger third call in 10 minutes (600 seconds)
  const delay3 = 10 * 60 * 1000;
  console.log(`\n=== SCHEDULING CALL 3 IN 10 MINUTES (${delay3}ms) ===`);
  setTimeout(async () => {
    console.log("\n=== TRIGGERING CALL 3 ===");
    await triggerApproval(jobIds[2], 2);
    console.log("\n=== ALL CALLS TRIGGERED. SCRIPT COMPLETED. ===");
    process.exit(0);
  }, delay3);
}

run().catch(err => {
  console.error("Error running test scheduler script:", err);
  process.exit(1);
});
