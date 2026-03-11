/**
 * Fix A2P 10DLC — Create Messaging Service, Campaign, and link the phone number
 * 
 * The brand is already APPROVED (BN637378fbf10d1cf4e56b2de017bd8e87).
 * We need:
 * 1. A Messaging Service
 * 2. An A2P Campaign linked to the brand
 * 3. Phone number linked to the Messaging Service
 */
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const BRAND_SID = 'BN637378fbf10d1cf4e56b2de017bd8e87';
const PHONE_SID = 'PN7109ae1a8a575f748e40b8a0014f3122';

async function fixA2P() {
    console.log('=== FIXING A2P 10DLC REGISTRATION ===\n');

    // Step 1: Create a Messaging Service
    console.log('--- Step 1: Creating Messaging Service ---');
    let messagingServiceSid;
    try {
        const service = await client.messaging.v1.services.create({
            friendlyName: 'DispatchBox SMS',
            useInboundWebhookOnNumber: true
        });
        messagingServiceSid = service.sid;
        console.log(`  Created! SID: ${service.sid}`);
        console.log(`  Name: ${service.friendlyName}`);
    } catch (e) {
        console.log(`  Error: ${e.message}`);
        // Try to list existing
        const services = await client.messaging.v1.services.list();
        if (services.length > 0) {
            messagingServiceSid = services[0].sid;
            console.log(`  Using existing: ${messagingServiceSid}`);
        } else {
            console.log('  FATAL: Cannot create or find a messaging service.');
            return;
        }
    }

    // Step 2: Add the phone number to the messaging service
    console.log('\n--- Step 2: Adding Phone Number to Messaging Service ---');
    try {
        const phoneNumber = await client.messaging.v1.services(messagingServiceSid)
            .phoneNumbers
            .create({ phoneNumberSid: PHONE_SID });
        console.log(`  Added! ${phoneNumber.phoneNumber} -> ${messagingServiceSid}`);
    } catch (e) {
        console.log(`  Error: ${e.message}`);
        if (e.message.includes('already associated')) {
            console.log('  Phone number already in the service (OK).');
        }
    }

    // Step 3: Check existing campaigns
    console.log('\n--- Step 3: Checking Existing A2P Campaigns ---');
    try {
        const campaigns = await client.messaging.v1.services(messagingServiceSid)
            .usAppToPerson
            .list();
        if (campaigns.length > 0) {
            console.log('  Existing campaigns:');
            campaigns.forEach(c => {
                console.log(`    Campaign SID: ${c.sid}`);
                console.log(`    Status: ${c.campaignStatus}`);
                console.log(`    Use Case: ${c.useCase}`);
            });
        } else {
            console.log('  No existing campaigns. Creating one...');

            // Step 4: Create A2P Campaign
            console.log('\n--- Step 4: Creating A2P Campaign ---');
            try {
                const campaign = await client.messaging.v1.services(messagingServiceSid)
                    .usAppToPerson
                    .create({
                        brandRegistrationSid: BRAND_SID,
                        description: 'DispatchBox field service management platform sends appointment reminders, service updates, and job status notifications to customers.',
                        messageSamples: [
                            'DispatchBox: Your service appointment is scheduled for tomorrow at 9 AM. Reply STOP to opt out.',
                            'DispatchBox: Your technician is on the way and will arrive in approximately 30 minutes.'
                        ],
                        usAppToPersonUsecase: 'MIXED',
                        hasEmbeddedLinks: false,
                        hasEmbeddedPhone: false,
                        messageFlow: 'Customers provide their phone number when submitting a service request through the DispatchBox web application or by calling our office. They consent to receive service-related text messages including appointment reminders, technician arrival notifications, and service updates. Customers can opt out at any time by replying STOP.',
                        optInMessage: 'You have opted in to receive service notifications from DispatchBox. Reply STOP to opt out.',
                        optOutMessage: 'You have been unsubscribed from DispatchBox notifications. Reply START to re-subscribe.',
                        helpMessage: 'DispatchBox service notifications. Reply STOP to unsubscribe or contact us at support@dispatch-box.com.',
                        optInKeywords: ['START', 'YES', 'UNSTOP'],
                        optOutKeywords: ['STOP', 'CANCEL', 'END', 'QUIT', 'UNSUBSCRIBE'],
                        helpKeywords: ['HELP', 'INFO']
                    });
                console.log(`  Campaign Created!`);
                console.log(`  SID: ${campaign.sid}`);
                console.log(`  Status: ${campaign.campaignStatus}`);
                console.log(`  Use Case: ${campaign.useCase}`);
            } catch (e) {
                console.log(`  Campaign creation error: ${e.message}`);
                if (e.code) console.log(`  Code: ${e.code}`);
                if (e.moreInfo) console.log(`  More info: ${e.moreInfo}`);
            }
        }
    } catch (e) {
        console.log(`  Error checking campaigns: ${e.message}`);
    }

    console.log('\n=== DONE ===');
    console.log('Note: A2P Campaign approval can take 1-7 business days.');
    console.log('Once approved, SMS delivery should work immediately.');
}

fixA2P().catch(e => console.error('Fatal:', e.message));
