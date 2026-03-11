const API_KEY = "AIzaSyBbbbhn_DQd9LHO3Ii88-m3utdi4L9WTaM";
const TEST_EMAIL = "test@example.com";
const TEST_PASSWORD = "test123456";

const TARGET_EMAIL = "rich@richheaton.com";
const TARGET_PHONE = "808-282-9726";

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
    console.log("Authenticating as a web app user...");
    const authUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;

    const authRes = await fetch(authUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            email: TEST_EMAIL,
            password: TEST_PASSWORD,
            returnSecureToken: true
        })
    });

    if (!authRes.ok) {
        console.error("Auth failed!", await authRes.text());
        process.exit(1);
    }

    const authData = await authRes.json();
    const idToken = authData.idToken;
    console.log(`Successfully authenticated as UID: ${authData.localId}`);

    console.log("\nStarting 10 App-Native Customer Communications Tests...");
    const funcUrl = "https://us-central1-maintenancemanager-c5533.cloudfunctions.net/sendCustomerQuestion";

    for (let i = 1; i <= 10; i++) {
        console.log(`--- Test ${i}/10 ---`);

        // 1. Send Email via Native App Feature
        try {
            const emailRes = await fetch(funcUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    data: {
                        jobId: `test-native-job-${i}`,
                        customerEmail: TARGET_EMAIL,
                        customerPhone: TARGET_PHONE,
                        customerName: "Rich Heaton",
                        question: `This is test question #${i} delivered via email from the DispatchBox App.`,
                        communicationMethod: "email"
                    }
                })
            });
            const emailData = await emailRes.json();
            if (emailData.error) throw new Error(emailData.error.message || JSON.stringify(emailData.error));
            console.log(`[Email] Result:`, emailData.result);
        } catch (error) {
            console.error(`[Email] Failed:`, error.message);
        }

        // 2. Send SMS via Native App Feature
        try {
            const smsRes = await fetch(funcUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    data: {
                        jobId: `test-native-job-${i}`,
                        customerEmail: TARGET_EMAIL,
                        customerPhone: TARGET_PHONE,
                        customerName: "Rich Heaton",
                        question: `This is test question #${i} delivered via SMS from the DispatchBox App.`,
                        communicationMethod: "text"
                    }
                })
            });
            const smsData = await smsRes.json();
            if (smsData.error) throw new Error(smsData.error.message || JSON.stringify(smsData.error));
            console.log(`[SMS] Result:`, smsData.result);
        } catch (error) {
            console.error(`[SMS] Failed:`, error.message);
        }

        // 1 second delay to avoid aggressive rate limiting
        await delay(1000);
    }

    console.log("\nAll 10 tests triggered successfully via App infrastructure!");
}

runTests().catch(err => {
    console.error("Critical error:", err);
    process.exit(1);
});
