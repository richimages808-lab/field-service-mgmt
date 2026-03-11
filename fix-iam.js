const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');

async function fixIam() {
    const p = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    if (!fs.existsSync(p)) return console.error('No firebase-tools.json found');

    const config = require(p);
    const token = config.tokens && config.tokens.refresh_token;
    // Wait, the token in configstore is a refresh token! We need an access token!
    // It's easier to just use `exec` to run `firebase login:ci`? No, it's interactive.
}

fixIam().catch(console.error);
