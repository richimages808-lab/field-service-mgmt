/**
 * SMS Troubleshooting Script
 * Checks message delivery status, number capabilities, and account status
 */
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function troubleshoot() {
    console.log('========================================');
    console.log('  TWILIO SMS TROUBLESHOOTING');
    console.log('========================================\n');

    // 1. Check account info
    console.log('--- 1. Account Status ---');
    try {
        const account = await client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
        console.log(`  Account SID: ${account.sid}`);
        console.log(`  Friendly Name: ${account.friendlyName}`);
        console.log(`  Status: ${account.status}`);
        console.log(`  Type: ${account.type}`);
    } catch (e) {
        console.log(`  Error fetching account: ${e.message}`);
    }

    // 2. Check the phone number capabilities
    console.log('\n--- 2. Phone Number Configuration ---');
    try {
        const numbers = await client.incomingPhoneNumbers.list({ phoneNumber: '+18082044472' });
        if (numbers.length > 0) {
            const n = numbers[0];
            console.log(`  Number: ${n.phoneNumber}`);
            console.log(`  SID: ${n.sid}`);
            console.log(`  SMS Capable: ${n.capabilities.sms}`);
            console.log(`  Voice Capable: ${n.capabilities.voice}`);
            console.log(`  MMS Capable: ${n.capabilities.mms}`);
            console.log(`  Status: ${n.status}`);
            console.log(`  SMS URL: ${n.smsUrl || 'none'}`);
            console.log(`  SMS Method: ${n.smsMethod || 'none'}`);
            console.log(`  SMS Fallback: ${n.smsFallbackUrl || 'none'}`);
        } else {
            console.log('  ERROR: Phone number +18082044472 NOT FOUND in account!');
        }
    } catch (e) {
        console.log(`  Error: ${e.message}`);
    }

    // 3. Check recent messages
    console.log('\n--- 3. Recent Messages (last 10) ---');
    try {
        const messages = await client.messages.list({ from: '+18082044472', limit: 10 });
        if (messages.length === 0) {
            console.log('  No messages found from this number!');
        }
        for (const m of messages) {
            console.log(`\n  SID: ${m.sid}`);
            console.log(`    To: ${m.to}`);
            console.log(`    Status: ${m.status}`);
            console.log(`    Error Code: ${m.errorCode || 'none'}`);
            console.log(`    Error Msg: ${m.errorMessage || 'none'}`);
            console.log(`    Date Created: ${m.dateCreated}`);
            console.log(`    Date Sent: ${m.dateSent || 'not sent yet'}`);
            console.log(`    Price: ${m.price || 'n/a'} ${m.priceUnit || ''}`);
            console.log(`    Body: ${m.body.substring(0, 80)}...`);
        }
    } catch (e) {
        console.log(`  Error: ${e.message}`);
    }

    // 4. Check messages TO the user's number specifically
    console.log('\n--- 4. Messages To +18082829726 ---');
    try {
        const messages = await client.messages.list({ to: '+18082829726', limit: 10 });
        if (messages.length === 0) {
            console.log('  No messages found to this number!');
        }
        for (const m of messages) {
            console.log(`\n  SID: ${m.sid}`);
            console.log(`    From: ${m.from}`);
            console.log(`    Status: ${m.status}`);
            console.log(`    Error Code: ${m.errorCode || 'none'}`);
            console.log(`    Error Msg: ${m.errorMessage || 'none'}`);
            console.log(`    Date Created: ${m.dateCreated}`);
            console.log(`    Date Sent: ${m.dateSent || 'not sent yet'}`);
            console.log(`    Body: ${m.body.substring(0, 80)}...`);
        }
    } catch (e) {
        console.log(`  Error: ${e.message}`);
    }

    // 5. Try sending a simple test message now
    console.log('\n--- 5. Sending Fresh Test SMS ---');
    try {
        const msg = await client.messages.create({
            body: 'DispatchBox Test: This is a test message to confirm SMS delivery. Time: ' + new Date().toLocaleString(),
            from: '+18082044472',
            to: '+18082829726'
        });
        console.log(`  Sent! SID: ${msg.sid}`);
        console.log(`  Status: ${msg.status}`);

        // Wait 5 seconds and check status
        console.log('  Waiting 5 seconds to check delivery status...');
        await new Promise(r => setTimeout(r, 5000));

        const updated = await client.messages(msg.sid).fetch();
        console.log(`  Updated Status: ${updated.status}`);
        console.log(`  Error Code: ${updated.errorCode || 'none'}`);
        console.log(`  Error Msg: ${updated.errorMessage || 'none'}`);
    } catch (e) {
        console.log(`  SEND FAILED: ${e.message}`);
        console.log(`  Error Code: ${e.code}`);
        console.log(`  More Info: ${e.moreInfo}`);
    }

    // 6. Check if there's a messaging service
    console.log('\n--- 6. Messaging Services ---');
    try {
        const services = await client.messaging.v1.services.list({ limit: 5 });
        if (services.length === 0) {
            console.log('  No messaging services configured');
        } else {
            services.forEach(s => {
                console.log(`  Service: ${s.friendlyName} (${s.sid})`);
                console.log(`    Status: ${s.statusCallback || 'none'}`);
            });
        }
    } catch (e) {
        console.log(`  Error: ${e.message}`);
    }

    console.log('\n========================================');
    console.log('  TROUBLESHOOTING COMPLETE');
    console.log('========================================');
}

troubleshoot().catch(e => {
    console.error('Fatal error:', e.message);
    process.exit(1);
});
