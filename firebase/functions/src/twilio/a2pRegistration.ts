import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const twilio = require("twilio");

// Initialize Firebase Admin if not already
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

const twilioClient = (() => {
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_ACCOUNT_SID.startsWith("AC")) {
        try {
            return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
        } catch (e) {
            console.warn("[A2PRegistration] Failed to init Twilio:", (e as Error).message);
            return null;
        }
    }
    return null;
})();

export interface A2PRegistrationRequest {
    orgId: string;
    businessName: string;
    businessType: string; // 'Partnership', 'LimitedLiabilityCompany', 'Cooperative', etc.
    businessRegistrationNumber: string; // EIN
    businessIndustry: string;
    businessRegionsOfOperation: string;
    websiteUrl: string;
    businessPhysicalAddress: {
        street: string;
        city: string;
        region: string; // State
        postalCode: string;
        country: string; // US
    };
    authorizedRepresentative: {
        firstName: string;
        lastName: string;
        email: string;
        phoneNumber: string;
        jobTitle: string;
        jobPosition: string; // 'Director', 'VP', etc.
    };
}

export const registerA2P = functions
    .runWith({ timeoutSeconds: 300 })
    .https.onCall(async (data: A2PRegistrationRequest, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError("unauthenticated", "Must be authenticated");
        }

        if (!twilioClient) {
            throw new functions.https.HttpsError("failed-precondition", "Twilio credentials not configured on the server.");
        }

        const { orgId, businessName, businessRegistrationNumber, authorizedRepresentative } = data;

        if (!orgId || !businessName || !businessRegistrationNumber) {
            throw new functions.https.HttpsError("invalid-argument", "Missing required business identity fields.");
        }

        console.log(`[A2PRegistration] Attempting to register A2P for Org: ${orgId}, User: ${context.auth?.uid}`);

        // Verify the user belongs to the org or is admin
        const orgDoc = await db.collection("organizations").doc(orgId).get();
        if (!orgDoc.exists) {
            console.error(`[A2PRegistration] Organization not found for ID: ${orgId}`);
            throw new functions.https.HttpsError("not-found", "Organization not found");
        }

        const orgData = orgDoc.data();
        let customerProfileSid = orgData?.a2p?.customerProfileSid;
        let brandSid = orgData?.a2p?.brandSid;
        let campaignSid = orgData?.a2p?.campaignSid;

        try {
            // STEP 1: Create a Secondary Customer Profile in Twilio Trust Hub
            if (!customerProfileSid) {
                console.log(`[A2PRegistration] Creating Secondary Customer Profile for ${businessName}...`);
                const profile = await twilioClient.trusthub.v1.customerProfiles.create({
                    friendlyName: `DispatchBox ISV - ${businessName}`,
                    email: authorizedRepresentative.email,
                    policySid: "RNdfa3dd3a44d8b94ceb70959bbccc71f3", // Secondary Customer Profile Policy
                });
                customerProfileSid = profile.sid;

                // Create and assign an End-User (Authorized Representative) to the Profile
                const endUser = await twilioClient.trusthub.v1.endUsers.create({
                    friendlyName: `${authorizedRepresentative.firstName} ${authorizedRepresentative.lastName}`,
                    type: "authorized_representative_1",
                    attributes: {
                        first_name: authorizedRepresentative.firstName,
                        last_name: authorizedRepresentative.lastName,
                        email: authorizedRepresentative.email,
                        phone_number: authorizedRepresentative.phoneNumber,
                        job_title: authorizedRepresentative.jobTitle,
                        job_position: authorizedRepresentative.jobPosition,
                        business_title: authorizedRepresentative.jobTitle
                    }
                });

                await twilioClient.trusthub.v1.customerProfiles(customerProfileSid)
                    .customerProfilesEntityAssignments.create({ objectSid: endUser.sid });

                // Create and assign a Supporting Document (Business Identity) to the Profile
                const document = await twilioClient.trusthub.v1.supportingDocuments.create({
                    friendlyName: `${businessName} Identity`,
                    type: "customer_profile_business_information",
                    attributes: {
                        business_name: businessName,
                        business_type: data.businessType,
                        business_registration_identifier: businessRegistrationNumber,
                        business_identity: "direct_customer",
                        business_industry: data.businessIndustry,
                        business_regions_of_operation: data.businessRegionsOfOperation,
                        website_url: data.websiteUrl,
                        street: data.businessPhysicalAddress.street,
                        city: data.businessPhysicalAddress.city,
                        region: data.businessPhysicalAddress.region,
                        postal_code: data.businessPhysicalAddress.postalCode,
                        iso_country: data.businessPhysicalAddress.country
                    }
                });

                await twilioClient.trusthub.v1.customerProfiles(customerProfileSid)
                    .customerProfilesEntityAssignments.create({ objectSid: document.sid });

                // Submit the Customer Profile for Evaluation
                await twilioClient.trusthub.v1.customerProfiles(customerProfileSid)
                    .customerProfilesEvaluations.create({ policySid: "RNdfa3dd3a44d8b94ceb70959bbccc71f3" });

                // Depending on Twilio rules, you might need to wait for Customer Profile to be 'approved'
                // before creating the Brand. If it fails, we will catch it.
                await db.collection("organizations").doc(orgId).update({
                    "a2p.customerProfileSid": customerProfileSid,
                    "a2p.status": "pending_profile"
                });
            }

            // STEP 2: Create a Brand Registration using the Customer Profile
            if (customerProfileSid && !brandSid) {
                console.log(`[A2PRegistration] Creating A2P Brand for Customer Profile ${customerProfileSid}...`);
                try {
                    const brand = await twilioClient.messaging.v1.brandRegistrations.create({
                        customerProfileBundleSid: customerProfileSid,
                        a2PProfileBundleSid: customerProfileSid,
                        brandType: "STANDARD" // Or 'STARTER' depending on volume
                    });
                    brandSid = brand.sid;

                    await db.collection("organizations").doc(orgId).update({
                        "a2p.brandSid": brandSid,
                        "a2p.status": "pending_brand"
                    });
                } catch (brandErr: any) {
                    console.error("[A2PRegistration] Brand Creation Error:", brandErr.message);
                    // It might fail if profile is not yet approved by Twilio synchronously.
                    throw new functions.https.HttpsError("failed-precondition", "Brand creation failed. Customer Profile may need manual approval first: " + brandErr.message);
                }
            }

            // STEP 3: Create the A2P Campaign use case
            if (brandSid && !campaignSid) {
                console.log(`[A2PRegistration] Creating A2P Campaign under Brand ${brandSid}...`);
                
                // Fetch the messaging service associated with this org from org_texting_subscriptions
                const subDoc = await db.collection("org_texting_subscriptions").doc(orgId).get();
                let messagingServiceSid = subDoc.data()?.messagingServiceSid;

                if (!messagingServiceSid) {
                    // Create one if it doesn't exist yet
                    const baseUrl = `https://us-central1-maintenancemanager-c5533.cloudfunctions.net`;
                    const msgService = await twilioClient.messaging.v1.services.create({
                        friendlyName: `DispatchBox - ${businessName}`,
                        inboundRequestUrl: `${baseUrl}/handleInboundSMS`,
                        inboundMethod: "POST",
                        useInboundWebhookOnNumber: false
                    });
                    messagingServiceSid = msgService.sid;

                    if (subDoc.exists) {
                        await subDoc.ref.update({ messagingServiceSid });
                    }
                }

                // Ensure the org's phone number is in the sender pool
                const phoneSid = subDoc.data()?.twilioPhoneSid;
                if (phoneSid) {
                    try {
                        await twilioClient.messaging.v1.services(messagingServiceSid)
                            .phoneNumbers
                            .create({ phoneNumberSid: phoneSid });
                        console.log(`[A2PRegistration] Added phone ${phoneSid} to sender pool of ${messagingServiceSid}`);
                    } catch (poolErr: any) {
                        // 21710 = phone number already in sender pool (safe to ignore)
                        if (poolErr?.code !== 21710) {
                            console.warn("[A2PRegistration] Could not add phone to sender pool:", poolErr.message);
                        }
                    }
                }

                try {
                    const domain = data.websiteUrl && data.websiteUrl.startsWith('http') ? data.websiteUrl : 'https://maintenancemanager-c5533.web.app';
                    const privacyUrl = `${domain.replace(/\/$/, '')}/privacy`;
                    const termsUrl = `${domain.replace(/\/$/, '')}/terms`;

                    const campaign = await twilioClient.messaging.v1.services(messagingServiceSid)
                        .usAppToPerson
                        .create({
                            brandRegistrationSid: brandSid,
                            description: `${businessName} field service management platform sends transactional appointment reminders, technician arrival alerts, job updates, and invoice links to customers.`,
                            messageSamples: [
                                `${businessName} Alert: Your service technician Alex is on the way for your appointment today at 2:00 PM. Msg & data rates may apply. Reply STOP to opt out, HELP for help.`,
                                `${businessName} Notice: Your estimate #1042 for HVAC repair is ready for review and approval at ${domain}/quote/sample. Reply STOP to cancel, HELP for assistance.`
                            ],
                            usAppToPersonUsecase: "SOLE_PROPRIETOR",
                            hasEmbeddedLinks: true,
                            hasEmbeddedPhone: false,
                            messageFlow: `End users opt in to receive transactional SMS messages from ${businessName} when registering for an account or booking a service request on our web portal (${domain}/signup). Users check an explicit opt-in checkbox with the text: "I agree to the Terms of Service (${termsUrl}) and Privacy Policy (${privacyUrl}), and consent to receive transactional SMS text messages from ${businessName}. Message and data rates may apply. Message frequency varies. Text STOP to opt-out, HELP for help. Mobile opt-in data will not be shared with third parties for marketing." Mobile information is used strictly for operational notifications and is never shared with third parties or affiliates for marketing purposes.`,
                            privacyPolicyUrl: privacyUrl,
                            termsAndConditionsUrl: termsUrl,
                            optInMessage: `You have opted in to receive transactional service notifications from ${businessName}. Msg & data rates may apply. Reply STOP to opt out, HELP for help.`,
                            optOutMessage: `You have been unsubscribed from ${businessName} notifications. Reply START to re-subscribe.`,
                            helpMessage: `${businessName} Service Notifications. Msg & data rates may apply. Reply STOP to unsubscribe or email support@dispatchbox.com for support.`,
                            optInKeywords: ["START", "YES", "UNSTOP"],
                            optOutKeywords: ["STOP", "CANCEL", "END", "QUIT", "UNSUBSCRIBE"],
                            helpKeywords: ["HELP", "INFO"]
                        });

                    campaignSid = campaign.sid;

                    await db.collection("organizations").doc(orgId).update({
                        "a2p.campaignSid": campaignSid,
                        "a2p.status": campaign.campaignStatus || "in_progress"
                    });
                    
                    if (subDoc.exists) {
                        await subDoc.ref.update({
                            a2pCampaignSid: campaignSid,
                            a2pCampaignStatus: campaign.campaignStatus || "IN_PROGRESS"
                        });
                    }
                } catch (campaignErr: any) {
                    console.error("[A2PRegistration] Campaign Creation Error:", campaignErr.message);
                    throw new functions.https.HttpsError("failed-precondition", "Campaign creation failed: " + campaignErr.message);
                }
            }

            return {
                success: true,
                message: "A2P processing started successfully.",
                a2pStatus: "pending_review",
                customerProfileSid, brandSid, campaignSid
            };

        } catch (error) {
            console.error("[A2PRegistration] Error:", error);
            throw new functions.https.HttpsError("internal", (error as Error).message);
        }
    });

