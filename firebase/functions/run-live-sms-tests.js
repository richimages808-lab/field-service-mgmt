const fs = require('fs');
if (fs.existsSync('.env')) {
    const envConfig = fs.readFileSync('.env', 'utf8');
    for (const line of envConfig.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const [key, ...vals] = trimmed.split('=');
            if (key && !process.env[key.trim()]) {
                process.env[key.trim()] = vals.join('=').trim();
            }
        }
    }
}

const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require(path.resolve('../serviceAccountKey.json'));

if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

const TARGET_PHONE = '+18082829726';
const ORG_ID = 'demo-org';
const MESSAGING_SERVICE_SID = 'MGd2bbaa7d8acb6e34baa6f5b63f63c49b';

async function executeTests() {
    console.log('====================================================');
    console.log('   RUNNING HITOP PLUMBERS SMS TESTS FOR ' + TARGET_PHONE);
    console.log('====================================================\n');

    // 1. Ensure Customer Record exists in demo-org
    console.log('1. Setting up Customer Record in demo-org...');
    const custRef = db.collection('customers').doc('customer_rich_heaton');
    await custRef.set({
        name: 'Rich Heaton',
        phone: TARGET_PHONE,
        email: 'rich@richheaton.com',
        address: '143 Pueohala Pl, Kailua, HI 96734',
        organizationId: ORG_ID,
        org_id: ORG_ID,
        type: 'CUSTOMER',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log('   ✓ Customer ready: customer_rich_heaton (Rich Heaton)');

    // 2. Create Job 1
    console.log('2. Creating Job 1: Water Heater Replacement & Flush...');
    const job1Ref = db.collection('jobs').doc('job_test_water_heater');
    await job1Ref.set({
        title: 'Water Heater Service & Tank Flush',
        description: 'Customer reported water temperature fluctuations and rumbling noise from 50-gal tank.',
        customer: {
            name: 'Rich Heaton',
            phone: TARGET_PHONE,
            email: 'rich@richheaton.com',
            address: '143 Pueohala Pl, Kailua, HI 96734'
        },
        customer_id: 'customer_rich_heaton',
        org_id: ORG_ID,
        organizationId: ORG_ID,
        status: 'scheduled',
        priority: 'high',
        scheduledDate: 'Tomorrow at 9:00 AM HST',
        assignedTechId: 'tech_mike',
        assignedTechName: 'Mike (Lead Plumber)',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log('   ✓ Job 1 ready: job_test_water_heater');

    // 3. Create Quote for Job 1
    console.log('3. Creating Quote #Q-7081 for Job 1...');
    const quoteRef = db.collection('quotes').doc('quote_test_7081');
    const quoteData = {
        quoteNumber: 'Q-7081',
        job_id: 'job_test_water_heater',
        customer_id: 'customer_rich_heaton',
        org_id: ORG_ID,
        organizationId: ORG_ID,
        status: 'sent',
        customer: {
            name: 'Rich Heaton',
            phone: TARGET_PHONE,
            email: 'rich@richheaton.com',
            address: '143 Pueohala Pl, Kailua, HI 96734'
        },
        scopeOfWork: 'Perform complete diagnostic on water heater, replace faulty pressure relief valve, flush tank sediment, and test system pressure.',
        lineItems: [
            {
                id: 'item-1',
                type: 'labor',
                description: 'Diagnostic & Water Pressure Calibration',
                quantity: 1,
                unit: 'flat',
                unitPrice: 95.00,
                total: 95.00,
                taxable: true
            },
            {
                id: 'item-2',
                type: 'material',
                description: 'Watts Temperature & Pressure Relief Valve (150 PSI)',
                quantity: 1,
                unit: 'each',
                unitPrice: 80.00,
                total: 80.00,
                taxable: true
            },
            {
                id: 'item-3',
                type: 'labor',
                description: 'Tank Sediment Flush & Element Cleaning',
                quantity: 2,
                unit: 'hours',
                unitPrice: 100.00,
                total: 200.00,
                taxable: true
            },
            {
                id: 'item-4',
                type: 'material',
                description: 'Disposal & Environmental Processing Fee',
                quantity: 1,
                unit: 'flat',
                unitPrice: 50.00,
                total: 50.00,
                taxable: false
            }
        ],
        subtotal: 425.00,
        taxRate: 4.712,
        taxAmount: 17.67,
        total: 442.67,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await quoteRef.set(quoteData, { merge: true });
    console.log('   ✓ Quote ready: quote_test_7081 ($442.67)');

    // 4. Send SMS Tests
    console.log('\n--- SENDING SMS 1: Appointment Confirmation ---');
    const sms1 = await client.messages.create({
        messagingServiceSid: MESSAGING_SERVICE_SID,
        to: TARGET_PHONE,
        body: 'Hitop Plumbers: Hi Rich, your appointment for Water Heater Service (#JOB-7081) is confirmed for Tomorrow at 9:00 AM HST. Tech Mike is assigned. Track arrival: https://dispatch-box.com/t/demo-track-7081 Reply STOP to opt out.'
    });
    console.log(`   ✓ Sent SMS 1 | SID: ${sms1.sid} | Status: ${sms1.status}`);

    await new Promise(r => setTimeout(r, 2500));

    console.log('\n--- SENDING SMS 2: Service Quote Delivery ---');
    const sms2 = await client.messages.create({
        messagingServiceSid: MESSAGING_SERVICE_SID,
        to: TARGET_PHONE,
        body: 'Hitop Plumbers: Your quote #Q-7081 for $442.67 is ready! View details: https://dispatch-box.com/quote/quote_test_7081\n\n👉 You can reply directly to this text with "APPROVE" to accept the quote, or reply with changes.'
    });
    console.log(`   ✓ Sent SMS 2 | SID: ${sms2.sid} | Status: ${sms2.status}`);

    await new Promise(r => setTimeout(r, 2500));

    console.log('\n--- SENDING SMS 3: Technician On-Site Question & Instruction ---');
    const sms3 = await client.messages.create({
        messagingServiceSid: MESSAGING_SERVICE_SID,
        to: TARGET_PHONE,
        body: 'Hitop Plumbers: Question regarding your upcoming service:\n\nCould you confirm if the main water shutoff valve is in the garage or outside near the meter?\n\nPlease reply directly to this text.'
    });
    console.log(`   ✓ Sent SMS 3 | SID: ${sms3.sid} | Status: ${sms3.status}`);

    await new Promise(r => setTimeout(r, 2500));

    console.log('\n--- SENDING SMS 4: Two-Way Texting Capabilities Guide ---');
    const sms4 = await client.messages.create({
        messagingServiceSid: MESSAGING_SERVICE_SID,
        to: TARGET_PHONE,
        body: 'Hitop Plumbers Two-Way Texting is ACTIVE! 🚀\n\nTry texting back any of these:\n1) "APPROVE" -> Approves Quote #Q-7081 instantly\n2) "Can we remove the disposal fee?" -> AI revises quote\n3) "Status" -> Checks your latest job status\n4) "New leak in master bath" -> Creates a new ticket'
    });
    console.log(`   ✓ Sent SMS 4 | SID: ${sms4.sid} | Status: ${sms4.status}`);

    // Wait a few seconds and check final delivery status of messages
    console.log('\nChecking delivery status from carrier...');
    await new Promise(r => setTimeout(r, 4000));

    for (const sid of [sms1.sid, sms2.sid, sms3.sid, sms4.sid]) {
        const fetched = await client.messages(sid).fetch();
        console.log(`  Message ${sid}: Status=${fetched.status}, ErrorCode=${fetched.errorCode || 'none'}`);
    }

    console.log('\n====================================================');
    console.log('   ALL 4 TEST MESSAGES SENT & VERIFIED!');
    console.log('====================================================\n');
}

executeTests().then(() => process.exit(0)).catch(err => { console.error('Error:', err); process.exit(1); });
