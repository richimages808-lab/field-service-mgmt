/**
 * server.ts — Cloud Run WebSocket server for Twilio ConversationRelay.
 * 
 * Accepts WebSocket connections from Twilio, handles speech events,
 * and sends responses via the QuoteCallbackAgent (Gemini-powered).
 * 
 * Twilio ConversationRelay Protocol:
 *   FROM Twilio → { type: "setup"|"prompt"|"interrupt"|"dtmf"|"error", ... }
 *   TO Twilio   → { type: "text", token: "...", last: true } or { type: "end" }
 */

import express from "express";
import { createServer } from "http";
import WebSocket from "ws";
import * as admin from "firebase-admin";
import { QuoteCallbackAgent } from "./quoteCallbackAgent";
import { SessionData } from "./tools";

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

const app = express();
const server = createServer(app);

// Health check endpoint (Cloud Run requires this)
app.get("/", (req, res) => {
    res.status(200).json({ status: "ok", service: "conversation-relay" });
});

app.get("/health", (req, res) => {
    res.status(200).json({ status: "healthy" });
});

// ============================================================
// WEBSOCKET SERVER
// ============================================================

const wss = new WebSocket.Server({ noServer: true });

// Map of active sessions (callSid → agent)
const activeSessions = new Map<string, {
    agent: QuoteCallbackAgent;
    session: SessionData;
    sessionId: string;
}>();

server.on("upgrade", (request, socket, head) => {
    // Parse session ID from URL path: /quote-callback?session=xxx
    const url = new URL(request.url || "/", `http://${request.headers.host}`);
    const sessionId = url.searchParams.get("session");

    if (!sessionId) {
        console.error("[WS] No session ID in URL, rejecting connection");
        socket.destroy();
        return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
        (ws as any)._sessionId = sessionId;
        wss.emit("connection", ws, request);
    });
});

wss.on("connection", async (ws: WebSocket, request: any) => {
    const sessionId = (ws as any)._sessionId;
    console.log(`[WS] New connection for session: ${sessionId}`);

    let agent: QuoteCallbackAgent | null = null;
    let callSid: string = "";

    ws.on("message", async (data: WebSocket.Data) => {
        try {
            const message = JSON.parse(data.toString());
            const eventType = message.type;

            switch (eventType) {

                // ── Setup Event ──
                // Fired once when the WebSocket connects. Contains call metadata.
                case "setup": {
                    callSid = message.callSid || "";
                    console.log(`[WS] Setup event for call ${callSid}, session ${sessionId}`);

                    // Load session data from Firestore
                    const sessionDoc = await db.collection("voice_sessions").doc(sessionId).get();
                    if (!sessionDoc.exists) {
                        console.error(`[WS] Session ${sessionId} not found in Firestore`);
                        sendText(ws, "I'm sorry, I encountered an issue. Please call us back. Goodbye!", true);
                        sendEnd(ws);
                        return;
                    }

                    const sessionData = sessionDoc.data() as SessionData;
                    sessionData.transcript = sessionData.transcript || [];

                    // Create the Gemini agent
                    agent = new QuoteCallbackAgent(sessionData, sessionId);
                    await agent.loadQuoteDetails();

                    // Store in active sessions
                    activeSessions.set(callSid, { agent, session: sessionData, sessionId });

                    // Update session status
                    await sessionDoc.ref.update({
                        status: "relay_connected",
                        relayCallSid: callSid,
                        relayConnectedAt: admin.firestore.FieldValue.serverTimestamp()
                    });

                    console.log(`[WS] Agent initialized for ${sessionData.customerName} (${sessionData.orgName})`);
                    break;
                }

                // ── Prompt Event ──
                // Fired when the caller finishes speaking. Contains transcribed text.
                case "prompt": {
                    const utterance = message.voicePrompt || message.transcript || "";
                    console.log(`[WS] Prompt from caller: "${utterance}"`);

                    if (!agent) {
                        console.error("[WS] No agent initialized, ignoring prompt");
                        sendText(ws, "I'm sorry, could you repeat that?", true);
                        break;
                    }

                    if (!utterance.trim()) {
                        // Empty speech — re-prompt
                        sendText(ws, "I didn't catch that. Could you say that again?", true);
                        break;
                    }

                    // Process through Gemini
                    const result = await agent.processUtterance(utterance);
                    
                    // Send response back to Twilio
                    sendText(ws, result.response, true);

                    // If the agent says to end the call, do it after speaking
                    if (result.shouldEndCall) {
                        // Small delay to let the final message play
                        setTimeout(() => {
                            sendEnd(ws);
                        }, 500);
                    }
                    break;
                }

                // ── Interrupt Event ──
                // Fired when the caller starts speaking while the AI is talking.
                case "interrupt": {
                    console.log("[WS] Caller interrupted");
                    // ConversationRelay handles stopping the TTS automatically.
                    // We just note it for debugging.
                    break;
                }

                // ── DTMF Event ──
                // Fired when the caller presses a key on their phone.
                case "dtmf": {
                    const digit = message.digit;
                    console.log(`[WS] DTMF digit: ${digit}`);

                    if (agent && digit) {
                        // Treat DTMF as a numbered option selection
                        const result = await agent.processUtterance(`I choose option ${digit}`);
                        sendText(ws, result.response, true);
                        if (result.shouldEndCall) {
                            setTimeout(() => sendEnd(ws), 500);
                        }
                    }
                    break;
                }

                // ── Error Event ──
                case "error": {
                    console.error(`[WS] Error from Twilio:`, message);
                    break;
                }

                default: {
                    console.log(`[WS] Unknown event type: ${eventType}`, message);
                }
            }

        } catch (err) {
            console.error("[WS] Error handling message:", (err as Error).message);
            try {
                sendText(ws, "I'm sorry, I had a brief issue. Could you say that again?", true);
            } catch (sendErr) {
                // WebSocket may have closed
            }
        }
    });

    ws.on("close", () => {
        console.log(`[WS] Connection closed for session ${sessionId}`);
        if (callSid) {
            activeSessions.delete(callSid);
        }
    });

    ws.on("error", (err) => {
        console.error(`[WS] WebSocket error for session ${sessionId}:`, err.message);
    });
});

// ============================================================
// HELPER: Send messages to Twilio ConversationRelay
// ============================================================

function sendText(ws: WebSocket, text: string, last: boolean = false) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: "text",
            token: text,
            last
        }));
    }
}

function sendEnd(ws: WebSocket) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "end" }));
    }
}

// ============================================================
// START SERVER
// ============================================================

const PORT = parseInt(process.env.PORT || "8080");
server.listen(PORT, () => {
    console.log(`[ConversationRelay] Server running on port ${PORT}`);
});
