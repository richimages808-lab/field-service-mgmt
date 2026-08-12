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

async function inspectBrandCampaigns() {
    console.log("Fetching brand details for", BRAND_SID);
    try {
        const brand = await client.messaging.v1.brandRegistrations(BRAND_SID).fetch();
        console.log("Brand SID:", brand.sid);
        console.log("Status:", brand.status);
        console.log("Brand Type:", brand.brandType);
        console.log("A2P Profile Bundle:", brand.a2pProfileBundleSid);

        // Fetch all brand vettings / brand campaigns if accessible via REST
        console.log("\nFetching vettings...");
        const vettings = await client.messaging.v1.brandRegistrations(BRAND_SID).brandVettings.list();
        console.log(`Vettings count: ${vettings.length}`);
        for (const v of vettings) {
            console.log("Vetting:", v.sid, v.vettingProvider, v.vettingStatus);
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

inspectBrandCampaigns();
