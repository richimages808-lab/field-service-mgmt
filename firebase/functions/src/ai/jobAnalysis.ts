import * as functions from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import { logGeminiUsage } from '../billing';
import { getFlashModel, getLatestFlashModelName } from './aiConfig';
import { searchVendorsForMaterial } from '../portal';
import { sanitizeForFirestore } from '../utils/sanitize';

const db = admin.firestore();

/**
 * Extract the Storage file path from a Firebase Storage download URL.
 */
function extractStoragePathFromUrl(url: string): string {
    if (url.includes('firebasestorage.googleapis.com')) {
        const match = url.match(/\/o\/(.+?)\?/);
        if (match) return decodeURIComponent(match[1]);
    } else if (url.includes('storage.googleapis.com')) {
        const parts = url.split('/');
        return parts.slice(4).join('/');
    }
    throw new Error(`Invalid storage URL format: ${url}`);
}

/**
 * Download job photos from Firebase Storage and convert to Gemini-compatible
 * inline data parts for multimodal analysis.
 */
async function downloadJobPhotos(photoUrls: string[], maxPhotos: number = 5): Promise<Array<{ inlineData: { data: string; mimeType: string } }>> {
    const photoParts: Array<{ inlineData: { data: string; mimeType: string } }> = [];
    const bucket = admin.storage().bucket();

    for (const photoUrl of photoUrls.slice(0, maxPhotos)) {
        try {
            const filePath = extractStoragePathFromUrl(photoUrl);
            const file = bucket.file(filePath);
            const [fileBuffer] = await file.download();
            const base64Image = fileBuffer.toString('base64');
            const ext = filePath.split('.').pop()?.toLowerCase() || 'jpeg';
            const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
            photoParts.push({ inlineData: { data: base64Image, mimeType } });
            console.log(`[JobAnalysis] Included photo for AI analysis: ${filePath}`);
        } catch (photoErr) {
            console.warn(`[JobAnalysis] Failed to download photo (skipping): ${photoUrl}`, photoErr);
        }
    }

    return photoParts;
}

interface AIRecommendation {
    diagnosis: string;
    solution: string;
    partsNeeded: Array<{ name: string; estimatedCost?: number }>;
    toolsNeeded?: string[];
    estimatedDuration: number;
    confidence: number;
    safetyWarnings?: string[];
    customerAvailability?: string[];
    jobClassification?: {
        jobType: string;
        tradeCategory: string;
        primaryItem: string | null;
    };
}

/**
 * Analyze a job using Gemini AI to provide diagnosis, solution, and parts recommendations
 */
export const analyzeJobWithAI = functions.https.onCall(async (data, context) => {
    // Require authentication
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { jobId } = data;

    if (!jobId) {
        throw new functions.https.HttpsError('invalid-argument', 'jobId is required');
    }

    try {
        // Fetch job details
        const jobDoc = await db.collection('jobs').doc(jobId).get();

        if (!jobDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Job not found');
        }

        const job = jobDoc.data();
        if (!job) {
            throw new functions.https.HttpsError('not-found', 'Job data is empty');
        }

        // Fetch technician's inventory if available
        const techInventory = await fetchTechInventory(context.auth.uid);

        // Fetch org profile for business-type-aware recommendations
        const orgProfile = job.org_id ? await fetchOrgProfile(job.org_id) : undefined;

        // Build the prompt for Gemini
        // Fetch org-learned patterns
        let orgPatterns = '';
        try {
            const { fetchOrgPatterns } = await import('./aiLearning');
            orgPatterns = await fetchOrgPatterns(job.org_id, job.request?.description || '', job.aiRecommendation?.jobClassification);
        } catch (e) {
            console.warn('Could not fetch org AI patterns:', e);
        }

        const prompt = buildAnalysisPrompt(job, techInventory, orgProfile, orgPatterns);

        // Build multimodal content: text prompt + customer photos
        const contentParts: any[] = [prompt];
        const photoUrls: string[] = job.request?.photos || [];
        if (photoUrls.length > 0) {
            const photoParts = await downloadJobPhotos(photoUrls);
            contentParts.push(...photoParts);
            console.log(`[analyzeJobWithAI] Sending ${photoParts.length} photo(s) to Gemini for job ${jobId}`);
        }

        const model = await getFlashModel();
        const result = await model.generateContent(contentParts);
        const response = await result.response;

        if (response.usageMetadata?.totalTokenCount) {
            await logGeminiUsage(response.usageMetadata.totalTokenCount, await getLatestFlashModelName(), 'analyzeJobWithAI');
        }

        const text = response.text();

        // Parse the AI response
        const recommendation = parseAIResponse(text, techInventory, job?.request?.description || '');

        // Save recommendation to job document
        await db.collection('jobs').doc(jobId).update({
            aiRecommendation: recommendation,
            aiAnalyzedAt: FieldValue.serverTimestamp(),
        });

        return {
            success: true,
            recommendation,
        };
    } catch (error: any) {
        console.error('AI analysis failed:', error);
        throw new functions.https.HttpsError('internal', `AI analysis failed: ${error.message}`);
    }
});

// ─── Helper: fetch similar completed jobs for calibration (mirrors aiQuoteGenerator) ──
async function fetchSimilarCompletedJobs(orgId: string, description: string): Promise<any[]> {
    try {
        const snap = await db.collection('jobs')
            .where('org_id', '==', orgId)
            .where('status', '==', 'completed')
            .orderBy('finished_at', 'desc')
            .limit(50)
            .get();
        const completedJobs: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (!description || completedJobs.length === 0) return [];

        // Simple keyword matching — same logic as aiQuoteGenerator.ts
        const stopWords = new Set(['a', 'an', 'the', 'to', 'in', 'my', 'is', 'and', 'or', 'for', 'of', 'on', 'at', 'it', 'i', 'we', 'need', 'have', 'has']);
        const keywords = description.toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 2 && !stopWords.has(w));

        if (keywords.length === 0) return [];

        const scored = completedJobs
            .map(job => {
                const jobDesc = (job.request?.description || '').toLowerCase();
                const matches = keywords.filter(kw => jobDesc.includes(kw)).length;
                return { ...job, matchScore: matches / keywords.length };
            })
            .filter(j => j.matchScore >= 0.3)
            .sort((a, b) => b.matchScore - a.matchScore)
            .slice(0, 5);

        return scored;
    } catch (err) {
        console.warn('[JobEstimate] Could not fetch similar jobs:', err);
        return [];
    }
}

// ─── Helper: fetch customer-specific job history ──────────────────────────────
async function fetchCustomerJobHistory(orgId: string, customerName: string): Promise<any[]> {
    try {
        if (!customerName || customerName.trim().length < 2) return [];
        const nameLower = customerName.trim().toLowerCase();

        // Query completed/in-progress jobs for this org, then filter by customer name
        const snap = await db.collection('jobs')
            .where('org_id', '==', orgId)
            .orderBy('created_at', 'desc')
            .limit(100)
            .get();

        const customerJobs = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter((j: any) => {
                const jName = (j.customer?.name || '').toLowerCase();
                return jName === nameLower || jName.includes(nameLower) || nameLower.includes(jName);
            })
            .slice(0, 10);

        return customerJobs;
    } catch (err) {
        console.warn('[JobEstimate] Could not fetch customer history:', err);
        return [];
    }
}

/**
 * Generate an AI job estimate from raw form data (before saving the job).
 * Returns diagnosis, solution, parts, estimated duration, cost breakdown, and confidence.
 * Now includes work history calibration (matching the quote AI engine).
 */
export const generateJobEstimate = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { description, category, priority, address, siteName, orgId, customerName, previousEstimate } = data;

    if (!description || typeof description !== 'string' || description.trim().length < 5) {
        throw new functions.https.HttpsError('invalid-argument', 'A job description is required (at least 5 characters)');
    }

    try {
        // Fetch the org's materials inventory for real pricing context
        let orgMaterials: any[] = [];
        const resolvedOrgId = orgId || (context.auth as any)?.token?.org_id || 'demo-org';

        // Fetch materials, similar jobs, and customer history in parallel
        const [materialsResult, similarJobs, customerHistory] = await Promise.all([
            db.collection('materials')
                .where('org_id', '==', resolvedOrgId)
                .get()
                .then(snap => snap.docs.map(doc => ({ id: doc.id, ...doc.data() })))
                .catch(err => { console.warn('Could not fetch org materials:', err); return [] as any[]; }),
            fetchSimilarCompletedJobs(resolvedOrgId, description.trim()),
            customerName ? fetchCustomerJobHistory(resolvedOrgId, customerName) : Promise.resolve([]),
        ]);
        orgMaterials = materialsResult;

        console.log(`[JobEstimate] Context: ${orgMaterials.length} materials, ${similarJobs.length} similar jobs, ${customerHistory.length} customer history items`);

        // ── Duration calibration from past jobs (same logic as aiQuoteGenerator) ──
        let durationMultiplier = 1.0;
        if (similarJobs.length > 0) {
            const ratios = similarJobs
                .filter(j => j.estimated_duration && j.finished_at && j.scheduled_at)
                .map(j => {
                    const actualMs = (j.finished_at?.toDate?.() || j.finished_at?._seconds ? new Date(j.finished_at._seconds * 1000) : new Date()).getTime()
                        - (j.scheduled_at?.toDate?.() || j.scheduled_at?._seconds ? new Date(j.scheduled_at._seconds * 1000) : new Date()).getTime();
                    const actualMins = actualMs / 60000;
                    return actualMins > 0 ? actualMins / j.estimated_duration : 1;
                })
                .filter(r => r > 0.2 && r < 5); // Filter outliers

            if (ratios.length > 0) {
                durationMultiplier = ratios.reduce((a, b) => a + b, 0) / ratios.length;
                console.log(`[JobEstimate] Duration calibration: ${durationMultiplier.toFixed(2)}x from ${ratios.length} similar jobs`);
            }
        }

        // Build a lightweight job-like object for the prompt builder
        const pseudoJob = {
            customer: { name: customerName || 'Customer', address: address || '' },
            request: { description: description.trim(), type: category || 'General Service', photos: [] },
            priority: priority || 'medium',
            complexity: 'unknown',
            site_name: siteName || ''
        };

        const prompt = buildEstimatePrompt(pseudoJob, orgMaterials, similarJobs, customerHistory, previousEstimate);

        const model = await getFlashModel();
        const result = await model.generateContent(prompt);
        const response = await result.response;

        if (response.usageMetadata?.totalTokenCount) {
            await logGeminiUsage(response.usageMetadata.totalTokenCount, await getLatestFlashModelName(), 'generateJobEstimate');
        }

        const text = response.text();
        const recommendation = parseAIResponse(text, [], description);

        // Apply duration calibration from work history
        if (durationMultiplier !== 1.0 && recommendation.estimatedDuration) {
            const original = recommendation.estimatedDuration;
            recommendation.estimatedDuration = Math.max(15, Math.round(original * durationMultiplier));
            console.log(`[JobEstimate] Duration calibrated: ${original}min → ${recommendation.estimatedDuration}min (${durationMultiplier.toFixed(2)}x)`);
        }

        // Cross-reference parts with org inventory & vendor catalog for real pricing across all vendors
        if (recommendation.partsNeeded && recommendation.partsNeeded.length > 0) {
            // Deduplicate partsNeeded by normalized material key
            const partsMap = new Map<string, any>();
            for (const p of recommendation.partsNeeded) {
                if (!p || !p.name) continue;
                const { isReusableTechnicianTool } = require('../portal');
                if (isReusableTechnicianTool(p.name)) {
                    console.log(`[JobEstimate] Filtered reusable technician tool from partsNeeded: ${p.name}`);
                    continue;
                }
                const normKey = p.name.toLowerCase().replace(/\(optional\)/gi, '').replace(/\(required\)/gi, '').replace(/[^a-z0-9]/g, '').trim();
                if (!normKey) continue;

                if (partsMap.has(normKey)) {
                    const existing = partsMap.get(normKey);
                    existing.quantity = Math.max(Number(existing.quantity) || 1, Number((p as any).quantity) || 1);
                    if ((p as any).essential) existing.essential = true;
                } else {
                    partsMap.set(normKey, { ...p });
                }
            }

            const deduplicatedParts = Array.from(partsMap.values());
            const orgVendorsSnap = await db.collection('vendors').where('org_id', '==', orgId).get().catch(() => null);
            const orgVendors = orgVendorsSnap ? orgVendorsSnap.docs.map(d => ({ id: d.id, ...d.data() })) : [];

            recommendation.partsNeeded = await Promise.all(deduplicatedParts.map(async part => {
                const match = findMaterialMatch(part.name, orgMaterials);
                const alternateVendorsMap = new Map<string, {
                    vendorId: string;
                    vendorName: string;
                    unitCost: number;
                    vendorProductUrl?: string;
                    estimatedDeliveryDays?: number;
                }>();

                let bestCost = part.estimatedCost || 0;
                let vendorName: string | undefined;
                let vendorProductUrl: string | undefined;
                let priceSource: string = 'ai_estimate';

                if (match) {
                    const vendors = match.vendors as any[] | undefined;
                    if (vendors && vendors.length > 0) {
                        for (const v of vendors) {
                            if (v.unitCost != null && v.unitCost > 0) {
                                const vKey = (v.vendorName || v.vendorId || '').toLowerCase();
                                alternateVendorsMap.set(vKey, {
                                    vendorId: v.vendorId || v.vendorName || '',
                                    vendorName: v.vendorName || 'Unknown Vendor',
                                    unitCost: v.unitCost,
                                    vendorProductUrl: v.vendorProductUrl || undefined,
                                    estimatedDeliveryDays: v.estimatedDeliveryDays || undefined,
                                });
                            }
                        }

                        const preferredVendorId = match.preferredVendorId;
                        let bestVendor = preferredVendorId
                            ? vendors.find((v: any) => v.vendorId === preferredVendorId)
                            : null;
                        if (!bestVendor) {
                            bestVendor = vendors.find((v: any) => v.unitCost != null && v.unitCost > 0);
                        }
                        if (bestVendor && bestVendor.unitCost > 0) {
                            bestCost = bestVendor.unitCost;
                            vendorName = bestVendor.vendorName;
                            vendorProductUrl = bestVendor.vendorProductUrl || undefined;
                            priceSource = 'vendor';
                        }
                    }

                    if (bestCost === (part.estimatedCost || 0) && match.unitCost && match.unitCost > 0) {
                        bestCost = match.unitCost;
                        priceSource = 'inventory';
                    }
                }

                // Search org vendors for live catalog prices for ALL vendors
                if (orgVendors.length > 0) {
                    try {
                        const searchRes = await searchVendorsForMaterial(part.name, orgVendors);
                        if (searchRes) {
                            if (searchRes.bestVendor) {
                                const bestVKey = searchRes.bestVendor.vendorName.toLowerCase();
                                if (!alternateVendorsMap.has(bestVKey)) {
                                    alternateVendorsMap.set(bestVKey, {
                                        vendorId: searchRes.bestVendor.vendorName,
                                        vendorName: searchRes.bestVendor.vendorName,
                                        unitCost: searchRes.bestVendor.price,
                                        vendorProductUrl: searchRes.bestVendor.productUrl,
                                    });
                                }
                                if (priceSource !== 'inventory' && !vendorName) {
                                    bestCost = searchRes.bestVendor.price;
                                    vendorName = searchRes.bestVendor.vendorName;
                                    vendorProductUrl = searchRes.bestVendor.productUrl;
                                    priceSource = 'vendor';
                                }
                            }
                            for (const alt of searchRes.alternateVendors) {
                                const vKey = alt.vendorName.toLowerCase();
                                if (!alternateVendorsMap.has(vKey)) {
                                    alternateVendorsMap.set(vKey, alt);
                                }
                            }
                        }
                    } catch (err) {
                        console.warn(`Vendor search failed in job analysis for "${part.name}":`, err);
                    }
                }

                const activeVendorKey = (vendorName || '').toLowerCase();
                const finalAlternateVendors = Array.from(alternateVendorsMap.values())
                    .filter(v => (v.vendorName || '').toLowerCase() !== activeVendorKey);

                const isMatchSpecific = match && (match.name.toLowerCase() === part.name.toLowerCase() ||
                    (match.name.split(' ').length >= part.name.split(' ').length));

                return {
                    ...part,
                    name: (isMatchSpecific && match) ? match.name : part.name,
                    estimatedCost: bestCost > 0 ? bestCost : part.estimatedCost,
                    materialId: match?.id || undefined,
                    priceSource: vendorName ? 'vendor' : (match && match.unitCost > 0 ? 'inventory' : 'ai_estimate'),
                    vendorName,
                    vendorProductUrl,
                    alternateVendors: finalAlternateVendors.length > 0 ? finalAlternateVendors : undefined,
                };
            }));
        }

        // Calculate a simple cost estimate summary from the parts
        const totalMaterialCost = recommendation.partsNeeded.reduce(
            (sum, p) => sum + (p.estimatedCost || 0) * ((p as any).quantity || 1), 0
        );

        const cleanRecommendation = sanitizeForFirestore(recommendation);

        return {
            success: true,
            recommendation: cleanRecommendation,
            costSummary: {
                estimatedMaterialCost: Math.round(totalMaterialCost * 100) / 100,
                estimatedLaborMinutes: recommendation.estimatedDuration,
                partsCount: recommendation.partsNeeded.length,
            },
            historyContext: {
                similarJobsFound: similarJobs.length,
                customerHistoryFound: customerHistory.length,
                durationCalibration: durationMultiplier !== 1.0 ? `${durationMultiplier.toFixed(2)}x` : null,
            }
        };
    } catch (error: any) {
        console.error('AI job estimate failed:', error);
        throw new functions.https.HttpsError('internal', `AI estimate failed: ${error.message}`);
    }
});

/**
 * Build the estimate prompt for Gemini — works with raw form data (no saved job required)
 * Includes org materials inventory and work history for calibrated estimates.
 */
function buildEstimatePrompt(
    job: any,
    orgMaterials: any[] = [],
    similarJobs: any[] = [],
    customerHistory: any[] = [],
    previousEstimate?: any
): string {
    // Build a compact inventory summary for the AI to reference
    let inventoryContext = '';
    if (orgMaterials.length > 0) {
        const inventoryLines = orgMaterials
            .filter(m => m.name && (m.unitCost > 0 || m.unitPrice > 0 || (m.vendors && m.vendors.length > 0)))
            .slice(0, 100) // Limit to 100 items to avoid token overflow
            .map(m => {
                // Get the best price from vendors or unitCost
                let price = m.unitCost || m.unitPrice || 0;
                let source = 'inventory';
                if (m.vendors && m.vendors.length > 0) {
                    const bestVendor = m.vendors.find((v: any) => v.unitCost > 0);
                    if (bestVendor) {
                        price = bestVendor.unitCost;
                        source = bestVendor.vendorName || 'vendor';
                    }
                }
                return `- ${m.name}: $${price.toFixed(2)} (${source})${m.quantity != null ? ` [${m.quantity} in stock]` : ''}`;
            });

        if (inventoryLines.length > 0) {
            inventoryContext = `\n\n**Company Materials Inventory (use these prices when a match exists):**\n${inventoryLines.join('\n')}`;
        }
    }

    // Build work history context for the AI
    let workHistoryContext = '';
    if (similarJobs.length > 0) {
        const jobSummaries = similarJobs.slice(0, 5).map(j => {
            const desc = (j.request?.description || 'No description').substring(0, 120);
            const duration = j.estimated_duration ? `${j.estimated_duration}min estimated` : '';
            let actualDuration = '';
            if (j.finished_at && j.scheduled_at) {
                const finishedMs = j.finished_at?.toDate?.()?.getTime?.() || (j.finished_at?._seconds ? j.finished_at._seconds * 1000 : 0);
                const scheduledMs = j.scheduled_at?.toDate?.()?.getTime?.() || (j.scheduled_at?._seconds ? j.scheduled_at._seconds * 1000 : 0);
                if (finishedMs && scheduledMs) {
                    const actualMins = Math.round((finishedMs - scheduledMs) / 60000);
                    if (actualMins > 0) actualDuration = `, ${actualMins}min actual`;
                }
            }
            const parts = (j.parts || j.materials || []).slice(0, 5).map((p: any) => p.name || p.description).join(', ');
            return `  - "${desc}" (${duration}${actualDuration})${parts ? ` | Parts used: ${parts}` : ''}`;
        });
        workHistoryContext += `\n\n**Similar Past Completed Jobs (use for calibration):**\n${jobSummaries.join('\n')}`;
    }

    if (customerHistory.length > 0) {
        const custSummaries = customerHistory.slice(0, 5).map(j => {
            const desc = (j.request?.description || 'No description').substring(0, 100);
            const status = j.status || 'unknown';
            const date = j.created_at?.toDate?.()?.toLocaleDateString?.() || (j.created_at?._seconds ? new Date(j.created_at._seconds * 1000).toLocaleDateString() : 'Unknown date');
            return `  - [${date}] "${desc}" (Status: ${status})`;
        });
        workHistoryContext += `\n\n**Work History for ${job.customer.name}:**\n${custSummaries.join('\n')}\nUse this history to identify recurring issues or patterns. If this customer has had similar problems before, factor that into your diagnosis and recommendations.`;
    }

    let previousEstimateContext = '';
    if (previousEstimate) {
        previousEstimateContext = `\n\n**Previous AI Estimate (User requested refinement/regeneration):**
- Previous Diagnosis: ${previousEstimate.diagnosis || 'None'}
- Previous Solution: ${previousEstimate.solution || 'None'}
- Previous Parts: ${JSON.stringify(previousEstimate.partsNeeded || [])}
- Previous Duration: ${previousEstimate.estimatedDuration || 0} minutes

**REFINEMENT & CLEANUP INSTRUCTIONS:**
1. Clean up and refine the previous estimate. DO NOT add duplicate items or extra fixtures.
2. Ensure the parts list is minimal, precise, and contains ONLY what is required for the repair.
3. If this is a repair job (e.g., running toilet, leaking faucet), DO NOT suggest replacing the entire toilet or sink fixture! Suggest ONLY internal tank repair parts (e.g., Toilet Tank Rebuild Kit, Fill Valve, or Flapper).`;
    }

    return `You are an expert field service technician assistant specializing in HVAC, plumbing, electrical, and general home services. Analyze this service request and provide a detailed, complete estimate.

**Service Request:**
- Issue Description: ${job.request.description}
- Service Type: ${job.request.type || 'General Service'}
- Priority: ${job.priority}
- Customer: ${job.customer.name || 'Not specified'}
- Location: ${job.customer.address || 'Not specified'}
${job.site_name ? `- Site: ${job.site_name}` : ''}
${inventoryContext}${workHistoryContext}${previousEstimateContext}

**Please provide a structured analysis in the following JSON format:**

{
  "jobClassification": {
    "jobType": "repair|replacement|installation|maintenance|diagnostic",
    "tradeCategory": "plumbing|electrical|hvac|general",
    "primaryItem": "The fixture/system being worked on (e.g. 'toilet', 'faucet', 'AC unit'), or null"
  },
  "diagnosis": "Brief diagnosis of the likely issue (2-3 sentences)",
  "solution": "Step-by-step recommended solution (3-5 steps)",
  "partsNeeded": [
    {"name": "Repair part or consumable name", "estimatedCost": 15.50, "quantity": 1}
  ],
  "toolsNeeded": ["Pipe wrench", "Basin wrench", "Level"],
  "estimatedDuration": 90,
  "confidence": 0.85,
  "safetyWarnings": ["Warning 1", "Warning 2"]
}

**HOLISTIC COMPREHENSIVE ISSUE EVALUATION MANDATE (CRITICAL):**
You MUST analyze the issue description as a complete, unified problem statement — DO NOT evaluate single keywords or isolated nouns in isolation!
1. **Full Statement Evaluation**: Read the entire sentence structure, verbs, symptoms, locations, and root causes together before deciding on diagnosis, solution, or parts.
2. **Never Over-Index on Noun Keywords**: Seeing a word like "toilet", "sink", "faucet", "AC", "heater", or "pipe" MUST NOT trigger a recommendation to replace the entire fixture or unit!
3. **Distinguish Fixture vs. Component**: Distinguish between the overall *fixture* (e.g., toilet) and the specific *failing component* (e.g., flapper valve, fill valve, tank gasket). If the issue describes running water, leaking, clicking, unclogging, or noise, recommend ONLY internal repair parts or rebuild kits, NEVER a whole fixture replacement.
4. **Holistic Action Determination**: Determine whether to repair, replace, or diagnose based on the COMBINED context of all words, severity indicators, and explicit customer requests.

**REPAIR vs. REPLACEMENT — CRITICAL RULE (READ THIS FIRST):**
Before recommending ANY major fixture or equipment in partsNeeded, you MUST first classify the job:

**REPAIR/SERVICE jobs** (clog, leak, malfunction, noise, running water, intermittent issue, "fix", "not working"):
  → Recommend ONLY consumables, repair parts, and supplies — NOT a replacement fixture.
  → A clogged toilet needs a wax ring, flapper, fill valve, or drain cleaner — NOT a new toilet.
  → A leaking faucet needs a cartridge, washer, O-ring, or gasket — NOT a new faucet.
  → A running toilet needs a flapper or fill valve — NOT a new toilet.
  → A noisy HVAC unit needs diagnostics, cleaning, or a capacitor — NOT a new AC unit.

**REPLACEMENT jobs** (customer explicitly says "replace", "install new", "swap out", "upgrade", or fixture is confirmed broken beyond repair):
  → Include the replacement fixture in partsNeeded.

**When in doubt, ALWAYS default to REPAIR.** Most service calls are repairs, not replacements.

**CRITICAL GUIDELINES:**
1. **ONLY recommend parts and fixtures that are DIRECTLY relevant to the customer's described issue.** Read the Issue Description carefully and recommend ONLY the specific items the customer is asking about. For example, if the customer says "replace 2 bathroom sinks", recommend sinks and sink-related accessories — do NOT recommend toilets, water heaters, or other unrelated fixtures.
2. **For REPLACEMENT jobs ONLY:** The PRIMARY item being replaced MUST be listed in partsNeeded with realistic retail pricing — but ONLY include the ones relevant to this specific request.
3. Then include all necessary accessories, connectors, supplies, and consumables that are specifically needed for the described work (e.g., supply lines, mounting hardware, drain assemblies, caulk, fittings, etc.).
4. **DO NOT add unrelated fixtures or equipment.** A request to replace sinks should NOT include toilets. A request to fix a faucet should NOT include a water heater. Stay strictly within the scope of what the customer described.
5. NEVER include technician-owned tools in partsNeeded — only items that are installed, consumed, or left behind on-site.
6. **toolsNeeded** should list the technician tools/equipment needed for this job (e.g., pipe wrench, basin wrench, drill, level, multimeter, etc.). These are tools the tech brings — NOT parts left behind.
7. If a Company Materials Inventory is provided above, match items against it and use those prices. For items not in inventory, use realistic current retail pricing.
8. Each part MUST have a realistic estimatedCost in USD. Never use $0 or leave cost blank.
9. Estimate realistic duration in minutes (include travel, diagnosis, repair, and cleanup). If similar past jobs are provided above, calibrate your estimate based on how long those actually took.
10. Confidence should be 0-1 based on how much information was provided. Vague descriptions = lower confidence.
11. Include safety warnings if applicable (electrical hazards, gas lines, water damage, etc.).
12. If the description is vague, lower confidence and note what additional information would help.
13. If customer work history is provided, reference recurring issues or patterns in your diagnosis.
14. CRITICAL MANDATE: NEVER group materials into generic terms like "Miscellaneous service consumables", "Consumables", "Hardware & Supplies", or "Tape & Fasteners". YOU MUST BREAK DOWN and list EVERY SINGLE material, part, supply, or consumable as an INDIVIDUAL SPECIFIC ITEM on its own line with its exact specific product name (e.g. "Pipe Sealant Tape", "Plumber's Putty 14oz", "Toilet Wax Ring with Closet Bolts").

Respond ONLY with valid JSON, no additional text.`;
}

/**
 * Find a matching material in the org inventory by name (fuzzy match)
 */
function findMaterialMatch(name: string, inventory: any[]): any | null {
    if (!name) return null;
    const normalizedName = name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    if (!normalizedName) return null;

    const majorCategories = new Set([
        'toilet', 'sink', 'faucet', 'shower', 'tub', 'bathtub', 'ac', 'hvac',
        'boiler', 'furnace', 'pipe', 'water heater', 'drain', 'pump', 'unit',
        'fixture', 'appliance', 'disposal'
    ]);

    // 1. Exact match first
    let match = inventory.find(m => (m.name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim() === normalizedName);
    if (match) return match;

    // 2. Inventory item name contains the recommended part name (e.g. inventory has "Mansfield Toilet Flapper", recommended is "Toilet Flapper")
    match = inventory.find(m => {
        const mName = (m.name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        return mName.length >= normalizedName.length && mName.includes(normalizedName);
    });
    if (match) return match;

    // 3. Recommended part name contains the inventory item name ONLY IF inventory item name is not just a major fixture category
    match = inventory.find(m => {
        const mName = (m.name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        if (majorCategories.has(mName)) return false;
        return mName.length >= 4 && normalizedName.includes(mName);
    });
    if (match) return match;

    // 4. Word overlap match (at least 60% of words match, avoiding component vs fixture mismatches)
    const componentKeywords = ['flapper', 'valve', 'kit', 'ring', 'gasket', 'seal', 'line', 'cartridge', 'handle', 'lever', 'tape', 'fitting', 'coupling', 'elbow', 'trap', 'assembly', 'rebuild'];
    const hasComponentWord = componentKeywords.some(w => normalizedName.includes(w));

    const nameWords = normalizedName.split(/\s+/).filter(w => w.length > 2);
    if (nameWords.length === 0) return null;

    match = inventory.find(m => {
        const mName = (m.name || '').toLowerCase();
        if (hasComponentWord && !componentKeywords.some(w => mName.includes(w))) {
            return false; // Don't match component (e.g. flapper) to fixture (e.g. toilet)
        }
        const mWords = mName.split(/\s+/);
        const overlap = nameWords.filter(w => mWords.some((mw: string) => mw.includes(w) || w.includes(mw))).length;
        return overlap / Math.max(nameWords.length, 1) >= 0.6;
    });

    return match || null;
}


/**
 * Automatically analyze jobs when they're created
 */
export const autoAnalyzeNewJob = functions.firestore
    .document('jobs/{jobId}')
    .onCreate(async (snap, context) => {
        const job = snap.data();
        const jobId = context.params.jobId;

        // Only analyze if there's a description and it's not a parts run
        if (!job.request?.description || job.type === 'parts_run') {
            return;
        }

        try {
            // Fetch technician's inventory if assigned
            const techInventory = job.assigned_tech_id
                ? await fetchTechInventory(job.assigned_tech_id)
                : [];

            // Fetch org profile for business-type-aware recommendations
            const orgProfile = job.org_id ? await fetchOrgProfile(job.org_id) : undefined;

            // Fetch org-learned patterns
            let orgPatterns = '';
            try {
                const { fetchOrgPatterns } = await import('./aiLearning');
                orgPatterns = await fetchOrgPatterns(job.org_id, job.request?.description || '');
            } catch (e) {
                console.warn('Could not fetch org AI patterns:', e);
            }

            // Build the prompt
            const prompt = buildAnalysisPrompt(job, techInventory, orgProfile, orgPatterns);

            // Build multimodal content: text prompt + customer photos
            const contentParts: any[] = [prompt];
            const photoUrls: string[] = job.request?.photos || [];
            if (photoUrls.length > 0) {
                const photoParts = await downloadJobPhotos(photoUrls);
                contentParts.push(...photoParts);
                console.log(`[autoAnalyzeNewJob] Sending ${photoParts.length} photo(s) to Gemini for job ${jobId}`);
            }

            // Call Gemini API
            const model = await getFlashModel();
            const result = await model.generateContent(contentParts);
            const response = await result.response;

            if (response.usageMetadata?.totalTokenCount) {
                await logGeminiUsage(response.usageMetadata.totalTokenCount, await getLatestFlashModelName(), 'autoAnalyzeNewJob');
            }

            const text = response.text();

            // Parse the AI response
            const recommendation = parseAIResponse(text, techInventory, job?.request?.description || '');

            // Fetch org profile to check for auto-scheduling settings
            const orgId = job.org_id;
            let autoApprove = false;
            // Quote request jobs (quote_pending status or ticket-linked) must never be auto-approved without tech & customer sign off
            const isQuoteRequestJob = job.status === 'quote_pending' || !!job.ticketId;
            if (orgId && !isQuoteRequestJob) {
                try {
                    const orgDoc = await db.collection('organizations').doc(orgId).get();
                    if (orgDoc.exists) {
                        autoApprove = !!orgDoc.data()?.autoApproveScheduling;
                    }
                } catch (orgErr) {
                    console.warn(`[autoAnalyzeNewJob] Failed to check autoApproveScheduling for org ${orgId}:`, orgErr);
                }
            }

            if (autoApprove) {
                console.log(`[autoAnalyzeNewJob] Auto-scheduling enabled for org ${orgId}. Generating auto-approved quote...`);
                // 1. Generate line items
                const lineItems: any[] = [];
                let total = 0;

                // Labor item
                const durationMinutes = recommendation.estimatedDuration || 60;
                const hours = durationMinutes / 60;
                const laborRate = 120; // default standard labor rate
                const laborTotal = Math.round(hours * laborRate * 100) / 100;
                lineItems.push({
                    description: `${job.request?.type || 'Service'} Labor`,
                    quantity: 1,
                    unitPrice: laborTotal,
                    total: laborTotal,
                    type: 'labor'
                });
                total += laborTotal;

                // Material items
                if (recommendation.partsNeeded && recommendation.partsNeeded.length > 0) {
                    for (const part of recommendation.partsNeeded) {
                        const neededQty = (part as any).quantity || 1;
                        const unitCost = part.estimatedCost || 15;
                        const partTotal = Math.round(unitCost * neededQty * 100) / 100;
                        lineItems.push({
                            description: part.name,
                            quantity: neededQty,
                            unitPrice: unitCost,
                            total: partTotal,
                            type: 'material',
                            materialId: (part as any).materialId || null
                        });
                        total += partTotal;
                    }
                }

                // 2. Create Quote document
                const quoteRef = db.collection('quotes').doc();
                await quoteRef.set({
                    org_id: orgId,
                    jobId: jobId,
                    status: 'approved',
                    lineItems,
                    total: Math.round(total * 100) / 100,
                    tax: 0,
                    discount: 0,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                // 3. Update job to pending and link quote
                await snap.ref.update({
                    aiRecommendation: recommendation,
                    aiAnalyzedAt: admin.firestore.FieldValue.serverTimestamp(),
                    status: 'pending',
                    quoteId: quoteRef.id,
                    active_quote_id: quoteRef.id,
                    quoteStatus: 'approved'
                });
                console.log(`[autoAnalyzeNewJob] Quote ${quoteRef.id} auto-created and approved. Job ${jobId} set to pending.`);
            } else {
                // Save recommendation
                await snap.ref.update({
                    aiRecommendation: recommendation,
                    aiAnalyzedAt: FieldValue.serverTimestamp(),
                });
            }

            console.log(`AI analysis completed for job ${jobId}`);
        } catch (error) {
            console.error(`AI analysis failed for job ${jobId}:`, error);
            // Don't throw - job creation should still succeed even if AI fails
        }
    });

/**
 * Fetch technician's parts and tools inventory
 */
async function fetchTechInventory(techId: string): Promise<any[]> {
    try {
        const inventorySnapshot = await db
            .collection('inventory')
            .where('techId', '==', techId)
            .get();

        return inventorySnapshot.docs.map(doc => doc.data());
    } catch (error) {
        console.error('Failed to fetch inventory:', error);
        return [];
    }
}

/**
 * Fetch organization profile for business-type-aware AI recommendations
 */
async function fetchOrgProfile(orgId: string): Promise<{ industry?: string; services?: string[]; businessName?: string } | undefined> {
    try {
        const orgDoc = await db.collection('organizations').doc(orgId).get();
        if (!orgDoc.exists) return undefined;
        const data = orgDoc.data();
        return {
            industry: data?.industry || data?.settings?.industry,
            services: data?.services || data?.settings?.serviceTypes,
            businessName: data?.name || data?.businessName,
        };
    } catch (error) {
        console.error('Failed to fetch org profile:', error);
        return undefined;
    }
}

/**
 * Build the analysis prompt for Gemini
 */
function buildAnalysisPrompt(job: any, inventory: any[], orgProfile?: { industry?: string; services?: string[]; businessName?: string }, orgPatterns?: string): string {
    const inventoryList = inventory.length > 0
        ? `\n\nTechnician's current inventory:\n${inventory.map(item => `- ${item.name} (${item.quantity || 'unknown qty'})`).join('\n')}`
        : '\n\nNote: Technician inventory is empty or not available.';

    let orgContext = '';
    if (orgProfile) {
        orgContext = `\n\n**Business Context:**
- Company: ${orgProfile.businessName || 'Field Service Company'}
- Industry: ${orgProfile.industry || 'General Field Service'}
- Services Offered: ${orgProfile.services?.join(', ') || 'General maintenance and repair'}
Your recommendations should be appropriate for a ${orgProfile.industry || 'field service'} business. The technicians will have standard ${orgProfile.industry || 'trade'} tools on hand.`;
    }

    return `You are an expert HVAC, plumbing, and electrical technician assistant. Analyze this service job and provide recommendations.

**Job Details:**
- Customer: ${job.customer.name}
- Issue Description: ${job.request.description}
- Job Type: ${job.request.type || 'General Service'}
- Priority: ${job.priority}
- Complexity: ${job.complexity || 'unknown'}
${job.request.photos?.length > 0 ? `
**PHOTOS: ${job.request.photos.length} customer photo(s) are attached as inline images below this prompt.**
You MUST analyze each photo carefully. Look for:
  • The specific issue or damage visible
  • The type of fixture/equipment/system shown
  • Any parts or materials already visible that may need replacement
  • Whether the item is REPAIRABLE or needs FULL REPLACEMENT based on what you see
Reference what you see in the photos in your "diagnosis" field. For example:
  "Based on the photos, the leak appears to originate from a corroded copper fitting near the shut-off valve..."
  Do NOT say "no photos were provided" or "cannot determine from photos" — you can see them right here.
` : '- Photos Available: 0'}
${inventoryList}${orgContext}${orgPatterns || ''}

**Please provide a structured analysis in the following JSON format:**

{
  "jobClassification": {
    "jobType": "repair|replacement|installation|maintenance|diagnostic",
    "tradeCategory": "plumbing|electrical|hvac|general",
    "primaryItem": "The fixture/system being worked on (e.g. 'toilet', 'faucet', 'AC unit'), or null"
  },
  "diagnosis": "Brief diagnosis of the likely issue (2-3 sentences)",
  "solution": "Step-by-step recommended solution (3-5 steps)",
  "partsNeeded": [
    {"name": "Repair part or consumable name", "estimatedCost": 15.50, "quantity": 1, "essential": true}
  ],
  "toolsNeeded": ["Pipe wrench", "Basin wrench", "Level"],
  "estimatedDuration": 90,
  "confidence": 0.85,
  "safetyWarnings": ["Warning 1", "Warning 2"],
  "customerAvailability": ["Monday morning", "Any time Tuesday"]
}

**HOLISTIC COMPREHENSIVE ISSUE EVALUATION MANDATE (CRITICAL):**
You MUST analyze the issue description as a complete, unified problem statement — DO NOT evaluate single keywords or isolated nouns in isolation!
1. **Full Statement Evaluation**: Read the entire sentence structure, verbs, symptoms, locations, and root causes together before deciding on diagnosis, solution, or parts.
2. **Never Over-Index on Noun Keywords**: Seeing a word like "toilet", "sink", "faucet", "AC", "heater", or "pipe" MUST NOT trigger a recommendation to replace the entire fixture or unit!
3. **Distinguish Fixture vs. Component**: Distinguish between the overall *fixture* (e.g., toilet) and the specific *failing component* (e.g., flapper valve, fill valve, tank gasket). If the issue describes running water, leaking, clicking, unclogging, or noise, recommend ONLY internal repair parts or rebuild kits, NEVER a whole fixture replacement.
4. **Holistic Action Determination**: Determine whether to repair, replace, or diagnose based on the COMBINED context of all words, severity indicators, and explicit customer requests.

**REPAIR vs. REPLACEMENT — CRITICAL RULE (READ THIS FIRST):**
Before recommending ANY major fixture or equipment in partsNeeded, you MUST first classify the job:

**REPAIR/SERVICE jobs** (clog, leak, malfunction, noise, running water, intermittent issue, "fix", "not working"):
  → Recommend ONLY consumables, repair parts, and supplies — NOT a replacement fixture.
  → A clogged toilet needs a wax ring, flapper, fill valve, or drain cleaner — NOT a new toilet.
  → A leaking faucet needs a cartridge, washer, O-ring, or gasket — NOT a new faucet.
  → A running toilet needs a flapper or fill valve — NOT a new toilet.
  → A noisy HVAC unit needs diagnostics, cleaning, or a capacitor — NOT a new AC unit.

**REPLACEMENT jobs** (customer explicitly says "replace", "install new", "swap out", "upgrade", or fixture is confirmed broken beyond repair):
  → Include the replacement fixture in partsNeeded as essential.

**When in doubt, ALWAYS default to REPAIR.** Most service calls are repairs, not replacements.
If photos show damage beyond repair, explain that in the diagnosis and recommend replacement.

**Additional Guidelines:**
1. **ONLY recommend parts and fixtures that are DIRECTLY relevant to the customer's described issue.** Read the Issue Description carefully. For example, if the customer says "replace 2 bathroom sinks", recommend sinks and sink-related accessories — do NOT recommend toilets, water heaters, or other unrelated fixtures.
2. **For REPLACEMENT jobs ONLY:** The PRIMARY item being replaced MUST be listed in partsNeeded with realistic retail pricing — but ONLY the ones the customer actually requested.
3. Then include all necessary accessories, connectors, supplies, and consumables specifically needed for the described work.
4. **DO NOT add unrelated fixtures or equipment.** Stay strictly within the scope of the customer's request. A sink replacement should NOT include toilets. A faucet fix should NOT include a water heater.
5. NEVER include technician-owned tools in partsNeeded — only items installed, consumed, or left behind on-site.
6. **toolsNeeded** should list the technician tools/equipment needed (e.g., pipe wrench, drill, multimeter). These are tools the tech brings — NOT parts left behind.
7. Check if parts are in technician's inventory (mark as "inInventory": true if found).
8. Each part MUST have a realistic estimatedCost in USD and a quantity. Never use $0.
9. Estimate realistic duration in minutes.
10. Confidence should be 0-1 based on information quality.
11. Include safety warnings if applicable (electrical hazards, gas lines, etc.).
12. If the description is vague, lower confidence and suggest what information is needed.
13. Extract any mentioned customer availability, scheduling preferences, or preferred days/times into the customerAvailability array. If none are mentioned, return an empty array.

Respond ONLY with valid JSON, no additional text.`;
}

/**
 * Parse the AI response and structure it
 */
function parseAIResponse(text: string, inventory: any[], jobDescription: string = ''): AIRecommendation {
    try {
        // Extract JSON from response (remove markdown code blocks if present)
        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/```\n?/g, '');
        }

        const parsed = JSON.parse(jsonText);

        const toolKeywords = [
            'tape measure', 'measuring tape', 'wrench', 'screwdriver', 'drill',
            'pliers', 'level', 'hammer', 'saw', 'multimeter', 'voltmeter',
            'pipe cutter', 'tubing cutter', 'torch', 'soldering iron',
            'wire stripper', 'crimper', 'inspection camera', 'flashlight',
            'utility knife', 'box cutter', 'pry bar', 'crowbar', 'chisel',
            'channel locks', 'basin wrench', 'socket set', 'ratchet',
            'allen wrench', 'hex key', 'stud finder', 'fish tape',
            'snake', 'auger', 'plunger', 'shop vac', 'vacuum',
            'ladder', 'step ladder', 'extension cord', 'work light',
            'safety glasses', 'gloves', 'knee pads', 'dust mask',
            'drop cloth', 'tarp', 'bucket'
        ];

        // Filter out any technician-owned tools from partsNeeded
        const filteredParts = (parsed.partsNeeded || []).filter((part: any) => {
            const nameLower = (part.name || '').toLowerCase();
            const isActuallyATool = toolKeywords.some(kw => nameLower.includes(kw));
            return !isActuallyATool;
        });

        // Check each part against inventory
        const partsNeeded = filteredParts.map((part: any) => {
            const inInventory = inventory.some(item =>
                item.name.toLowerCase().includes(part.name.toLowerCase()) ||
                part.name.toLowerCase().includes(item.name.toLowerCase())
            );

            return {
                ...part,
                inInventory,
            };
        });

        // Flag parts that don't appear relevant to the job description.
        // We mark them as non-essential so the quote generator can make them optional.
        // This catches cases where the AI hallucinates unrelated fixtures
        // (e.g., recommending a toilet for a sink replacement).
        const descLower = jobDescription.toLowerCase();
        if (descLower) {
            const descWords = descLower.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w: string) => w.length > 2);
            // Common fixture categories that should only appear if mentioned in the description
            const majorFixtures = ['toilet', 'bidet', 'water heater', 'furnace', 'ac unit', 'air conditioner',
                'garbage disposal', 'dishwasher', 'washing machine', 'dryer', 'bathtub', 'shower',
                'sink', 'faucet', 'light fixture', 'ceiling fan', 'circuit breaker'];
            
            for (const part of partsNeeded) {
                const partNameLower = (part.name || '').toLowerCase();
                const matchedFixture = majorFixtures.find(f => partNameLower.includes(f));
                if (matchedFixture) {
                    // Check if this fixture type is actually mentioned in the job description
                    const fixtureWords = matchedFixture.split(/\s+/);
                    const isMentioned = fixtureWords.every((fw: string) => 
                        descWords.some((dw: string) => dw.includes(fw) || fw.includes(dw))
                    );
                    if (!isMentioned) {
                        // Mark as not essential — quote generator can flag or skip it
                        part.essential = false;
                        part.isRequired = false;
                        part._irrelevantFlag = true;
                        console.warn(`AI recommended "${part.name}" but it doesn't match job description. Flagging as non-essential.`);
                    }
                }
            }
        }

        // Repair-aware validation: if the AI classified this as a repair/service/maintenance/diagnostic
        // job but still recommended a major fixture as a purchasable part, flag it.
        // This catches the "clogged toilet → buy new toilet" type of error.
        const jobType = parsed.jobClassification?.jobType?.toLowerCase() || '';
        const isRepairJob = ['repair', 'maintenance', 'diagnostic', 'service'].some(t => jobType.includes(t));
        if (isRepairJob) {
            const majorFixtureKeywords = ['toilet', 'bidet', 'water heater', 'furnace', 'ac unit', 'air conditioner',
                'garbage disposal', 'dishwasher', 'washing machine', 'dryer', 'bathtub', 'shower',
                'sink', 'faucet', 'light fixture', 'ceiling fan', 'circuit breaker panel'];

            for (const part of partsNeeded) {
                const partNameLower = (part.name || '').toLowerCase();
                // Check if this part name IS a major fixture (not just contains a fixture word as a substring)
                // e.g. "Toilet" or "American Standard Toilet" should match, but "Toilet flapper" should NOT
                const isMajorFixture = majorFixtureKeywords.some(fixture => {
                    // The part name either IS the fixture, or the fixture is the primary noun
                    // (not a modifier like "toilet flapper", "faucet cartridge", "sink drain")
                    const fixtureWords = fixture.split(/\s+/);
                    const partWords = partNameLower.split(/\s+/);
                    // If the part name is just the fixture (possibly with brand/model), it's a replacement fixture
                    // If the part name has the fixture as a prefix followed by a part type, it's a repair part
                    const repairPartSuffixes = ['flapper', 'cartridge', 'valve', 'washer', 'gasket', 'seal',
                        'o-ring', 'ring', 'hose', 'line', 'connector', 'adapter', 'supply',
                        'drain', 'trap', 'handle', 'lever', 'bolt', 'nut', 'kit', 'element',
                        'filter', 'cap', 'cover', 'seat', 'spring', 'diaphragm', 'float',
                        'fill', 'flush', 'wax', 'sealant', 'tape', 'putty', 'cleaner'];
                    const hasRepairSuffix = repairPartSuffixes.some(suffix => partNameLower.includes(suffix));
                    if (hasRepairSuffix) return false; // It's a repair part, not a fixture replacement

                    // Check if the fixture name matches the beginning/core of the part name
                    return fixtureWords.every(fw => partWords.some((pw: string) => pw.includes(fw) || fw.includes(pw)));
                });

                if (isMajorFixture) {
                    part.essential = false;
                    part.isRequired = false;
                    (part as any)._repairOverride = true;
                    console.warn(`[RepairValidation] Repair job recommends fixture "${part.name}" — marking non-essential (job type: ${jobType})`);
                }
            }
        }

        return {
            diagnosis: parsed.diagnosis || 'Analysis pending',
            solution: parsed.solution || 'See job details for more information',
            partsNeeded,
            toolsNeeded: parsed.toolsNeeded || [],
            estimatedDuration: parsed.estimatedDuration || 60,
            confidence: parsed.confidence || 0.5,
            safetyWarnings: parsed.safetyWarnings || [],
            customerAvailability: parsed.customerAvailability || [],
            jobClassification: parsed.jobClassification || undefined,
        };
    } catch (error) {
        console.error('Failed to parse AI response:', error);
        console.error('Raw response:', text);

        // Return a fallback recommendation
        return {
            diagnosis: 'AI analysis could not be completed. Please review job manually.',
            solution: 'Review the job description and customer photos to determine the best approach.',
            partsNeeded: [],
            estimatedDuration: 60,
            confidence: 0.3,
            customerAvailability: [],
        };
    }
}

/**
 * Catalog parts and tools from an image
 */
export const catalogInventoryFromImage = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { imageUrl, techId } = data;

    if (!imageUrl) {
        throw new functions.https.HttpsError('invalid-argument', 'imageUrl is required');
    }

    try {
        const model = await getFlashModel();

        // Fetch the image
        const imagePart = {
            inlineData: {
                data: imageUrl.split(',')[1], // Remove data:image/jpeg;base64, prefix
                mimeType: 'image/jpeg',
            },
        };

        const prompt = `Analyze this image and catalog all visible parts, tools, and equipment.
For each item, provide:
- name: The specific name of the item
- category: "part", "tool", or "equipment"
- quantity: Estimated quantity visible (or 1 if just one)
- condition: "new", "used", or "unknown"

Common categories to look for:
- HVAC parts: filters, capacitors, contactors, thermostats, refrigerant, coils
- Plumbing parts: pipes, fittings, valves, washers, drain cleaners
- Electrical parts: wire, breakers, outlets, switches, wire nuts, tape
- Tools: wrenches, screwdrivers, multimeters, gauges, drills
- Safety: gloves, goggles, respirators

Respond with a JSON array:
[
  {"name": "Item name", "category": "part", "quantity": 5, "condition": "new"},
  ...
]

Respond ONLY with valid JSON array, no additional text.`;

        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;

        if (response.usageMetadata?.totalTokenCount) {
            await logGeminiUsage(response.usageMetadata.totalTokenCount, await getLatestFlashModelName(), 'catalogInventoryFromImage');
        }

        const text = response.text();

        // Parse response
        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/```\n?/g, '');
        }

        const items = JSON.parse(jsonText);

        // Save to inventory collection
        const batch = db.batch();
        for (const item of items) {
            const docRef = db.collection('inventory').doc();
            batch.set(docRef, {
                ...item,
                techId: techId || context.auth.uid,
                imageUrl,
                catalogedAt: FieldValue.serverTimestamp(),
                catalogedBy: 'ai',
            });
        }
        await batch.commit();

        return {
            success: true,
            itemsFound: items.length,
            items,
        };
    } catch (error: any) {
        console.error('Inventory cataloging failed:', error);
        throw new functions.https.HttpsError('internal', `Cataloging failed: ${error.message}`);
    }
});
