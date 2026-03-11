import * as functions from "firebase-functions";
import { Client, TrafficModel } from "@googlemaps/google-maps-services-js";

const client = new Client({});

export const calculateDriveTime = functions.https.onCall(async (data, context) => {
    // 1. Authentication Check
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'The function must be called while authenticated.'
        );
    }

    const { origin, destination } = data;

    if (!origin || !destination) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'The function must be called with one arguments "origin" and "destination".'
        );
    }

    // 2. Get API Key from Config
    const apiKey = process.env.GOOGLE_MAPS_KEY;
    if (!apiKey) {
        throw new functions.https.HttpsError(
            'failed-precondition',
            'Google Maps API key is not configured.'
        );
    }

    try {
        // 3. Call Google Maps API
        const response = await client.distancematrix({
            params: {
                origins: [origin],
                destinations: [destination],
                key: apiKey,
                departure_time: new Date(), // Real-time traffic
                traffic_model: TrafficModel.best_guess
            },
            timeout: 5000 // 5 seconds timeout
        });

        if (response.data.status !== 'OK') {
            throw new Error(`Google Maps API Error: ${response.data.status}`);
        }

        const element = response.data.rows[0].elements[0];

        if (element.status !== 'OK') {
            // Fallback for zero_results or not_found
            return { duration: 15, distance: 0, fallback: true };
        }

        // duration_in_traffic is available when departure_time is specified
        const durationSeconds = element.duration_in_traffic?.value || element.duration.value;
        const distanceMeters = element.distance.value;

        return {
            duration: Math.ceil(durationSeconds / 60), // Minutes
            distance: (distanceMeters / 1609.34).toFixed(1), // Miles
            fallback: false
        };

    } catch (error) {
        console.error("Distance Matrix Error:", error);
        // Fallback to 15 mins if API fails
        return { duration: 15, distance: 0, fallback: true, error: (error as Error).message };
    }
});
export * from "./email/inbound";
export * from "./email/outbound";
export * from "./organization";
export * from "./twilio/sms";
export * from "./twilio/voice";
// Job analysis functions
export { analyzeJobWithAI, autoAnalyzeNewJob, catalogInventoryFromImage } from './ai/jobAnalysis';

// Material and tool identification
export { identifyMaterials } from './ai/identifyMaterials';
export * from "./customerCommunication";
export * from "./auth";
export * from "./jobs";
export * from "./reporting";
export * from "./scheduledReports";
export * from "./recurringJobs";
export * from "./processAppointmentReminders";
export * from "./billing";
export { getTextingPlans, searchAvailableNumbers, provisionPhoneNumber, getTextingSubscription, releasePhoneNumber } from "./textingService";
export { createVapiAssistant, updateAgentTraining, getVapiAgentConfig, deleteVapiAssistant, importPhoneToVapi, getVapiCallLogs, getVapiVoices, handleVapiWebhook } from "./vapiService";
export { provisionCommunicationServices, getCommsPlans, checkA2pCampaignStatus, getCommunicationStatus } from "./provisionCommsService";
export { registerCustomDomain, verifyCustomDomain, getCustomDomainStatus, removeCustomDomain } from "./customDomainService";
export { checkDomainAvailability, registerDomain, getDomainStatus, setupExistingDomain } from "./domainService";
export { setupEmailForwarding, addEmailAlias, removeEmailAlias, listEmailAliases, checkDomainEmailStatus } from "./emailService";
export * from "./portal";
