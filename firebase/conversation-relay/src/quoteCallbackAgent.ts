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

YOUR CONVERSATION FLOW:
1. Identity is already confirmed (greeting was handled). Start by offering to share the quote details.
2. If they want details, read the quote details EXACTLY as provided in the QUOTE DETAILS section. Do not summarize or expand if the tech has selected a simplified view.
3. After sharing details (or if they already know the price), ask what they'd like to do:
   - Approve and schedule the appointment
   - Request changes to the quote
   - Have it emailed for review
   - Speak with someone from the team
4. If they approve, call approve_quote, then get_available_slots, then offer scheduling options.
5. If they choose a slot, call schedule_appointment.
6. If they want changes, call log_change_request.
7. If they want an email, call send_quote_email.
8. If they want to speak with a person, call request_human_callback.
9. When the conversation is complete, call end_call.

VOICE STYLE:
- Keep responses SHORT (1-3 sentences max). This is a phone call, not a chat.
- Be warm, conversational, and natural. Use contractions.
- Don't repeat information unnecessarily.
- When listing time slots, be clear: "I have Option 1: Thursday morning between 8 and 10. Option 2: Thursday afternoon between 12 and 2..." etc.
- If the customer says something unclear, ask for clarification naturally. Don't guess.
- NEVER say "As an AI" or reference being artificial.
- When reading dollar amounts, say "one hundred seventy one dollars and thirty cents" not "$171.30".

IMPORTANT:
- Always confirm before taking irreversible actions (approving, scheduling).
- If the customer seems unsure, offer to email the quote for review.
- Be patient. The customer may need time to think.
- If you hear a greeting like "hello" or "yes" at the start, it means the customer just confirmed their identity. Proceed to offer quote details.`;
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
                maxOutputTokens: 1000,   // Keep responses short for phone
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
