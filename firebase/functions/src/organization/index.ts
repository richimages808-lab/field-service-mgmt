import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

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
            fromEmail: fromEmail || (emailPrefix ? `${emailPrefix}@service.dispatch-box.com` : "service@dispatch-box.com"),
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
            ? `${emailPrefix}@service.dispatch-box.com`
            : null,
        message: emailPrefix
            ? `Your service email is: ${emailPrefix}@service.dispatch-box.com`
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
        emailAddress: `${prefix.toLowerCase()}@service.dispatch-box.com`
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
