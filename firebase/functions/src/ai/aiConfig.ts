import { GoogleGenerativeAI } from '@google/generative-ai';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

// Retrieve Gemini API key from process.env or functions.config()
export function getGeminiApiKey(): string {
    return process.env.GEMINI_API_KEY || (typeof functions.config === 'function' ? functions.config().gemini?.api_key : '') || '';
}

// Initialize the core SDK (used as secondary fallback if Vertex AI is unavailable)
export const genAI = new GoogleGenerativeAI(getGeminiApiKey());

// Default to the latest Gemini 3.8 Flash model (with automatic fallback chain)
const DEFAULT_FLASH_MODEL = 'gemini-3.8-flash';
const FALLBACK_FLASH_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash'];
const DEFAULT_PRO_MODEL = 'gemini-3.1-pro-preview';

let cachedModelName = DEFAULT_FLASH_MODEL;
let lastFetchedTime = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Resolve the active GCP project ID for Vertex AI requests.
 */
function getActiveProjectId(): string {
    if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
    if (process.env.GCP_PROJECT) return process.env.GCP_PROJECT;
    try {
        if (admin.apps.length > 0 && admin.app().options.projectId) {
            return admin.app().options.projectId!;
        }
    } catch {
        // ignore
    }
    return 'dispatch-box-sb';
}

/**
 * Obtain an OAuth2 access token for Vertex AI calls.
 * Works both inside Cloud Functions (Application Default Credentials)
 * and locally via GOOGLE_ACCESS_TOKEN or gcloud CLI.
 */
let cachedAccessToken: { token: string; expiresAt: number } | null = null;
async function getVertexAccessToken(): Promise<string | null> {
    if (process.env.GOOGLE_ACCESS_TOKEN) {
        return process.env.GOOGLE_ACCESS_TOKEN;
    }
    const now = Date.now();
    if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60_000) {
        return cachedAccessToken.token;
    }

    try {
        const metaRes = await fetch(
            'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
            { headers: { 'Metadata-Flavor': 'Google' } }
        );
        if (metaRes.ok) {
            const tokenData: any = await metaRes.json();
            if (tokenData && tokenData.access_token) {
                cachedAccessToken = {
                    token: tokenData.access_token,
                    expiresAt: now + ((tokenData.expires_in || 3000) * 1000),
                };
                return tokenData.access_token;
            }
        }
    } catch {
        // Not running on GCP metadata server; try firebase-admin or gcloud CLI
    }

    try {
        if (!admin.apps.length) {
            admin.initializeApp();
        }
        const cred = admin.app().options.credential || admin.credential.applicationDefault();
        if (cred && typeof cred.getAccessToken === 'function') {
            const tokenObj = await cred.getAccessToken();
            if (tokenObj && tokenObj.access_token) {
                cachedAccessToken = {
                    token: tokenObj.access_token,
                    expiresAt: now + ((tokenObj.expires_in || 3000) * 1000),
                };
                return tokenObj.access_token;
            }
        }
    } catch {
        // Fallback for local CLI testing where metadata.google.internal is not present
    }

    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { execSync } = require('child_process');
        const token = execSync('gcloud auth print-access-token', { stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000 })
            .toString()
            .trim();
        if (token) {
            cachedAccessToken = { token, expiresAt: now + 1800_000 };
            return token;
        }
    } catch {
        // ignore
    }

    return null;
}

/**
 * Normalize any prompt input passed to model.generateContent(...) into Vertex AI contents format.
 */
function normalizeToVertexContents(input: any): { contents: any[]; systemInstruction?: any; generationConfig?: any; tools?: any[] } {
    if (typeof input === 'string') {
        return {
            contents: [{ role: 'user', parts: [{ text: input }] }],
        };
    }
    if (Array.isArray(input)) {
        const parts = input.map((item) => {
            if (typeof item === 'string') return { text: item };
            if (item?.inlineData) return { inlineData: item.inlineData };
            if (item?.text) return { text: item.text };
            return item;
        });
        return {
            contents: [{ role: 'user', parts }],
        };
    }
    if (input && typeof input === 'object' && Array.isArray(input.contents)) {
        return {
            contents: input.contents,
            systemInstruction: input.systemInstruction,
            generationConfig: input.generationConfig,
            tools: input.tools,
        };
    }
    return {
        contents: [{ role: 'user', parts: [{ text: String(input ?? '') }] }],
    };
}

/**
 * Wrap a Vertex AI JSON response in an object matching @google/generative-ai's GenerateContentResult.
 */
function wrapVertexResponse(data: any) {
    const candidates = data?.candidates || [];
    const firstParts = candidates[0]?.content?.parts || [];
    const combinedText = firstParts
        .map((p: any) => p.text || '')
        .join('');

    return {
        response: {
            candidates,
            usageMetadata: data?.usageMetadata,
            text: () => combinedText,
            functionCalls: () =>
                firstParts
                    .filter((p: any) => p.functionCall)
                    .map((p: any) => p.functionCall),
        },
    };
}

/**
 * Call Vertex AI Global Endpoint with automatic model fallback.
 */
async function generateViaVertexAI(
    preferredModel: string,
    payload: { contents: any[]; systemInstruction?: any; generationConfig?: any; tools?: any[] }
): Promise<any> {
    const token = await getVertexAccessToken();
    if (!token) {
        throw new Error('No Vertex AI access token available');
    }

    const projectId = getActiveProjectId();
    const modelsToTry = [
        preferredModel,
        ...FALLBACK_FLASH_MODELS.filter((m) => m !== preferredModel),
    ];

    let lastError: Error | null = null;
    for (const modelName of modelsToTry) {
        const cleanModel = modelName.replace(/^models\//, '');
        const url = `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/global/publishers/google/models/${cleanModel}:generateContent`;

        const isFlash = cleanModel.includes('flash');
        const body: any = {
            contents: payload.contents,
            generationConfig: {
                ...(isFlash ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
                ...(payload.generationConfig || {}),
            },
        };
        if (payload.systemInstruction) {
            body.systemInstruction = payload.systemInstruction;
        }
        if (payload.tools) {
            body.tools = payload.tools;
        }

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (res.ok) {
            const data = await res.json();
            return wrapVertexResponse(data);
        }

        const errData = await res.json().catch(() => ({}));
        const errMsg = errData?.error?.message || `HTTP ${res.status}`;
        lastError = new Error(`[VertexAI ${cleanModel}]: ${errMsg}`);
        // If 404 (model not found in region), try next model in fallback chain
        if (res.status !== 404 && res.status !== 429 && res.status !== 503) {
            break;
        }
    }

    throw lastError || new Error('Vertex AI request failed');
}

/**
 * Create a resilient GenerativeModel-compatible wrapper that uses Vertex AI (Gemini 3.8 Flash / 3.5 Flash)
 * and falls back to Google AI Studio SDK if needed.
 */
export function getSyncFlashModel(preferredModel: string = DEFAULT_FLASH_MODEL, defaultGenerationConfig?: any) {
    return {
        model: preferredModel,
        async generateContent(input: any) {
            const normalized = normalizeToVertexContents(input);
            if (defaultGenerationConfig) {
                normalized.generationConfig = {
                    ...defaultGenerationConfig,
                    ...(normalized.generationConfig || {}),
                };
            }
            try {
                return await generateViaVertexAI(preferredModel, normalized);
            } catch (vertexErr) {
                // Fallback to Google Generative AI SDK if a working GEMINI_API_KEY is configured
                const apiKey = getGeminiApiKey();
                if (apiKey) {
                    const sdkModel = genAI.getGenerativeModel({
                        model: preferredModel,
                        ...(defaultGenerationConfig ? { generationConfig: defaultGenerationConfig } : {}),
                    });
                    return await sdkModel.generateContent(input);
                }
                throw vertexErr;
            }
        },
        startChat(chatParams?: { history?: any[]; systemInstruction?: any; tools?: any[]; generationConfig?: any }) {
            const history: any[] = [...(chatParams?.history || [])];
            return {
                async sendMessage(messageInput: any) {
                    let userParts: any[];
                    if (typeof messageInput === 'string') {
                        userParts = [{ text: messageInput }];
                    } else if (Array.isArray(messageInput)) {
                        userParts = messageInput;
                    } else {
                        userParts = [messageInput];
                    }
                    history.push({ role: 'user', parts: userParts });

                    const result = await generateViaVertexAI(preferredModel, {
                        contents: history,
                        systemInstruction: chatParams?.systemInstruction,
                        tools: chatParams?.tools,
                        generationConfig: {
                            ...(defaultGenerationConfig || {}),
                            ...(chatParams?.generationConfig || {}),
                        },
                    });

                    const modelCandidate = result.response.candidates?.[0]?.content;
                    if (modelCandidate) {
                        history.push({
                            role: 'model',
                            parts: modelCandidate.parts || [{ text: result.response.text() }],
                        });
                    }
                    return result;
                },
            };
        },
    };
}

/**
 * Dynamically queries the Google AI API for the newest available "flash" model
 * that explicitly supports generateContent, defaulting to gemini-3.8-flash.
 */
export async function getLatestFlashModelName(): Promise<string> {
    const now = Date.now();
    if (now - lastFetchedTime < CACHE_TTL_MS && lastFetchedTime !== 0) {
        return cachedModelName;
    }

    try {
        const apiKey = getGeminiApiKey();
        if (!apiKey) return cachedModelName;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (!response.ok) return cachedModelName;

        const data = await response.json();
        if (data && data.models) {
            const flashModels = data.models.filter((m: any) =>
                m.name.includes('gemini-') &&
                m.name.includes('-flash') &&
                !m.name.includes('preview') &&
                !m.name.includes('lite') &&
                !m.name.includes('tts') &&
                !m.name.includes('image') &&
                (m.supportedGenerationMethods || []).includes('generateContent')
            );

            if (flashModels.length > 0) {
                flashModels.sort((a: any, b: any) => {
                    const getVersionStr = (name: string) => {
                        const match = name.match(/gemini-(\d+\.\d+)/);
                        return match ? parseFloat(match[1]) : 0;
                    };
                    return getVersionStr(b.name) - getVersionStr(a.name);
                });

                cachedModelName = flashModels[0].name.replace('models/', '');
                lastFetchedTime = now;
                console.log(`[AI Auto-Update]: Successfully cached newest model: ${cachedModelName}`);
            }
        }
    } catch (error) {
        console.error('[AI Auto-Update]: Failed to fetch newest model, using default', error);
    }

    return cachedModelName;
}

/**
 * Returns an initialized Flash model instance using the latest Gemini 3.8 Flash model.
 */
export async function getFlashModel() {
    const modelName = await getLatestFlashModelName();
    return getSyncFlashModel(modelName);
}

/**
 * Returns an initialized Pro model instance using Gemini 3.1 Pro.
 */
export async function getProModel() {
    return getSyncFlashModel(DEFAULT_PRO_MODEL);
}
