import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { createAccessToken } from "../accessTokens";

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

const WEBHOOK_BASE_URL = "https://us-central1-maintenancemanager-c5533.cloudfunctions.net";

// ============================================================================
// In-memory caches (persist across warm invocations within the same instance)
// ============================================================================

// Address validation cache — avoids redundant Maps API calls for repeated/similar addresses
const addressCache = new Map<string, { result: AddressValidationResult; ts: number }>();
const ADDRESS_CACHE_TTL = 1000 * 60 * 30; // 30 minutes
const ADDRESS_CACHE_MAX = 200;

// Org knowledge cache — these rarely change, no need to re-fetch every turn
const orgKnowledgeCache = new Map<string, { data: any; ts: number }>();
const ORG_CACHE_TTL = 1000 * 60 * 10; // 10 minutes

// Voice profile cache
const voiceProfileCache = new Map<string, { data: any; ts: number }>();
const PROFILE_CACHE_TTL = 10 * 60 * 1000;  // 10 minutes

// ━━━ Enhanced STT Helpers ━━━
// Twilio Gather attributes for improved speech recognition accuracy
const STT_BASE_ATTRS = 'enhanced="true" speechModel="phone_call" language="en-US"';
function buildGatherAttrs(action: string, timeout: number = 4, hints?: string): string {
    const base = `input="speech" action="${action}" timeout="${timeout}" speechTimeout="auto" ${STT_BASE_ATTRS}`;
    return hints ? `${base} hints="${hints}"` : base;
}
// Context-specific hint sets for common voice intake fields
const HINTS_GREETING = 'quote, estimate, service, repair, fix, schedule, appointment, change, cancel, plumbing, electrical, HVAC, water heater, toilet, faucet, drain, leak, shower, talk to someone, voicemail';
const HINTS_NAME = 'first name, last name';
const HINTS_ADDRESS = 'street, road, drive, lane, avenue, boulevard, circle, court, place, way, apartment, unit, suite, north, south, east, west';
const HINTS_CONTACT = 'call, text, email, phone, message, call me, text me, email me';
const HINTS_YESNO = 'yes, yeah, yep, correct, no, nope, that is right, sounds good';

// Gemini response timeout — bail to keyword fallback if Gemini takes too long
// 12 seconds gives Gemini enough time even under load; Twilio allows up to 15s before timeout
const GEMINI_TIMEOUT_MS = 12000;

/**
 * Race a promise against a timeout. Returns the promise result or throws on timeout.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`[${label}] timed out after ${ms}ms`)), ms)
        )
    ]);
}

// ============================================================================
// Address Validation via Google Maps Geocoding API
// ============================================================================

interface AddressValidationResult {
    valid: boolean;
    formattedAddress: string | null;
    confidence: 'high' | 'partial' | 'none';
    originalInput: string;
}

async function validateAddress(rawAddress: string): Promise<AddressValidationResult> {
    const apiKey = process.env.GOOGLE_MAPS_KEY;
    if (!apiKey) {
        console.warn("[Voice] GOOGLE_MAPS_KEY not set, skipping address validation");
        return { valid: true, formattedAddress: rawAddress, confidence: 'high', originalInput: rawAddress };
    }

    // Check in-memory cache first (keyed on normalized address)
    const cacheKey = rawAddress.toLowerCase().trim().replace(/[^a-z0-9 ]/g, '');
    const cached = addressCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < ADDRESS_CACHE_TTL) {
        console.log(`[Voice] Address cache HIT: "${rawAddress}"`);
        return cached.result;
    }

    try {
        const encoded = encodeURIComponent(rawAddress);
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${apiKey}`;
        const response = await withTimeout(fetch(url), 6000, 'Maps Geocode');
        const data = await response.json();

        if (data.status === 'OK' && data.results && data.results.length > 0) {
            const result = data.results[0];
            const formatted = result.formatted_address;
            const types = result.geometry?.location_type;

            // ROOFTOP or RANGE_INTERPOLATED = high confidence (exact or near-exact match)
            // GEOMETRIC_CENTER = partial (neighborhood/area level)
            // APPROXIMATE = low confidence
            if (types === 'ROOFTOP' || types === 'RANGE_INTERPOLATED') {
                console.log(`[Voice] Address validated (high): "${rawAddress}" -> "${formatted}"`);
                const validResult: AddressValidationResult = { valid: true, formattedAddress: formatted, confidence: 'high', originalInput: rawAddress };
                cacheAddressResult(rawAddress, validResult);
                return validResult;
            } else if (types === 'GEOMETRIC_CENTER') {
                // Check if we got at least a street-level result
                const hasStreet = result.address_components?.some((c: any) => c.types.includes('route'));
                if (hasStreet) {
                    console.log(`[Voice] Address validated (partial with street): "${rawAddress}" -> "${formatted}"`);
                    const partialResult: AddressValidationResult = { valid: true, formattedAddress: formatted, confidence: 'partial', originalInput: rawAddress };
                    cacheAddressResult(rawAddress, partialResult);
                    return partialResult;
                }
                console.log(`[Voice] Address too vague (area only): "${rawAddress}" -> "${formatted}"`);
                return { valid: false, formattedAddress: formatted, confidence: 'partial', originalInput: rawAddress };
            } else {
                console.log(`[Voice] Address low confidence: "${rawAddress}" -> "${formatted}" (${types})`);
                return { valid: false, formattedAddress: formatted, confidence: 'partial', originalInput: rawAddress };
            }
        }

        console.log(`[Voice] Address not found: "${rawAddress}" (status: ${data.status})`);
        return { valid: false, formattedAddress: null, confidence: 'none', originalInput: rawAddress };

    } catch (error) {
        console.error("[Voice] Address validation error:", (error as Error).message);
        // On error (including timeout), accept the address as-is rather than blocking the flow
        return { valid: true, formattedAddress: rawAddress, confidence: 'high', originalInput: rawAddress };
    }
}

/** Store a validated address result in the cache */
function cacheAddressResult(rawAddress: string, result: AddressValidationResult) {
    const cacheKey = rawAddress.toLowerCase().trim().replace(/[^a-z0-9 ]/g, '');
    // Evict oldest entries if cache is full
    if (addressCache.size >= ADDRESS_CACHE_MAX) {
        const firstKey = addressCache.keys().next().value;
        if (firstKey) addressCache.delete(firstKey);
    }
    addressCache.set(cacheKey, { result, ts: Date.now() });
}

/**
 * Expand common address abbreviations for natural TTS readback.
 * Converts things like "123 Main St Apt 4B" → "123 Main Street, Apartment 4B"
 */
function expandAddressForSpeech(address: string): string {
    if (!address) return address;

    // Map of abbreviations → full words (case-insensitive matching, preserving surrounding text)
    const expansions: [RegExp, string][] = [
        // Street types (most common first)
        [/\bSt\.?\b(?!\s*(Suite|Paul|Louis|Cloud|Pete|Charles|George|Aug|Joseph|Clair|Croix))/gi, "Street"],
        [/\bAve\.?\b/gi, "Avenue"],
        [/\bBlvd\.?\b/gi, "Boulevard"],
        [/\bDr\.?\b(?!\s*[A-Z][a-z])/gi, "Drive"],   // Avoid expanding "Dr. Smith"
        [/\bLn\.?\b/gi, "Lane"],
        [/\bRd\.?\b/gi, "Road"],
        [/\bCt\.?\b/gi, "Court"],
        [/\bCir\.?\b/gi, "Circle"],
        [/\bPl\.?\b/gi, "Place"],
        [/\bPkwy\.?\b/gi, "Parkway"],
        [/\bHwy\.?\b/gi, "Highway"],
        [/\bTrl\.?\b/gi, "Trail"],
        [/\bTer\.?\b/gi, "Terrace"],
        [/\bWay\b/gi, "Way"],

        // Unit / suite types
        [/\bApt\.?\b/gi, "Apartment"],
        [/\bSte\.?\b/gi, "Suite"],
        [/\bFl\.?\b/gi, "Floor"],
        [/\bRm\.?\b/gi, "Room"],
        [/\bBldg\.?\b/gi, "Building"],
        [/\bUnit\b/gi, "Unit"],

        // Directionals (at word boundaries only)
        [/\bN\.?\b(?=\s+[A-Z0-9])/g, "North"],
        [/\bS\.?\b(?=\s+[A-Z0-9])/g, "South"],
        [/\bE\.?\b(?=\s+[A-Z0-9])/g, "East"],
        [/\bW\.?\b(?=\s+[A-Z0-9])/g, "West"],
        [/\bNE\.?\b/gi, "Northeast"],
        [/\bNW\.?\b/gi, "Northwest"],
        [/\bSE\.?\b/gi, "Southeast"],
        [/\bSW\.?\b/gi, "Southwest"],

        // Misc
        [/\bMt\.?\b/gi, "Mount"],
        [/\bFt\.?\b/gi, "Fort"],
    ];

    let expanded = address;
    for (const [pattern, replacement] of expansions) {
        expanded = expanded.replace(pattern, replacement);
    }

    // Add a comma before unit designators for a natural pause
    // "123 Main Street Apartment 4B" → "123 Main Street, Apartment 4B"
    expanded = expanded.replace(/(\w)\s+(Apartment|Suite|Unit|Floor|Room|Building)\s+/gi, "$1, $2 ");

    return expanded;
}

// Gemini AI for voice conversation (lazy init)
let genAI: any = null;
let geminiModel: any = null;

function getGeminiModel() {
    if (geminiModel) return geminiModel;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.warn("[Voice] GEMINI_API_KEY not set.");
        return null;
    }
    try {
        const { GoogleGenerativeAI } = require("@google/generative-ai");
        genAI = new GoogleGenerativeAI(apiKey);
        geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        return geminiModel;
    } catch (e) {
        console.error("[Voice] Failed to initialize Gemini:", (e as Error).message);
        return null;
    }
}

// ============================================================================
// Send Customer Portal Link via SMS (and email if available)
// ============================================================================

const APP_URL = process.env.APP_URL || 'https://dispatch-box.com';

async function sendPortalLinkToCustomer(
    customerPhone: string,
    orgId: string | null | undefined,
    customerEmail?: string
): Promise<void> {
    try {
        // Get org slug for branded portal URL
        let portalUrl = `${APP_URL}/portal/login`;
        let orgName = "our team";
        let senderNumber = process.env.TWILIO_PHONE_NUMBER;

        if (orgId) {
            const orgDoc = await db.collection("organizations").doc(orgId).get();
            if (orgDoc.exists) {
                const orgData = orgDoc.data();
                const slug = orgData?.slug || orgData?.portalConfig?.slug;
                orgName = orgData?.name || "our team";
                if (slug) {
                    portalUrl = `${APP_URL}/portal/login?org=${slug}`;
                }
            }

            // Use org's dedicated number if available
            const subSnap = await db.collection("org_texting_subscriptions").doc(orgId).get();
            if (subSnap.exists && subSnap.data()?.phoneNumber) {
                senderNumber = subSnap.data()?.phoneNumber;
            }
        }

        // Send SMS with portal link
        const smsBody = `Hi! Thanks for calling ${orgName}. You can view and update your service request, verify your address, check quotes, and more at your customer portal: ${portalUrl}`;

        const twilioSid = process.env.TWILIO_ACCOUNT_SID;
        const twilioToken = process.env.TWILIO_AUTH_TOKEN;
        if (twilioSid && twilioToken && senderNumber) {
            const twilioLib = require("twilio");
            const client = twilioLib(twilioSid, twilioToken);

            // Normalize phone numbers
            const toDigits = customerPhone.replace(/\D/g, '');
            const toNorm = toDigits.length === 10 ? `+1${toDigits}` : `+${toDigits}`;
            const fromDigits = senderNumber.replace(/\D/g, '');
            const fromNorm = fromDigits.length === 10 ? `+1${fromDigits}` : `+${fromDigits}`;

            await client.messages.create({
                body: smsBody,
                from: fromNorm,
                to: toNorm
            });
            console.log(`[Voice] Portal link SMS sent to ${toNorm}`);
        } else {
            console.warn("[Voice] Twilio not configured, skipping portal link SMS");
        }

        // Also send email if we have one
        if (customerEmail) {
            try {
                const { sendCustomEmail } = require("../email/outbound");
                await sendCustomEmail({
                    to: customerEmail,
                    subject: `Your Customer Portal - ${orgName}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <h2 style="color: #3B82F6;">Your Customer Portal</h2>
                            <p>Hi there! Thanks for calling ${orgName}.</p>
                            <p>You can view and manage your service requests, verify your address, check quotes, review past work, and more through your customer portal:</p>
                            <div style="text-align: center; margin: 24px 0;">
                                <a href="${portalUrl}" style="background-color: #3B82F6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                                    Open Customer Portal
                                </a>
                            </div>
                            <p style="color: #666; font-size: 14px;">If you have any questions, just reply to this email or give us a call.</p>
                            <p style="color: #999; font-size: 12px;">Powered by DispatchBox</p>
                        </div>
                    `
                });
                console.log(`[Voice] Portal link email sent to ${customerEmail}`);
            } catch (emailErr) {
                console.warn("[Voice] Portal link email failed (non-fatal):", (emailErr as Error).message);
            }
        }
    } catch (error) {
        console.error("[Voice] Failed to send portal link:", (error as Error).message);
        // Non-fatal - don't block the call flow
    }
}

/**
 * Look up which organization owns the called phone number.
 * Returns org data or null if using the platform default number.
 */
async function getOrgForNumber(calledNumber: string): Promise<{ orgId: string; orgName: string; callForwardNumber?: string; callbackMode?: string; aiVoiceProfileId?: string } | null> {
    if (!calledNumber) return null;
    try {
        const digits = calledNumber.replace(/\D/g, '');
        const snapshot = await db.collection("org_texting_subscriptions")
            .where("status", "==", "active")
            .get();

        for (const doc of snapshot.docs) {
            const data = doc.data();
            const subDigits = (data.phoneNumber || '').replace(/\D/g, '');
            if (subDigits && digits.endsWith(subDigits.slice(-10))) {
                // Found the org Ã¢â‚¬â€ get the org name + call settings
                const orgDoc = await db.collection("organizations").doc(doc.id).get();
                const orgData = orgDoc.exists ? orgDoc.data() : null;
                const orgName = orgData?.name || "our company";
                return {
                    orgId: doc.id,
                    orgName,
                    callForwardNumber: orgData?.callForwardNumber || undefined,
                    callbackMode: orgData?.callbackMode || "with_quote",
                    aiVoiceProfileId: orgData?.aiVoiceProfileId || undefined
                };
            }
        }
    } catch (e) {
        console.warn("[Voice] Error looking up org for number:", (e as Error).message);
    }
    return null;
}

/**
 * Load the org's AI agent knowledge base (FAQs, services, hours, etc.)
 * from ai_agent_config. This is what the business owner trains.
 */
async function loadOrgKnowledge(orgId: string): Promise<{ faqs: { question: string; answer: string }[]; services: { name: string; description: string; priceRange: string }[]; businessHours: string; serviceArea: string; specialInstructions: string } | null> {
    // Check in-memory cache first
    const cached = orgKnowledgeCache.get(orgId);
    if (cached && (Date.now() - cached.ts) < ORG_CACHE_TTL) {
        return cached.data;
    }

    try {
        const configDoc = await db.collection("ai_agent_config").doc(orgId).get();
        if (!configDoc.exists) return null;
        const data = configDoc.data()!;
        const result = {
            faqs: data.faqs || [],
            services: data.services || [],
            businessHours: data.businessHours || '',
            serviceArea: data.serviceArea || '',
            specialInstructions: data.specialInstructions || ''
        };
        orgKnowledgeCache.set(orgId, { data: result, ts: Date.now() });
        return result;
    } catch (e) {
        console.warn("[Voice] Error loading org knowledge:", (e as Error).message);
        return null;
    }
}

/**
 * Log a customer question that the AI couldn't fully answer so the
 * business owner can review it and add an answer to the knowledge base.
 */
async function logCustomerQuestion(orgId: string, question: string, callerPhone: string, sessionId: string): Promise<void> {
    try {
        // Deduplicate Ã¢â‚¬â€ don't log the same question twice within 24 hours
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const existing = await db.collection("customer_questions")
            .where("orgId", "==", orgId)
            .where("question", "==", question)
            .where("createdAt", ">=", oneDayAgo)
            .limit(1)
            .get();
        if (!existing.empty) return; // Already logged recently

        await db.collection("customer_questions").add({
            orgId,
            question,
            callerPhone,
            sessionId,
            status: 'pending', // pending | promoted | dismissed
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`[Voice] Logged customer question for org ${orgId}: "${question}"`);
    } catch (e) {
        console.warn("[Voice] Error logging customer question:", (e as Error).message);
    }
}

/**
 * Handles inbound Voice calls from Twilio.
 * Creates a session in Firestore for multi-turn intake conversation.
 */
export const handleInboundCall = functions.https.onRequest(async (req: any, res: any) => {
    const from = req.body?.From || "";
    const to = req.body?.To || "";

    console.log(`[Voice] Inbound call from ${from} to ${to}`);

    // Generate session ID upfront so org lookup + session write can run in parallel
    const sessionId = `voice_${from}_${Date.now()}`;
    const orgPromise = getOrgForNumber(to);

    // Start session creation optimistically with placeholder — update after org resolves
    const sessionWritePromise = orgPromise.then(org => {
        const companyName = org?.orgName || "DispatchBox";
        return db.collection("voice_sessions").doc(sessionId).set({
            callerPhone: from,
            calledNumber: to,
            orgId: org?.orgId || null,
            orgName: companyName,
            callForwardNumber: org?.callForwardNumber || null,
            transcript: [],
            collected: { name: null, address: null, description: null, urgency: null, availability: null, email: null, contactPreference: null },
            intent: null, // service_request | status_check | voicemail | other
            turn: 0,
            status: "active",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        }).then(() => org);
    });

    const org = await sessionWritePromise;
    const companyName = org?.orgName || "DispatchBox";

    // Build the initial greeting
    // If no speech after greeting, redirect to gather handler with nsc=1 to start retry loop
    const gatherAction = buildGatherAction(sessionId, from, to, 1);
    const retryAction = buildGatherAction(sessionId, from, to, 1, 1);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather ${buildGatherAttrs(gatherAction, 4, HINTS_GREETING)}>
        <Say voice="Google.en-US-Neural2-F">Hi, this is Amy with ${escapeXml(companyName)}, how can I help you? For example, I can schedule a service, get you a quote, change an appointment, or answer a question.</Say>
    </Gather>
    <Redirect>${retryAction}</Redirect>
</Response>`;


    res.set("Content-Type", "text/xml");
    res.status(200).send(twiml);
});
/**
 * Handles speech input from the caller with session-based multi-turn intake.
 * Loads conversation history from Firestore, feeds it to Gemini, and saves updated state.
 */
export const handleVoiceGather = functions.https.onRequest(async (req: any, res: any) => {
    const speechResult = req.body?.SpeechResult || "";
    const from = req.query?.from || req.body?.From || "";
    const to = req.query?.to || req.body?.To || "";
    const sessionId = req.query?.session || "";
    const turn = parseInt(req.query?.turn || "1");
    const noSpeechCount = parseInt(req.query?.nsc || "0");

    console.log(`[Voice] Gather turn ${turn}: "${speechResult}" (noSpeechCount: ${noSpeechCount})`);

    if (!speechResult) {
        // Retry up to 3 times (10s each = 30s total silence before giving up)
        const retryPrompts = [
            "I'm still here! Take your time. What can I help you with today?",
            "Are you still there? I'd love to help Ã¢â‚¬â€ just let me know what you need.",
            "It sounds like we may be having some connection trouble. No worries at all Ã¢â‚¬â€ we'll give you a call right back in about 5 minutes to pick up where we left off."
        ];

        if (noSpeechCount < 2) {
            // Retry Ã¢â‚¬â€ ask again with a friendly prompt
            const retryAction = buildGatherAction(sessionId, from, to, turn, noSpeechCount + 1);
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather ${buildGatherAttrs(retryAction, 4, HINTS_GREETING)}>
        <Say voice="Google.en-US-Neural2-F">${retryPrompts[noSpeechCount]}</Say>
    </Gather>
    <Redirect>${retryAction}</Redirect>
</Response>`;
            res.set("Content-Type", "text/xml");
            return res.status(200).send(twiml);
        }

        // 3rd failure Ã¢â‚¬â€ schedule a callback in 5 minutes and hang up
        console.log(`[Voice] No speech after 3 attempts. Scheduling callback for ${from}`);
        await scheduleRetryCallback(sessionId, from, to);

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Google.en-US-Neural2-F">${retryPrompts[2]}</Say>
    <Hangup/>
</Response>`;
        res.set("Content-Type", "text/xml");
        return res.status(200).send(twiml);
    }

    try {
        // Load session state + caller context in parallel to reduce latency
        const sessionRef = db.collection("voice_sessions").doc(sessionId);
        const [sessionDoc, callerInfo] = await Promise.all([
            sessionRef.get(),
            getCallerContext(from)
        ]);
        const session = sessionDoc.exists ? sessionDoc.data()! : {
            callerPhone: from, calledNumber: to, orgId: null, orgName: "DispatchBox",
            transcript: [], collected: {}, intent: null
        };

        const org = session.orgId ? { orgId: session.orgId, orgName: session.orgName } : await getOrgForNumber(to);

        // Add caller's speech to transcript
        const transcript: { role: string; text: string; timestamp?: string }[] = session.transcript || [];
        transcript.push({ role: "caller", text: speechResult, timestamp: new Date().toISOString() });

        // ━━━ Monitor customer corrections and rebukes ━━━
        const inputLowerSpeech = speechResult.toLowerCase().trim();
        const REBUKE_PATTERNS = /\b(wrong|incorrect|error|mistake|fix|change|different|not right|not correct|got it wrong|no it is|no it's|restart|start over|no to that|nope to)\b/i;
        const isRebuke = REBUKE_PATTERNS.test(inputLowerSpeech);

        const previousAction = session.lastAction || null;
        const isAmbiguousNegative = /^(no|nope)$/i.test(inputLowerSpeech);
        const isConfirmRebuke = isAmbiguousNegative && previousAction === 'confirm';

        let correctionsCount = session.collected?._correctionsCount || 0;
        if (isRebuke || isConfirmRebuke) {
            correctionsCount += 1;
            console.log(`[Voice] Detected customer rebuke/correction: "${speechResult}". New corrections count: ${correctionsCount}`);
        }

        // ━━━ Quick Response Engine ━━━
        // Skip the Gemini API call for common, predictable responses (saves 2-4 seconds)
        const sessionStatus = session.status || 'active';
        const quickResponse = tryQuickResponse(speechResult, session.collected || {}, turn, callerInfo, session.intent || null, previousAction, sessionStatus);

        // Use quick response if available, otherwise fall back to AI
        const aiResponse = quickResponse
            ? quickResponse
            : await processVoiceWithAI(speechResult, callerInfo, org, turn, session.collected, transcript);

        // Merge any newly collected fields
        const collected = { 
            ...(session.collected || {}), 
            ...(aiResponse.collectedFields || {}),
            _correctionsCount: correctionsCount 
        };

        // ━━━ Auto-fill known caller data into collected ━━━
        // Ensures callerInfo fields are always in the collected object for ticket creation,
        // even when the quick-response engine skipped asking about them.
        if (callerInfo?.address && !collected.address) {
            collected.address = callerInfo.address;
            collected._addressSource = 'caller_record';
        }
        if (callerInfo?.name && callerInfo.name !== 'Unknown Caller' && !collected.name) {
            collected.name = callerInfo.name;
        }
        // Sync intent into collected so createTicketFromVoice can always read it
        if (aiResponse.intent || session.intent) {
            collected.intent = aiResponse.intent || session.intent;
        }

        // â€”â€”â€” Address Validation via Google Maps â€”â€”â€”
        // If a NEW address was just collected this turn, validate it
        const newAddress = aiResponse.collectedFields?.address;
        const previousAddress = session.collected?.address;
        if (newAddress && newAddress !== previousAddress) {
            const addressAttempts = (session.collected?._addressAttempts || 0) + 1;
            collected._addressAttempts = addressAttempts;

            const validation = await validateAddress(newAddress);

            if (validation.valid && validation.formattedAddress) {
                // High/partial confidence â€” use the corrected address
                collected.address = validation.formattedAddress;
                collected._addressValidated = true;
                console.log(`[Voice] Address validated on attempt ${addressAttempts}: "${newAddress}" -> "${validation.formattedAddress}"`);

                // If the corrected address is meaningfully different, override the AI response
                // to read back the corrected version for confirmation
                if (validation.formattedAddress.toLowerCase() !== newAddress.toLowerCase() && 
                    aiResponse.action === 'continue') {
                    aiResponse.message = `I found that address as ${expandAddressForSpeech(validation.formattedAddress)}. ${aiResponse.message}`;
                }
            } else if (addressAttempts >= 2) {
                // 2nd failed attempt â€” stop asking, tell them we'll send a portal link
                console.log(`[Voice] Address failed validation ${addressAttempts} times. Sending portal link.`);
                collected._addressSkipped = true;
                collected._addressValidated = false;
                // Keep the raw address for dispatcher review
                collected.address = newAddress;
                collected._correctionsCount = (collected._correctionsCount || 0) + 1;

                // Fire-and-forget: send portal link via SMS (and email if available)
                const customerEmail = collected.email || '';
                sendPortalLinkToCustomer(from, org?.orgId, customerEmail || undefined)
                    .then(() => console.log(`[Voice] Portal link sent to ${from}`))
                    .catch((e: Error) => console.warn(`[Voice] Portal link send failed: ${e.message}`));

                // Override the AI response to tell the caller about the link
                aiResponse.message = "No worries at all! I'm sending you a text right now with a link to your customer portal. You can verify your address, view your service request, check quotes, and more from there. Now let me continue with your request.";
                aiResponse.action = 'continue';
            } else {
                // 1st failed attempt â€” ask to repeat the address
                console.log(`[Voice] Address validation failed (attempt ${addressAttempts}): "${newAddress}"`);
                delete collected.address; // Remove the bad address so AI asks again
                collected._addressAttempts = addressAttempts;
                collected._correctionsCount = (collected._correctionsCount || 0) + 1;

                const suggestion = validation.formattedAddress 
                    ? `I found something close: ${expandAddressForSpeech(validation.formattedAddress)}. Is that right, or could you repeat your full street address?`
                    : "I wasn't able to verify that address. Could you repeat your full street address including the street number?";
                aiResponse.message = suggestion;
                aiResponse.action = 'continue';
            }
        }

        // Save updated session (including lastAction for confirmation detection)
        await sessionRef.set({
            ...session,
            transcript,
            collected,
            intent: aiResponse.intent || session.intent,
            lastAction: aiResponse.action || null,
            turn,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // ━━━ Check for Representative Callback Handoff (correctionsCount >= 2) ━━━
        if (collected._correctionsCount >= 2) {
            console.log(`[Voice] Corrections count reached ${collected._correctionsCount}. Triggering human representative callback.`);
            collected._requiresHumanFollowup = true;
            collected._representativeCallback = true;

            const ticketRef = await createTicketFromVoice(from, collected, org?.orgId, transcript);

            const handoffMsg = "I want to make sure we get all of your details exactly right, so I'm going to have a representative call you directly at this number shortly to get everything finalized and schedule your service. Thank you so much for your patience, and have a wonderful day!";

            transcript.push({ role: "assistant", text: handoffMsg, timestamp: new Date().toISOString() });

            // Mark session as completed/ended
            await sessionRef.set({
                ...session,
                transcript,
                collected,
                status: "completed",
                lastAction: "end_call",
                turn,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            if (ticketRef) {
                await db.collection("tickets").doc(ticketRef.id).update({
                    transcript,
                    aiConfidenceNotes: "AI Voice Agent handed off to representative callback due to multiple corrections/failures."
                });
            }

            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Google.en-US-Neural2-F">${sanitizeForTts(escapeXml(handoffMsg))}</Say>
    <Hangup/>
</Response>`;
            res.set("Content-Type", "text/xml");
            return res.status(200).send(twiml);
        }

        const maxTurns = 12;
        // ━━━ Confirmation → Ticket Creation Flow ━━━
        // If the PREVIOUS turn was a "confirm" and the caller just said "yes/yeah/correct",
        // immediately create the ticket — don't let the AI re-confirm.
        const lowerSpeech = speechResult.toLowerCase().trim();
        const isAffirmative = /\b(yes|yeah|yep|correct|right|that's right|that is right|sounds good|go ahead|perfect|ok|okay|sure|absolutely|yup)\b/.test(lowerSpeech);

        if (previousAction === "confirm" && isAffirmative) {
            console.log(`[Voice] Caller confirmed after confirm turn Ã¢â‚¬â€ creating ticket immediately.`);
            collected._confirmed = true;
            const ticketRef1 = await createTicketFromVoice(from, collected, org?.orgId, transcript);

            // Build a closing message that tells them about the follow-up
            const hasAddress = !!collected.address;
            const hasEmail = !!collected.email;
            const contactPref = collected.contactPreference || (hasEmail ? 'email' : 'text');
            const isQuote = /quote/i.test(collected.description || '') || session.intent === 'quote_request';
            let closingMsg = "I've created your service request.";
            if (!hasAddress) {
                closingMsg += ` We'll follow up by ${contactPref} to confirm your service address.`;
            } else if (hasEmail) {
                closingMsg += " You'll receive a confirmation email with your ticket details shortly.";
            }
            if (isQuote) {
                closingMsg += ` We'll get a quote over to you by ${contactPref} shortly.`;
            } else {
                closingMsg += ` Someone from our team will be reaching out shortly by ${contactPref} to get you scheduled.`;
            }

            transcript.push({ role: "assistant", text: closingMsg, timestamp: new Date().toISOString() });
            await sessionRef.update({ transcript, collected, status: "completed" });
            // Update the ticket with the final transcript (includes the closing message)
            if (ticketRef1) {
                await db.collection("tickets").doc(ticketRef1.id).update({ transcript });
            }

            const doneAction = buildGatherAction(sessionId, from, to, turn + 1);
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather ${buildGatherAttrs(doneAction, 5, HINTS_YESNO)}>
        <Say voice="Google.en-US-Neural2-F">${sanitizeForTts(escapeXml(closingMsg))} Is there anything else I can help you with?</Say>
        <Pause length="1"/>
    </Gather>
    <Say voice="Google.en-US-Neural2-F">Thank you for calling. Have a great day!</Say>
    <Hangup/>
</Response>`;
            res.set("Content-Type", "text/xml");
            return res.status(200).send(twiml);

        } else if (aiResponse.action === "confirm" || aiResponse.action === "create_ticket") {
            // User requested that we just recap and say goodbye, no need for an explicit confirmation loop
            console.log(`[Voice] Creating ticket and gathering for anything else`);
            collected._confirmed = true;
            const ticketRef2 = await createTicketFromVoice(from, collected, org?.orgId, transcript);

            const closingMsg = aiResponse.message;

            transcript.push({ role: "assistant", text: closingMsg, timestamp: new Date().toISOString() });
            await sessionRef.update({ transcript, collected, status: "completed" });
            if (ticketRef2) {
                await db.collection("tickets").doc(ticketRef2.id).update({ transcript });
            }

            const doneAction = buildGatherAction(sessionId, from, to, turn + 1);
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather ${buildGatherAttrs(doneAction, 5, HINTS_YESNO)}>
        <Say voice="Google.en-US-Neural2-F">${sanitizeForTts(escapeXml(closingMsg))}</Say>
        <Pause length="1"/>
    </Gather>
    <Say voice="Google.en-US-Neural2-F">Thank you for calling. Have a great day!</Say>
    <Hangup/>
</Response>`;
            res.set("Content-Type", "text/xml");
            return res.status(200).send(twiml);

        } else if (aiResponse.action === "check_status") {
            transcript.push({ role: "assistant", text: aiResponse.message, timestamp: new Date().toISOString() });
            await sessionRef.update({ transcript, intent: "status_check" });

            const statusAction = buildGatherAction(sessionId, from, to, turn + 1);
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather ${buildGatherAttrs(statusAction, 5, HINTS_YESNO)}>
        <Say voice="Google.en-US-Neural2-F">${sanitizeForTts(escapeXml(aiResponse.message))} Is there anything else I can help you with?</Say>
        <Pause length="1"/>
    </Gather>
    <Say voice="Google.en-US-Neural2-F">Thank you for calling. Goodbye!</Say>
    <Hangup/>
</Response>`;
            res.set("Content-Type", "text/xml");
            return res.status(200).send(twiml);

        } else if (aiResponse.action === "answer_question") {
            // AI answered a question from the knowledge base Ã¢â‚¬â€ continue conversation
            transcript.push({ role: "assistant", text: aiResponse.message, timestamp: new Date().toISOString() });
            await sessionRef.update({ transcript });

            // If the AI flagged this as an unanswerable question, log it
            if (aiResponse.questionLogged && org?.orgId) {
                logCustomerQuestion(org.orgId, aiResponse.questionLogged, from, sessionId);
            }

            const continueAction = buildGatherAction(sessionId, from, to, turn + 1);
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather ${buildGatherAttrs(continueAction, 4, HINTS_GREETING)}>
        <Say voice="Google.en-US-Neural2-F">${sanitizeForTts(escapeXml(aiResponse.message))}</Say>
    </Gather>
    <Redirect>${continueAction.replace(/&/g, '&amp;')}</Redirect>
</Response>`;
            res.set("Content-Type", "text/xml");
            return res.status(200).send(twiml);

        } else if (aiResponse.action === "end_call") {
            await sessionRef.update({ status: "ended" });
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Google.en-US-Neural2-F">${escapeXml(aiResponse.message)}</Say>
    <Hangup/>
</Response>`;
            res.set("Content-Type", "text/xml");
            return res.status(200).send(twiml);

        } else if (aiResponse.action === "voicemail") {
            // Check if org has a forward number for human transfer
            const forwardNumber = session.callForwardNumber;
            await sessionRef.update({ status: forwardNumber ? "transferred" : "voicemail" });

            if (forwardNumber) {
                // Transfer to a real person
                const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Google.en-US-Neural2-F">Absolutely, let me connect you with someone right now. Please hold.</Say>
    <Dial>${escapeXml(forwardNumber)}</Dial>
</Response>`;
                res.set("Content-Type", "text/xml");
                return res.status(200).send(twiml);
            } else {
                // No forward number Ã¢â‚¬â€ fall back to voicemail
                const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Google.en-US-Neural2-F">${escapeXml(aiResponse.message)}</Say>
    <Record action="/handleVoicemailRecording" maxLength="120" playBeep="true" />
</Response>`;
                res.set("Content-Type", "text/xml");
                return res.status(200).send(twiml);
            }

        } else {
            // Continue conversation Ã¢â‚¬â€ ask for next piece of info
            if (turn >= maxTurns) {
                await createTicketFromVoice(from, collected, org?.orgId, transcript);
                await sessionRef.update({ status: "completed_max_turns" });
                const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Google.en-US-Neural2-F">${escapeXml(aiResponse.message)} I've created a service request with everything you've shared. Someone from our team will follow up shortly.</Say>
    <Hangup/>
</Response>`;
                res.set("Content-Type", "text/xml");
                return res.status(200).send(twiml);
            }

            transcript.push({ role: "assistant", text: aiResponse.message, timestamp: new Date().toISOString() });
            await sessionRef.update({ transcript });

            // Log unanswered questions for the business owner to review
            if (aiResponse.questionLogged && org?.orgId) {
                logCustomerQuestion(org.orgId, aiResponse.questionLogged, from, sessionId);
            }

            const continueAction = buildGatherAction(sessionId, from, to, turn + 1);
            // Choose STT hints based on what the AI is asking for next
            const msgLower = (aiResponse.message || '').toLowerCase();
            const dynamicHints = /\b(name|who am i speaking|can i get your name)\b/i.test(msgLower) ? HINTS_NAME
                : /\b(address|location|street|where.*(service|work))\b/i.test(msgLower) ? HINTS_ADDRESS
                : /\b(call.*text.*email|reach you|contact|prefer)\b/i.test(msgLower) ? HINTS_CONTACT
                : /\b(confirm|correct|right|sound good|recap)\b/i.test(msgLower) ? HINTS_YESNO
                : HINTS_GREETING;
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather ${buildGatherAttrs(continueAction, 4, dynamicHints)}>
        <Say voice="Google.en-US-Neural2-F">${sanitizeForTts(escapeXml(aiResponse.message))}</Say>
    </Gather>
    <Redirect>${continueAction}</Redirect>
</Response>`;
            res.set("Content-Type", "text/xml");
            return res.status(200).send(twiml);
        }

    } catch (error) {
        console.error("[Voice] Error processing speech:", error);
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Google.en-US-Neural2-F">I'm sorry, I'm having trouble right now. Let me take a message. Please leave a detailed message after the beep.</Say>
    <Record action="/handleVoicemailRecording" maxLength="120" playBeep="true" />
</Response>`;
        res.set("Content-Type", "text/xml");
        return res.status(200).send(twiml);
    }
});


/**
 * Webhook for when recording is complete.
 * Twilio sends RecordingUrl in the body.
 */
export const handleVoicemailRecording = functions.https.onRequest(async (req: any, res: any) => {
    const recordingUrl = req.body.RecordingUrl;
    const from = req.body.From;
    const to = req.body.To || "";

    console.log(`Received voicemail from ${from}: ${recordingUrl}`);

    try {
        const org = await getOrgForNumber(to);
        await createTicketFromVoice(from, { description: `Voicemail received. Recording: ${recordingUrl}` }, org?.orgId, []);

        res.set("Content-Type", "text/xml");
        res.status(200).send("<Response><Say voice='Google.en-US-Neural2-F'>Thank you. Your message has been received and a ticket has been created. We'll get back to you soon. Goodbye!</Say><Hangup/></Response>");
    } catch (error) {
        console.error("Error processing voicemail:", error);
        res.set("Content-Type", "text/xml");
        res.status(200).send("<Response><Hangup/></Response>");
    }
});

// ============================================================================
// ============================================================================
// Quick Response Engine — bypasses AI for common, predictable turns
// ============================================================================

/**
 * Attempts to handle the caller's speech without calling Gemini.
 * Returns an AIVoiceResponse if the input is a common pattern, or null to fall through to AI.
 */
function tryQuickResponse(
    speech: string,
    collected: Record<string, any>,
    turn: number,
    callerInfo: CallerContext | null,
    currentIntent: string | null,
    lastAction: string | null,
    sessionStatus: string
): AIVoiceResponse | null {
    const lower = speech.toLowerCase().trim().replace(/[.,!?]+$/, '');
    const words = lower.split(/\s+/);
    const wordCount = words.length;

    // ─── 0. Post-Completion Wrap-Up Check ───
    // If the session status is 'completed' (a ticket has already been successfully created/recapped),
    // and the user does NOT explicitly ask for a new service or check status, immediately end the call.
    // This prevents infinite loops caused by ambient noise, "okay", "thank you", or late responses.
    if (sessionStatus === 'completed') {
        const wantsNewAction = /\b(schedule|new|another|quote|repair|appointment|fix|broken|issue|problem|status|update|check on|where is|my job)\b/i.test(lower);
        if (!wantsNewAction) {
            console.log(`[Voice][Quick] Completed session, no new action requested. Ending call.`);
            return {
                message: "Thanks again for calling. Have a wonderful day!",
                action: "end_call",
                intent: currentIntent || "service_request",
                collectedFields: {}
            };
        }
    }

    // â”â”â” Determine what field is missing next â”â”â”
    const hasDescription = !!collected.description;
    const hasAddress = !!collected.address || (callerInfo?.address);
    const hasContactPref = !!collected.contactPreference;

    // Sanity-check callerInfo.name — STT can produce garbled names like "Which Is"
    // that get persisted. If the name looks like common English words rather than
    // a real person's name, treat it as unknown.
    const GARBLED_NAME_PATTERNS = /^(which is|which|what is|that is|this is|who is|how is|it is|there is|here is|let me|tell me|give me|help me)$/i;
    const callerNameIsValid = callerInfo
        && callerInfo.name !== 'Unknown Caller'
        && !GARBLED_NAME_PATTERNS.test(callerInfo.name.trim());
    const hasName = !!collected.name || callerNameIsValid;

    // â”â”â” 1. Goodbye / end call detection â”â”â”
    // "no" and "nope" are ambiguous â€” they could mean "no, that's wrong" (address correction,
    // declining a suggestion) or "no, nothing else" (goodbye). Only treat them as goodbye
    // when the session is already completed (post-ticket "anything else?" prompt).
    // Explicit goodbye phrases like "goodbye", "bye", "that's all" are safe at any point.
    const isExplicitGoodbye = /^(goodbye|bye|that's all|that is all|no thanks|no thank you|nothing else|i'm good|all set|have a good day)$/i.test(lower);
    const isAmbiguousNegative = /^(no|nope)$/i.test(lower);
    const isPostCompletion = sessionStatus === 'completed' || lastAction === 'create_ticket' || lastAction === 'check_status' || lastAction === 'answer_question';

    if (isExplicitGoodbye || (isAmbiguousNegative && isPostCompletion)) {
        console.log(`[Voice][Quick] Detected goodbye: "${speech}" (lastAction=${lastAction}, status=${sessionStatus})`);
        return {
            message: "Thank you for calling! Have a great day.",
            action: "end_call",
            intent: currentIntent || "service_request",
            collectedFields: {}
        };
    }

    // If caller said "no"/"nope" mid-conversation, let it fall through to the AI
    // so Gemini can handle it in context (e.g. "Is that address right?" â†’ "No" â†’ ask for correction)
    if (isAmbiguousNegative && !isPostCompletion) {
        console.log(`[Voice][Quick] Ambiguous "no" mid-conversation â€” deferring to AI (lastAction=${lastAction})`);
        return null;
    }


    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ 2. "Talk to a person / human / manager" (any turn) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    if (/\b(speak|talk|human|person|manager|real person|representative|someone|live)\b/i.test(lower)) {
        console.log(`[Voice][Quick] Detected voicemail request: "${speech}"`);
        return {
            message: "Of course! Let me take a message and have someone call you back shortly.",
            action: "voicemail",
            intent: "voicemail",
            collectedFields: {}
        };
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ 3. Intent detection (first turn or early turns before description is set) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    if (!hasDescription && turn <= 2) {
        // Service / repair / fix request
        if (/\b(service|repair|fix|broken|leak|replace|install|maintenance|plumb|drain|toilet|faucet|water heater|pipe|clog|ac |hvac|heating|cooling)\b/i.test(lower)) {
            console.log(`[Voice][Quick] Detected service intent: "${speech}"`);
            // If the speech contains a specific issue (more than just "service"), capture it
            const isSpecific = wordCount >= 3 || /\b(toilet|faucet|water heater|pipe|drain|leak|clog|ac |hvac|shower)\b/i.test(lower);
            if (isSpecific) {
                // They gave a real description Ã¢â‚¬â€ capture it and ask for name next
                if (hasName) {
                    return {
                        message: "Got it. What's the address or area for the service?",
                        action: "continue",
                        intent: "service_request",
                        collectedFields: { description: speech }
                    };
                }
                return {
                    message: "Got it! Can I get your name?",
                    action: "continue",
                    intent: "service_request",
                    collectedFields: { description: speech }
                };
            }
            // Generic "I need service" Ã¢â‚¬â€ acknowledge and ask for name
            if (hasName) {
                return {
                    message: "Sure thing! What kind of issue are you experiencing?",
                    action: "continue",
                    intent: "service_request",
                    collectedFields: {}
                };
            }
            return {
                message: "Sure thing! Can I get your name?",
                action: "continue",
                intent: "service_request",
                collectedFields: {}
            };
        }

        // Quote request ("close" is a known STT misrecognition of "quote" on phone audio)
        if (/\b(quote|close|estimate|price|pricing|cost|how much)\b/i.test(lower)) {
            console.log(`[Voice][Quick] Detected quote intent: "${speech}"`);

            // Check if the speech also contains a description of the work needed
            // e.g. "I need a quote to change my kitchen sink" Ã¢â‚¬â€ don't re-ask "What do you need a quote for?"
            const strippedDesc = lower
                .replace(/\b(i need|i want|can i get|get me|i'd like|give me)\b/gi, '')
                .replace(/\b(a |an )\b/gi, '')
                .replace(/\b(quote|close|estimate|price|pricing|cost|how much)\b/gi, '')
                .replace(/\b(for|to|on|about|regarding)\b/gi, '')
                .trim();
            const hasDescriptionInSpeech = strippedDesc.length > 5 && strippedDesc.split(/\s+/).length >= 2;

            if (hasDescriptionInSpeech) {
                // They gave both intent + description Ã¢â‚¬â€ capture it
                console.log(`[Voice][Quick] Quote intent includes description: "${strippedDesc}"`);
                const nextQuestion = hasName
                    ? (hasAddress ? "What's the best way to reach you Ã¢â‚¬â€ call, text, or email?" : "What's the address or area for the service?")
                    : "Can I get your name?";
                return {
                    message: `Got it! ${nextQuestion}`,
                    action: "continue",
                    intent: "quote_request",
                    collectedFields: { description: speech }
                };
            }

            if (hasName) {
                return {
                    message: "Absolutely! What do you need a quote for?",
                    action: "continue",
                    intent: "quote_request",
                    collectedFields: {}
                };
            }
            return {
                message: "Absolutely! Can I get your name first?",
                action: "continue",
                intent: "quote_request",
                collectedFields: {}
            };
        }

        // Appointment change / reschedule
        // Guard: "change out" means "replace" (a service request), not "reschedule"
        // Only match "change" when it's about an appointment, not about replacing hardware
        const isChangeOut = /\bchange\s+out\b/i.test(lower);
        const hasAppointmentContext = /\b(reschedule|cancel|move|appointment|existing)\b/i.test(lower);
        const hasChangeAlone = /\bchange\b/i.test(lower) && !isChangeOut;
        if (hasAppointmentContext || hasChangeAlone) {
            console.log(`[Voice][Quick] Detected appointment change: "${speech}"`);
            return {
                message: "I can help with that! Can I get your name so I can look up your appointment?",
                action: "continue",
                intent: "status_check",
                collectedFields: {}
            };
        }

        // Check status
        if (/\b(check|status|update|where|when|my job|my ticket)\b/i.test(lower)) {
            console.log(`[Voice][Quick] Detected status check: "${speech}"`);
            return {
                message: "Let me look into that. Can I get your name?",
                action: "continue",
                intent: "status_check",
                collectedFields: {}
            };
        }
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ 4. Name extraction (when name is the next missing field) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    if (!hasName && (hasDescription || turn <= 2) && wordCount <= 4) {
        // Short response likely a name Ã¢â‚¬â€ but exclude obvious non-names
        const looksLikeName = wordCount <= 3
            && !/\b(yes|no|yeah|nope|ok|sure|call|text|email|help|service|quote|fix|repair|um|uh)\b/i.test(lower)
            && /^[a-z\s'-]+$/i.test(lower);
        if (looksLikeName) {
            // Capitalize the name properly
            const name = lower.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            console.log(`[Voice][Quick] Extracted name: "${name}"`);
            const nextQuestion = !hasDescription
                ? "What's going on that you need help with?"
                : !hasAddress
                    ? "What's the address or area for the service?"
                    : "What's the best way to reach you Ã¢â‚¬â€ call, text, or email?";
            return {
                message: `Thanks, ${name}! ${nextQuestion}`,
                action: "continue",
                intent: currentIntent || "service_request",
                collectedFields: { name }
            };
        }
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ 5. Contact preference (call / text / email) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    if (!hasContactPref && hasDescription && hasName) {
        // Pure contact preference answers
        if (/^(call|phone|call me|phone call|give me a call)$/i.test(lower)) {
            console.log(`[Voice][Quick] Contact preference: call`);
            if (currentIntent === "quote_request") {
                // For quotes: skip availability, go straight to recap + create ticket
                const addr = collected.address || 'your address on file';
                const desc = collected.description || 'the work you described';
                const cName = collected.name || 'there';
                return {
                    message: `Got it, ${cName}. To recap, you need a quote for ${desc} at ${addr}. We will call you back once the quote is ready. Is there anything else I can help with?`,
                    action: "create_ticket",
                    intent: "quote_request",
                    collectedFields: { contactPreference: "call" }
                };
            }
            return {
                message: "Call it is! What days and times work best for you?",
                action: "continue",
                intent: currentIntent || "service_request",
                collectedFields: { contactPreference: "call" }
            };
        }
        if (/^(text|text me|message|sms|text message)$/i.test(lower)) {
            console.log(`[Voice][Quick] Contact preference: text`);
            if (currentIntent === "quote_request") {
                // For quotes: skip availability, go straight to recap + create ticket
                const addr = collected.address || 'your address on file';
                const desc = collected.description || 'the work you described';
                const cName = collected.name || 'there';
                return {
                    message: `Got it, ${cName}. To recap, you need a quote for ${desc} at ${addr}. We will text you once the quote is ready. Is there anything else I can help with?`,
                    action: "create_ticket",
                    intent: "quote_request",
                    collectedFields: { contactPreference: "text" }
                };
            }
            return {
                message: "Text works! What days and times work best for you?",
                action: "continue",
                intent: currentIntent || "service_request",
                collectedFields: { contactPreference: "text" }
            };
        }
        if (/^(email|email me|e-?mail)$/i.test(lower)) {
            console.log(`[Voice][Quick] Contact preference: email`);
            return {
                message: "Sure, email works! What's your email address?",
                action: "continue",
                intent: currentIntent || "service_request",
                collectedFields: { contactPreference: "email" }
            };
        }
    }

    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ No quick match Ã¢â‚¬â€ fall through to AI Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    return null;
}

// ============================================================================
// AI Processing
// ============================================================================

interface AIVoiceResponse {
    message: string;
    action: 'continue' | 'create_ticket' | 'confirm' | 'check_status' | 'end_call' | 'voicemail' | 'answer_question';
    intent?: string;
    collectedFields?: Record<string, string>;
    questionLogged?: string; // The general question the caller asked, for knowledge base logging
}

async function processVoiceWithAI(
    speechInput: string,
    callerInfo: CallerContext | null,
    org: { orgId: string; orgName: string; aiVoiceProfileId?: string } | null,
    turn: number,
    collected: Record<string, any>,
    transcript: { role: string; text: string; timestamp?: string }[]
): Promise<AIVoiceResponse> {
    const model = getGeminiModel();

    if (!model) {
        return processVoiceWithKeywords(speechInput, callerInfo, collected);
    }

    try {
        const companyName = org?.orgName || "DispatchBox";
        const callerContext = callerInfo
            ? `Known caller: ${callerInfo.name} (phone: ${callerInfo.phone}). ${callerInfo.recentJobs.length} recent jobs.${callerInfo.recentJobs.length > 0 ? ` Latest: "${callerInfo.recentJobs[0].description}" Ã¢â‚¬â€ ${callerInfo.recentJobs[0].status}.` : ''}`
            : "Caller is not yet in our system.";

        // Build transcript history for context
        const historyStr = transcript.slice(-10).map(t => `${t.role === 'caller' ? 'CALLER' : 'YOU'}: ${t.text}`).join('\n');

        // Show what we've collected so far
        const col = collected || {};
        // For known callers, auto-fill address from their customer record
        // Apply garbled-name check — STT artifacts like "Which Is" shouldn't count as known
        const GARBLED_NAMES = /^(which is|which|what is|that is|this is|who is|how is|it is|there is|here is|let me|tell me|give me|help me)$/i;
        const isKnownCaller = callerInfo && callerInfo.name !== 'Unknown Caller' && !GARBLED_NAMES.test(callerInfo.name.trim());
        const knownAddress = callerInfo?.address || '';
        // Determine if this is a quote request â€” affects which fields are required
        const isQuoteIntent = col._quoteIntent || /quote/i.test(col.description || '') || 
            transcript.some((t: any) => /quote|estimate|price/i.test(t.text || ''));
        const availabilityDisplay = isQuoteIntent 
            ? (col.availability || 'N/A (not needed for quotes â€” DO NOT ASK)')
            : (col.availability || 'NOT YET');
        const collectedStr = [
            `Name: ${col.name || (isKnownCaller ? callerInfo!.name + ' (from caller ID)' : 'NOT YET')}`,
            `Issue/Description: ${col.description || 'NOT YET'}`,
            `Address: ${col.address || (knownAddress ? knownAddress + ' (on file)' : 'NOT YET')}`,
            `Email: ${col.email || 'NOT YET'}`,
            `Contact Preference: ${col.contactPreference || 'NOT YET'}`,
            `Availability: ${availabilityDisplay}`,
            `Urgency: ${col.urgency || 'NOT YET'}`
        ].join('\n');

        // Auto-fill known caller fields into collected so we don't re-ask
        if (isKnownCaller && !col.name) col.name = callerInfo!.name;
        if (knownAddress && !col.address) col.address = knownAddress;

        // Address instructions depend on whether caller is known
        const spokenAddress = knownAddress ? expandAddressForSpeech(knownAddress) : '';
        const addressInstructions = isKnownCaller && knownAddress
            ? (isQuoteIntent
                ? `The caller is a KNOWN CUSTOMER with address "${spokenAddress}" on file. Because this is a QUOTE REQUEST and location affects pricing, you MUST confirm the service address by asking: "I have your address as ${spokenAddress} on file — is that where the work will be done, or is it a different location?" Do NOT skip this step.`
                : `The caller is a KNOWN CUSTOMER with address "${spokenAddress}" on file. Do NOT ask for their address unless they say it's a different location. Confirm by saying "I have your address as ${spokenAddress} on file, is that correct?" only if relevant.`)
            : `For the address: You MUST ask the customer for their full service address.`;

        // Load the org's knowledge base (FAQs, services, hours) if available
        const knowledge = org?.orgId ? await loadOrgKnowledge(org.orgId) : null;

        // Load the AI Voice Profile if available (cached in-memory)
        let profileConfig = null;
        if (org?.aiVoiceProfileId) {
            const cachedProfile = voiceProfileCache.get(org.aiVoiceProfileId);
            if (cachedProfile && (Date.now() - cachedProfile.ts) < PROFILE_CACHE_TTL) {
                profileConfig = cachedProfile.data;
            } else {
                try {
                    const profileDoc = await db.collection('ai_voice_profiles').doc(org.aiVoiceProfileId).get();
                    if (profileDoc.exists) {
                        profileConfig = profileDoc.data();
                        voiceProfileCache.set(org.aiVoiceProfileId, { data: profileConfig, ts: Date.now() });
                    }
                } catch (e) {
                    console.warn("[Voice] Error loading voice profile:", (e as Error).message);
                }
            }
        }

        // Build knowledge base section for the prompt
        let knowledgeSection = '';
        if (knowledge) {
            if (knowledge.faqs.length > 0) {
                knowledgeSection += '\n## Business Q&A Knowledge Base\nUse these answers when a caller asks a related question:\n';
                for (const faq of knowledge.faqs) {
                    if (faq.question && faq.answer) {
                        knowledgeSection += `Q: ${faq.question}\nA: ${faq.answer}\n\n`;
                    }
                }
            }
            if (knowledge.services.length > 0) {
                knowledgeSection += '\n## Our Services\n';
                for (const svc of knowledge.services) {
                    knowledgeSection += `- ${svc.name}: ${svc.description}`;
                    if (svc.priceRange) knowledgeSection += ` (${svc.priceRange})`;
                    knowledgeSection += '\n';
                }
            }
            if (knowledge.businessHours) {
                knowledgeSection += `\n## Business Hours\n${knowledge.businessHours}\n`;
            }
            if (knowledge.serviceArea) {
                knowledgeSection += `\n## Service Area\n${knowledge.serviceArea}\n`;
            }
            if (knowledge.specialInstructions) {
                knowledgeSection += `\n## Special Instructions\n${knowledge.specialInstructions}\n`;
            }
        }

        let fallbackInstructions = `4. RETRIES & ALTERNATE COMMUNICATION: If you have to ask for the SAME piece of information more than twice because the caller's answer is unclear, DO NOT keep asking. Instead, switch to an alternate method: "I'm having a little trouble getting that. Would you prefer to text or email us about this instead?" If they agree, say "Great, please text or email us at our main number and we'll get right back to you. Have a great day!" and select "end_call".`;
        if (profileConfig?.collection?.enableFallbackCommunication === false) {
            fallbackInstructions = `4. RETRIES: If you have to ask for the SAME piece of information more than twice because the caller's answer is unclear, politely ask one more time. DO NOT offer to switch to text or email.`;
        }

        let confirmationInstructions = `8. ONLY confirm ONCE. When you do the final recap, end with "Is there anything else that I can help you with?". Do NOT ask "does that sound right?"`;
        if (profileConfig?.collection?.requireConfirmation === true) {
            confirmationInstructions = `8. CONFIRMATION REQUIRED: After collecting a piece of information, ALWAYS repeat it back to the caller to confirm it is correct before moving on. When you do the final recap, you MUST ask "Does that all sound correct?" and wait for their confirmation.`;
        }

        const prompt = `You are Amy, the friendly AI receptionist for ${companyName}.

## Your Personality & Communication Style
- Sound like a real, warm team member, NOT a robot or menu system.
- Keep every response to 1-2 SHORT sentences. This is a phone call, brevity is key.
- Use natural, conversational language. Avoid corporate phrases like "Your call is important to us."
- If the caller sounds stressed or frustrated, acknowledge it briefly: "I understand, let's get that taken care of" then move to solving.
- Do NOT announce that you are AI unless directly asked. If asked, be honest but casual: "I'm an AI assistant, but I can definitely help you out."
- Ask ONE question at a time, never stack multiple questions.
- IMPORTANT: Never use em-dashes or special Unicode characters in your responses. Use commas or periods instead.
- IMPORTANT: When reading addresses aloud, ALWAYS expand abbreviations to full words. Say "Street" not "St", "Avenue" not "Ave", "Boulevard" not "Blvd", "Apartment" not "Apt", "Suite" not "Ste", "Drive" not "Dr", "Road" not "Rd", "Lane" not "Ln", "North" not "N", etc.
${knowledgeSection}
## Caller Context
${callerContext}

## Conversation So Far
${historyStr || '(First turn, caller just responded to your greeting.)'}

## Info Collected
${collectedStr}

## Caller's Latest Response
"${speechInput}"

## Your Task
1. Extract any NEW info from the caller's latest response and return it in "collectedFields".
   - "name": caller's full name
   - "description": the SPECIFIC issue or service needed (e.g. "shower head replacement", "leaking faucet", "clogged drain"). Generic phrases like "service call" or "appointment" are NOT a valid description, you MUST ask what the issue is.
   - "address": the street address for the service
   - "email": caller's email address if they provide one. If they spell it out slowly (e.g. "R i c h at a o l dot com"), carefully reassemble the letters into a valid email.
   - "contactPreference": how they want to be contacted: "call", "text", or "email"
   - "availability": days and times that work for them (e.g. "Mondays and Wednesdays between 12 and 4", "Tuesday afternoon")
   - "urgency": "emergency" or "normal" (infer from tone/words like "flooding", "no heat", "ASAP", do NOT ask directly)
2. ${addressInstructions}
3. COLLECTION ORDER - follow this flow STRICTLY:
   a. When the caller says they want service, a quote, or similar -> acknowledge it, then ask for their name: "Sure thing! Can I get your name?"
   b. After getting the name -> briefly confirm it, then ask what the problem is: "Thanks, [Name]! What's going on that you need help with?" (If they already stated the issue, skip this.)
   c. After getting the issue -> briefly confirm it, then ask for their address: "Got it, [Issue]. What's the address for the service?" (CRITICAL: You MUST ask for the address unless it is already on file).
   d. After getting the address -> briefly confirm it, then ask for contact preference: "[Address], understood. What's the best way to reach you, by call, text, or email?"
   e. After getting contact info -> briefly confirm it.
       *** ABSOLUTE RULE ***: If intent is "quote_request", you MUST NOT ask for availability or scheduling. NEVER say "What days and times work best for you?" for a quote. Go DIRECTLY to the recap and use "create_ticket".
       For SERVICE requests ONLY: Ask for availability: "[Preference] is great. What days and times work best for you for the service?"
   f. After getting all required info -> you MUST recap the details fully.
       For QUOTES: Required = name + description + address + contactPreference. Availability is NOT required and MUST NOT be asked.
       For SERVICE: Required = name + description + address + contactPreference + availability.
   If the caller provides multiple pieces of info at once, extract them all, confirm them briefly, and skip to the next missing field.
${fallbackInstructions}
5. NEVER RE-ASK for information already collected. Check "Info Collected" above. If a field has a value (not "NOT YET"), do NOT ask for it again.
6. Pick an action:
   - "continue" - ask for the NEXT missing field. Ask ONE thing at a time.
   - "confirm" or "create_ticket" - USE ONLY WHEN you have name + description + address + (if service request) availability. YOU MUST read back the details. For a service: "To recap, you need [service required] at [address] around [requested dates]. We will reach out by [text/call/email] to get you scheduled. Is there anything else I can help with?". For a quote: "To recap, you need a quote for [service] at [address]. We will [call you back / text you / email you] once the quote is ready. Is there anything else I can help with?" Then use this action. NEVER use this action until all required fields are collected.
   - "check_status" - caller wants to check on an existing job.
   - "answer_question" - caller asks a question you CAN answer from the knowledge base. Answer naturally, then steer back.
   - "end_call" - caller says goodbye, has no more needs, or agrees to text/email instead.
   - "voicemail" - caller asks to speak to a human or leave a message. Do NOT try to convince them to stay.
7. If the address is confusing or unclear, do your best to capture it.
${confirmationInstructions}
9. If the caller asks a question you CANNOT answer, respond: "Great question, I'll make a note and have someone get back to you on that." Set intent to "general_question" and include "questionLogged".

Respond ONLY with valid JSON:
{
  "message": "your spoken reply (1-2 sentences, under 30 words except for the recap which can be longer)",
  "action": "continue|create_ticket|confirm|check_status|end_call|voicemail|answer_question",
  "intent": "service_request|quote_request|status_check|general_question|voicemail",
  "collectedFields": { "fieldName": "value" },
  "questionLogged": "the question caller asked, if unanswerable"
}`;

        const geminiStart = Date.now();
        const result: any = await withTimeout(model.generateContent(prompt), GEMINI_TIMEOUT_MS, 'Gemini');
        console.log(`[Voice] Gemini responded in ${Date.now() - geminiStart}ms`);
        const responseText = result.response.text().trim();

        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const validActions = ['continue', 'create_ticket', 'confirm', 'check_status', 'end_call', 'voicemail', 'answer_question'];
            return {
                message: parsed.message || "Could you tell me a bit more about what you need?",
                action: validActions.includes(parsed.action) ? parsed.action : 'continue',
                intent: parsed.intent || undefined,
                collectedFields: parsed.collectedFields || {},
                questionLogged: parsed.questionLogged || undefined
            };
        }

        return { message: "I'd be happy to help. Could you tell me a little more about what you need?", action: "continue", collectedFields: {} };

    } catch (error) {
        console.error("[Voice] AI processing error:", (error as Error).message);
        return processVoiceWithKeywords(speechInput, callerInfo, collected);
    }
}

function processVoiceWithKeywords(
    speechInput: string,
    callerInfo: CallerContext | null,
    collected: Record<string, any> = {}
): AIVoiceResponse {
    const lower = speechInput.toLowerCase();

    // Status check keywords
    if (lower.includes("status") || lower.includes("update") || lower.includes("check on") || lower.includes("where is") || lower.includes("my job")) {
        if (callerInfo && callerInfo.recentJobs.length > 0) {
            const job = callerInfo.recentJobs[0];
            return {
                message: `I found your most recent service request. The status is currently ${job.status}. ${job.status === 'scheduled' ? 'A technician has been assigned.' : job.status === 'completed' ? 'The job has been completed.' : 'Our team is working on it.'}`,
                action: 'check_status'
            };
        }
        return {
            message: "I don't see any recent service requests associated with your phone number. Would you like to create a new service request?",
            action: 'continue'
        };
    }

    // Schedule / service request keywords
    if (lower.includes("schedule") || lower.includes("appointment") || lower.includes("service") || lower.includes("fix") || lower.includes("repair") || lower.includes("broken") || lower.includes("issue") || lower.includes("problem") || lower.includes("quote") || lower.includes("close")) {
        return {
            message: "I'd be happy to help with that. Could I get your name and address to get started?",
            action: 'continue'
        };
    }

    // End call keywords
    if (lower.includes("goodbye") || lower.includes("bye") || lower.includes("thank") || lower.includes("that's all") || lower.includes("no") || lower.includes("nothing")) {
        return {
            message: "Thank you for calling. Have a great day!",
            action: 'end_call'
        };
    }

    // Voicemail keywords
    if (lower.includes("leave a message") || lower.includes("voicemail") || lower.includes("talk to someone") || lower.includes("speak to") || lower.includes("real person") || lower.includes("human")) {
        return {
            message: "Of course. Please leave a detailed message after the beep, and someone will get back to you shortly.",
            action: 'voicemail'
        };
    }

    // If we are already in an active flow (collected fields exist)
    const hasAnyFields = Object.keys(collected).length > 0;
    if (hasAnyFields) {
        const hasDescription = !!collected.description;
        const hasAddress = !!collected.address || (callerInfo?.address);

        const GARBLED_NAME_PATTERNS = /^(which is|which|what is|that is|this is|who is|how is|it is|there is|here is|let me|tell me|give me|help me)$/i;
        const callerNameIsValid = callerInfo
            && callerInfo.name !== 'Unknown Caller'
            && !GARBLED_NAME_PATTERNS.test(callerInfo.name.trim());
        const hasName = !!collected.name || callerNameIsValid;
        const hasContactPref = !!collected.contactPreference;

        if (!hasName) {
            return {
                message: "I'd be happy to help with that. Can I get your name to get started?",
                action: 'continue',
                collectedFields: {}
            };
        }

        if (!hasDescription) {
            return {
                message: `Thanks ${collected.name || callerInfo?.name}! What kind of issue are you experiencing?`,
                action: 'continue',
                collectedFields: {}
            };
        }

        if (!hasAddress) {
            return {
                message: "Got it. What is the full street address for the service?",
                action: 'continue',
                collectedFields: {}
            };
        }

        if (!hasContactPref) {
            return {
                message: "What is the best way to reach you — call, text, or email?",
                action: 'continue',
                collectedFields: {}
            };
        }

        // Recap and create ticket
        const addr = collected.address || callerInfo?.address || 'your address on file';
        const desc = collected.description || 'the service request';
        const cName = collected.name || callerInfo?.name || 'there';
        const contactPref = collected.contactPreference || 'text';

        return {
            message: `Got it, ${cName}. To recap, you need help with ${desc} at ${addr}. We will contact you by ${contactPref} once a technician is assigned. Is there anything else I can help with?`,
            action: 'create_ticket',
            collectedFields: {}
        };
    }

    // Default: ask for clarification — NEVER auto-create a ticket from ambiguous input
    return {
        message: "I want to make sure I help you correctly. Could you tell me a bit more about what you're looking for? For example, do you need to schedule a service, get a quote, or check on an existing job?",
        action: 'continue'
    };
}

// ============================================================================
// Context Helpers
// ============================================================================

interface CallerContext {
    name: string;
    phone: string;
    address?: string;
    customerId?: string;
    recentJobs: { id: string; description: string; status: string }[];
}

async function getCallerContext(phone: string): Promise<CallerContext | null> {
    if (!phone) return null;

    try {
        // Search customers by phone
        const customersSnap = await db.collection("customers")
            .where("phone", "==", phone)
            .limit(1)
            .get();

        let customerName = "Unknown Caller";
        let customerId = "";

        let customerAddress = '';
        if (!customersSnap.empty) {
            const customerData = customersSnap.docs[0].data();
            customerName = customerData.name || "Unknown Caller";
            customerId = customersSnap.docs[0].id;
            customerAddress = customerData.address || '';
        }

        // Search for recent jobs
        const jobsSnap = await db.collection("jobs")
            .where("customer.phone", "==", phone)
            .orderBy("createdAt", "desc")
            .limit(3)
            .get();

        const recentJobs = jobsSnap.docs.map(doc => ({
            id: doc.id,
            description: doc.data().request?.description || doc.data().description || "Service request",
            status: doc.data().status || "pending"
        }));

        return { name: customerName, phone, address: customerAddress, customerId, recentJobs };
    } catch (error) {
        console.warn("[Voice] Error getting caller context:", (error as Error).message);
        return null;
    }
}

async function createTicketFromVoice(
    phone: string,
    collected: Record<string, any>,
    orgId?: string,
    transcript?: { role: string; text: string; timestamp?: string }[]
) {
    const callerName = collected.name || "Unknown Caller";
    const address = collected.address || "";
    const description = collected.description || "Voice call Ã¢â‚¬â€ details in transcript";
    const urgency = collected.urgency || "normal";
    const availability = collected.availability || "";
    const email = collected.email || "";

    // Build a human-readable description from collected fields
    const richDescription = [
        description,
        address ? `Address: ${address}` : null,
        urgency === 'emergency' ? 'Ã¢Å¡Â Ã¯Â¸Â EMERGENCY' : null,
        availability ? `Availability: ${availability}` : null
    ].filter(Boolean).join('\n');

    // Find or create customer
    // Note: The codebase has both "org_id" and "organizationId" conventions.
    // Try org_id first (newer convention), fall back to organizationId, then phone-only.
    const customersRef = db.collection("customers");
    let snapshot;
    if (orgId) {
        // Try org_id first (newer records)
        snapshot = await customersRef.where("phone", "==", phone).where("org_id", "==", orgId).limit(1).get();
        if (snapshot.empty) {
            // Fall back to organizationId (older records)
            snapshot = await customersRef.where("phone", "==", phone).where("organizationId", "==", orgId).limit(1).get();
        }
    }
    if (!snapshot || snapshot.empty) {
        // Last resort: phone-only lookup
        snapshot = await customersRef.where("phone", "==", phone).limit(1).get();
    }

    let customerRef;
    let customerName = callerName;
    let customerId: string | null = null;

    if (!snapshot.empty) {
        customerRef = snapshot.docs[0].ref;
        customerName = snapshot.docs[0].data().name || callerName;
        customerId = snapshot.docs[0].id;
        // Update name if we learned it from the call and it was "Unknown"
        const updates: any = {};
        const currentName = snapshot.docs[0].data().name;
        if (callerName !== "Unknown Caller" && (!currentName || currentName === "Unknown Caller" || currentName === "New Customer" || currentName === phone)) {
            updates.name = callerName;
            customerName = callerName;
        }
        // Update email if we collected one and customer doesn't have one
        if (email && !snapshot.docs[0].data().email) {
            updates.email = email;
        }
        // Update address if we collected one and customer doesn't have one
        if (address && !snapshot.docs[0].data().address) {
            updates.address = address;
        }
        if (Object.keys(updates).length > 0) {
            await customerRef.update(updates);
        }
    } else {
        const newCustData: any = {
            phone,
            name: callerName,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            type: "LEAD"
        };
        if (orgId) newCustData.organizationId = orgId;
        if (address) newCustData.address = address;
        if (email) newCustData.email = email;
        customerRef = await customersRef.add(newCustData);
        customerId = customerRef.id;
    }

    const intent = collected.intent || "service_request";

    // 1. Create the ticket (audit trail)
    const ticketData: any = {
        requestorName: customerName,
        requestorPhone: phone,
        requestorEmail: email || null,
        address: address || null,
        customerRef,
        description: richDescription,
        source: "VOICE",
        status: "PENDING",
        intent: intent,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        collectedInfo: collected
    };
    if (orgId) ticketData.organizationId = orgId;
    if (transcript && transcript.length > 0) {
        ticketData.transcript = transcript; // Save full transcript
    }

    const ticketRef = await db.collection("tickets").add(ticketData);
    console.log(`[Voice] Created ticket ${ticketRef.id} from call by ${phone}`);

    const isQuoteRequest = intent === "quote_request";
    let createdJobId: string | null = null;

    // ALWAYS create a job, but set status based on intent
    const jobData: any = {
        status: isQuoteRequest ? "quote_pending" : "pending",
        priority: urgency === "emergency" ? "high" : "medium",
        customer: {
            name: customerName,
            phone: phone,
            address: address,
            email: email || null
        },
        request: {
            description: richDescription,
            photos: [],
            availability: availability ? [availability] : [],
            source: "voice",
            contactPreference: collected.contactPreference || null
        },
        collectedInfo: collected,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        ticketId: ticketRef.id
    };
    if (orgId) jobData.org_id = orgId;
    if (customerId) jobData.customer_id = customerId;

    const jobRef = await db.collection("jobs").add(jobData);
    createdJobId = jobRef.id;
    console.log(`[Voice] Created job ${jobRef.id} linked to ticket ${ticketRef.id} (QuoteRequest: ${isQuoteRequest})`);

    await ticketRef.update({ autoJobId: jobRef.id });

    // Generate access token for the voice-created ticket (fire-and-forget)
    try {
        const token = await createAccessToken({
            resourceType: 'ticket',
            resourceId: ticketRef.id,
            orgId: orgId || '',
            customerPhone: phone,
            customerEmail: email || undefined,
            customerName,
            permissions: ['view', 'reschedule'],
            createdBy: 'voice',
            expiresInDays: 90,
        });
        console.log(`[Voice] Generated token ${token} for ticket ${ticketRef.id}`);
    } catch (tokenErr) {
        console.warn('[Voice] Token generation failed:', (tokenErr as Error).message);
    }

    // 3. Auto-quote if org has it enabled (fire-and-forget Ã¢â‚¬â€ don't block the Twilio response)
    if (orgId) {
        try {
            const orgDoc = await db.collection("organizations").doc(orgId).get();
            if (orgDoc.exists && orgDoc.data()?.autoQuoteEnabled === true) {
                const { autoCreateJobAndQuote } = require("../portal");
                // Don't await Ã¢â‚¬â€ auto-quote can take 15+ seconds and would cause Twilio timeout
                autoCreateJobAndQuote(orgId, ticketRef.id, {
                    customerName,
                    customerPhone: phone,
                    customerEmail: "",
                    address,
                    description: richDescription,
                    urgency,
                    customerId
                }, { skipJobCreation: true, existingJobId: createdJobId }).then(async (result: { jobId?: string; quoteId?: string }) => {
                    console.log(`[Voice] Auto-quote triggered for ticket ${ticketRef.id}, quoteId: ${result.quoteId}`);

                    if (!result.quoteId) return;

                    const contactPref = collected.contactPreference || "text";
                    let quoteUrl = `https://portal.dispatchbox.com/quote/${result.quoteId}`;

                    // Generate token for the quote
                    try {
                        const quoteToken = await createAccessToken({
                            resourceType: 'quote',
                            resourceId: result.quoteId,
                            orgId: orgId!,
                            customerPhone: phone,
                            customerEmail: email || undefined,
                            customerName,
                            permissions: ['view', 'approve', 'decline'],
                            createdBy: 'voice',
                            expiresInDays: 90,
                        });
                        quoteUrl = `https://dispatch-box.com/t/${quoteToken}`;
                        console.log(`[Voice] Generated quote token ${quoteToken} for quote ${result.quoteId}`);
                    } catch (e) {
                        console.warn('[Voice] Quote token gen failed:', (e as Error).message);
                    }

                    // Look up the org's phone number for sending
                    let fromNumber = "";
                    try {
                        const subDoc = await db.collection("org_texting_subscriptions").doc(orgId).get();
                        if (subDoc.exists && subDoc.data()?.phoneNumber) {
                            fromNumber = subDoc.data()!.phoneNumber;
                        }
                    } catch (e) { /* use calledNumber */ }

                    // Get org name for messaging
                    let orgName = "our team";
                    try {
                        const orgNameDoc = await db.collection("organizations").doc(orgId).get();
                        if (orgNameDoc.exists && orgNameDoc.data()?.name) {
                            orgName = orgNameDoc.data()!.name;
                        }
                    } catch (e) { /* use default */ }

                    if (contactPref === "text" || contactPref === "sms") {
                        // Send immediate SMS with quote link
                        try {
                            const { sendSMS } = require("./sms");
                            await sendSMS(phone, `${orgName}: Your quote is ready for review! View and approve it here: ${quoteUrl}  Reply STOP to opt out.`, orgId, fromNumber);
                            console.log(`[Voice] Quote SMS sent to ${phone} for quote ${result.quoteId}`);
                        } catch (smsErr) {
                            console.warn("[Voice] Quote SMS failed:", (smsErr as Error).message);
                        }
                    } else if (contactPref === "email" && email) {
                        // Send email with quote link
                        try {
                            const { sendAutoFollowUpCommunication } = require("../customerCommunication");
                            await sendAutoFollowUpCommunication(
                                orgId,
                                result.jobId || createdJobId || "",
                                phone,
                                email,
                                "email",
                                `Hi ${customerName},\n\nYour quote from ${orgName} is ready for review!\n\nView and approve it here: ${quoteUrl}\n\nIf you have any questions, feel free to reply or give us a call.\n\nThanks,\n${orgName}`
                            );
                            console.log(`[Voice] Quote email sent to ${email} for quote ${result.quoteId}`);
                        } catch (emailErr) {
                            console.warn("[Voice] Quote email failed:", (emailErr as Error).message);
                            // Fallback to SMS if email fails and we have a phone
                            try {
                                const { sendSMS } = require("./sms");
                                await sendSMS(phone, `${orgName}: Your quote is ready for review! View and approve it here: ${quoteUrl}  Reply STOP to opt out.`, orgId, fromNumber);
                            } catch (smsErr2) {
                                console.warn("[Voice] Quote SMS fallback also failed:", (smsErr2 as Error).message);
                            }
                        }
                    } else if (contactPref === "call") {
                        // Create pending_callbacks entry for AI outbound call
                        try {
                            await db.collection("pending_callbacks").add({
                                orgId,
                                orgPhone: fromNumber,
                                customerPhone: phone,
                                customerName: customerName || "",
                                quoteId: result.quoteId,
                                jobId: result.jobId || createdJobId || "",
                                jobDescription: richDescription.substring(0, 200),
                                type: "quote_ready",
                                // Don't auto-call immediately — wait for tech to review the quote first.
                                // The callback status will be changed to "pending" when the tech approves
                                // the quote from the dashboard, which then triggers the 5-min processor.
                                status: "awaiting_review",
                                contactPreference: "call",
                                createdAt: admin.firestore.FieldValue.serverTimestamp()
                            });
                            console.log(`[Voice] Quote callback queued (awaiting tech review) for ${phone}, quoteId: ${result.quoteId}`);
                        } catch (cbErr) {
                            console.warn("[Voice] Callback creation failed:", (cbErr as Error).message);
                            // Fallback to SMS
                            try {
                                const { sendSMS } = require("./sms");
                                await sendSMS(phone, `${orgName}: Your quote is ready for review! View and approve it here: ${quoteUrl}  Reply STOP to opt out.`, orgId, fromNumber);
                            } catch (smsErr2) {
                                console.warn("[Voice] Callback SMS fallback also failed:", (smsErr2 as Error).message);
                            }
                        }
                    } else {
                        // Default fallback: send SMS
                        try {
                            const { sendSMS } = require("./sms");
                            await sendSMS(phone, `${orgName}: Your quote is ready for review! View and approve it here: ${quoteUrl}  Reply STOP to opt out.`, orgId, fromNumber);
                            console.log(`[Voice] Quote SMS (default) sent to ${phone} for quote ${result.quoteId}`);
                        } catch (smsErr) {
                            console.warn("[Voice] Default quote SMS failed:", (smsErr as Error).message);
                        }
                    }
                }).catch((quoteErr: Error) => {
                    console.warn("[Voice] Auto-quote failed (non-fatal):", quoteErr.message);
                });
            }
        } catch (quoteErr) {
            console.warn("[Voice] Auto-quote setup failed (non-fatal):", (quoteErr as Error).message);
        }
    }

    // Fire-and-forget: send portal link to every voice caller
    sendPortalLinkToCustomer(phone, orgId, email || undefined)
        .then(() => console.log(`[Voice] Portal link sent to ${phone} after ticket creation`))
        .catch((e: Error) => console.warn(`[Voice] Portal link send failed (non-fatal): ${e.message}`));

    return ticketRef;
}

/**
 * Build a properly XML-escaped Gather action URL.
 * Raw & must be &amp; inside XML attribute values.
 * noSpeechCount (nsc) tracks consecutive no-speech events for retry logic.
 */
function buildGatherAction(sessionId: string, from: string, to: string, turn: number, noSpeechCount: number = 0, absolute: boolean = false): string {
    // Build the URL then escape & for XML attribute context
    const base = absolute ? WEBHOOK_BASE_URL : '';
    const url = `${base}/handleVoiceGather?session=${encodeURIComponent(sessionId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&turn=${turn}&nsc=${noSpeechCount}`;
    return url.replace(/&/g, '&amp;');
}

/**
 * Schedule a retry callback in 5 minutes when the caller went silent.
 * Creates a doc in `scheduled_callbacks` collection for processScheduledCallbacks to pick up.
 */
async function scheduleRetryCallback(sessionId: string, callerPhone: string, calledNumber: string): Promise<void> {
    try {
        const sessionDoc = await db.collection("voice_sessions").doc(sessionId).get();
        const session = sessionDoc.exists ? sessionDoc.data()! : null;

        const callbackTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

        await db.collection("scheduled_callbacks").add({
            type: "voice_retry",
            callerPhone,
            calledNumber,
            sessionId,
            orgId: session?.orgId || null,
            orgName: session?.orgName || "DispatchBox",
            collected: session?.collected || {},
            transcript: session?.transcript || [],
            scheduledFor: admin.firestore.Timestamp.fromDate(callbackTime),
            status: "pending",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Update voice session status
        if (sessionDoc.exists) {
            await sessionDoc.ref.update({ status: "callback_scheduled", callbackScheduledFor: callbackTime });
        }

        console.log(`[Voice] Callback scheduled for ${callerPhone} at ${callbackTime.toISOString()}`);
    } catch (err) {
        console.error("[Voice] Error scheduling callback:", (err as Error).message);
    }
}

/**
 * Runs every minute. Picks up pending voice retry callbacks and initiates outbound calls.
 */
export const processScheduledCallbacks = functions.pubsub.schedule("every 1 minutes").onRun(async () => {
    const now = admin.firestore.Timestamp.now();

    const pendingSnap = await db.collection("scheduled_callbacks")
        .where("status", "==", "pending")
        .where("scheduledFor", "<=", now)
        .limit(10)
        .get();

    if (pendingSnap.empty) return null;

    console.log(`[Voice] Processing ${pendingSnap.size} scheduled callbacks`);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const twilio = require("twilio");
    const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
    const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_ACCOUNT_SID.startsWith("AC")) {
        console.error("[Voice] Twilio not configured for callbacks.");
        return null;
    }

    const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);


    for (const doc of pendingSnap.docs) {
        const cb = doc.data();
        try {
            // Look up the org's phone number to call FROM
            let fromNumber = cb.calledNumber; // Default: same number they called
            if (cb.orgId) {
                const subDoc = await db.collection("org_texting_subscriptions").doc(cb.orgId).get();
                if (subDoc.exists && subDoc.data()?.phoneNumber) {
                    fromNumber = subDoc.data()!.phoneNumber;
                }
            }

            // Create a new session for the callback
            const newSessionId = `voice_cb_${cb.callerPhone}_${Date.now()}`;
            await db.collection("voice_sessions").doc(newSessionId).set({
                callerPhone: cb.callerPhone,
                calledNumber: fromNumber,
                orgId: cb.orgId,
                orgName: cb.orgName,
                callForwardNumber: null,
                transcript: cb.transcript || [],
                collected: cb.collected || { name: null, address: null, description: null, urgency: null, availability: null, email: null },
                intent: "service_request",
                turn: (cb.transcript?.length || 0),
                status: "callback_active",
                originalSessionId: cb.sessionId,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Build a greeting that acknowledges it's a callback
            const orgName = escapeXml(cb.orgName || "DispatchBox");
            const turnNum = (cb.transcript?.length || 0) + 1;
            const gatherAction = buildGatherAction(newSessionId, cb.callerPhone, fromNumber, turnNum, 0, true);

            // Initiate the outbound call
            const call = await twilioClient.calls.create({
                to: cb.callerPhone,
                from: fromNumber,
                twiml: `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" action="${gatherAction}" timeout="10" speechTimeout="auto" language="en-US"><Say voice="Google.en-US-Neural2-F">Hi, this is Amy from ${orgName} calling you back. It looks like we may have had some connection issues on your earlier call. I'd love to pick up where we left off Ã¢â‚¬â€ how can I help you today?</Say></Gather><Say voice="Google.en-US-Neural2-F">No worries, feel free to call us back anytime. Have a great day!</Say><Hangup/></Response>`,
                timeout: 30
            });

            console.log(`[Voice] Callback call ${call.sid} initiated to ${cb.callerPhone}`);

            await doc.ref.update({
                status: "completed",
                callSid: call.sid,
                newSessionId,
                processedAt: admin.firestore.FieldValue.serverTimestamp()
            });

        } catch (err) {
            console.error(`[Voice] Callback failed for ${cb.callerPhone}:`, (err as Error).message);
            await doc.ref.update({
                status: "failed",
                error: (err as Error).message,
                processedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
    }

    return null;
});

/**
 * Escape XML special characters for TwiML.
 */
function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Sanitize text for TTS output.
 * Replaces Unicode characters (em-dashes, smart quotes, etc.) that Twilio TTS
 * may read aloud as garbled text (e.g. em-dash "\u2014" becomes "a euro").
 */
function sanitizeForTts(str: string): string {
    let cleaned = str
        .replace(/[\u2014\u2013]/g, ', ')   // em-dash, en-dash -> comma
        .replace(/[\u2018\u2019]/g, "'")    // smart single quotes
        .replace(/[\u201C\u201D]/g, '"')    // smart double quotes
        .replace(/[\u2026]/g, '...')         // ellipsis
        .replace(/[\u00A0]/g, ' ')           // non-breaking space
        .replace(/[^\x20-\x7E]/g, '');       // strip any remaining non-ASCII

    // Expand address abbreviations the AI may have missed (e.g. "Apt" → "Apartment")
    // This is a safety net — the system prompt instructs the AI to expand, but it
    // doesn't always comply. Running this ensures TTS never reads abbreviations.
    cleaned = expandAddressForSpeech(cleaned);

    return cleaned;
}

/**
 * Simple utility to guess timezone offset (UTC) from US area code.
 */
function getBusinessHoursOffset(phone: string): number {
    const ac = phone.replace(/\D/g, '').slice(-10, -7);
    if (!ac) return -5; // default EST
    const hst = ['808']; // Hawaii (UTC-10)
    const akst = ['907']; // Alaska (UTC-9)
    const pst = ['206','208','209','213','253','310','323','360','408','415','425','503','509','510','530','541','559','562','619','626','650','661','707','714','760','805','818','831','858','909','916','925','949','951'];
    const mst = ['208','303','307','385','406','435','480','505','520','575','602','623','702','719','720','775','801','928','970'];
    const cst = ['205','210','214','217','218','224','225','228','251','254','256','262','281','308','309','312','314','316','318','319','320','334','337','361','402','405','409','414','417','430','432','469','479','501','504','507','512','515','534','539','573','580','601','605','608','612','615','618','620','630','636','651','660','682','701','708','712','713','715','731','763','773','806','815','816','830','832','847','870','901','903','913','915','918','920','931','936','940','952','956','972','979'];
    if (hst.includes(ac)) return -10;
    if (akst.includes(ac)) return -9;
    if (pst.includes(ac)) return -8;
    if (mst.includes(ac)) return -7;
    if (cst.includes(ac)) return -6;
    return -5;
}

/**
 * Runs every 5 minutes. Picks up pending quote callbacks and initiates outbound calls
 * only if it is within their local business hours (8 AM - 6 PM).
 */
export const processPendingQuoteCallbacks = functions.pubsub.schedule("every 5 minutes").onRun(async () => {
    const pendingSnap = await db.collection("pending_callbacks")
        .where("status", "==", "pending")
        .limit(20)
        .get();

    if (pendingSnap.empty) {
        console.log("[Voice] No pending quote callbacks found.");
        return null;
    }

    const now = new Date();
    const utcHour = now.getUTCHours();
    console.log(`[Voice] Found ${pendingSnap.size} pending quote callbacks. UTC hour: ${utcHour}`);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const twilio = require("twilio");
    const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
    const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_ACCOUNT_SID.startsWith("AC")) {
        console.error("[Voice] Twilio not configured for quote callbacks.");
        return null;
    }
    const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

    for (const docSnap of pendingSnap.docs) {
        const cb = docSnap.data();
        const offset = getBusinessHoursOffset(cb.customerPhone || '');
        let localHour = utcHour + offset;
        if (localHour < 0) localHour += 24;
        else if (localHour >= 24) localHour -= 24;

        // Business hours: 8 AM to 6 PM local
        if (localHour >= 8 && localHour < 18) {
            try {
                let fromNumber = cb.orgPhone || "+1234567890"; // Default, replaced if org has number
                if (cb.orgId) {
                    const subDoc = await db.collection("org_texting_subscriptions").doc(cb.orgId).get();
                    if (subDoc.exists && subDoc.data()?.phoneNumber) {
                        fromNumber = subDoc.data()!.phoneNumber;
                    }
                }

                const sessionId = `quote_cb_${cb.customerPhone}_${Date.now()}`;
                
                // Get org name
                let orgName = "DispatchBox";
                if (cb.orgId) {
                    const orgDoc = await db.collection("organizations").doc(cb.orgId).get();
                    if (orgDoc.exists && orgDoc.data()?.name) {
                        orgName = orgDoc.data()!.name;
                    }
                }

                // Get job description for the greeting
                let jobDescription = cb.jobDescription || "";
                if (!jobDescription && cb.jobId) {
                    try {
                        const jobDoc = await db.collection("jobs").doc(cb.jobId).get();
                        if (jobDoc.exists) {
                            jobDescription = jobDoc.data()?.request?.description || jobDoc.data()?.type || "";
                        }
                    } catch (jobErr) {
                        console.warn(`[Voice] Could not fetch job description for ${cb.jobId}`);
                    }
                }

                // Sanitize customerName — filter out garbled STT names like "Which Is"
                const GARBLED_NAME_RE = /^(which is|which|what is|that is|this is|who is|how is|it is|there is|here is|let me|tell me|give me|help me|unknown caller)$/i;
                const rawCbName = cb.customerName || '';
                const cbNameIsValid = rawCbName && !GARBLED_NAME_RE.test(rawCbName.trim());
                const customerFirstName = escapeXml(cbNameIsValid ? rawCbName.split(' ')[0] : 'there');
                const escapedOrgName = escapeXml(orgName);
                const escapedJobDesc = jobDescription ? escapeXml(jobDescription.substring(0, 120)) : "";

                await db.collection("voice_sessions").doc(sessionId).set({
                    callerPhone: cb.customerPhone,
                    calledNumber: fromNumber,
                    orgId: cb.orgId,
                    quoteId: cb.quoteId,
                    jobId: cb.jobId,
                    customerName: cb.customerName || "",
                    jobDescription: jobDescription,
                    orgName: orgName,
                    status: "active",
                    intent: "quote_callback",
                    turn: 0,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });

                // Step 1: Introduce Amy, reference the work, and verify
                // the right person is on the line before discussing the quote.
                const availAction = `${WEBHOOK_BASE_URL}/handleQuoteCallbackAvailability?session=${encodeURIComponent(sessionId)}&from=${encodeURIComponent(fromNumber)}&to=${encodeURIComponent(cb.customerPhone)}`.replace(/&/g, '&amp;');

                // Strip address from job description so we only read the work scope aloud
                const workScope = escapedJobDesc
                    ? escapedJobDesc.split(/\n?Address:/i)[0].trim()
                    : "";
                const workClause = workScope ? ` for ${workScope}` : "";
                const greetingScript = `Hi, this is Amy from ${escapedOrgName}. I'm calling about your quote${workClause}. Am I speaking with ${customerFirstName}?`;

                const call = await twilioClient.calls.create({
                    to: cb.customerPhone,
                    from: fromNumber,
                    twiml: `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" action="${availAction}" timeout="8" speechTimeout="auto" language="en-US"><Say voice="Google.en-US-Neural2-F">${greetingScript}</Say></Gather><Say voice="Google.en-US-Neural2-F">No worries! I'll text you the quote to review at your convenience. Have a great day!</Say><Hangup/></Response>`,
                    timeout: 30
                });

                console.log(`[Voice] Quote Callback call ${call.sid} initiated to ${cb.customerPhone}`);

                await docSnap.ref.update({
                    status: "completed",
                    callSid: call.sid,
                    sessionId,
                    processedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } catch (err) {
                console.error(`[Voice] Quote Callback failed for ${cb.customerPhone}:`, (err as Error).message);
                await docSnap.ref.update({
                    status: "failed",
                    error: (err as Error).message,
                    processedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        } else {
            console.log(`[Voice] Skipping quote callback for ${cb.customerPhone} (local hour ${localHour})`);
        }
    }

    return null;
});

/**
 * handleQuoteCallbackAvailability — Step 2 of the callback flow.
 * After asking "Am I speaking with [name]?", this processes the customer's response.
 * If they confirm identity, we ask if they'd like to hear the quote details.
 * If they say no or are unclear, we offer to text the quote instead.
 */
export const handleQuoteCallbackAvailability = functions.https.onRequest(async (req, res) => {
    try {
        const { session: sessionId } = req.query;
        const { SpeechResult } = req.body;
        const speech = (SpeechResult || "").toLowerCase().trim();

        console.log(`[Quote Callback Avail] Session: ${sessionId}, Speech: "${SpeechResult}"`);

        const sessionDoc = await db.collection("voice_sessions").doc(sessionId as string).get();
        if (!sessionDoc.exists) {
            res.set("Content-Type", "text/xml");
            res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Google.en-US-Neural2-F">I'm sorry, we encountered an issue. Please call us back. Have a great day!</Say><Hangup/></Response>`);
            return;
        }

        const session = sessionDoc.data()!;
        const jobDesc = session.jobDescription ? ` for ${escapeXml(session.jobDescription.substring(0, 100))}` : "";
        const gatherAction = `${WEBHOOK_BASE_URL}/handleQuoteCallbackGather?session=${encodeURIComponent(sessionId as string)}&turn=1`.replace(/&/g, '&amp;');

        // ━━━ Greeting Interruption Detection ━━━
        // When the AI calls out, the greeting plays inside a <Gather>. If the customer
        // picks up and reflexively says "Hello" / "Hi" / "Hey" while the greeting is
        // still playing, Twilio barges in and sends the speech here. The customer never
        // heard who was calling or why. Detect this and REPLAY the full greeting.
        const greetingRetries = session._greetingRetries || 0;
        const isGreetingOnly = /^(hello|hi|hey|hey there|hi there|howdy|good morning|good afternoon|good evening|what|who|who's this|who is this|huh)[\s!?.]*$/i.test(speech);

        if (isGreetingOnly && greetingRetries < 2) {
            // Customer interrupted with a greeting — replay the full introduction
            console.log(`[Quote Callback Avail] Greeting interruption detected ("${speech}"), replaying greeting (retry ${greetingRetries + 1})`);
            await sessionDoc.ref.update({
                _greetingRetries: greetingRetries + 1,
                transcript: admin.firestore.FieldValue.arrayUnion(`User: ${SpeechResult}`, `AI: Greeting interrupted, replaying introduction.`)
            });

            // Reconstruct the greeting from session data
            const GARBLED_NAME_RE = /^(which is|which|what is|that is|this is|who is|how is|it is|there is|here is|let me|tell me|give me|help me|unknown caller)$/i;
            const rawName = session.customerName || '';
            const nameIsValid = rawName && !GARBLED_NAME_RE.test(rawName.trim());
            const firstName = escapeXml(nameIsValid ? rawName.split(' ')[0] : 'there');
            const escapedOrgName = escapeXml(session.orgName || 'DispatchBox');
            const escapedJobDesc = session.jobDescription ? escapeXml(session.jobDescription.substring(0, 120)) : '';
            const workScope = escapedJobDesc ? escapedJobDesc.split(/\n?Address:/i)[0].trim() : '';
            const workClause = workScope ? ` for ${workScope}` : '';

            const replayGreeting = `Oh hi ${firstName}! Sorry about that. This is Amy from ${escapedOrgName}. I'm calling about your quote${workClause}. Am I speaking with ${firstName}?`;

            // Point back to this same handler so the next response gets processed here
            const replayAction = `${WEBHOOK_BASE_URL}/handleQuoteCallbackAvailability?session=${encodeURIComponent(sessionId as string)}`.replace(/&/g, '&amp;');

            const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" action="${replayAction}" timeout="8" speechTimeout="auto" language="en-US"><Say voice="Google.en-US-Neural2-F">${replayGreeting}</Say></Gather><Say voice="Google.en-US-Neural2-F">No worries! I'll text you the quote to review at your convenience. Have a great day!</Say><Hangup/></Response>`;
            res.set("Content-Type", "text/xml");
            res.status(200).send(twiml);
            return;
        }

        // Check if customer confirmed identity
        // Note: "hello/hi/hey" are NOT in this list — they are handled above as greeting interruptions
        const isConfirmed = /\b(yes|yeah|yep|speaking|this is|here|that's me|correct|sure|go ahead|uh huh|it is|i am)\b/i.test(speech);
        const isNotAvailable = /\b(no|not available|not here|busy|wrong number|call back|later|wrong person)\b/i.test(speech);

        if (isConfirmed || (!isNotAvailable && speech.length > 0)) {
            // Identity confirmed — ask if they'd like to hear the quote details
            await sessionDoc.ref.update({ status: "identity_confirmed", turn: 1, transcript: admin.firestore.FieldValue.arrayUnion(`User: ${SpeechResult}`, `AI: Identity confirmed, asking about quote details.`) });

            const detailsScript = `Great! I have your quote ready. Would you like to hear the details now for approval, or would you prefer I send it to you by text or email?`;

            const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" action="${gatherAction}" timeout="10" speechTimeout="auto" language="en-US"><Say voice="Google.en-US-Neural2-F">${escapeXml(detailsScript)}</Say></Gather><Say voice="Google.en-US-Neural2-F">No worries! I'll text you the quote to review at your convenience. Have a great day!</Say><Hangup/></Response>`;
            res.set("Content-Type", "text/xml");
            res.status(200).send(twiml);
        } else {
            // Customer declined or asked to receive it another way — text the quote
            await sessionDoc.ref.update({ status: "details_declined", transcript: admin.firestore.FieldValue.arrayUnion(`User: ${SpeechResult}`, `AI: Customer declined details, texting quote.`) });

            // Send SMS with quote link
            try {
                const { sendSMS } = require("./sms");
                const quoteUrl = `https://portal.dispatchbox.com/quote/${session.quoteId}`;
                const subDoc = await db.collection("org_texting_subscriptions").doc(session.orgId).get();
                const fromNum = subDoc.exists ? subDoc.data()?.phoneNumber : session.calledNumber;
                await sendSMS(session.callerPhone, `Your quote${jobDesc} is ready for review! View and approve it here: ${quoteUrl}  Reply STOP to opt out.`, session.orgId, fromNum);
            } catch (smsErr) {
                console.warn("[Quote Callback] Avail SMS failed:", (smsErr as Error).message);
            }

            const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Google.en-US-Neural2-F">No problem at all! I'll send a text with the quote details so they can review it when they're ready. Have a great day!</Say><Hangup/></Response>`;
            res.set("Content-Type", "text/xml");
            res.status(200).send(twiml);
        }
    } catch (e) {
        console.error("Quote Callback Availability Error:", e);
        res.set("Content-Type", "text/xml");
        res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Google.en-US-Neural2-F">I'm sorry, we experienced a technical issue. We'll follow up by text. Have a great day!</Say><Hangup/></Response>`);
    }
});

export const handleQuoteCallbackGather = functions.https.onRequest(async (req, res) => {
    try {
        const { session: sessionId, turn: turnStr } = req.query;
        const { SpeechResult } = req.body;
        const turn = parseInt(turnStr as string || "1");

        console.log(`[Quote Callback] Session: ${sessionId}, Turn: ${turn}, Speech: "${SpeechResult}"`);
        const sessionDoc = await db.collection("voice_sessions").doc(sessionId as string).get();
        if (!sessionDoc.exists) {
            console.error(`[Quote Callback] Session ${sessionId} not found.`);
            res.set("Content-Type", "text/xml");
            res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Google.en-US-Neural2-F">I'm sorry, we encountered an issue. Please call us back. Have a great day!</Say><Hangup/></Response>`);
            return;
        }

        const session = sessionDoc.data()!;
        const speech = (SpeechResult || "").toLowerCase().trim();
        const quoteUrl = `https://portal.dispatchbox.com/quote/${session.quoteId}`;

        // Use session.turn from Firestore as the source of truth (not the query string)
        // The availability handler sets turn=1 on confirmation, so effectiveTurn starts at 2
        const effectiveTurn = (session.turn || 0) + 1;
        console.log(`[Quote Callback] Effective turn: ${effectiveTurn} (session.turn=${session.turn}, query.turn=${turn})`);

        // Increment turn in Firestore for next round
        await sessionDoc.ref.update({ turn: effectiveTurn });

        // Ã¢â€â‚¬Ã¢â€â‚¬ Helper: send quote link via SMS Ã¢â€â‚¬Ã¢â€â‚¬
        const sendQuoteLink = async () => {
            try {
                const { sendSMS } = require("./sms");
                await sendSMS(session.callerPhone, `Your quote is ready for review! View and approve it here: ${quoteUrl}  Reply STOP to opt out.`, session.orgId, session.calledNumber);
            } catch (smsErr) {
                console.warn("[Quote Callback] SMS failed:", (smsErr as Error).message);
            }
        };

        // Ã¢â€â‚¬Ã¢â€â‚¬ Helper: approve quote in Firestore + upsert customer Ã¢â€â‚¬Ã¢â€â‚¬
        const approveQuoteAndUpsertCustomer = async () => {
            try {
                await db.collection("quotes").doc(session.quoteId).update({
                    status: "approved", approvedAt: admin.firestore.FieldValue.serverTimestamp(), approvedVia: "ai_voice_callback"
                });
                if (session.jobId) {
                    await db.collection("jobs").doc(session.jobId).update({
                        quoteStatus: "approved", active_quote_id: session.quoteId, updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }
                // Upsert customer record
                const orgId = session.orgId;
                const custPhone = session.callerPhone;
                if (custPhone && orgId) {
                    const snap = await db.collection("customers").where("org_id", "==", orgId).where("phone", "==", custPhone).limit(1).get();
                    if (snap.empty) {
                        await db.collection("customers").add({
                            org_id: orgId, name: session.customerName || "", phone: custPhone, contactType: "Customer",
                            billing: { terms: "net30" }, approvedQuotes: [session.quoteId],
                            createdAt: admin.firestore.FieldValue.serverTimestamp(), source: "ai_voice_callback"
                        });
                    } else {
                        const cDoc = snap.docs[0];
                        const existing = cDoc.data().approvedQuotes || [];
                        if (!existing.includes(session.quoteId)) existing.push(session.quoteId);
                        await cDoc.ref.update({ approvedQuotes: existing, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
                    }
                }
            } catch (err) {
                console.error("[Quote Callback] Approve/upsert error:", (err as Error).message);
            }
        };

        const nextAction = `${WEBHOOK_BASE_URL}/handleQuoteCallbackGather?session=${encodeURIComponent(sessionId as string)}&amp;turn=${turn + 1}`;
        const jobDesc = session.jobDescription ? ` for the ${escapeXml(session.jobDescription.substring(0, 100))}` : "";

        // Ã¢â€â‚¬Ã¢â€â‚¬ Greeting detection Ã¢â€â‚¬Ã¢â€â‚¬
        if (/^(hello|hi|hey|hey there|hi there|good morning|good afternoon|good evening|howdy|what's up|yo|sup)[\s!?.]*$/i.test(speech) && effectiveTurn <= 2) {
            await sessionDoc.ref.update({ transcript: admin.firestore.FieldValue.arrayUnion(`User: ${SpeechResult}`, `AI: Re-prompted.`) });
            const t = `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" action="${nextAction}" timeout="8" speechTimeout="auto" language="en-US"><Say voice="Google.en-US-Neural2-F">Hi there! Your quote${jobDesc} is complete. Just a heads up, if any unforeseen issues come up during the work, your technician will go over those with you before proceeding. Would you like to approve the quote now so we can schedule your service, would you like it texted or emailed to review, or would you prefer someone call you to discuss?</Say></Gather><Say voice="Google.en-US-Neural2-F">No worries, I'll text you the quote to review. Have a great day!</Say><Hangup/></Response>`;
            res.set("Content-Type", "text/xml");
            res.status(200).send(t);
            return;
        }

        let twiml = `<?xml version="1.0" encoding="UTF-8"?><Response>`;

        // -- STEP 3: First response after "Would you like to hear the details?" --
        // If this is the first gather turn (effectiveTurn===2), the customer is
        // answering whether they want the quote read aloud.
        if (effectiveTurn === 2) {
            const wantsToHear = /\b(yes|yeah|yep|sure|go ahead|please|okay|ok|absolutely|definitely|tell me|hear|details|of course|let's hear|read)\b/i.test(speech);
            const wantsText = /\b(text|email|send|link|message)\b/i.test(speech);
            const hasQuestions = /\b(question|change|modify|adjust|concern|not sure|wondering|different|remove|add|cheaper|lower|too much|too high|price|cost)\b/i.test(speech);

            if (hasQuestions) {
                // Customer has questions or wants changes — ask them to describe
                await sessionDoc.ref.update({ status: "customer_has_questions", transcript: admin.firestore.FieldValue.arrayUnion(`User: ${SpeechResult}`, `AI: Customer has questions, asking for details.`) });
                const questionAction = `${WEBHOOK_BASE_URL}/handleQuoteCallbackGather?session=${encodeURIComponent(sessionId as string)}&amp;turn=${turn + 1}`;
                twiml += `<Gather input="speech" action="${questionAction}" timeout="15" speechTimeout="auto" language="en-US"><Say voice="Google.en-US-Neural2-F">Of course! Please go ahead and tell me what questions you have or what changes you'd like, and I'll make sure the technician gets your feedback right away.</Say></Gather>`;
                twiml += `<Say voice="Google.en-US-Neural2-F">No worries, I'll text you the quote and you can reply with any questions. Have a great day!</Say><Hangup/></Response>`;
                res.set("Content-Type", "text/xml");
                res.status(200).send(twiml);
                return;
            } else if (wantsText) {
                // Customer wants it texted/emailed
                twiml += `<Say voice="Google.en-US-Neural2-F">Sure thing! I'll send you the quote right now so you can review and approve it at your convenience. Have a great day!</Say><Hangup/></Response>`;
                await sendQuoteLink();
                await sessionDoc.ref.update({ status: "completed_text_sent", transcript: admin.firestore.FieldValue.arrayUnion(`User: ${SpeechResult}`, `AI: Sent quote via text.`) });
                res.set("Content-Type", "text/xml");
                res.status(200).send(twiml);
                return;
            } else if (wantsToHear) {
                // Customer explicitly wants to hear the quote — read it and offer options
                let quoteSpeech = "";
                try {
                    const quoteDoc = await db.collection("quotes").doc(session.quoteId).get();
                    if (quoteDoc.exists) {
                        const qData = quoteDoc.data()!;
                        const total = `$${(qData.total || 0).toFixed(2)}`;
                        const mode = qData.presentationMode || "single_price";
                        const items = (qData.lineItems || []).map((item: any) => ({
                            type: item.type || "labor",
                            description: item.description || "",
                            quantity: item.quantity || 1,
                            unitPrice: item.unitPrice || 0,
                            total: item.total || 0
                        }));
                        const { buildQuoteSpeech } = require("./outboundCall");
                        const discountInfo = (qData.discount && qData.discount > 0) ? { amount: qData.discount, reason: qData.discountReason || undefined } : undefined;
                        quoteSpeech = " " + buildQuoteSpeech(mode, total, items, discountInfo);
                    }
                } catch (qErr) {
                    console.warn("[Quote Callback] Failed to build quote speech:", (qErr as Error).message);
                }

                await sessionDoc.ref.update({ status: "details_presented", transcript: admin.firestore.FieldValue.arrayUnion(`User: ${SpeechResult}`, `AI: Reading quote details.`) });
                const optionsScript = `Here are your quote details.${quoteSpeech} Please keep in mind that while this quote reflects our best estimate, if any unforeseen issues arise during the work, your technician will review those changes with you before proceeding. Would you like to approve the quote now so we can get you scheduled, would you like me to text or email it to you for review, or do you have any questions or changes you'd like to discuss?`;
                twiml += `<Gather input="speech" action="${nextAction}" timeout="10" speechTimeout="auto" language="en-US"><Say voice="Google.en-US-Neural2-F">${escapeXml(optionsScript)}</Say></Gather>`;
                twiml += `<Say voice="Google.en-US-Neural2-F">No worries! I'll text you the quote to review at your convenience. Have a great day!</Say><Hangup/></Response>`;
                res.set("Content-Type", "text/xml");
                res.status(200).send(twiml);
                return;
            } else {
                // Unclear response — re-prompt without auto-reading the quote
                await sessionDoc.ref.update({ transcript: admin.firestore.FieldValue.arrayUnion(`User: ${SpeechResult || ""}`, `AI: Re-prompted for details preference.`) });
                twiml += `<Gather input="speech" action="${nextAction}" timeout="10" speechTimeout="auto" language="en-US"><Say voice="Google.en-US-Neural2-F">I'm sorry, I didn't quite catch that. Would you like me to read you the quote details, text them to you, or would you prefer to discuss with someone from our team?</Say></Gather>`;
                twiml += `<Say voice="Google.en-US-Neural2-F">No worries! I'll text you the quote to review at your convenience. Have a great day!</Say><Hangup/></Response>`;
                res.set("Content-Type", "text/xml");
                res.status(200).send(twiml);
                return;
            }
        }

        // -- Customer describing their questions/changes (after Amy prompted them) --
        // When the session is in "customer_has_questions" state, the customer's
        // response IS their question/feedback. Capture it verbatim and route to the tech.
        if (session.status === "customer_has_questions" && speech.length > 2) {
            const customerFeedback = SpeechResult || "Customer provided feedback via phone";
            twiml += `<Say voice="Google.en-US-Neural2-F">Got it! I've noted your feedback and the technician will review it and get back to you shortly. I'll also text you a link to the quote where you can add any additional details. Thank you for your time, and have a great day!</Say><Hangup/></Response>`;
            // Log the change request as a customer note on the quote
            try {
                const changeNote = {
                    text: customerFeedback,
                    createdAt: new Date().toISOString(),
                    author: "customer" as const,
                    type: "message" as const,
                    source: "ai_voice_callback"
                };
                const statusNote = {
                    text: "Customer requested changes via AI callback — awaiting technician review",
                    createdAt: new Date().toISOString(),
                    author: "system" as const,
                    type: "status_change" as const,
                    waitingFor: "tech" as const,
                };
                const quoteRef = db.collection("quotes").doc(session.quoteId);
                const qSnap = await quoteRef.get();
                const existingNotes = qSnap.exists ? (qSnap.data()!.customerNotes || []) : [];
                existingNotes.push(changeNote, statusNote);
                await quoteRef.update({
                    customerNotes: existingNotes,
                    status: "tech_review",
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } catch (crErr) {
                console.warn("[Quote Callback] Question/change note write failed:", (crErr as Error).message);
            }
            await sendQuoteLink();
            await sessionDoc.ref.update({ status: "completed_change_requested", transcript: admin.firestore.FieldValue.arrayUnion(`User: ${SpeechResult}`, `AI: Captured customer feedback, routed to tech.`) });
            res.set("Content-Type", "text/xml");
            res.status(200).send(twiml);
            return;
        }

        // -- Share Details (read quote without approving) --
        // Customer wants to hear the quote details before making a decision.
        // This does NOT approve the quote; it reads it and then re-prompts.
        if (speech.includes("detail") || speech.includes("hear") || speech.includes("tell me") || speech.includes("share") || speech.includes("what is") || speech.includes("what's the") || speech.includes("how much") || speech.includes("go over") || speech.includes("read") || speech.includes("repeat") || speech.includes("break") || speech.includes("breakdown")) {
            // Read the quote using the tech's preferred presentation mode
            let quoteSpeech = "";
            try {
                const quoteDoc = await db.collection("quotes").doc(session.quoteId).get();
                if (quoteDoc.exists) {
                    const qData = quoteDoc.data()!;
                    const total = `$${(qData.total || 0).toFixed(2)}`;
                    const mode = qData.presentationMode || "single_price";
                    const items = (qData.lineItems || []).map((item: any) => ({
                        type: item.type || "labor",
                        description: item.description || "",
                        quantity: item.quantity || 1,
                        unitPrice: item.unitPrice || 0,
                        total: item.total || 0
                    }));
                    const { buildQuoteSpeech } = require("./outboundCall");
                    const discountInfo = (qData.discount && qData.discount > 0) ? { amount: qData.discount, reason: qData.discountReason || undefined } : undefined;
                    quoteSpeech = buildQuoteSpeech(mode, total, items, discountInfo);
                }
            } catch (qErr) {
                console.warn("[Quote Callback] Failed to build quote speech:", (qErr as Error).message);
                quoteSpeech = "I wasn't able to pull up the details right now.";
            }

            await sessionDoc.ref.update({ transcript: admin.firestore.FieldValue.arrayUnion(`User: ${SpeechResult}`, `AI: Shared quote details (no approval).`) });
            twiml += `<Gather input="speech" action="${nextAction}" timeout="10" speechTimeout="auto" language="en-US"><Say voice="Google.en-US-Neural2-F">Of course! ${escapeXml(quoteSpeech)} Would you like to approve the quote and get scheduled, have it texted to you, or would you prefer someone from our team call you to discuss?</Say></Gather>`;
            twiml += `<Say voice="Google.en-US-Neural2-F">No worries, I'll text you the quote to review. Have a great day!</Say><Hangup/></Response>`;

        // -- Text/Email --
        } else if (speech.includes("text") || speech.includes("email") || speech.includes("link") || speech.includes("message") || speech.includes("send")) {
            twiml += `<Say voice="Google.en-US-Neural2-F">Sure thing! I'll send you the quote right now so you can review and approve it at your convenience. Have a great day!</Say><Hangup/></Response>`;
            await sendQuoteLink();
            await sessionDoc.ref.update({ status: "completed_text_sent", transcript: admin.firestore.FieldValue.arrayUnion(`User: ${SpeechResult}`, `AI: Sent quote.`) });

        // Ã¢â€ â‚¬Ã¢â€ â‚¬ Human discussion Ã¢â€ â‚¬Ã¢â€ â‚¬
        } else if (speech.includes("discuss") || speech.includes("talk") || speech.includes("call me") || speech.includes("call back") || speech.includes("someone call") || speech.includes("person") || speech.includes("human") || speech.includes("speak") || speech.includes("representative")) {
            twiml += `<Say voice="Google.en-US-Neural2-F">Absolutely! I'll have someone from our team call you to go over the quote before we schedule anything. They'll reach out shortly. Have a great day!</Say><Hangup/></Response>`;
            try {
                await db.collection("pending_callbacks").add({
                    orgId: session.orgId, customerPhone: session.callerPhone, customerName: session.customerName || "",
                    quoteId: session.quoteId, jobId: session.jobId || "", type: "human_followup",
                    status: "needs_human_callback", reason: "Customer wants to discuss quote before scheduling",
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } catch (e2) { console.warn("[Quote Callback] Human CB write failed"); }
            await sessionDoc.ref.update({ status: "completed_human_requested", transcript: admin.firestore.FieldValue.arrayUnion(`User: ${SpeechResult}`, `AI: Human callback queued.`) });

        // —— Approve + Schedule ——
        } else if (speech.includes("approve") || speech.includes("accept") || speech.includes("yes") || speech.includes("yeah") || speech.includes("yep") || speech.includes("sure") || speech.includes("go ahead") || speech.includes("schedule") || speech.includes("okay") || speech.includes("sounds good") || speech.includes("let's do it") || speech.includes("book")) {
            const qDoc = await db.collection("quotes").doc(session.quoteId).get();
            const total = qDoc.exists ? (qDoc.data()!.total || 0).toFixed(2) : "unknown";
            await approveQuoteAndUpsertCustomer();

            // Look up the assigned tech for schedule-aware scheduling
            let assignedTechId: string | null = null;
            if (session.jobId) {
                try {
                    const jobDoc = await db.collection("jobs").doc(session.jobId).get();
                    assignedTechId = jobDoc.exists ? (jobDoc.data()!.assigned_to || jobDoc.data()!.assigned_technician_id || null) : null;
                } catch (e) { /* no assigned tech */ }
            }

            await sessionDoc.ref.update({
                status: "approved_scheduling",
                assignedTechId: assignedTechId || null,
                transcript: admin.firestore.FieldValue.arrayUnion(`User: ${SpeechResult}`, `AI: Approved ($${total}), asking customer for preferred day.`)
            });
            await sendQuoteLink();

            // Ask the customer what day works — DON'T immediately dump slots
            const schedAction = `${WEBHOOK_BASE_URL}/handleQuoteSchedulingGather?session=${encodeURIComponent(sessionId as string)}&amp;turn=1`;
            twiml += `<Gather input="speech" action="${schedAction}" timeout="10" speechTimeout="auto" language="en-US"><Say voice="Google.en-US-Neural2-F">Great! Your quote${jobDesc} comes to $${total} and has been approved. I'll also text you a copy for your records. Now let's get you scheduled. What day of the week works best for you?</Say></Gather>`;
            twiml += `<Say voice="Google.en-US-Neural2-F">No worries, I'll text you to schedule at your convenience. Have a great day!</Say><Hangup/></Response>`;

        // â”€â”€ Change Request (customer wants to modify the quote) â”€â”€
        } else if (speech.includes("change") || speech.includes("modify") || speech.includes("adjust") || speech.includes("different") || speech.includes("remove") || speech.includes("cheaper") || speech.includes("lower") || speech.includes("less") || speech.includes("add something") || speech.includes("question about") || speech.includes("not sure about") || speech.includes("can we") || speech.includes("what if") || speech.includes("instead") || speech.includes("just the") || speech.includes("only the") || speech.includes("too much") || speech.includes("too high") || speech.includes("price") || speech.includes("cost")) {
            twiml += `<Say voice="Google.en-US-Neural2-F">Absolutely, I understand! Let me note your request for changes and have the technician review it. They'll update the quote and get back to you shortly. In the meantime, I'll text you a link to the current quote where you can also submit any additional details. Have a great day!</Say><Hangup/></Response>`;
            // Log the change request as a customer note
            try {
                const changeNote = {
                    text: SpeechResult || "Customer requested changes via phone",
                    createdAt: new Date().toISOString(),
                    author: "customer",
                    source: "ai_voice_callback"
                };
                const quoteRef = db.collection("quotes").doc(session.quoteId);
                const qSnap = await quoteRef.get();
                const existingNotes = qSnap.exists ? (qSnap.data()!.customerNotes || []) : [];
                existingNotes.push(changeNote);
                await quoteRef.update({
                    customerNotes: existingNotes,
                    status: "tech_review",
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            } catch (crErr) {
                console.warn("[Quote Callback] Change request note write failed:", (crErr as Error).message);
            }
            await sendQuoteLink();
            await sessionDoc.ref.update({ status: "completed_change_requested", transcript: admin.firestore.FieldValue.arrayUnion(`User: ${SpeechResult}`, `AI: Change request logged, texted quote link.`) });

        // Ã¢â€â‚¬Ã¢â€â‚¬ Decline Ã¢â€â‚¬Ã¢â€â‚¬
        } else if (speech.includes("no") || speech.includes("not interested") || speech.includes("cancel") || speech.includes("never mind") || speech.includes("not right now")) {
            twiml += `<Say voice="Google.en-US-Neural2-F">No problem at all! If you change your mind, feel free to give us a call. Have a great day!</Say><Hangup/></Response>`;
            await sessionDoc.ref.update({ status: "completed_declined", transcript: admin.firestore.FieldValue.arrayUnion(`User: ${SpeechResult}`, `AI: Declined.`) });

        // Ã¢â€â‚¬Ã¢â€â‚¬ Unclear Ã¢â€â‚¬Ã¢â€â‚¬
        } else {
            if (effectiveTurn <= 3) {
                twiml += `<Gather input="speech" action="${nextAction}" timeout="8" speechTimeout="auto" language="en-US"><Say voice="Google.en-US-Neural2-F">I'm sorry, I didn't quite catch that. You can approve the quote now to get scheduled, I can text or email it to you, or I can have someone call you to discuss. What would you prefer?</Say></Gather>`;
                twiml += `<Say voice="Google.en-US-Neural2-F">No worries, I'll text you the quote. Have a great day!</Say><Hangup/></Response>`;
                await sessionDoc.ref.update({ transcript: admin.firestore.FieldValue.arrayUnion(`User: ${SpeechResult || "No speech"}`, `AI: Re-prompted.`) });
            } else {
                twiml += `<Say voice="Google.en-US-Neural2-F">No worries! I'll text you the quote so you can review it. Have a great day!</Say><Hangup/></Response>`;
                await sendQuoteLink();
                await sessionDoc.ref.update({ status: "completed_fallback", transcript: admin.firestore.FieldValue.arrayUnion(`User: ${SpeechResult || ""}`, `AI: Fallback texted.`) });
            }
        }

        res.set("Content-Type", "text/xml");
        res.status(200).send(twiml);
    } catch (e) {
        console.error("Quote Callback Gather Error:", e);
        res.set("Content-Type", "text/xml");
        res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Google.en-US-Neural2-F">I'm sorry, we experienced a technical issue. We'll follow up by text. Have a great day!</Say><Hangup/></Response>`);
    }
});

/**
 * handleQuoteSchedulingGather — After on-call quote approval, handles time slot selection.
 */
export const handleQuoteSchedulingGather = functions.https.onRequest(async (req, res) => {
    try {
        const { session: sessionId, turn: turnStr } = req.query;
        const { SpeechResult } = req.body;
        const turn = parseInt(turnStr as string || "1");
        console.log(`[Quote Scheduling] Session: ${sessionId}, Turn: ${turn}, Speech: "${SpeechResult}"`);

        const sessionDoc = await db.collection("voice_sessions").doc(sessionId as string).get();
        if (!sessionDoc.exists) {
            res.set("Content-Type", "text/xml");
            res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Google.en-US-Neural2-F">Sorry, we hit an issue. We'll follow up by text. Have a great day!</Say><Hangup/></Response>`);
            return;
        }

        const session = sessionDoc.data()!;
        const speech = (SpeechResult || "").toLowerCase().trim();
        let twiml = `<?xml version="1.0" encoding="UTF-8"?><Response>`;
        const nextAction = `${WEBHOOK_BASE_URL}/handleQuoteSchedulingGather?session=${encodeURIComponent(sessionId as string)}&amp;turn=${turn + 1}`;

        // Helper: send SMS fallback with all available slots
        const sendSlotsSMS = async (slots: any[]) => {
            try {
                const { sendSMS } = require("./sms");
                const subDoc = await db.collection("org_texting_subscriptions").doc(session.orgId).get();
                const fromNum = subDoc.exists ? subDoc.data()?.phoneNumber : session.calledNumber;
                const list = slots.map((s: any, i: number) => `${i+1}. ${s.dayLabel} ${s.startTime}-${s.endTime}`).join("\n");
                await sendSMS(session.callerPhone, `${session.orgName || 'Our team'}: Your quote is approved! 🎉\n${list}\n\nReply with your preferred time number. Reply STOP to opt out.`, session.orgId, fromNum);
            } catch (e2) { console.warn("[Scheduling] Slot SMS failed"); }
        };

        // ===== TURN 1: Customer tells us what day works =====
        if (!session.availableSlots || session.availableSlots.length === 0) {
            const { computeAvailableSlots } = require("./outboundCall");
            const techId = session.assignedTechId || null;
            const allSlots = await computeAvailableSlots(session.orgId, techId);

            // Parse requested days from speech
            const dayNames = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
            const requestedDays = dayNames.filter(d => speech.includes(d));
            // Also detect relative terms
            const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
            const dayOfWeekNames = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
            if (speech.includes("tomorrow")) requestedDays.push(dayOfWeekNames[tomorrow.getDay()]);
            if (speech.includes("today")) requestedDays.push(dayOfWeekNames[new Date().getDay()]);
            // Time-of-day preference
            const wantsMorning = /\b(morning|early|am)\b/i.test(speech);
            const wantsAfternoon = /\b(afternoon|later|pm|evening)\b/i.test(speech);

            let matchingSlots = allSlots;
            if (requestedDays.length > 0) {
                matchingSlots = allSlots.filter((s: any) => requestedDays.includes(s.dayLabel?.toLowerCase()));
            }
            if (wantsMorning) matchingSlots = matchingSlots.filter((s: any) => s.spoken?.includes("morning"));
            if (wantsAfternoon) matchingSlots = matchingSlots.filter((s: any) => s.spoken?.includes("afternoon") || s.spoken?.includes("evening"));

            // If no matches for their preference, offer all slots
            if (matchingSlots.length === 0 && requestedDays.length > 0) {
                const availDays = [...new Set(allSlots.map((s: any) => s.dayLabel))].join(", ");
                await sessionDoc.ref.update({ availableSlots: allSlots, transcript: admin.firestore.FieldValue.arrayUnion(`User: ${SpeechResult}`, `AI: No availability on requested day, offering alternatives.`) });
                twiml += `<Gather input="speech" action="${nextAction}" timeout="10" speechTimeout="auto" language="en-US"><Say voice="Google.en-US-Neural2-F">I'm sorry, we don't have availability on ${requestedDays.join(" or ")}. We do have openings on ${escapeXml(availDays)}. Which of those days would work for you?</Say></Gather>`;
                twiml += `<Say voice="Google.en-US-Neural2-F">No worries, I'll text you the available times. Have a great day!</Say><Hangup/></Response>`;
                res.set("Content-Type", "text/xml"); res.status(200).send(twiml); return;
            }

            // If no day specified at all (unclear speech), ask again
            if (requestedDays.length === 0 && !wantsMorning && !wantsAfternoon && speech.length < 3) {
                const availDays = [...new Set(allSlots.map((s: any) => s.dayLabel))].join(", ");
                await sessionDoc.ref.update({ transcript: admin.firestore.FieldValue.arrayUnion(`User: ${SpeechResult || ""}`, `AI: Re-asking for day preference.`) });
                twiml += `<Gather input="speech" action="${nextAction}" timeout="10" speechTimeout="auto" language="en-US"><Say voice="Google.en-US-Neural2-F">I didn't quite catch that. We have availability on ${escapeXml(availDays)}. What day works best for you, or would you prefer morning or afternoon?</Say></Gather>`;
                twiml += `<Say voice="Google.en-US-Neural2-F">No worries, I'll text you the available times. Have a great day!</Say><Hangup/></Response>`;
                res.set("Content-Type", "text/xml"); res.status(200).send(twiml); return;
            }

            // Present matching slots
            const slotsToOffer = matchingSlots.slice(0, 3);
            await sessionDoc.ref.update({ availableSlots: slotsToOffer, transcript: admin.firestore.FieldValue.arrayUnion(`User: ${SpeechResult}`, `AI: Presenting ${slotsToOffer.length} slots matching preference.`) });

            let slotSpeech = "";
            if (slotsToOffer.length === 1) slotSpeech = `We have an opening ${escapeXml(slotsToOffer[0].spoken)}. Does that work for you?`;
            else if (slotsToOffer.length === 2) slotSpeech = `Option 1, ${escapeXml(slotsToOffer[0].spoken)}. Or option 2, ${escapeXml(slotsToOffer[1].spoken)}. Which works best?`;
            else slotSpeech = `Option 1, ${escapeXml(slotsToOffer[0].spoken)}. Option 2, ${escapeXml(slotsToOffer[1].spoken)}. Or option 3, ${escapeXml(slotsToOffer[2].spoken)}. Which works best?`;

            twiml += `<Gather input="speech" action="${nextAction}" timeout="10" speechTimeout="auto" language="en-US"><Say voice="Google.en-US-Neural2-F">${slotSpeech}</Say></Gather>`;
            twiml += `<Say voice="Google.en-US-Neural2-F">No worries, I'll text you the available times. Have a great day!</Say><Hangup/></Response>`;
            res.set("Content-Type", "text/xml"); res.status(200).send(twiml); return;
        }

        // ===== TURN 2+: Customer picks from presented slots =====
        const slots = session.availableSlots || [];
        let chosen: any = null;

        const isRejection = /\b(neither|none|not those|nope|no|don't work|doesn't work|won't work|none of)\b/i.test(speech);

        if (!isRejection) {
            if ((/\bone\b/i.test(speech) || speech.includes("1") || /\bfirst\b/i.test(speech)) && slots[0]) chosen = slots[0];
            else if ((/\btwo\b/i.test(speech) || speech.includes("2") || /\bsecond\b/i.test(speech)) && slots[1]) chosen = slots[1];
            else if ((/\bthree\b/i.test(speech) || speech.includes("3") || /\bthird\b/i.test(speech)) && slots[2]) chosen = slots[2];
            else if ((/\b(yes|sure|sounds good|that works|perfect)\b/i.test(speech)) && slots[0]) chosen = slots[0];
            else if (/\bmorning\b/i.test(speech)) chosen = slots.find((s: any) => s.spoken?.includes("morning"));
            else if (/\bafternoon\b/i.test(speech)) chosen = slots.find((s: any) => s.spoken?.includes("afternoon"));
        }

        // Day-of-week match within available slots
        if (!chosen && !isRejection) {
            for (const day of ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]) {
                if (speech.includes(day)) { chosen = slots.find((s: any) => s.dayLabel?.toLowerCase() === day); break; }
            }
        }

        // If they mentioned a new day not in current slots, recompute
        if (!chosen && !isRejection) {
            const dayNames = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
            const newDays = dayNames.filter(d => speech.includes(d));
            const currentDays = slots.map((s: any) => s.dayLabel?.toLowerCase()).filter(Boolean);
            if (newDays.length > 0 && !newDays.some(d => currentDays.includes(d))) {
                // Customer wants a different day — recompute
                await sessionDoc.ref.update({ availableSlots: admin.firestore.FieldValue.delete() });
                // Re-enter turn 1 logic by redirecting
                const reAction = `${WEBHOOK_BASE_URL}/handleQuoteSchedulingGather?session=${encodeURIComponent(sessionId as string)}&amp;turn=${turn + 1}`;
                twiml += `<Redirect method="POST">${reAction}</Redirect></Response>`;
                // Store the speech so the redirect can use it
                await sessionDoc.ref.update({ availableSlots: admin.firestore.FieldValue.delete(), pendingSpeech: SpeechResult, transcript: admin.firestore.FieldValue.arrayUnion(`User: ${SpeechResult}`, `AI: Customer wants different day, recomputing.`) });
                res.set("Content-Type", "text/xml"); res.status(200).send(twiml); return;
            }
        }

        // ===== Check if we're confirming a pending slot =====
        if (session.pendingSlot) {
            const pending = session.pendingSlot;
            const isConfirm = /\b(yes|yeah|yep|correct|right|sure|that's right|perfect|sounds good|go ahead|confirm|book it|that works)\b/i.test(speech);
            const isDeny = /\b(no|nope|wrong|not right|incorrect|different|change|actually)\b/i.test(speech);

            if (isConfirm) {
                // Customer confirmed — NOW book it
                if (session.jobId) {
                    await db.collection("jobs").doc(session.jobId).update({
                        status: "scheduled", scheduledDate: pending.date, scheduledTime: pending.startTime,
                        scheduledWindow: `${pending.startTime} - ${pending.endTime}`, scheduledDay: pending.dayLabel,
                        scheduledAt: admin.firestore.Timestamp.now(), scheduledVia: "ai_quote_callback"
                    });
                }
                await sessionDoc.ref.update({ status: "completed_scheduled", chosenSlot: pending, pendingSlot: admin.firestore.FieldValue.delete(), transcript: admin.firestore.FieldValue.arrayUnion(`User: ${SpeechResult}`, `AI: Confirmed and scheduled ${pending.spoken}.`) });
                try {
                    const { sendSMS } = require("./sms");
                    const subDoc = await db.collection("org_texting_subscriptions").doc(session.orgId).get();
                    const fromNum = subDoc.exists ? subDoc.data()?.phoneNumber : session.calledNumber;
                    await sendSMS(session.callerPhone, `✅ ${session.orgName || 'Our team'}: Appointment confirmed for ${pending.dayLabel}, ${pending.date} from ${pending.startTime} to ${pending.endTime}. A technician will arrive during this window. Reply STOP to opt out.`, session.orgId, fromNum);
                } catch (e2) { console.warn("[Scheduling] SMS failed:", (e2 as Error).message); }
                twiml += `<Say voice="Google.en-US-Neural2-F">Perfect! You're all set for ${escapeXml(pending.spoken)}. We've sent you a confirmation text as well. Thank you for choosing ${escapeXml(session.orgName || 'us')}. Have a wonderful day!</Say><Hangup/></Response>`;
            } else if (isDeny) {
                // Customer said it's wrong — clear pending and re-offer
                const slotList = slots.map((s: any, i: number) => `option ${i+1}, ${s.spoken}`).join(". ");
                await sessionDoc.ref.update({ pendingSlot: admin.firestore.FieldValue.delete(), transcript: admin.firestore.FieldValue.arrayUnion(`User: ${SpeechResult}`, `AI: Customer rejected confirmation, re-offering.`) });
                twiml += `<Gather input="speech" action="${nextAction}" timeout="10" speechTimeout="auto" language="en-US"><Say voice="Google.en-US-Neural2-F">No problem! Let me re-read the options. ${escapeXml(slotList)}. Which one works best, or would you prefer a different day?</Say></Gather>`;
                twiml += `<Say voice="Google.en-US-Neural2-F">No worries, I'll text you the available times. Have a great day!</Say><Hangup/></Response>`;
            } else {
                // Unclear — re-ask confirmation
                await sessionDoc.ref.update({ transcript: admin.firestore.FieldValue.arrayUnion(`User: ${SpeechResult || ""}`, `AI: Re-asking confirmation.`) });
                twiml += `<Gather input="speech" action="${nextAction}" timeout="10" speechTimeout="auto" language="en-US"><Say voice="Google.en-US-Neural2-F">I'm sorry, I didn't catch that. Just to confirm, I have you down for ${escapeXml(pending.spoken)}. Is that correct?</Say></Gather>`;
                twiml += `<Say voice="Google.en-US-Neural2-F">No worries, I'll text you to confirm at your convenience. Have a great day!</Say><Hangup/></Response>`;
            }
            res.set("Content-Type", "text/xml"); res.status(200).send(twiml); return;
        }

        if (chosen) {
            // Don't book yet — ask for confirmation first
            await sessionDoc.ref.update({ pendingSlot: chosen, transcript: admin.firestore.FieldValue.arrayUnion(`User: ${SpeechResult}`, `AI: Asking to confirm ${chosen.spoken}.`) });
            twiml += `<Gather input="speech" action="${nextAction}" timeout="10" speechTimeout="auto" language="en-US"><Say voice="Google.en-US-Neural2-F">Just to confirm, I have you down for ${escapeXml(chosen.spoken)}. Is that correct?</Say></Gather>`;
            twiml += `<Say voice="Google.en-US-Neural2-F">No worries, I'll text you to confirm at your convenience. Have a great day!</Say><Hangup/></Response>`;
        } else if (isRejection) {
            if (turn <= 3) {
                // Clear slots and ask for a new day preference
                await sessionDoc.ref.update({ availableSlots: admin.firestore.FieldValue.delete(), transcript: admin.firestore.FieldValue.arrayUnion(`User: ${SpeechResult}`, `AI: Customer rejected, asking for new day.`) });
                twiml += `<Gather input="speech" action="${nextAction}" timeout="10" speechTimeout="auto" language="en-US"><Say voice="Google.en-US-Neural2-F">I understand those don't work. What day of the week would be better for you?</Say></Gather>`;
                twiml += `<Say voice="Google.en-US-Neural2-F">No worries, I'll text you the available times. Have a great day!</Say><Hangup/></Response>`;
            } else {
                await sendSlotsSMS(slots);
                twiml += `<Say voice="Google.en-US-Neural2-F">No worries! I've texted you the available times so you can pick one at your convenience. Have a great day!</Say><Hangup/></Response>`;
                await sessionDoc.ref.update({ status: "completed_schedule_sms", transcript: admin.firestore.FieldValue.arrayUnion(`User: ${SpeechResult || ""}`, `AI: SMS slots sent.`) });
            }
        } else if (turn <= 3) {
            twiml += `<Gather input="speech" action="${nextAction}" timeout="8" speechTimeout="auto" language="en-US"><Say voice="Google.en-US-Neural2-F">I'm sorry, I didn't quite catch that. Could you tell me which option works best? You can say option 1, option 2, or option 3, or tell me a different day that works.</Say></Gather>`;
            twiml += `<Say voice="Google.en-US-Neural2-F">No worries, I'll text you the available times. Have a great day!</Say><Hangup/></Response>`;
            await sessionDoc.ref.update({ transcript: admin.firestore.FieldValue.arrayUnion(`User: ${SpeechResult || ""}`, `AI: Re-prompted scheduling.`) });
        } else {
            await sendSlotsSMS(slots);
            twiml += `<Say voice="Google.en-US-Neural2-F">No worries! I've texted you the available times so you can pick one at your convenience. Have a great day!</Say><Hangup/></Response>`;
            await sessionDoc.ref.update({ status: "completed_schedule_sms", transcript: admin.firestore.FieldValue.arrayUnion(`User: ${SpeechResult || ""}`, `AI: SMS slots sent.`) });
        }

        res.set("Content-Type", "text/xml");
        res.status(200).send(twiml);
    } catch (e) {
        console.error("Quote Scheduling Error:", e);
        res.set("Content-Type", "text/xml");
        res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Google.en-US-Neural2-F">I'm sorry, we hit a technical issue. We'll follow up by text. Have a great day!</Say><Hangup/></Response>`);
    }
});

// ============================================================================
// Session Cleanup — sweep orphaned "active" sessions to "abandoned"
// Runs every 15 minutes. Sessions older than 30 minutes with no update
// are considered abandoned (caller hung up without completing the flow).
// ============================================================================
export const cleanupAbandonedVoiceSessions = functions.pubsub
    .schedule('every 15 minutes')
    .timeZone('America/Los_Angeles')
    .onRun(async () => {
        const cutoff = admin.firestore.Timestamp.fromDate(
            new Date(Date.now() - 30 * 60 * 1000) // 30 minutes ago
        );

        try {
            // Find active sessions that haven't been updated in 30+ minutes
            const staleSnapshot = await db.collection("voice_sessions")
                .where("status", "==", "active")
                .where("updatedAt", "<", cutoff)
                .limit(50) // Process in batches to avoid timeouts
                .get();

            if (staleSnapshot.empty) {
                console.log("[Voice Cleanup] No stale sessions found.");
                return null;
            }

            const batch = db.batch();
            let count = 0;

            for (const doc of staleSnapshot.docs) {
                const session = doc.data();
                const hasTranscript = session.transcript && session.transcript.length > 0;
                const hasCollected = session.collected && Object.keys(session.collected).some(
                    (k: string) => !k.startsWith('_') && session.collected[k]
                );

                batch.update(doc.ref, {
                    status: "abandoned",
                    abandonedAt: admin.firestore.FieldValue.serverTimestamp(),
                    abandonReason: hasTranscript
                        ? `Caller disconnected after ${session.transcript.length} transcript entries`
                        : "No interaction recorded — likely an immediate hangup",
                    // Preserve partial data for dispatcher review if any was collected
                    ...(hasCollected ? { partialDataAvailable: true } : {})
                });
                count++;
            }

            await batch.commit();
            console.log(`[Voice Cleanup] Marked ${count} sessions as abandoned.`);
            return null;
        } catch (error) {
            console.error("[Voice Cleanup] Error:", (error as Error).message);
            return null;
        }
    });
