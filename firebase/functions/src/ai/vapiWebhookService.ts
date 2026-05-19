import * as admin from "firebase-admin";
import { sendAutoFollowUpCommunication } from "../customerCommunication";
import { VapiAgentConfig } from "../vapiService";

const db = admin.firestore();

export async function createTicketFromVoiceCall(
    orgId: string, 
    callerNumber: string, 
    summary: string, 
    duration: number, 
    transcript: string, 
    vapiCallId: string
) {
    const ticketData: any = {
        requestorPhone: callerNumber,
        description: `AI Phone Call Summary:\n${summary}\n\nDuration: ${Math.round(duration / 60)} min ${duration % 60} sec`,
        source: "VAPI_VOICE",
        status: "PENDING",
        organizationId: orgId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        metadata: {
            vapiCallId,
            duration,
            transcript: transcript.substring(0, 5000) // Limit transcript size
        }
    };

    // Try to find existing customer
    if (callerNumber && callerNumber !== "Unknown") {
        const customerSnap = await db.collection("customers")
            .where("phone", "==", callerNumber)
            .limit(1)
            .get();

        if (!customerSnap.empty) {
            ticketData.customerRef = customerSnap.docs[0].ref;
            ticketData.customerName = customerSnap.docs[0].data().name;
        }
    }

    const ticketRef = await db.collection("tickets").add(ticketData);
    console.log(`[Vapi Webhook] Created ticket ${ticketRef.id} from call by ${callerNumber}`);
    
    return { ticketRef, ticketData };
}

export async function triggerPostCallWorkflow(
    orgId: string, 
    ticketId: string, 
    callerNumber: string, 
    customerRef: any, 
    summary: string
) {
    try {
        const configDoc = await db.collection("org_vapi_config").doc(orgId).get();
        if (configDoc.exists) {
            const config = configDoc.data() as VapiAgentConfig;
            if (config.autoFollowUp && config.autoFollowUp !== 'none') {
                const customerEmail = customerRef ? (await customerRef.get()).data()?.email : null;
                const followUpMessage = `We received your request:\n\n${summary}`;
                
                await sendAutoFollowUpCommunication(
                    orgId,
                    ticketId,
                    callerNumber,
                    customerEmail,
                    config.autoFollowUp,
                    followUpMessage
                );
            }
        }
    } catch (e) {
        console.error("[Vapi Webhook] Error sending auto follow up:", e);
    }
}

export async function recordVoiceUsage(orgId: string, durationSeconds: number, cost: number) {
    const monthKey = new Date().toISOString().substring(0, 7);
    const usageRef = db.collection("org_vapi_usage").doc(orgId)
        .collection("months").doc(monthKey);

    await db.runTransaction(async (txn) => {
        const doc = await txn.get(usageRef);
        const usageData = doc.exists ? doc.data()! : {
            totalCalls: 0,
            totalMinutes: 0,
            estimatedCost: 0
        };

        usageData.totalCalls = (usageData.totalCalls || 0) + 1;
        usageData.totalMinutes = (usageData.totalMinutes || 0) + Math.ceil(durationSeconds / 60);
        usageData.estimatedCost = (usageData.estimatedCost || 0) + (cost || 0);
        usageData.updatedAt = admin.firestore.Timestamp.now();

        txn.set(usageRef, usageData, { merge: true });
    });
}
