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

const MESSAGING_SERVICE_SID = 'MGd2bbaa7d8acb6e34baa6f5b63f63c49b';

async function getCampaign() {
    console.log("Checking usAppToPerson campaigns for Messaging Service:", MESSAGING_SERVICE_SID);
    try {
        const list = await client.messaging.v1.services(MESSAGING_SERVICE_SID).usAppToPerson.list();
        console.log(`Found ${list.length} campaign(s):`);
        for (const c of list) {
            console.log("--- Campaign Details ---");
            console.log("SID:", c.sid);
            console.log("Status:", c.campaignStatus);
            console.log("Campaign ID:", c.campaignId);
            console.log("Usecase:", c.usAppToPersonUsecase);
            console.log("Description:", c.description);
            console.log("Message Flow:", c.messageFlow);
            console.log("Message Samples:", c.messageSamples);
            console.log("Errors / Details:", JSON.stringify(c, null, 2));
        }
    } catch (e) {
        console.error("Error fetching campaign:", e.message);
    }
}

getCampaign();
