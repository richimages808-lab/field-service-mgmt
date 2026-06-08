import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { getFlashModel, getLatestFlashModelName } from "../ai/aiConfig";
import { logGeminiUsage } from "../billing";

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

/**
 * Validates that an email prefix is available and valid
 */
function isValidPrefix(prefix: string): { valid: boolean; error?: string } {
    // Must be 3-30 characters, alphanumeric and hyphens only
    const prefixRegex = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

    if (!prefix || prefix.length < 3) {
        return { valid: false, error: "Prefix must be at least 3 characters" };
    }
    if (prefix.length > 30) {
        return { valid: false, error: "Prefix must be 30 characters or less" };
    }
    if (!prefixRegex.test(prefix)) {
        return { valid: false, error: "Prefix can only contain lowercase letters, numbers, and hyphens" };
    }

    // Reserved prefixes
    const reserved = ["admin", "support", "help", "service", "info", "contact", "sales", "billing", "api", "www", "mail", "email", "dispatch", "dispatchbox"];
    if (reserved.includes(prefix)) {
        return { valid: false, error: "This prefix is reserved" };
    }

    return { valid: true };
}

/**
 * Callable function to register a new organization with an email prefix.
 * Called during customer signup.
 */
export const registerOrganization = functions.https.onCall(async (data, context) => {
    // Auth check
    if (!context.auth) {
        throw new functions.https.HttpsError(
            "unauthenticated",
            "Must be authenticated to create an organization"
        );
    }

    const {
        name,
        emailPrefix,
        customDomain,
        fromName,
        fromEmail,
        plan,
        businessDetails,
        skipCommsProvisioning,
        businessProfile,
        inventorySettings
    } = data;

    if (!name) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "Organization name is required"
        );
    }

    // Validate email prefix if provided
    if (emailPrefix) {
        const validation = isValidPrefix(emailPrefix.toLowerCase());
        if (!validation.valid) {
            throw new functions.https.HttpsError(
                "invalid-argument",
                validation.error || "Invalid email prefix"
            );
        }

        // Check if prefix is already taken
        const existingOrg = await db.collection("organizations")
            .where("inboundEmail.prefix", "==", emailPrefix.toLowerCase())
            .limit(1)
            .get();

        if (!existingOrg.empty) {
            throw new functions.https.HttpsError(
                "already-exists",
                "This email prefix is already in use"
            );
        }
    }

    // Generate slug from name
    const slug = name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .substring(0, 50);

    // Calculate trial expiry if on trial plan
    let trialExpiresAt = null;
    const selectedPlan = plan || "trial";
    if (selectedPlan === "trial") {
        const trialEndDate = new Date();
        trialEndDate.setDate(trialEndDate.getDate() + 30);
        trialExpiresAt = trialEndDate;
    }

    // Determine max technicians based on plan
    const planLimits: Record<string, number> = {
        trial: 5,
        individual: 1,
        small_business: 5,
        enterprise: -1 // unlimited
    };

    // Create the organization
    const orgData: any = {
        name,
        slug,
        inboundEmail: {
            prefix: emailPrefix?.toLowerCase() || null,
            customDomains: customDomain ? [customDomain] : [],
            autoReplyEnabled: true,
            autoReplyTemplate: null
        },
        outboundEmail: {
            fromName: fromName || name,
            fromEmail: fromEmail || (emailPrefix ? `${emailPrefix}@dispatch-box.com` : "service@dispatch-box.com"),
            replyTo: null
        },
        branding: {
            logoUrl: null,
            primaryColor: "#4F46E5",
            companyName: name
        },
        plan: selectedPlan,
        planLimits: {
            maxTechnicians: planLimits[selectedPlan] || 5,
            hasTeamManagement: selectedPlan !== "individual",
            hasDispatcherConsole: selectedPlan !== "individual"
        },
        businessProfile: businessProfile || 'general',
        inventorySettings: inventorySettings || null,
        communicationServices: {
            enabled: !skipCommsProvisioning,
            provisionedAt: null
        },
        trialExpiresAt,
        ownerId: context.auth.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // Add business details if provided (for A2P registration)
    if (businessDetails) {
        orgData.businessDetails = {
            businessType: businessDetails.businessType || null,
            ein: businessDetails.ein || null,
            street: businessDetails.street || null,
            city: businessDetails.city || null,
            state: businessDetails.state || null,
            zip: businessDetails.zip || null,
            country: businessDetails.country || "US",
            websiteUrl: businessDetails.websiteUrl || null,
            contactEmail: businessDetails.contactEmail || null,
            contactPhone: businessDetails.contactPhone || null
        };
    }

    // Store custom domain if provided
    if (customDomain) {
        orgData.customDomain = customDomain;
    }

    const orgRef = await db.collection("organizations").add(orgData);

    // Update the user's profile with their org_id
    // Individual plan users are technicians, others start as admin
    await db.collection("users").doc(context.auth.uid).update({
        org_id: orgRef.id,
        role: selectedPlan === "individual" ? "technician" : "admin"
    });

    // Return the created organization info
    return {
        success: true,
        organizationId: orgRef.id,
        skipCommsProvisioning: !!skipCommsProvisioning,
        emailAddress: emailPrefix
            ? `${emailPrefix}@dispatch-box.com`
            : null,
        message: emailPrefix
            ? `Your service email is: ${emailPrefix}@dispatch-box.com`
            : "Organization created. Configure your email prefix in settings."
    };
});

/**
 * Callable function to check if an email prefix is available.
 */
export const checkEmailPrefixAvailability = functions.https.onCall(async (data, context) => {
    const { prefix } = data;

    if (!prefix) {
        return { available: false, error: "Prefix is required" };
    }

    const validation = isValidPrefix(prefix.toLowerCase());
    if (!validation.valid) {
        return { available: false, error: validation.error };
    }

    // Check if prefix exists
    const existingOrg = await db.collection("organizations")
        .where("inboundEmail.prefix", "==", prefix.toLowerCase())
        .limit(1)
        .get();

    if (!existingOrg.empty) {
        return { available: false, error: "This prefix is already in use" };
    }

    return {
        available: true,
        emailAddress: `${prefix.toLowerCase()}@dispatch-box.com`
    };
});

/**
 * Callable function to update organization email settings.
 */
export const updateOrganizationEmailSettings = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError(
            "unauthenticated",
            "Must be authenticated"
        );
    }

    const { orgId, settings } = data;

    if (!orgId) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "Organization ID is required"
        );
    }

    // Verify user has access to this org
    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    const userData = userDoc.data();

    if (userData?.org_id !== orgId && userData?.role !== "admin") {
        throw new functions.https.HttpsError(
            "permission-denied",
            "You don't have permission to update this organization"
        );
    }

    // Prepare update data
    const updateData: any = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (settings.autoReplyEnabled !== undefined) {
        updateData["inboundEmail.autoReplyEnabled"] = settings.autoReplyEnabled;
    }
    if (settings.autoReplyTemplate !== undefined) {
        updateData["inboundEmail.autoReplyTemplate"] = settings.autoReplyTemplate;
    }
    if (settings.fromName !== undefined) {
        updateData["outboundEmail.fromName"] = settings.fromName;
    }
    if (settings.customDomains !== undefined) {
        updateData["inboundEmail.customDomains"] = settings.customDomains;
    }

    await db.collection("organizations").doc(orgId).update(updateData);

    return { success: true };
});

/**
 * Helper to extract state abbreviation or name from a service address
 */
function extractStateOrArea(address: string): string | null {
    if (!address) return null;
    const upperAddress = address.toUpperCase();
    
    // Look for standard 2-letter state abbreviations at the end before zip
    // e.g. "Honolulu, HI 96815" or "Los Angeles, CA 90001"
    const stateRegex = /\b([A-Z]{2})\b\s+\d{5}(-\d{4})?$/;
    const match = address.match(stateRegex);
    if (match) return match[1].toUpperCase();

    // Check full state names
    const states = [
        'ALABAMA','ALASKA','ARIZONA','ARKANSAS','CALIFORNIA','COLORADO','CONNECTICUT','DELAWARE','FLORIDA','GEORGIA',
        'HAWAII','IDAHO','ILLINOIS','INDIANA','IOWA','KANSAS','KENTUCKY','LOUISIANA','MAINE','MARYLAND',
        'MASSACHUSETTS','MICHIGAN','MINNESOTA','MISSISSIPPI','MISSOURI','MONTANA','NEBRASKA','NEVADA',
        'NEW HAMPSHIRE','NEW JERSEY','NEW MEXICO','NEW YORK','NORTH CAROLINA','NORTH DAKOTA','OHIO','OKLAHOMA',
        'OREGON','PENNSYLVANIA','RHODE ISLAND','SOUTH CAROLINA','SOUTH DAKOTA','TENNESSEE','TEXAS','UTAH',
        'VERMONT','VIRGINIA','WASHINGTON','WEST VIRGINIA','WISCONSIN','WYOMING'
    ];
    
    for (const state of states) {
        if (upperAddress.includes(state)) {
            return state;
        }
    }
    
    // Check general state abbreviation surrounded by word boundaries
    const stateAbbrs = [
        'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
        'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
        'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
    ];
    for (const abbr of stateAbbrs) {
        const regex = new RegExp(`\\b${abbr}\\b`);
        if (regex.test(upperAddress)) {
            return abbr;
        }
    }

    return null;
}

/**
 * Callable function to look up tax rates by location.
 * First checks organization-configured service locations,
 * then falls back to Gemini AI for the area's standard tax name and rate.
 */
export const lookupLocationTaxRate = functions.https.onCall(async (data, context) => {
    // Require authentication
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { address, orgId: argOrgId, tradeCategory } = data;

    if (!address) {
        throw new functions.https.HttpsError('invalid-argument', 'Address is required');
    }

    try {
        let orgId = argOrgId;

        // If orgId wasn't passed, fetch from the user's document
        if (!orgId) {
            const userSnap = await db.collection("users").doc(context.auth.uid).get();
            const userData = userSnap.data();
            orgId = userData?.org_id;
        }

        const detectedState = extractStateOrArea(address);

        // 1. Try to find a matching pre-configured location in the organization's settings
        if (orgId) {
            const orgSnap = await db.collection("organizations").doc(orgId).get();
            if (orgSnap.exists) {
                const orgData = orgSnap.data();
                const serviceLocations = orgData?.settings?.serviceLocations || [];

                if (detectedState && serviceLocations.length > 0) {
                    const matchedLoc = serviceLocations.find((loc: any) => 
                        loc.state?.toUpperCase() === detectedState || 
                        detectedState.includes(loc.state?.toUpperCase()) ||
                        loc.state?.toUpperCase().includes(detectedState)
                    );

                    if (matchedLoc) {
                        return {
                            taxRate: matchedLoc.taxRate,
                            taxName: matchedLoc.taxName,
                            source: 'settings',
                            justification: `Matched configured settings for service area: ${matchedLoc.state}`
                        };
                    }
                }
            }
        }

        // 2. Query the shared global database first (global_tax_rates)
        if (detectedState) {
            const globalSnap = await db.collection("global_tax_rates").doc(detectedState).get();
            if (globalSnap.exists) {
                const globalData = globalSnap.data();
                return {
                    taxRate: globalData?.taxRate ?? 0,
                    taxName: globalData?.taxName || 'Sales Tax',
                    source: 'shared',
                    justification: globalData?.justification || `Retrieved verified shared rate for ${detectedState}`
                };
            }
        }

        // 3. AI Fallback: Query Gemini AI for standard regional tax rate/name
        const prompt = `You are a professional local tax analyst.
Given the following customer address/location and trade/type of work:
Location: "${address}"
Trade/Work Type: "${tradeCategory || 'general home services'}"

Determine the standard applicable state or local tax rate (%) and tax name for this location and trade (e.g. Sales Tax, GET (General Excise Tax in Hawaii), etc.).
Be accurate. For example:
- In Honolulu or Hawaii, it is GET (General Excise Tax) of 4.5% to 4.712%.
- In California, it is Sales Tax of 7.25% to 10.25% depending on county/city (e.g., standard state rate is 7.25%, Los Angeles is 9.5%).
- In Washington, sales tax is around 6.5% - 10.25%.
- If there is no sales tax/GET (e.g., Oregon, Delaware, New Hampshire, Montana, Alaska), taxRate should be 0 and taxName should be "None".

Please return your response in strictly valid JSON format with no markdown blocks (no \`\`\`json tags, just raw JSON) with exactly these fields:
{
  "taxRate": <number, e.g. 4.712 or 8.25>,
  "taxName": "<string, e.g. 'GET' or 'Sales Tax'>",
  "justification": "<string, a concise 1-sentence explanation of the resolved tax name and rate for this specific location>"
}`;

        const model = await getFlashModel();
        const result = await model.generateContent(prompt);
        const response = await result.response;

        if (response.usageMetadata?.totalTokenCount) {
            await logGeminiUsage(response.usageMetadata.totalTokenCount, await getLatestFlashModelName(), 'lookupLocationTaxRate');
        }

        const text = response.text();
        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/```\n?/g, '');
        }

        const parsed = JSON.parse(jsonText);
        
        return {
            taxRate: Number(parsed.taxRate) || 0,
            taxName: parsed.taxName || 'Sales Tax',
            source: 'ai',
            justification: parsed.justification || `AI-resolved rate for ${address}`
        };

    } catch (error: any) {
        console.error('Tax lookup failed:', error);
        // Fallback to 0% and generic Sales Tax on total failure
        return {
            taxRate: 0,
            taxName: 'Sales Tax',
            source: 'fallback',
            justification: `Fallback to default due to error: ${error.message}`
        };
    }
});
