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

async function inspectA2PDetails() {
    console.log("=========================================");
    console.log("  INSPECTING TWILIO A2P BRAND & CAMPAIGNS");
    console.log("=========================================\n");

    // Brands
    const brands = await client.messaging.v1.brandRegistrations.list();
    console.log(`Found ${brands.length} Brands:`);
    for (const b of brands) {
        console.log(`\nBrand SID: ${b.sid}`);
        console.log(`  Profile Bundle: ${b.a2pProfileBundleSid}`);
        console.log(`  Status: ${b.status}`);
        console.log(`  Brand Type: ${b.brandType || 'Sole Proprietor / Standard'}`);
        console.log(`  Identity Status: ${b.identityStatus}`);
        console.log(`  Failure Reason: ${b.failureReason || 'none'}`);

        // Try listing brand vettings
        try {
            const vettings = await client.messaging.v1.brandRegistrations(b.sid).brandVettings.list();
            console.log(`  Vettings: ${vettings.length}`);
            for (const v of vettings) {
                console.log(`    - Vetting SID: ${v.sid} | Provider: ${v.vettingProvider} | Status: ${v.vettingStatus}`);
            }
        } catch (e) {
            console.log(`  Vettings error: ${e.message}`);
        }
    }

    // List ALL Messaging Services and all A2P campaigns under each
    console.log("\n--- Messaging Services & Campaigns ---");
    const services = await client.messaging.v1.services.list();
    for (const s of services) {
        console.log(`\nService: ${s.friendlyName} (${s.sid})`);
        try {
            const a2ps = await client.messaging.v1.services(s.sid).usAppToPerson.list();
            console.log(`  A2P Registrations (${a2ps.length}):`);
            for (const a of a2ps) {
                console.log(`    - A2P SID: ${a.sid}`);
                console.log(`      Status: ${a.campaignStatus}`);
                console.log(`      Campaign ID: ${a.campaignId}`);
                console.log(`      Use Case: ${a.usAppToPersonUsecase}`);
                console.log(`      Brand SID: ${a.brandRegistrationSid}`);
                console.log(`      Description: ${a.description}`);
            }
        } catch (e) {
            console.log(`  Error: ${e.message}`);
        }
    }

    // Toll-Free Verification check
    console.log("\n--- Toll-Free Verifications ---");
    try {
        const tfvs = await client.messaging.v1.tollfreeVerifications.list();
        console.log(`Found ${tfvs.length} Toll-Free Verifications:`);
        for (const tf of tfvs) {
            console.log(`  - SID: ${tf.sid} | Number: ${tf.tollfreePhoneNumberSid} | Status: ${tf.status}`);
        }
    } catch (e) {
        console.log(`  Error listing TF verifications: ${e.message}`);
    }
}

inspectA2PDetails().catch(console.error);
