import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import twilio = require('twilio');

// Use native fetch in Node 20+
// @ts-ignore
const fetchNode = globalThis.fetch;

/**
 * Internal helper to fetch total Twilio spend for the current calendar month
 */
async function fetchTwilioUsageInternal(): Promise<{ totalCost: number; currency: string }> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
        console.warn("Twilio credentials not found in environment.");
        return { totalCost: 0, currency: 'USD' };
    }

    const client = twilio(accountSid, authToken);

    // Fetch usage records for this month
    const records = await client.usage.records.thisMonth.list();

    let totalCost = 0;
    let currency = 'USD';

    // Sum up the price across all usage categories
    records.forEach((record: any) => {
        const price = parseFloat(record.price || '0');
        if (!isNaN(price)) {
            totalCost += price;
        }
        if (record.priceUnit) {
            currency = record.priceUnit.toUpperCase();
        }
    });

    return {
        totalCost: Number(totalCost.toFixed(2)),
        currency
    };
}

/**
 * Fetch total Twilio spend for the current calendar month
 */
export const getTwilioUsage = functions.https.onCall(async (data, context) => {
    // 1. Auth check
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
    }

    try {
        return await fetchTwilioUsageInternal();
    } catch (error) {
        console.error("Error fetching Twilio usage:", error);
        throw new functions.https.HttpsError('internal', 'Failed to fetch Twilio spend.');
    }
});

/**
 * Internal helper to fetch total SendGrid email volume for the current calendar month
 */
async function fetchSendGridUsageInternal(): Promise<{ totalEmails: number }> {
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
        console.warn("SendGrid API key not found in environment.");
        return { totalEmails: 0 };
    }

    // Get the first day of the current month in YYYY-MM-DD format
    const date = new Date();
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
    const startDateStr = firstDay.toISOString().split('T')[0];

    // Ensure we handle current day as well according to SendGrid API constraints
    const todayStr = date.toISOString().split('T')[0];

    // Use native fetch to hit SendGrid Stats API
    const response = await fetchNode(`https://api.sendgrid.com/v3/stats?start_date=${startDateStr}&end_date=${todayStr}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        const errBody = await response.text();
        console.error("SendGrid API Error:", response.status, errBody);
        throw new Error(`SendGrid API returned status ${response.status}`);
    }

    const statsData = await response.json();

    let totalEmails = 0;

    // Stats return an array of dates, each containing an array of stats objects
    if (Array.isArray(statsData)) {
        statsData.forEach((dayData: any) => {
            if (dayData.stats && Array.isArray(dayData.stats)) {
                dayData.stats.forEach((stat: any) => {
                    if (stat.metrics && typeof stat.metrics.delivered === 'number') {
                        totalEmails += stat.metrics.delivered;
                    }
                });
            }
        });
    }

    return { totalEmails };
}

/**
 * Fetch total SendGrid email volume for the current calendar month
 */
export const getSendGridUsage = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
    }

    try {
        return await fetchSendGridUsageInternal();
    } catch (error) {
        console.error("Error fetching SendGrid usage:", error);
        throw new functions.https.HttpsError('internal', 'Failed to fetch SendGrid usage.');
    }
});

/**
 * Log Gemini token usage to Firestore for live cost tracking
 */
export const logGeminiUsage = async (tokens: number, model: string, feature: string) => {
    try {
        const db = admin.firestore();
        const date = new Date();
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const docRef = db.collection('site_config').doc(`ai_usage_${monthKey}`);

        await docRef.set({
            totalTokens: admin.firestore.FieldValue.increment(tokens),
            [`model_${model}`]: admin.firestore.FieldValue.increment(tokens),
            [`feature_${feature}`]: admin.firestore.FieldValue.increment(tokens),
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (error) {
        console.error("Failed to log Gemini usage:", error);
        // Do not throw, we don't want to break the main application flow if logging fails
    }
};

/**
 * Scheduled function to snapshot daily costs (BigQuery compute/storage) 
 * Runs every night at 11:55 PM
 */
import { BigQuery } from '@google-cloud/bigquery';

export const snapshotDailyCosts = functions.pubsub.schedule('55 23 * * *').timeZone('America/Los_Angeles').onRun(async (context) => {
    try {
        const bq = new BigQuery();
        const db = admin.firestore();
        const date = new Date();
        const yyyyMmDd = date.toISOString().split('T')[0];
        const monthKey = yyyyMmDd.substring(0, 7); // YYYY-MM

        // 1. Calculate BigQuery Query Cost for the day (last 24h)
        const queryCostSql = `
            SELECT 
                SUM(total_bytes_billed) / POW(1024, 4) * 6.25 AS computeAssetCost
            FROM \`region-us.INFORMATION_SCHEMA.JOBS\`
            WHERE creation_time > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)
        `;
        let computeCost = 0;
        try {
            const [queryCostRows] = await bq.query(queryCostSql);
            if (queryCostRows.length > 0 && queryCostRows[0].computeAssetCost) {
                computeCost = queryCostRows[0].computeAssetCost;
            }
        } catch (e: any) {
            console.error("Error calculating BigQuery compute cost:", e.message);
        }

        // 2. Calculate BigQuery Storage Cost (snapshot)
        // Storage cost is roughly $0.02 per GB per month for active logical bytes
        // We will calculate the estimated daily storage cost
        const storageCostSql = `
            SELECT 
                (SUM(active_logical_bytes) / POW(1024, 3) * 0.02) / 30 AS dailyActiveStorageCost,
                (SUM(long_term_logical_bytes) / POW(1024, 3) * 0.01) / 30 AS dailyLongTermStorageCost
            FROM \`region-us.INFORMATION_SCHEMA.TABLE_STORAGE\`
        `;
        let storageCost = 0;
        try {
            const [storageCostRows] = await bq.query(storageCostSql);
            if (storageCostRows.length > 0) {
                storageCost = (storageCostRows[0].dailyActiveStorageCost || 0) + (storageCostRows[0].dailyLongTermStorageCost || 0);
            }
        } catch (e: any) {
            console.error("Error calculating BigQuery storage cost:", e.message);
        }

        const totalBqDailyCost = computeCost + storageCost;

        // Save into a billing history collection organized by month
        const monthRef = db.collection('billing_history').doc(monthKey);

        // Add to a subcollection for daily breakdowns
        await monthRef.collection('daily_costs').doc(yyyyMmDd).set({
            date: yyyyMmDd,
            bigqueryComputeCost: computeCost,
            bigqueryStorageCost: storageCost,
            bigqueryTotalCost: totalBqDailyCost,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // 3. Aggregate all Month-to-Date costs
        // Twilio
        let twilioTotal = 0;
        try {
            const twilioData = await fetchTwilioUsageInternal();
            twilioTotal = twilioData.totalCost;
        } catch (e: any) {
            console.warn("Could not fetch MTD Twilio for aggregation:", e.message);
        }

        // Fees config for fixed costs and SendGrid rate
        let fees: any = {};
        try {
            const feesDoc = await db.collection('site_config').doc('fees').get();
            if (feesDoc.exists) {
                fees = feesDoc.data() || {};
            }
        } catch (e: any) {
            console.warn("Could not fetch fees config for aggregation:", e.message);
        }

        // SendGrid
        let sendgridTotalCost = 0;
        let sendgridEmails = 0;
        try {
            const sgData = await fetchSendGridUsageInternal();
            sendgridEmails = sgData.totalEmails;
            const emailCostPerMessage = fees.emailCostPerMessage || 0.0004;
            sendgridTotalCost = sendgridEmails * emailCostPerMessage;
        } catch (e: any) {
            console.warn("Could not fetch MTD SendGrid for aggregation:", e.message);
        }

        // Gemini AI Tokens
        let geminiTotalCost = 0;
        let geminiTokens = 0;
        try {
            const aiUsageDoc = await db.collection('site_config').doc(`ai_usage_${monthKey}`).get();
            if (aiUsageDoc.exists) {
                geminiTokens = aiUsageDoc.data()?.totalTokens || 0;
                geminiTotalCost = (geminiTokens / 1_000_000) * 0.20; // Blended $0.20 per 1M tokens
            }
        } catch (e: any) {
            console.warn("Could not fetch MTD Gemini for aggregation:", e.message);
        }

        // Fixed Costs & Maps
        const monthlyHostingCost = fees.monthlyHostingCost || 0;
        const monthlyFirestoreCost = fees.monthlyFirestoreCost || 0;
        const monthlyStorageCost = fees.monthlyStorageCost || 0;
        const twilioMonthlyPhoneCost = fees.twilioMonthlyPhoneCost || 1.15;
        const yearlyDomainCost = fees.yearlyDomainCost || 12.00;
        const fixedTotalCost = monthlyHostingCost + monthlyFirestoreCost + monthlyStorageCost + twilioMonthlyPhoneCost + (yearlyDomainCost / 12);

        const mapsCostPerRequest = fees.mapsCostPerRequest || 0.005;
        const estimatedMonthlyMapsRequests = fees.estimatedMonthlyMapsRequests || 1000;
        const mapsTotalCost = mapsCostPerRequest * estimatedMonthlyMapsRequests; // Use estimated for now as we don't track live maps usage

        // Function Invocations (Estimated for now)
        const cloudFunctionCostPerInvocation = fees.cloudFunctionCostPerInvocation || 0.0000004;
        const estimatedMonthlyFunctionInvocations = fees.estimatedMonthlyFunctionInvocations || 10000;
        const functionsTotalCost = cloudFunctionCostPerInvocation * estimatedMonthlyFunctionInvocations;

        // BigQuery MTD Sum
        let bigqueryMtdCost = 0;
        try {
            const dailyCostsSnap = await monthRef.collection('daily_costs').get();
            dailyCostsSnap.forEach(doc => {
                bigqueryMtdCost += (doc.data().bigqueryTotalCost || 0);
            });
        } catch (e: any) {
            console.warn("Could not sum daily BQ costs for aggregation:", e.message);
        }

        const totalCostSum = twilioTotal + sendgridTotalCost + geminiTotalCost + fixedTotalCost + mapsTotalCost + functionsTotalCost + bigqueryMtdCost;

        // We use set with merge to ensure the document exists and we can append
        await monthRef.set({
            month: monthKey,
            twilioTotalCost: twilioTotal,
            sendgridTotalCost: sendgridTotalCost,
            sendgridEmails: sendgridEmails,
            geminiTotalCost: geminiTotalCost,
            geminiTokens: geminiTokens,
            fixedTotalCost: fixedTotalCost,
            mapsTotalCost: mapsTotalCost,
            functionsTotalCost: functionsTotalCost,
            bigqueryTotalCost: bigqueryMtdCost, // MTD sum
            grandTotalCost: totalCostSum,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        console.log(`Successfully snapshotted daily costs for ${yyyyMmDd}. Total BQ cost: $${totalBqDailyCost}. Grand MTD Total: $${totalCostSum}`);
    } catch (error) {
        console.error("Failed to snapshot daily costs:", error);
    }
});
