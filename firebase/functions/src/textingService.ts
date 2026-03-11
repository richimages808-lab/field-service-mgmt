import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
const twilio = require("twilio");

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

// Initialize Twilio
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

const twilioClient = (() => {
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
        && !TWILIO_ACCOUNT_SID.includes("your-")
        && TWILIO_ACCOUNT_SID.startsWith("AC")) {
        try {
            return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
        } catch (e) {
            console.warn("[TextingService] Failed to initialize Twilio client:", (e as Error).message);
            return null;
        }
    }
    return null;
})();

// ============================================================
// PLAN DEFINITIONS
// ============================================================
const PLANS: Record<string, {
    name: string;
    monthlyPrice: number;
    includedMessages: number;
    perMessageOverageRate: number;
    description: string;
}> = {
    starter: {
        name: "Starter",
        monthlyPrice: 29.99,
        includedMessages: 500,
        perMessageOverageRate: 0.05,
        description: "Dedicated number + SMS + AI Call Answering + 500 msgs/mo"
    },
    pro: {
        name: "Pro",
        monthlyPrice: 79.99,
        includedMessages: 2000,
        perMessageOverageRate: 0.04,
        description: "Dedicated number + SMS + AI Call Answering + 2,000 msgs/mo"
    },
    enterprise: {
        name: "Enterprise",
        monthlyPrice: 149.99,
        includedMessages: 5000,
        perMessageOverageRate: 0.03,
        description: "Dedicated number + SMS + AI Call Answering + 5,000 msgs/mo + priority support"
    }
};

// ============================================================
// GET AVAILABLE PLANS
// ============================================================
export const getTextingPlans = functions.https.onCall(async (_data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    return {
        plans: Object.entries(PLANS).map(([id, plan]) => ({
            id,
            ...plan
        }))
    };
});

// ============================================================
// SEARCH AVAILABLE PHONE NUMBERS
// ============================================================
export const searchAvailableNumbers = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    if (!twilioClient) {
        throw new functions.https.HttpsError("failed-precondition", "Twilio not configured");
    }

    const { areaCode, state } = data;

    try {
        const searchParams: any = {
            smsEnabled: true,
            voiceEnabled: true,
            limit: 10
        };

        if (areaCode) {
            searchParams.areaCode = areaCode;
        }
        if (state) {
            searchParams.inRegion = state;
        }

        const numbers = await twilioClient.availablePhoneNumbers("US")
            .local.list(searchParams);

        return {
            numbers: numbers.map((n: any) => ({
                phoneNumber: n.phoneNumber,
                friendlyName: n.friendlyName,
                locality: n.locality,
                region: n.region,
                capabilities: {
                    sms: n.capabilities.sms,
                    voice: n.capabilities.voice,
                    mms: n.capabilities.mms
                }
            }))
        };
    } catch (error) {
        console.error("[TextingService] Error searching numbers:", error);
        throw new functions.https.HttpsError("internal", "Failed to search phone numbers");
    }
});

// ============================================================
// PROVISION PHONE NUMBER
// ============================================================
export const provisionPhoneNumber = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    if (!twilioClient) {
        throw new functions.https.HttpsError("failed-precondition", "Twilio not configured");
    }

    const { phoneNumber, planId, orgId } = data;

    if (!phoneNumber || !planId || !orgId) {
        throw new functions.https.HttpsError("invalid-argument", "Missing phoneNumber, planId, or orgId");
    }

    const plan = PLANS[planId];
    if (!plan) {
        throw new functions.https.HttpsError("invalid-argument", `Invalid plan: ${planId}`);
    }

    // Check if org already has a subscription
    const existingSub = await db.collection("org_texting_subscriptions").doc(orgId).get();
    if (existingSub.exists && existingSub.data()?.status === "active") {
        throw new functions.https.HttpsError("already-exists", "Organization already has an active texting subscription");
    }

    try {
        // 1. Purchase the phone number from Twilio with SMS + Voice webhooks
        const baseUrl = `https://us-central1-maintenancemanager-c5533.cloudfunctions.net`;
        const incomingNumber = await twilioClient.incomingPhoneNumbers.create({
            phoneNumber: phoneNumber,
            smsUrl: `${baseUrl}/handleInboundSMS`,
            smsMethod: "POST",
            voiceUrl: `${baseUrl}/handleInboundCall`,
            voiceMethod: "POST",
            friendlyName: `DispatchBox - ${orgId}`
        });

        console.log(`[TextingService] Provisioned ${phoneNumber} for org ${orgId}, SID: ${incomingNumber.sid}`);

        // 2. Create subscription in Firestore
        const now = admin.firestore.Timestamp.now();
        await db.collection("org_texting_subscriptions").doc(orgId).set({
            phoneNumber: phoneNumber,
            twilioPhoneSid: incomingNumber.sid,
            plan: planId,
            planName: plan.name,
            monthlyPrice: plan.monthlyPrice,
            includedMessages: plan.includedMessages,
            perMessageOverageRate: plan.perMessageOverageRate,
            status: "active",
            provisionedAt: now,
            provisionedBy: context.auth.uid,
            currentPeriodStart: now
        });

        // 3. Initialize usage tracking for current month
        const monthKey = new Date().toISOString().substring(0, 7);
        await db.collection("org_texting_usage").doc(orgId)
            .collection("months").doc(monthKey).set({
                messagesSent: 0,
                messagesReceived: 0,
                totalMessages: 0,
                estimatedCost: 0,
                overage: 0,
                updatedAt: now
            });

        return {
            success: true,
            subscription: {
                phoneNumber,
                plan: plan.name,
                monthlyPrice: plan.monthlyPrice,
                includedMessages: plan.includedMessages
            }
        };
    } catch (error) {
        console.error("[TextingService] Error provisioning number:", error);
        throw new functions.https.HttpsError(
            "internal",
            `Failed to provision phone number: ${(error as Error).message}`
        );
    }
});

// ============================================================
// GET TEXTING SUBSCRIPTION
// ============================================================
export const getTextingSubscription = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    const { orgId } = data;
    if (!orgId) {
        throw new functions.https.HttpsError("invalid-argument", "Missing orgId");
    }

    const subDoc = await db.collection("org_texting_subscriptions").doc(orgId).get();

    if (!subDoc.exists) {
        return { subscription: null };
    }

    // Get current month usage
    const monthKey = new Date().toISOString().substring(0, 7);
    const usageDoc = await db.collection("org_texting_usage").doc(orgId)
        .collection("months").doc(monthKey).get();

    return {
        subscription: subDoc.data(),
        usage: usageDoc.exists ? usageDoc.data() : {
            messagesSent: 0,
            messagesReceived: 0,
            totalMessages: 0,
            estimatedCost: 0,
            overage: 0
        }
    };
});

// ============================================================
// RELEASE PHONE NUMBER (CANCEL)
// ============================================================
export const releasePhoneNumber = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
    }

    if (!twilioClient) {
        throw new functions.https.HttpsError("failed-precondition", "Twilio not configured");
    }

    const { orgId } = data;
    if (!orgId) {
        throw new functions.https.HttpsError("invalid-argument", "Missing orgId");
    }

    const subDoc = await db.collection("org_texting_subscriptions").doc(orgId).get();
    if (!subDoc.exists || subDoc.data()?.status !== "active") {
        throw new functions.https.HttpsError("not-found", "No active subscription found");
    }

    const subData = subDoc.data()!;

    try {
        // Release number from Twilio
        await twilioClient.incomingPhoneNumbers(subData.twilioPhoneSid).remove();
        console.log(`[TextingService] Released ${subData.phoneNumber} for org ${orgId}`);

        // Update subscription status
        await db.collection("org_texting_subscriptions").doc(orgId).update({
            status: "cancelled",
            cancelledAt: admin.firestore.Timestamp.now(),
            cancelledBy: context.auth.uid
        });

        return { success: true, message: "Phone number released and subscription cancelled" };
    } catch (error) {
        console.error("[TextingService] Error releasing number:", error);
        throw new functions.https.HttpsError(
            "internal",
            `Failed to release phone number: ${(error as Error).message}`
        );
    }
});

// ============================================================
// LOG TEXTING USAGE (called internally by communication functions)
// ============================================================
export async function logTextingUsage(
    orgId: string,
    direction: "sent" | "received",
    perMessageRate: number
) {
    const monthKey = new Date().toISOString().substring(0, 7);
    const usageRef = db.collection("org_texting_usage").doc(orgId)
        .collection("months").doc(monthKey);

    await db.runTransaction(async (txn) => {
        const doc = await txn.get(usageRef);
        const data = doc.exists ? doc.data()! : {
            messagesSent: 0,
            messagesReceived: 0,
            totalMessages: 0,
            estimatedCost: 0,
            overage: 0
        };

        if (direction === "sent") {
            data.messagesSent++;
        } else {
            data.messagesReceived++;
        }
        data.totalMessages = data.messagesSent + data.messagesReceived;
        data.estimatedCost = data.totalMessages * perMessageRate;
        data.updatedAt = admin.firestore.Timestamp.now();

        // Check if over included limit
        const subDoc = await txn.get(
            db.collection("org_texting_subscriptions").doc(orgId)
        );
        if (subDoc.exists) {
            const included = subDoc.data()?.includedMessages || 0;
            if (data.totalMessages > included) {
                data.overage = data.totalMessages - included;
            }
        }

        txn.set(usageRef, data, { merge: true });
    });
}
