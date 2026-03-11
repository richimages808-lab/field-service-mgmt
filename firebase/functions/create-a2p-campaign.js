/**
 * Create Sole Proprietor A2P Campaign
 * Brand type is Sole Proprietor, which requires a different campaign type
 */
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const MESSAGING_SERVICE_SID = 'MGbb6835c4cf88305c81544d5cfae188b2';
const BRAND_SID = 'BN637378fbf10d1cf4e56b2de017bd8e87';

async function createSolePropCampaign() {
    console.log('=== Creating Sole Proprietor A2P Campaign ===\n');

    // First check brand details
    console.log('--- Brand Details ---');
    try {
        const brand = await client.messaging.v1.brandRegistrations(BRAND_SID).fetch();
        console.log(`  SID: ${brand.sid}`);
        console.log(`  Status: ${brand.brandRegistrationStatus || brand.status}`);
        console.log(`  Brand Type: ${brand.brandType || 'unknown'}`);
        console.log(`  A2P Profile: ${brand.a2pProfileBundleSid}`);
    } catch (e) {
        console.log(`  Error: ${e.message}`);
    }

    // Try creating with SOLE_PROPRIETOR use case
    console.log('\n--- Creating A2P Campaign (Sole Proprietor) ---');

    // For Sole Proprietor, try the sole_proprietor usecase
    const useCases = ['SOLE_PROPRIETOR', 'LOW_VOLUME', 'CUSTOMER_CARE'];

    for (const useCase of useCases) {
        console.log(`\nTrying use case: ${useCase}`);
        try {
            const campaign = await client.messaging.v1.services(MESSAGING_SERVICE_SID)
                .usAppToPerson
                .create({
                    brandRegistrationSid: BRAND_SID,
                    description: 'DispatchBox field service management sends appointment reminders and service updates to customers.',
                    messageSamples: [
                        'DispatchBox: Your service appointment is scheduled for tomorrow at 9 AM. Reply STOP to opt out.',
                        'DispatchBox: Your technician is on the way and will arrive in approximately 30 minutes.'
                    ],
                    usAppToPersonUsecase: useCase,
                    hasEmbeddedLinks: false,
                    hasEmbeddedPhone: false,
                    messageFlow: 'Customers provide their phone number when submitting a service request through the DispatchBox web application. They consent to receive service-related text messages. Customers can opt out by replying STOP.',
                    optInMessage: 'You have opted in to DispatchBox service notifications. Reply STOP to opt out.',
                    optOutMessage: 'You have been unsubscribed from DispatchBox notifications. Reply START to re-subscribe.',
                    helpMessage: 'DispatchBox service notifications. Reply STOP to unsubscribe or HELP for more info.',
                    optInKeywords: ['START', 'YES', 'UNSTOP'],
                    optOutKeywords: ['STOP', 'CANCEL', 'END', 'QUIT', 'UNSUBSCRIBE'],
                    helpKeywords: ['HELP', 'INFO']
                });
            console.log(`  SUCCESS! Campaign Created!`);
            console.log(`  Campaign SID: ${campaign.sid}`);
            console.log(`  Status: ${campaign.campaignStatus}`);
            console.log(`  Use Case: ${campaign.useCase || useCase}`);
            console.log('\n  Campaign is now pending review.');
            console.log('  Once approved, SMS will be delivered.');
            return; // Success, stop trying
        } catch (e) {
            console.log(`  Failed: ${e.message}`);
            if (e.code) console.log(`  Code: ${e.code}`);
        }
    }

    console.log('\n--- All standard use cases failed. Checking available use cases... ---');

    // Let's see what use cases are available for this brand
    try {
        // Try fetching supported use cases
        const response = await client.messaging.v1.services(MESSAGING_SERVICE_SID)
            .usAppToPerson
            .list();
        console.log('  Existing campaigns:', response.length);
        response.forEach(c => {
            console.log(`    ${c.sid}: ${c.campaignStatus} (${c.useCase || 'unknown'})`);
        });
    } catch (e) {
        console.log(`  Error: ${e.message}`);
    }
}

createSolePropCampaign().catch(e => console.error('Fatal:', e.message));
