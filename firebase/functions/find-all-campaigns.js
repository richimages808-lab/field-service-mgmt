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

async function findAllCampaigns() {
    const services = await client.messaging.v1.services.list();
    console.log(`Found ${services.length} messaging services:`);
    for (const s of services) {
        console.log(`\nService: ${s.friendlyName} (${s.sid})`);
        try {
            const a2ps = await client.messaging.v1.services(s.sid).usAppToPerson.list();
            console.log(`  Campaigns count: ${a2ps.length}`);
            for (const a of a2ps) {
                console.log(`    - SID: ${a.sid} | Status: ${a.campaignStatus} | CampaignID: ${a.campaignId} | Usecase: ${a.usAppToPersonUsecase}`);
                console.log(`      Description: ${a.description}`);
                console.log(`      MessageFlow: ${a.messageFlow}`);
            }
        } catch (e) {
            console.log(`  Error: ${e.message}`);
        }
    }
}

findAllCampaigns();
