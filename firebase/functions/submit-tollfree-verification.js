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

async function submitTFVerification() {
    console.log("Submitting Toll-Free Verification for +18884893998 (PN6101d50e036e8f933bc892a358aa8e40)...");
    try {
        const verification = await client.messaging.v1.tollfreeVerifications.create({
            tollfreePhoneNumberSid: 'PN6101d50e036e8f933bc892a358aa8e40',
            businessName: 'DispatchBox',
            businessWebsite: 'https://maintenancemanager-c5533.web.app',
            notificationEmail: 'richard@dispatch-box.com',
            businessType: 'SOLE_PROPRIETOR',
            useCaseCategories: ['ACCOUNT_NOTIFICATIONS'],
            useCaseSummary: 'DispatchBox field service management platform sends appointment reminders, service notifications, and technician tracking links to business customers.',
            productionMessageSample: 'DispatchBox: Your appointment is scheduled for 9am tomorrow. Reply STOP to cancel.',
            optInImageUrls: ['https://maintenancemanager-c5533.web.app/optin-sample.jpg'],
            optInType: 'VERBAL',
            messageVolume: '1,000',
            businessStreetAddress: '1001 Bishop St',
            businessCity: 'Honolulu',
            businessStateProvinceRegion: 'HI',
            businessPostalCode: '96813',
            businessCountry: 'US',
            businessContactFirstName: 'Richard',
            businessContactLastName: 'User',
            businessContactEmail: 'richard@dispatch-box.com',
            businessContactPhone: '+18082829726'
        });
        console.log("SUCCESS!");
        console.log("Verification SID:", verification.sid);
        console.log("Verification Status:", verification.status);
    } catch (e) {
        console.error("TF Verification failed:", e.message);
        if (e.code) console.error("Error Code:", e.code);
        if (e.moreInfo) console.error("More Info:", e.moreInfo);
    }
}

submitTFVerification();
