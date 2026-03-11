/**
 * Check A2P 10DLC registration status and available options
 */
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function checkA2P() {
    console.log('=== A2P 10DLC Registration Status ===\n');

    // Check for Toll-Free numbers (bypass A2P requirement)
    console.log('--- All Phone Numbers in Account ---');
    try {
        const numbers = await client.incomingPhoneNumbers.list();
        for (const n of numbers) {
            console.log(`  ${n.phoneNumber}`);
            console.log(`    Type: ${n.phoneNumber.startsWith('+1800') || n.phoneNumber.startsWith('+1888') || n.phoneNumber.startsWith('+1877') || n.phoneNumber.startsWith('+1866') || n.phoneNumber.startsWith('+1855') || n.phoneNumber.startsWith('+1844') || n.phoneNumber.startsWith('+1833') ? 'TOLL-FREE' : 'LOCAL (10DLC)'}`);
            console.log(`    SMS: ${n.capabilities.sms}, Voice: ${n.capabilities.voice}`);
            console.log(`    Friendly Name: ${n.friendlyName}`);
            console.log(`    SID: ${n.sid}`);
        }
    } catch (e) {
        console.log(`  Error: ${e.message}`);
    }

    // Check messaging services
    console.log('\n--- Messaging Services ---');
    try {
        const services = await client.messaging.v1.services.list();
        if (services.length === 0) {
            console.log('  No messaging services found.');
            console.log('  -> A messaging service is needed to register A2P 10DLC campaigns.');
        } else {
            for (const s of services) {
                console.log(`  Service: ${s.friendlyName} (${s.sid})`);
            }
        }
    } catch (e) {
        console.log(`  Error: ${e.message}`);
    }

    // Check A2P Brand Registrations
    console.log('\n--- A2P Brand Registrations ---');
    try {
        const brands = await client.messaging.v1.brandRegistrations.list();
        if (brands.length === 0) {
            console.log('  No brand registrations found.');
            console.log('  -> You need to register a brand for A2P 10DLC.');
        } else {
            for (const b of brands) {
                console.log(`  Brand: ${b.a2pProfileBundleSid} (${b.sid})`);
                console.log(`    Status: ${b.brandRegistrationStatus || b.status}`);
            }
        }
    } catch (e) {
        console.log(`  Error: ${e.message}`);
    }

    // Check Toll-Free verification
    console.log('\n--- Toll-Free Verification ---');
    try {
        const tfv = await client.messaging.v1.tollfreeVerifications.list();
        if (tfv.length === 0) {
            console.log('  No toll-free verifications found.');
        } else {
            for (const v of tfv) {
                console.log(`  ${v.tollfreePhoneNumberSid}: ${v.status}`);
            }
        }
    } catch (e) {
        console.log(`  Error: ${e.message}`);
    }

    console.log('\n=== RECOMMENDATIONS ===');
    console.log('ERROR 30034 means your 10DLC number is NOT registered for A2P messaging.');
    console.log('Options to fix:');
    console.log('  1. Register for A2P 10DLC (takes days/weeks for approval)');
    console.log('     - Register a Brand in Twilio Console');
    console.log('     - Create a Campaign');
    console.log('     - Link your number to the campaign');
    console.log('  2. Purchase a Toll-Free number (faster verification)');
    console.log('  3. Use Twilio Messaging Service with a registered short code');
    console.log('');
}

checkA2P().catch(e => console.error('Fatal:', e.message));
