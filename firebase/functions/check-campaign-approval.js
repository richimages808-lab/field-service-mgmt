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

const BRAND_SID = 'BN637378fbf10d1cf4e56b2de017bd8e87';

async function checkCampaignApproval() {
    console.log("=========================================");
    console.log("  CHECKING TWILIO A2P CAMPAIGN APPROVAL");
    console.log("=========================================\n");

    try {
        const brand = await client.messaging.v1.brandRegistrations(BRAND_SID).fetch();
        console.log(`Brand (${brand.sid}): ${brand.status}`);

        const services = await client.messaging.v1.services.list();
        for (const s of services) {
            const campaigns = await client.messaging.v1.services(s.sid).usAppToPerson.list();
            if (campaigns.length > 0) {
                console.log(`\nService ${s.friendlyName} (${s.sid}):`);
                for (const c of campaigns) {
                    console.log(`  Campaign SID: ${c.sid}`);
                    console.log(`  Status: ${c.campaignStatus}`);
                    console.log(`  Usecase: ${c.usAppToPersonUsecase}`);
                    console.log(`  Date Updated: ${c.dateUpdated}`);
                    if (c.campaignStatus === 'APPROVED' || c.campaignStatus === 'VERIFIED') {
                        console.log("\n🎉 CONGRATULATIONS! A2P 10DLC CAMPAIGN IS FULLY APPROVED!");
                    } else if (c.campaignStatus === 'IN_PROGRESS' || c.campaignStatus === 'PENDING') {
                        console.log("\n⏳ CAMPAIGN IS CURRENTLY UNDER CARRIER REVIEW (IN PROGRESS)");
                    } else if (c.campaignStatus === 'FAILED' || c.campaignStatus === 'REJECTED') {
                        console.log("\n❌ CAMPAIGN WAS REJECTED. Review failure reasons above.");
                    }
                }
            }
        }
    } catch (e) {
        console.error("Check failed:", e.message);
    }

    console.log("\n=========================================");
}

checkCampaignApproval();
