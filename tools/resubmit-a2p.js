const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const rootDir = path.resolve(__dirname, '..');
const envText = fs.readFileSync(path.join(rootDir, 'firebase', 'functions', '.env'), 'utf-8');
const envConfig = {};
envText.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
        const idx = trimmed.indexOf('=');
        if (idx !== -1) envConfig[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
    }
});

const twilio = require(path.join(rootDir, 'firebase', 'functions', 'node_modules', 'twilio'))(envConfig.TWILIO_ACCOUNT_SID, envConfig.TWILIO_AUTH_TOKEN);
const serviceAccount = require(path.join(rootDir, 'firebase', 'serviceAccountKey.json'));
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

async function createFreshMessagingServiceAndCampaign() {
    const brandSid = 'BN637378fbf10d1cf4e56b2de017bd8e87';

    console.log('1. Creating fresh Messaging Service...');
    const service = await twilio.messaging.v1.services.create({
        friendlyName: 'DispatchBox Production SMS',
        inboundRequestUrl: 'https://us-central1-maintenancemanager-c5533.cloudfunctions.net/handleInboundTwilioSms',
        statusCallback: 'https://us-central1-maintenancemanager-c5533.cloudfunctions.net/handleTwilioSmsStatus'
    });
    console.log('Created Messaging Service:', service.sid);

    // 2. Add phone numbers to sender pool
    const phones = ['+18082044472', '+18084352635', '+18085563431', '+18085567141'];
    for (const num of phones) {
        try {
            const incoming = await twilio.incomingPhoneNumbers.list({ phoneNumber: num });
            if (incoming.length > 0) {
                await twilio.messaging.v1.services(service.sid).phoneNumbers.create({ phoneNumberSid: incoming[0].sid });
                console.log('Added number to service:', num);
            }
        } catch(e) {
            console.log('Number add warning:', num, e.message);
        }
    }

    // 3. Create A2P Campaign
    console.log('2. Creating A2P 10DLC Campaign on new service...');
    const description = 'DispatchBox field service management platform sends transactional SMS appointment confirmations, technician en-route alerts, job status updates, and quote/invoice links to customers.';
    
    const messageSamples = [
        'DispatchBox: Your service appointment is scheduled for tomorrow at 9:00 AM. Reply STOP to cancel, HELP for assistance. Msg & data rates may apply.',
        'DispatchBox: Your technician is on the way. Track arrival: https://maintenancemanager-c5533.web.app/t/demo123. Reply STOP to opt out, HELP for help.'
    ];

    const messageFlow = 'End users opt in to receive transactional SMS messages from DispatchBox when requesting service, booking an appointment, or submitting an inquiry via our public web forms at https://maintenancemanager-c5533.web.app/contact or https://maintenancemanager-c5533.web.app/request-service, or when signing up at https://maintenancemanager-c5533.web.app/signup. Users check an explicit opt-in checkbox with the text: "I agree to receive transactional text messages (such as appointment confirmations, technician ETA alerts, and quote/invoice notifications) from DispatchBox at the mobile number provided. Message and data rates may apply. Message frequency varies. Reply STOP to opt out, HELP for help. View our Privacy Policy (https://maintenancemanager-c5533.web.app/privacy) and Terms of Service (https://maintenancemanager-c5533.web.app/terms). Mobile information will not be shared with third parties or affiliates for marketing or promotional purposes." Privacy Policy URL: https://maintenancemanager-c5533.web.app/privacy. Terms of Service URL: https://maintenancemanager-c5533.web.app/terms.';

    try {
        const campaign = await twilio.messaging.v1.services(service.sid).usAppToPerson.create({
            brandRegistrationSid: brandSid,
            description: description,
            messageSamples: messageSamples,
            usAppToPersonUsecase: 'SOLE_PROPRIETOR',
            hasEmbeddedLinks: true,
            hasEmbeddedPhone: false,
            messageFlow: messageFlow,
            optInMessage: 'You have opted in to receive transactional service notifications from DispatchBox. Msg & data rates may apply. Reply STOP to opt out, HELP for help.',
            optOutMessage: 'You have successfully unsubscribed from DispatchBox notifications. You will receive no further messages. Reply START to re-subscribe.',
            helpMessage: 'DispatchBox Service Notifications. Msg & data rates may apply. Reply STOP to unsubscribe or email support@dispatchbox.com for help.',
            optInKeywords: ['START', 'YES', 'UNSTOP'],
            optOutKeywords: ['STOP', 'CANCEL', 'END', 'QUIT', 'UNSUBSCRIBE', 'STOPALL', 'REVOKE'],
            helpKeywords: ['HELP', 'INFO'],
            privacyPolicyUrl: 'https://maintenancemanager-c5533.web.app/privacy',
            termsAndConditionsUrl: 'https://maintenancemanager-c5533.web.app/terms'
        });

        console.log('Campaign Created Successfully!');
        console.log('Campaign SID:', campaign.sid);
        console.log('Campaign Status:', campaign.campaignStatus);

        // Update firebase/functions/.env with new TWILIO_MESSAGING_SERVICE_SID
        const envPath = path.join(rootDir, 'firebase', 'functions', '.env');
        let updatedEnv = envText.replace(/TWILIO_MESSAGING_SERVICE_SID=.*/, `TWILIO_MESSAGING_SERVICE_SID=${service.sid}`);
        fs.writeFileSync(envPath, updatedEnv, 'utf-8');
        console.log('Updated .env with TWILIO_MESSAGING_SERVICE_SID =', service.sid);

        // Update Firestore records
        const subSnap = await db.collection('org_texting_subscriptions').get();
        for (const doc of subSnap.docs) {
            await doc.ref.update({
                a2pCampaignSid: campaign.sid,
                a2pCampaignStatus: campaign.campaignStatus || 'IN_PROGRESS',
                messagingServiceSid: service.sid,
                updatedAt: admin.firestore.Timestamp.now()
            });
            console.log('Updated subscription doc:', doc.id);
        }
    } catch(err) {
        console.error('Campaign creation error:', err.message, err.code, err);
    }
}

createFreshMessagingServiceAndCampaign().then(() => process.exit(0)).catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
