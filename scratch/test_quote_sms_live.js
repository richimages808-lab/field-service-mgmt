const path = require('path');
const fs = require('fs');

const envPath = path.resolve(__dirname, '../firebase/functions/.env');
const envLines = fs.readFileSync(envPath, 'utf8').split('\n');
const env = {};
for (const line of envLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
        env[trimmed.substring(0, idx).trim()] = trimmed.substring(idx + 1).trim();
    }
}

const twilio = require('../firebase/functions/node_modules/twilio');
const TWILIO_ACCOUNT_SID = env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = env.TWILIO_AUTH_TOKEN;
const TWILIO_MESSAGING_SERVICE_SID = env.TWILIO_MESSAGING_SERVICE_SID || 'MGd2bbaa7d8acb6e34baa6f5b63f63c49b';
const TARGET_PHONE = '+18082829726';

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

function renderTemplate(template, vars) {
    let output = template;
    for (const [key, val] of Object.entries(vars)) {
        const regex = new RegExp(`\\{${key}\\}`, 'g');
        output = output.replace(regex, val);
    }
    return output;
}

async function testQuoteTemplate() {
    console.log('=== TEST 2: Interactive Quote Delivery Variable Lifecycle ===');
    const defaultQuoteTemplate = "Hi {customerName}, {companyName} has prepared a quote for {quoteTotal}. View and approve it here: {quoteUrl}";
    const sampleQuoteVars = {
        customerName: "Rich",
        companyName: "Hitop Plumbers",
        quoteTotal: "$850.00",
        quoteUrl: "https://dispatch-box.com/quote/q808"
    };

    console.log('1. Factory Quote Template:');
    console.log(`"${renderTemplate(defaultQuoteTemplate, sampleQuoteVars)}"`);

    console.log('\n2. Customizing Variables (Adding discount note and 1-tap review):');
    const customQuoteTemplate = "Aloha {customerName}! Your custom plumbing quote from {companyName} is ready ({quoteTotal}). Please review and approve online: {quoteUrl} or reply YES to approve directly.";
    const renderedCustomQuote = renderTemplate(customQuoteTemplate, sampleQuoteVars);
    console.log(`"${renderedCustomQuote}"`);

    console.log('\n3. Reverting with "Reset to Default":');
    console.log(`"${renderTemplate(defaultQuoteTemplate, sampleQuoteVars)}"`);

    console.log('\n4. Sending Live Real Quote SMS to ' + TARGET_PHONE + '...');
    const result = await client.messages.create({
        body: renderedCustomQuote,
        messagingServiceSid: TWILIO_MESSAGING_SERVICE_SID,
        to: TARGET_PHONE
    });
    console.log(`✅ Quote SMS Sent! SID: ${result.sid}, Status: ${result.status}`);
}

testQuoteTemplate().then(() => {
    console.log('\nQuote variable test finished successfully.');
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
