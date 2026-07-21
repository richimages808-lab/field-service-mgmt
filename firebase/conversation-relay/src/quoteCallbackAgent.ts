/**
 * quoteCallbackAgent.ts — Gemini-powered conversation agent for quote callbacks.
 * 
 * Replaces the entire 500+ line keyword-matching if-else chain with a
 * system prompt + Gemini function calling. Maintains conversation state
 * per WebSocket session and calls tools for Firestore actions.
 */

import { GoogleGenerativeAI, Content, Part, FunctionDeclarationsTool } from "@google/generative-ai";
import { toolDeclarations, executeToolCall, SessionData } from "./tools";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ============================================================
// SYSTEM PROMPT — replaces all keyword matching logic
// ============================================================

function buildSystemPrompt(session: SessionData, quoteDetails: string): string {
    const mode = session.presentationMode || "single_price";
    let modeInstruction = "";
    if (mode === "single_price") {
        modeInstruction = `\nQUOTE PRESENTATION MODE: The technician has configured this quote to be presented as a single flat rate. You MUST ONLY state the total price and any discount. Do NOT break down or invent any individual itemized costs or categories (like labor or materials), even if the customer asks. If they ask for details/breakdowns, politely explain that the technician has provided a single flat rate for the job.`;
    } else if (mode === "category_rollup") {
        modeInstruction = `\nQUOTE PRESENTATION MODE: The technician has configured this quote as a category summary. You MUST ONLY read out the subtotals for each category (e.g., Labor, Materials) and the total. Do NOT list individual itemized descriptions.`;
    } else {
        modeInstruction = `\nQUOTE PRESENTATION MODE: The technician has configured this quote with detailed line items. You MUST read out the individual line items (description and total) and the final total.`;
    }

    return `You are Amy, a friendly and professional AI phone assistant for ${session.orgName || "DispatchBox"}.

CONTEXT:
- You are on a live phone call with ${session.customerName || "the customer"}.
- They have an existing quote for: ${session.jobDescription || "a service request"}.
- Their phone number: ${session.callerPhone}
- Quote ID: ${session.quoteId}
${quoteDetails ? `\nQUOTE DETAILS:\n${quoteDetails}` : ""}
${modeInstruction}

=== CRITICAL PACING RULES (HIGHEST PRIORITY) ===

These rules override ALL other instructions. Violating them creates a terrible customer experience.

1. ONE TOPIC PER TURN. Never combine quote details with scheduling options in the same response.
2. STOP AND LISTEN after every piece of information you share. Wait for the customer to react.
3. ANSWER THEIR QUESTION FIRST. If the customer asks something, fully address it before changing topics.
4. NEVER ASSUME READINESS. Do not jump to scheduling until the customer has acknowledged the quote price.
5. NEVER STACK QUESTIONS. Ask one question, then wait. Do not ask "Would you like to schedule? I have three options..." in one breath.
6. IF THEY INTERRUPT with a question or concern, drop whatever you were about to say and address their point.
7. MATCH THEIR PACE. If they're thinking, give them space. If they sound uncertain, offer to email the quote.

=== CONVERSATION FLOW (Decision Tree) ===

Follow this as a decision tree, NOT a linear checklist. At each step, STOP and wait for the customer.

STEP 1 — GREETING:
  Say: "Hi [name], I'm calling about your [job description]. Great news — your quote has been approved! Would you like me to go over the details?"
  → STOP. Wait for their answer.
  → If YES / "sure" / "go ahead" → go to STEP 2
  → If they already know the price / "I saw it" / "yeah I know" → go to STEP 3
  → If they have a question → answer it, then re-offer to share details
  → If "just email it" → call send_quote_email, say goodbye
  → If "not interested" → acknowledge respectfully, call end_call

STEP 2 — SHARE QUOTE DETAILS:
  Read the quote details EXACTLY as provided (respect the presentation mode).
  Then say: "How does that sound?"
  → STOP. Wait for their reaction.
  → If positive / "sounds good" / "okay" → go to STEP 3
  → If "that's too much" / price concern → empathize, offer to log a change request
  → If they ask a question → answer it fully
  → If "let me think about it" → offer to email the quote for review
  → If "can you change X" → call log_change_request

STEP 3 — OFFER SCHEDULING:
  Say: "Great! Would you like to schedule your appointment now?"
  → STOP. Wait for their answer.
  → If YES → go to STEP 4
  → If "what times do you have?" → go to STEP 4
  → If NO / not ready → offer to email or call back later
  → If they want to speak to someone → call request_human_callback

STEP 4 — PRESENT TIME SLOTS:
  Call get_available_slots first.
  Then present slots clearly: "I have a few openings. How about [slot 1]? Or [slot 2]?"
  → STOP. Wait for their choice.
  → If they pick one → CONFIRM: "So [slot spoken], is that right?"
    → If confirmed → call schedule_appointment
  → If "none of those work" → offer to have someone follow up with more options
  → If unclear → ask them to clarify which option they prefer

STEP 5 — WRAP UP:
  After scheduling: "You're all set! We'll send a confirmation text. Thank you for choosing [company]!"
  → call end_call

=== NEVER DO THIS (Anti-Patterns) ===

❌ "Your quote is nine hundred fifty dollars. I have three openings: Monday morning..."
   → This skips the customer's reaction to the price.
✅ "Your quote is nine hundred fifty dollars. How does that sound?"
   → Wait for their response before offering scheduling.

❌ Customer: "Can you email me the quote?" Agent: "Sure! Now about scheduling, I have three options..."
   → This ignores the customer's request and pushes scheduling.
✅ Customer: "Can you email me the quote?" Agent: "Of course, I'll send that over right now."
   → Call send_quote_email, then offer a natural close.

❌ Customer: "Hmm, that seems expensive." Agent: "I understand. Option 1 is Monday morning..."
   → This bulldozes past the customer's concern.
✅ Customer: "Hmm, that seems expensive." Agent: "I understand. Would you like me to have the technician review the pricing? Or I can email you the full breakdown to look over."

❌ Agent asks two questions in one turn: "Would you like to schedule? I have Monday or Tuesday."
✅ Agent asks one: "Would you like to schedule your appointment now?" → waits → then offers slots.

=== VOICE STYLE ===

- Keep responses SHORT (1-2 sentences max). This is a phone call, not a chat.
- Be warm, conversational, and natural. Use contractions.
- Don't repeat information the customer already knows.
- When listing time slots, be clear and pace yourself: "I have Monday morning between 8 and 10... or Thursday afternoon between 12 and 2."
- If the customer says something unclear, ask for clarification naturally. Don't guess.
- NEVER say "As an AI" or reference being artificial.
- When reading dollar amounts, say "nine hundred fifty dollars" not "$950".
- End each response at a natural stopping point where the customer can speak.

=== TOOL USAGE GUARDRAILS ===

- Do NOT call approve_quote until the customer explicitly says they want to proceed ("yes", "let's do it", "sounds good, schedule it").
- Do NOT call get_available_slots until the customer says they're ready to schedule.
- Do NOT call schedule_appointment without first confirming the specific slot with the customer.
- If the customer says "let me think about it" or "I'm not sure" — offer to send_quote_email, do NOT push scheduling.
- Always confirm before taking irreversible actions.`;
}

function buildSpokenQuoteDetails(q: any): string {
    const total = (q.total || 0).toFixed(2);
    const discount = q.discount && q.discount > 0 ? `\nDiscount: $${q.discount.toFixed(2)}` : "";
    const mode = q.presentationMode || "single_price";

    if (mode === "single_price") {
        return `Total: $${total}${discount}`;
    }

    if (mode === "category_rollup") {
        const categories: Record<string, number> = {};
        for (const item of (q.lineItems || [])) {
            const type = item.type || "other";
            const label = type.charAt(0).toUpperCase() + type.slice(1);
            categories[label] = (categories[label] || 0) + (item.total || 0);
        }

        const lines = Object.entries(categories)
            .filter(([, amt]) => amt > 0)
            .map(([cat, amt]) => `- ${cat} subtotal: $${amt.toFixed(2)}`)
            .join("\n");

        return `Summary by Category:\n${lines}${discount}\nTotal: $${total}`;
    }

    // detailed mode (or fallback)
    const lines = (q.lineItems || []).map((item: any) =>
        `- ${item.description || item.type}: $${(item.total || 0).toFixed(2)}`
    ).join("\n");

    return `Line Items:\n${lines}${discount}\nTotal: $${total}`;
}

// ============================================================
// CONVERSATION MANAGER
// ============================================================

export class QuoteCallbackAgent {
    private session: SessionData;
    private sessionId: string;
    private history: Content[] = [];
    private model: any;
    private quoteDetails: string = "";

    constructor(session: SessionData, sessionId: string) {
        this.session = session;
        this.sessionId = sessionId;
        this.model = genAI.getGenerativeModel({
            model: "gemini-3.5-flash",
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 300,   // Keep responses very short for phone — 1-2 sentences
            },
        });
    }

    /**
     * Load quote details from Firestore for the system prompt
     */
    async loadQuoteDetails(): Promise<void> {
        try {
            const admin = require("firebase-admin");
            const db = admin.firestore();

            if (this.session.quoteId) {
                const quoteDoc = await db.collection("quotes").doc(this.session.quoteId).get();
                if (quoteDoc.exists) {
                    const q = quoteDoc.data();
                    this.quoteDetails = buildSpokenQuoteDetails(q);
                    this.session.presentationMode = q.presentationMode || "single_price";

                    // Look up assigned tech
                    if (this.session.jobId) {
                        const jobDoc = await db.collection("jobs").doc(this.session.jobId).get();
                        if (jobDoc.exists) {
                            this.session.assignedTechId = jobDoc.data()?.assigned_to || null;
                        }
                    }
                }
            }
        } catch (e) {
            console.warn("[Agent] Failed to load quote details:", (e as Error).message);
        }
    }

    /**
     * Process a customer's speech and return the agent's response.
     * Handles tool calls automatically via Gemini function calling.
     */
    async processUtterance(utterance: string): Promise<{
        response: string;
        shouldEndCall: boolean;
        endStatus?: string;
    }> {
        const admin = require("firebase-admin");
        const db = admin.firestore();
        const sessionRef = db.collection("voice_sessions").doc(this.sessionId);

        try {
            // Add user message to history
            this.history.push({
                role: "user",
                parts: [{ text: utterance }]
            });

            // Update transcript in background
            const transcript = this.session.transcript || [];
            transcript.push(`User: ${utterance}`);

            // Build the chat request
            const systemPrompt = buildSystemPrompt(this.session, this.quoteDetails);
            
            const tools: FunctionDeclarationsTool[] = [{
                functionDeclarations: toolDeclarations as any
            }];

            const chat = this.model.startChat({
                history: this.history.slice(0, -1), // Exclude last user message (sent via sendMessage)
                systemInstruction: { parts: [{ text: systemPrompt }] },
                tools,
            });

            let result = await chat.sendMessage(utterance);
            let response = result.response;
            let finalText = "";
            let shouldEndCall = false;
            let endStatus: string | undefined;

            // Process function calls in a loop (Gemini may chain them)
            let iterations = 0;
            while (iterations < 5) {
                iterations++;
                const candidate = response.candidates?.[0];
                if (!candidate) break;

                const parts = candidate.content?.parts || [];
                const functionCall = parts.find((p: Part) => p.functionCall);
                const textPart = parts.find((p: Part) => p.text);

                if (textPart?.text) {
                    finalText += textPart.text;
                }

                if (functionCall?.functionCall) {
                    const { name, args } = functionCall.functionCall;
                    console.log(`[Agent] Tool call: ${name}(${JSON.stringify(args)})`);

                    const toolResult = await executeToolCall(
                        name, args || {}, this.session, this.sessionId
                    );

                    if (toolResult.shouldEndCall) {
                        shouldEndCall = true;
                        endStatus = toolResult.endStatus;
                    }

                    // Send tool result back to Gemini for the next response
                    result = await chat.sendMessage([{
                        functionResponse: {
                            name,
                            response: { result: toolResult.result }
                        }
                    }]);
                    response = result.response;
                    // Continue loop to check for more function calls or final text
                } else {
                    // No more function calls, we're done
                    break;
                }
            }

            // Extract final text if there's more after tool calls
            const lastCandidate = response.candidates?.[0];
            if (lastCandidate?.content?.parts) {
                for (const part of lastCandidate.content.parts) {
                    if (part.text && !finalText.includes(part.text)) {
                        finalText += part.text;
                    }
                }
            }

            // Clean up response for voice
            finalText = finalText.trim();
            if (!finalText) {
                finalText = "I'm sorry, could you repeat that?";
            }

            // Update history with model response
            this.history.push({
                role: "model",
                parts: [{ text: finalText }]
            });

            // Update transcript and turn in background
            transcript.push(`AI: ${finalText}`);
            this.session.transcript = transcript;
            this.session.turn = (this.session.turn || 0) + 1;
            sessionRef.update({
                transcript,
                turn: this.session.turn
            }).catch((e: Error) => console.warn("[Agent] Transcript update failed:", e.message));

            return { response: finalText, shouldEndCall, endStatus };

        } catch (e) {
            console.error("[Agent] Error processing utterance:", (e as Error).message);
            return {
                response: "I'm sorry, I had a brief issue. Could you say that again?",
                shouldEndCall: false
            };
        }
    }
}
