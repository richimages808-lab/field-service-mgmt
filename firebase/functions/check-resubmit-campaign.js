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
const CAMPAIGN_SID = 'QE2c6890da8086d771620e9b13fadeba0b';

async function checkResubmit() {
    console.log("Checking campaign status and resubmit options...");
    try {
        const c = await client.messaging.v1.services(MESSAGING_SERVICE_SID).usAppToPerson(CAMPAIGN_SID).fetch();
        console.log("Campaign SID:", c.sid);
        console.log("Status:", c.campaignStatus);

        // Check if there is an explicit resubmit endpoint in Twilio API client
        // In Twilio API, updating the usAppToPerson resource or calling resubmit if supported
        console.log("Date Updated:", c.dateUpdated);
        console.log("Message Flow updated:", c.messageFlow.includes("No mobile information will be shared"));
    } catch (e) {
        console.error("Error:", e.message);
    }
}

checkResubmit();
