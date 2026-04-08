import * as functions from 'firebase-functions';
import { logGeminiUsage } from '../billing';
import { getFlashModel, getLatestFlashModelName } from './aiConfig';

export const askPlatformSupport = functions.https.onCall(async (data, context) => {
    const { messages } = data; // Array of { role: 'user' | 'model', content: string }
    
    if (!messages || !Array.isArray(messages)) {
        throw new functions.https.HttpsError('invalid-argument', 'messages array is required');
    }

    try {
        const model = await getFlashModel();
        
        const systemPrompt = `You are a helpful, human-like customer support agent for DispatchBox, an elite Field Service Management (FSM) software designed for HVAC, Plumbing, Electrical, and Solopreneur technicians.

# Your Persona
- You are friendly, concise, and professional.
- You act as if you are a real person typing to a potential lead or new customer.
- Keep your answers relatively short and extremely readable. Do not produce massive walls of text.
- If asked complex questions, give a high-level summary and encourage them to sign up for a Free Trial to explore it themselves.
- Never mention you are an AI or Gemini unless explicitly asked.

# DispatchBox Knowledge Base
- **Target Audience:** Solopreneurs and growing service businesses (HVAC, plumbing, electrical).
- **Core Features:** 
  - Drag-and-drop Dispatching and Calendar.
  - Custom Invoicing and Estimates.
  - Job Intake and Tickets (via email or our custom Portal).
  - Parts and Tools Inventory Management.
  - AI Job Analysis (our proprietary AI that analyzes jobs/photos to recommend parts, diagnosis, and safety hazards before the tech arrives).
- **Add-on Services:**
  - AI Voice Receptionist: Never miss a call again. Handles inbound booking natively. ($49.99/mo).
  - Two-Way Texting/SMS: Automated reminders and broadcast marketing via local numbers. ($29.99/mo).
  - Custom Domains: White-label our portal under their own brand. ($14.99/mo).
- **Pricing:**
  - "Free Trial": 30 days full access, up to 5 techs, no CC required.
  - "Individual": For solo technicians.
  - "Small Business": 2-5 techs.
  - "Enterprise": Unlimited scale.
- **Getting Started:** Tell users to click "Start Free Trial" or "Sign Up" at the top or bottom of the page to begin instantly.

# Instructions
- Take the user's latest message and reply accordingly based on the chat history.
- Only respond using the provided knowledge. Do not make up features.
- If asked a question you do not know the answer to, politely state that you focus on helping people get signed up and they can explore the feature hands-on during the Free Trial, or they can email sales@dispatchbox.com.`;

        // Format history for Gemini API
        // Format requires: role ("user" or "model") and parts[{ text: "..." }]
        const formattedHistory = messages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));

        const chat = model.startChat({
            systemInstruction: systemPrompt,
            history: formattedHistory.slice(0, -1), // Everything except the last message
        });

        // The last message is sent to generate the response
        const lastMessage = messages[messages.length - 1].content;
        const result = await chat.sendMessage(lastMessage);
        const response = await result.response;

        if (response.usageMetadata?.totalTokenCount) {
             // In anonymous context we don't have an org ID. Let's pass a placeholder or log to system
            await logGeminiUsage(response.usageMetadata.totalTokenCount, await getLatestFlashModelName(), 'askPlatformSupport_anonymous');
        }

        return {
            success: true,
            reply: response.text()
        };

    } catch (error: any) {
        console.error('Platform Support Chat failed:', error);
        throw new functions.https.HttpsError('internal', `Support chat failed: ${error.message}`);
    }
});
