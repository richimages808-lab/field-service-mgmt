import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

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
                // Found the org — get the org name + call settings
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
    try {
        const configDoc = await db.collection("ai_agent_config").doc(orgId).get();
        if (!configDoc.exists) return null;
        const data = configDoc.data()!;
        return {
            faqs: data.faqs || [],
            services: data.services || [],
            businessHours: data.businessHours || '',
            serviceArea: data.serviceArea || '',
            specialInstructions: data.specialInstructions || ''
        };
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
        // Deduplicate — don't log the same question twice within 24 hours
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

    const org = await getOrgForNumber(to);
    const companyName = org?.orgName || "DispatchBox";
    const sessionId = `voice_${from}_${Date.now()}`;

    // Create session in Firestore for multi-turn memory
    await db.collection("voice_sessions").doc(sessionId).set({
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
    });

    // Build the initial greeting
    // If no speech after greeting, redirect to gather handler with nsc=1 to start retry loop
    const gatherAction = buildGatherAction(sessionId, from, to, 1);
    const retryAction = buildGatherAction(sessionId, from, to, 1, 1);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" action="${gatherAction}" timeout="15" speechTimeout="auto" language="en-US">
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
            "Are you still there? I'd love to help — just let me know what you need.",
            "It sounds like we may be having some connection trouble. No worries at all — we'll give you a call right back in about 5 minutes to pick up where we left off."
        ];

        if (noSpeechCount < 2) {
            // Retry — ask again with a friendly prompt
            const retryAction = buildGatherAction(sessionId, from, to, turn, noSpeechCount + 1);
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" action="${retryAction}" timeout="10" speechTimeout="auto" language="en-US">
        <Say voice="Google.en-US-Neural2-F">${retryPrompts[noSpeechCount]}</Say>
    </Gather>
    <Redirect>${retryAction.replace(/&amp;/g, '&amp;amp;')}</Redirect>
</Response>`;
            res.set("Content-Type", "text/xml");
            return res.status(200).send(twiml);
        }

        // 3rd failure — schedule a callback in 5 minutes and hang up
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
        const transcript: { role: string; text: string }[] = session.transcript || [];
        transcript.push({ role: "caller", text: speechResult });


        // ─── Quick Response Engine ───
        // Skip the Gemini API call for common, predictable responses (saves 2-4 seconds)
        const quickResponse = tryQuickResponse(speechResult, session.collected || {}, turn, callerInfo);

        // Use quick response if available, otherwise fall back to AI
        const aiResponse = quickResponse
            ? quickResponse
            : await processVoiceWithAI(speechResult, callerInfo, org, turn, session.collected, transcript);

        // Merge any newly collected fields
        const collected = { ...(session.collected || {}), ...(aiResponse.collectedFields || {}) };

        // Save updated session
        await sessionRef.set({
            ...session,
            transcript,
            collected,
            intent: aiResponse.intent || session.intent,
            turn,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        const maxTurns = 12;

        // ─── Confirmation → Ticket Creation Flow ───
        // If the PREVIOUS turn was a "confirm" and the caller just said "yes/yeah/correct",
        // immediately create the ticket — don't let the AI re-confirm.
        const previousAction = session.lastAction || null;
        const lowerSpeech = speechResult.toLowerCase().trim();
        const isAffirmative = /\b(yes|yeah|yep|correct|right|that's right|that is right|sounds good|go ahead|perfect|ok|okay|sure|absolutely|yup)\b/.test(lowerSpeech);

        if (previousAction === "confirm" && isAffirmative) {
            console.log(`[Voice] Caller confirmed after confirm turn — creating ticket immediately.`);
            collected._confirmed = true;
            await createTicketFromVoice(from, collected, org?.orgId, transcript);

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

            transcript.push({ role: "assistant", text: closingMsg });
            await sessionRef.update({ transcript, collected, status: "completed" });

            const doneAction = buildGatherAction(sessionId, from, to, turn + 1);
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" action="${doneAction}" timeout="10" speechTimeout="auto" language="en-US">
        <Say voice="Google.en-US-Neural2-F">${escapeXml(closingMsg)} Is there anything else I can help you with?</Say>
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
            await createTicketFromVoice(from, collected, org?.orgId, transcript);

            const closingMsg = aiResponse.message;

            transcript.push({ role: "assistant", text: closingMsg });
            await sessionRef.update({ transcript, collected, status: "completed" });

            const doneAction = buildGatherAction(sessionId, from, to, turn + 1);
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" action="${doneAction}" timeout="10" speechTimeout="auto" language="en-US">
        <Say voice="Google.en-US-Neural2-F">${escapeXml(closingMsg)}</Say>
    </Gather>
    <Say voice="Google.en-US-Neural2-F">Thank you for calling. Have a great day!</Say>
    <Hangup/>
</Response>`;
            res.set("Content-Type", "text/xml");
            return res.status(200).send(twiml);

        } else if (aiResponse.action === "check_status") {
            transcript.push({ role: "assistant", text: aiResponse.message });
            await sessionRef.update({ transcript, intent: "status_check" });

            const statusAction = buildGatherAction(sessionId, from, to, turn + 1);
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" action="${statusAction}" timeout="10" speechTimeout="auto" language="en-US">
        <Say voice="Google.en-US-Neural2-F">${escapeXml(aiResponse.message)} Is there anything else I can help you with?</Say>
    </Gather>
    <Say voice="Google.en-US-Neural2-F">Thank you for calling. Goodbye!</Say>
    <Hangup/>
</Response>`;
            res.set("Content-Type", "text/xml");
            return res.status(200).send(twiml);

        } else if (aiResponse.action === "answer_question") {
            // AI answered a question from the knowledge base — continue conversation
            transcript.push({ role: "assistant", text: aiResponse.message });
            await sessionRef.update({ transcript });

            // If the AI flagged this as an unanswerable question, log it
            if (aiResponse.questionLogged && org?.orgId) {
                logCustomerQuestion(org.orgId, aiResponse.questionLogged, from, sessionId);
            }

            const continueAction = buildGatherAction(sessionId, from, to, turn + 1);
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" action="${continueAction}" timeout="10" speechTimeout="auto" language="en-US">
        <Say voice="Google.en-US-Neural2-F">${escapeXml(aiResponse.message)}</Say>
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
                // No forward number — fall back to voicemail
                const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Google.en-US-Neural2-F">${escapeXml(aiResponse.message)}</Say>
    <Record action="/handleVoicemailRecording" maxLength="120" playBeep="true" />
</Response>`;
                res.set("Content-Type", "text/xml");
                return res.status(200).send(twiml);
            }

        } else {
            // Continue conversation — ask for next piece of info
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

            transcript.push({ role: "assistant", text: aiResponse.message });
            await sessionRef.update({ transcript });

            // Log unanswered questions for the business owner to review
            if (aiResponse.questionLogged && org?.orgId) {
                logCustomerQuestion(org.orgId, aiResponse.questionLogged, from, sessionId);
            }

            const continueAction = buildGatherAction(sessionId, from, to, turn + 1);
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" action="${continueAction}" timeout="10" speechTimeout="auto" language="en-US">
        <Say voice="Google.en-US-Neural2-F">${escapeXml(aiResponse.message)}</Say>
    </Gather>
    <Redirect>${continueAction.replace(/&amp;/g, '&amp;amp;')}</Redirect>
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
    callerInfo: CallerContext | null
): AIVoiceResponse | null {
    const lower = speech.toLowerCase().trim().replace(/[.,!?]+$/, '');
    const words = lower.split(/\s+/);
    const wordCount = words.length;

    // ─── Determine what field is missing next ───
    const hasName = !!collected.name || (callerInfo && callerInfo.name !== 'Unknown Caller');
    const hasDescription = !!collected.description;
    const hasAddress = !!collected.address || (callerInfo?.address);
    const hasContactPref = !!collected.contactPreference;

    // ─── 1. Goodbye / end call detection (any turn) ───
    if (/^(goodbye|bye|that's all|that is all|no thanks|no thank you|nope|no|nothing else|i'm good|all set|have a good day)$/i.test(lower)) {
        console.log(`[Voice][Quick] Detected goodbye: "${speech}"`);
        return {
            message: "Thank you for calling! Have a great day.",
            action: "end_call",
            intent: "service_request",
            collectedFields: {}
        };
    }

    // ─── 2. "Talk to a person / human / manager" (any turn) ───
    if (/\b(speak|talk|human|person|manager|real person|representative|someone|live)\b/i.test(lower)) {
        console.log(`[Voice][Quick] Detected voicemail request: "${speech}"`);
        return {
            message: "Of course! Let me take a message and have someone call you back shortly.",
            action: "voicemail",
            intent: "voicemail",
            collectedFields: {}
        };
    }

    // ─── 3. Intent detection (first turn or early turns before description is set) ───
    if (!hasDescription && turn <= 2) {
        // Service / repair / fix request
        if (/\b(service|repair|fix|broken|leak|replace|install|maintenance|plumb|drain|toilet|faucet|water heater|pipe|clog|ac |hvac|heating|cooling)\b/i.test(lower)) {
            console.log(`[Voice][Quick] Detected service intent: "${speech}"`);
            // If the speech contains a specific issue (more than just "service"), capture it
            const isSpecific = wordCount >= 3 || /\b(toilet|faucet|water heater|pipe|drain|leak|clog|ac |hvac|shower)\b/i.test(lower);
            if (isSpecific) {
                // They gave a real description — capture it and ask for name next
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
            // Generic "I need service" — acknowledge and ask for name
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

        // Quote request
        if (/\b(quote|estimate|price|pricing|cost|how much)\b/i.test(lower)) {
            console.log(`[Voice][Quick] Detected quote intent: "${speech}"`);
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
        if (/\b(change|reschedule|cancel|move|appointment|existing)\b/i.test(lower)) {
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

    // ─── 4. Name extraction (when name is the next missing field) ───
    if (!hasName && (hasDescription || turn <= 2) && wordCount <= 4) {
        // Short response likely a name — but exclude obvious non-names
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
                    : "What's the best way to reach you — call, text, or email?";
            return {
                message: `Thanks, ${name}! ${nextQuestion}`,
                action: "continue",
                intent: "service_request",
                collectedFields: { name }
            };
        }
    }

    // ─── 5. Contact preference (call / text / email) ───
    if (!hasContactPref && hasDescription && hasName) {
        // Pure contact preference answers
        if (/^(call|phone|call me|phone call|give me a call)$/i.test(lower)) {
            console.log(`[Voice][Quick] Contact preference: call`);
            return {
                message: "Call it is! What days and times work best for you?",
                action: "continue",
                intent: "service_request",
                collectedFields: { contactPreference: "call" }
            };
        }
        if (/^(text|text me|message|sms|text message)$/i.test(lower)) {
            console.log(`[Voice][Quick] Contact preference: text`);
            return {
                message: "Text works! What days and times work best for you?",
                action: "continue",
                intent: "service_request",
                collectedFields: { contactPreference: "text" }
            };
        }
        if (/^(email|email me|e-?mail)$/i.test(lower)) {
            console.log(`[Voice][Quick] Contact preference: email`);
            return {
                message: "Sure, email works! What's your email address?",
                action: "continue",
                intent: "service_request",
                collectedFields: { contactPreference: "email" }
            };
        }
    }

    // ─── No quick match — fall through to AI ───
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
    transcript: { role: string; text: string }[]
): Promise<AIVoiceResponse> {
    const model = getGeminiModel();

    if (!model) {
        return processVoiceWithKeywords(speechInput, callerInfo);
    }

    try {
        const companyName = org?.orgName || "DispatchBox";
        const callerContext = callerInfo
            ? `Known caller: ${callerInfo.name} (phone: ${callerInfo.phone}). ${callerInfo.recentJobs.length} recent jobs.${callerInfo.recentJobs.length > 0 ? ` Latest: "${callerInfo.recentJobs[0].description}" — ${callerInfo.recentJobs[0].status}.` : ''}`
            : "Caller is not yet in our system.";

        // Build transcript history for context
        const historyStr = transcript.slice(-10).map(t => `${t.role === 'caller' ? 'CALLER' : 'YOU'}: ${t.text}`).join('\n');

        // Show what we've collected so far
        const col = collected || {};
        // For known callers, auto-fill address from their customer record
        const isKnownCaller = callerInfo && callerInfo.name !== 'Unknown Caller';
        const knownAddress = callerInfo?.address || '';
        const collectedStr = [
            `Name: ${col.name || (isKnownCaller ? callerInfo!.name + ' (from caller ID)' : 'NOT YET')}`,
            `Issue/Description: ${col.description || 'NOT YET'}`,
            `Address: ${col.address || (knownAddress ? knownAddress + ' (on file)' : 'NOT YET')}`,
            `Email: ${col.email || 'NOT YET'}`,
            `Contact Preference: ${col.contactPreference || 'NOT YET'}`,
            `Availability: ${col.availability || 'NOT YET'}`,
            `Urgency: ${col.urgency || 'NOT YET'}`
        ].join('\n');

        // Auto-fill known caller fields into collected so we don't re-ask
        if (isKnownCaller && !col.name) col.name = callerInfo!.name;
        if (knownAddress && !col.address) col.address = knownAddress;

        // Address instructions depend on whether caller is known
        const addressInstructions = isKnownCaller && knownAddress
            ? `The caller is a KNOWN CUSTOMER with address "${knownAddress}" on file. Do NOT ask for their address unless they say it's a different location. Confirm by saying "I have your address as [address] on file, is that correct?" only if relevant.`
            : `For the address: You MUST ask the customer for their full service address.`;

        // Load the org's knowledge base (FAQs, services, hours) if available
        const knowledge = org?.orgId ? await loadOrgKnowledge(org.orgId) : null;

        // Load the AI Voice Profile if available
        let profileConfig = null;
        if (org?.aiVoiceProfileId) {
            try {
                const profileDoc = await db.collection('ai_voice_profiles').doc(org.aiVoiceProfileId).get();
                if (profileDoc.exists) {
                    profileConfig = profileDoc.data();
                }
            } catch (e) {
                console.warn("[Voice] Error loading voice profile:", (e as Error).message);
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
- Sound like a real, warm team member — NOT a robot or menu system.
- Keep every response to 1-2 SHORT sentences. This is a phone call — brevity is key.
- Use natural, conversational language. Avoid corporate phrases like "Your call is important to us."
- If the caller sounds stressed or frustrated, acknowledge it briefly: "I understand — let's get that taken care of" then move to solving.
- Do NOT announce that you are AI unless directly asked. If asked, be honest but casual: "I'm an AI assistant, but I can definitely help you out."
- Ask ONE question at a time — never stack multiple questions.
${knowledgeSection}
## Caller Context
${callerContext}

## Conversation So Far
${historyStr || '(First turn — caller just responded to your greeting.)'}

## Info Collected
${collectedStr}

## Caller's Latest Response
"${speechInput}"

## Your Task
1. Extract any NEW info from the caller's latest response and return it in "collectedFields".
   - "name": caller's full name
   - "description": the SPECIFIC issue or service needed (e.g. "shower head replacement", "leaking faucet", "clogged drain"). Generic phrases like "service call" or "appointment" are NOT a valid description — you MUST ask what the issue is.
   - "address": the street address for the service
   - "email": caller's email address if they provide one. If they spell it out slowly (e.g. "R i c h at a o l dot com"), carefully reassemble the letters into a valid email.
   - "contactPreference": how they want to be contacted — "call", "text", or "email"
   - "availability": days and times that work for them (e.g. "Mondays and Wednesdays between 12 and 4", "Tuesday afternoon")
   - "urgency": "emergency" or "normal" (infer from tone/words like "flooding", "no heat", "ASAP" — do NOT ask directly)
2. ${addressInstructions}
3. COLLECTION ORDER — follow this flow STRICTLY:
   a. When the caller says they want service, a quote, or similar -> acknowledge it, then ask for their name: "Sure thing! Can I get your name?"
   b. After getting the name -> briefly confirm it, then ask what the problem is: "Thanks, [Name]! What's going on that you need help with?" (If they already stated the issue, skip this.)
   c. After getting the issue -> briefly confirm it, then ask for their address: "Got it, [Issue]. What's the address for the service?" (CRITICAL: You MUST ask for the address unless it is already on file).
   d. After getting the address -> briefly confirm it, then ask for contact preference: "[Address], understood. What's the best way to reach you — call, text, or email?"
   e. After getting contact info -> briefly confirm it, then ask for availability: "[Preference] is great. What days and times work best for you?"
   f. After getting availability -> you MUST recap the details fully.
   If the caller provides multiple pieces of info at once, extract them all, confirm them briefly, and skip to the next missing field.
${fallbackInstructions}
5. NEVER RE-ASK for information already collected. Check "Info Collected" above — if a field has a value (not "NOT YET"), do NOT ask for it again.
6. Pick an action:
   - "continue" — ask for the NEXT missing field. Ask ONE thing at a time.
   - "confirm" or "create_ticket" — USE ONLY WHEN you have name + description + address + availability. YOU MUST read back the details exactly like this: "To recap, you need [service required] at [address] around [requested dates]. Thank you, and we will reach out to you via [text/call/email] about your service. Is there anything else that I can help you with?" Then use this action. NEVER use this action until you have the address and availability.
   - "check_status" — caller wants to check on an existing job.
   - "answer_question" — caller asks a question you CAN answer from the knowledge base. Answer naturally, then steer back.
   - "end_call" — caller says goodbye, has no more needs, or agrees to text/email instead.
   - "voicemail" — caller asks to speak to a human or leave a message. Do NOT try to convince them to stay.
7. If the address is confusing or unclear, do your best to capture it.
${confirmationInstructions}
9. If the caller asks a question you CANNOT answer, respond: "Great question — I'll make a note and have someone get back to you on that." Set intent to "general_question" and include "questionLogged".

Respond ONLY with valid JSON:
{
  "message": "your spoken reply (1-2 sentences, under 30 words except for the recap which can be longer)",
  "intent": "service_request|quote_request|status_check|general_question|voicemail",
  "collectedFields": { "fieldName": "value" },
  "questionLogged": "the question caller asked, if unanswerable"
}`;

        const result = await model.generateContent(prompt);
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

        return { message: "I'd be happy to help. Let me create a service request for you.", action: "create_ticket", collectedFields: {} };

    } catch (error) {
        console.error("[Voice] AI processing error:", (error as Error).message);
        return processVoiceWithKeywords(speechInput, callerInfo);
    }
}

function processVoiceWithKeywords(speechInput: string, callerInfo: CallerContext | null): AIVoiceResponse {
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
    if (lower.includes("schedule") || lower.includes("appointment") || lower.includes("service") || lower.includes("fix") || lower.includes("repair") || lower.includes("broken") || lower.includes("issue") || lower.includes("problem") || lower.includes("quote")) {
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

    // Default: try to create a ticket from whatever they said
    return {
        message: "Thanks for that information. I'm creating a service request with the details you provided. A member of our team will follow up with you shortly.",
        action: 'create_ticket'
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
    transcript?: { role: string; text: string }[]
) {
    const callerName = collected.name || "Unknown Caller";
    const address = collected.address || "";
    const description = collected.description || "Voice call — details in transcript";
    const urgency = collected.urgency || "normal";
    const availability = collected.availability || "";
    const email = collected.email || "";

    // Build a human-readable description from collected fields
    const richDescription = [
        description,
        address ? `Address: ${address}` : null,
        urgency === 'emergency' ? '⚠️ EMERGENCY' : null,
        availability ? `Availability: ${availability}` : null
    ].filter(Boolean).join('\n');

    // Find or create customer
    const customersRef = db.collection("customers");
    let customerQuery = customersRef.where("phone", "==", phone);
    if (orgId) {
        customerQuery = customerQuery.where("organizationId", "==", orgId);
    }
    const snapshot = await customerQuery.limit(1).get();

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
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        collectedInfo: collected
    };
    if (orgId) ticketData.organizationId = orgId;
    if (transcript && transcript.length > 0) {
        ticketData.transcript = transcript.slice(-20); // Save last 20 turns
    }

    const ticketRef = await db.collection("tickets").add(ticketData);
    console.log(`[Voice] Created ticket ${ticketRef.id} from call by ${phone}`);

    // 2. Create a job so dispatchers see it in the Job Intake Dashboard
    const jobData: any = {
        status: "pending",
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
    console.log(`[Voice] Created job ${jobRef.id} linked to ticket ${ticketRef.id}`);

    await ticketRef.update({ autoJobId: jobRef.id });

    // 3. Auto-quote if org has it enabled (fire-and-forget — don't block the Twilio response)
    if (orgId) {
        try {
            const orgDoc = await db.collection("organizations").doc(orgId).get();
            if (orgDoc.exists && orgDoc.data()?.autoQuoteEnabled === true) {
                const { autoCreateJobAndQuote } = require("../portal");
                // Don't await — auto-quote can take 15+ seconds and would cause Twilio timeout
                autoCreateJobAndQuote(orgId, ticketRef.id, {
                    customerName,
                    customerPhone: phone,
                    customerEmail: "",
                    address,
                    description: richDescription,
                    urgency,
                    customerId
                }).then(() => {
                    console.log(`[Voice] Auto-quote triggered for ticket ${ticketRef.id}`);
                }).catch((quoteErr: Error) => {
                    console.warn("[Voice] Auto-quote failed (non-fatal):", quoteErr.message);
                });
            }
        } catch (quoteErr) {
            console.warn("[Voice] Auto-quote setup failed (non-fatal):", (quoteErr as Error).message);
        }
    }

    return ticketRef;
}

/**
 * Build a properly XML-escaped Gather action URL.
 * Raw & must be &amp; inside XML attribute values.
 * noSpeechCount (nsc) tracks consecutive no-speech events for retry logic.
 */
function buildGatherAction(sessionId: string, from: string, to: string, turn: number, noSpeechCount: number = 0): string {
    // Build the URL then escape & for XML attribute context
    const url = `/handleVoiceGather?session=${encodeURIComponent(sessionId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&turn=${turn}&nsc=${noSpeechCount}`;
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
            const gatherAction = buildGatherAction(newSessionId, cb.callerPhone, fromNumber, turnNum);

            // Initiate the outbound call
            const call = await twilioClient.calls.create({
                to: cb.callerPhone,
                from: fromNumber,
                twiml: `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" action="${gatherAction}" timeout="10" speechTimeout="auto" language="en-US"><Say voice="Google.en-US-Neural2-F">Hi, this is Amy from ${orgName} calling you back. It looks like we may have had some connection issues on your earlier call. I'd love to pick up where we left off — how can I help you today?</Say></Gather><Say voice="Google.en-US-Neural2-F">No worries, feel free to call us back anytime. Have a great day!</Say><Hangup/></Response>`,
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
