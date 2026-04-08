import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the core SDK
export const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// High-quality fallback model in case of API failure
let cachedModelName = 'gemini-2.5-flash';
let lastFetchedTime = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Dynamically queries the Google AI API for the newest available "flash" model
 * that explicitly supports generateContent, ensuring new API keys never break
 * when older models are deprecated.
 */
export async function getLatestFlashModelName(): Promise<string> {
    const now = Date.now();
    // Return cached name if we've fetched it within exactly 24 hours
    if (now - lastFetchedTime < CACHE_TTL_MS && lastFetchedTime !== 0) {
        return cachedModelName;
    }

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return cachedModelName;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (!response.ok) return cachedModelName;

        const data = await response.json();
        if (data && data.models) {
            // Filter strictly to non-preview flash models that support content generation
            const flashModels = data.models.filter((m: any) => 
                m.name.includes('gemini-') && 
                m.name.includes('-flash') && 
                !m.name.includes('preview') &&
                m.supportedGenerationMethods.includes('generateContent')
            );
            
            if (flashModels.length > 0) {
                // Sort ascending by version string (biggest number first)
                flashModels.sort((a: any, b: any) => {
                    const getVersionStr = (name: string) => {
                        const match = name.match(/gemini-(\d+\.\d+)/);
                        return match ? parseFloat(match[1]) : 0;
                    };
                    return getVersionStr(b.name) - getVersionStr(a.name);
                });

                // Strip 'models/' prefix since SDK auto-prepends it
                cachedModelName = flashModels[0].name.replace('models/', '');
                lastFetchedTime = now;
                console.log(`[AI Auto-Update]: Successfully cached newest model: ${cachedModelName}`);
            }
        }
    } catch (error) {
        console.error("[AI Auto-Update]: Failed to fetch newest model, falling back to 2.5-flash", error);
    }

    return cachedModelName;
}

/**
 * Syntactic sugar wrapper to instantly grab an initialized model 
 * instance utilizing the auto-updated model name.
 */
export async function getFlashModel() {
    const modelName = await getLatestFlashModelName();
    return genAI.getGenerativeModel({ model: modelName });
}
