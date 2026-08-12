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
const BRAND_SID = 'BN637378fbf10d1cf4e56b2de017bd8e87';

async function updateExistingCampaign() {
    console.log(`Updating existing A2P 10DLC Campaign ${CAMPAIGN_SID} for service ${MESSAGING_SERVICE_SID}...`);

    const compliantMessageFlow = `Customers opt in by completing the booking form or checking the SMS consent box during service appointment intake on our website at https://dispatch-box.com or https://maintenancemanager-c5533.web.app. Privacy Policy: https://dispatch-box.com/privacy Terms: https://dispatch-box.com/terms. No mobile information will be shared with third parties/affiliates for marketing/promotional purposes. All the above categories exclude text messaging originator opt-in data and consent; this information will not be shared with any third parties.`;

    const compliantDescription = `DispatchBox field service management platform sends transactional SMS appointment confirmations, technician en-route alerts, and quote/invoice links to customers.`;

    const compliantSamples = [
        'DispatchBox: Your service appointment is confirmed for tomorrow at 9:00 AM. Reply STOP to cancel or HELP for assistance. Msg & data rates may apply.',
        'DispatchBox: Your technician is en route to your location. Track arrival: https://dispatch-box.com/t/abc12345. Reply STOP to opt out.'
    ];

    try {
        const updated = await client.messaging.v1.services(MESSAGING_SERVICE_SID)
            .usAppToPerson(CAMPAIGN_SID)
            .update({
                brandRegistrationSid: BRAND_SID,
                usAppToPersonUsecase: 'SOLE_PROPRIETOR',
                description: compliantDescription,
                messageFlow: compliantMessageFlow,
                messageSamples: compliantSamples,
                hasEmbeddedLinks: true,
                hasEmbeddedPhone: true,
                subscriberOptIn: true,
                ageGated: false,
                directLending: false
            });
        console.log("SUCCESSFULLY UPDATED AND RESUBMITTED CAMPAIGN!");
        console.log("SID:", updated.sid);
        console.log("Campaign Status:", updated.campaignStatus);
        console.log("Date Updated:", updated.dateUpdated);
    } catch (e) {
        console.error("Update failed:", e.message);
        if (e.code) console.error("Error Code:", e.code);
        if (e.moreInfo) console.error("More Info:", e.moreInfo);
    }
}

updateExistingCampaign();
