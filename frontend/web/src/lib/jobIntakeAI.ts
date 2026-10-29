import { Job, AIJobRecommendation, InventoryCategory } from '../types';
import { Timestamp } from 'firebase/firestore';
import { getDefaultInventorySettings, detectAllTradeKeys } from '../utils/defaultInventoryCategories';

/**
 * AI-powered job intake analysis system
 * Analyzes job requests and provides recommendations for:
 * - Priority level
 * - Estimated duration
 * - Required tools and materials (driven by company-configured or trade-standard categories)
 * - Scope of work classification
 * - Fix instructions and safety considerations
 */

// Tech profile interface for recommendation engine
interface TechProfile {
    tools?: string[];
    specialties?: string[];
    organization?: {
        inventorySettings?: {
            workCategories?: InventoryCategory[];
            toolCategories?: InventoryCategory[];
            materialCategories?: InventoryCategory[];
        };
        businessProfile?: string;
    };
}

/**
 * Helper to match a job description against configured work categories
 */
function findMatchingWorkCategory(
    description: string,
    workCategories: InventoryCategory[]
): { matchedCategory?: InventoryCategory; matchedSubcategory?: string } {
    const text = description.toLowerCase();
    let bestCat: InventoryCategory | undefined;
    let bestSub: string | undefined;
    let maxMatchLen = 0;

    for (const cat of workCategories) {
        if (text.includes(cat.name.toLowerCase())) {
            bestCat = cat;
            maxMatchLen = cat.name.length;
        }
        if (cat.subcategories) {
            for (const sub of cat.subcategories) {
                const subLower = sub.toLowerCase();
                if (text.includes(subLower) && subLower.length > maxMatchLen) {
                    bestCat = cat;
                    bestSub = sub;
                    maxMatchLen = subLower.length;
                }
            }
        }
    }

    return { matchedCategory: bestCat, matchedSubcategory: bestSub };
}

/**
 * Analyze job description and generate AI recommendations
 */
export async function generateJobRecommendation(
    job: Job,
    techProfile?: TechProfile | any,
    customOrgSettings?: {
        workCategories?: InventoryCategory[];
        toolCategories?: InventoryCategory[];
        materialCategories?: InventoryCategory[];
    }
): Promise<AIJobRecommendation> {
    const description = (job.request?.description || '').toLowerCase();
    const jobType = job.request?.type?.toLowerCase() || '';
    const techTools = techProfile?.tools || [];

    // Detect all matching trades across 28+ industry sectors
    const query = `${job.category || ''} ${description} ${jobType} ${techProfile?.organization?.businessProfile || ''}`;
    const tradeKeys = detectAllTradeKeys(query);
    const primaryTrade = tradeKeys[0] || 'general';

    // Retrieve full catalog of categories (merging multi-trades if applicable)
    const defaultSettings = getDefaultInventorySettings(tradeKeys.join(' '));
    const activeOrgSettings = customOrgSettings || techProfile?.organization?.inventorySettings;

    const workCategories = (activeOrgSettings?.workCategories && activeOrgSettings.workCategories.length > 0)
        ? activeOrgSettings.workCategories
        : defaultSettings.workCategories;

    const toolCategories = (activeOrgSettings?.toolCategories && activeOrgSettings.toolCategories.length > 0)
        ? activeOrgSettings.toolCategories
        : defaultSettings.toolCategories;

    const materialCategories = (activeOrgSettings?.materialCategories && activeOrgSettings.materialCategories.length > 0)
        ? activeOrgSettings.materialCategories
        : defaultSettings.materialCategories;

    // Match work category and subcategory from configured hierarchy
    const { matchedCategory, matchedSubcategory } = findMatchingWorkCategory(description, workCategories);

    // Analyze urgency/priority
    const priority = analyzePriority(description);

    // Estimate duration and complexity
    const { duration, complexity } = estimateDurationAndComplexity(description, primaryTrade);

    // Determine required tools using toolCategories
    const requiredTools = determineRequiredTools(description, primaryTrade, techTools, toolCategories);

    // Determine materials needed using materialCategories
    const materials = determineMaterials(description, primaryTrade, materialCategories);

    // Get fix instructions
    const fixInstructions = getFixInstructions(description, primaryTrade);

    // Safety considerations
    const safety = getSafetyConsiderations(description, primaryTrade);

    // Determine skills required
    const skills = determineSkills(description, primaryTrade);

    return {
        priority: priority.level,
        priorityReason: priority.reason,
        estimatedDuration: duration,
        complexity,
        requiredTools,
        recommendedMaterials: materials,
        skillsRequired: skills,
        fixInstructions,
        safetyConsiderations: safety,
        matchedWorkCategory: matchedCategory?.name,
        matchedSubcategory: matchedSubcategory,
        generatedAt: Timestamp.now()
    };
}

/**
 * Detect job category from description
 */
function detectJobCategory(description: string, jobType: string): string {
    const tradeKeys = detectAllTradeKeys(`${description} ${jobType}`);
    return tradeKeys[0] || 'general';
}

/**
 * Analyze priority level based on keywords and urgency indicators
 */
function analyzePriority(description: string): { level: 'low' | 'medium' | 'high' | 'critical', reason: string } {
    const text = description.toLowerCase();

    // Critical urgency indicators
    if (/emergency|urgent|immediate|asap|critical|dangerous|safety|gas leak|electrical fire|flooding/i.test(text)) {
        return { level: 'critical', reason: 'Contains emergency/safety keywords requiring immediate attention' };
    }

    // High priority indicators
    if (/not work|broke|fail|down|no heat|no cool|no power|no water/i.test(text)) {
        return { level: 'high', reason: 'System failure affecting customer comfort or operations' };
    }

    // Medium priority indicators
    if (/intermittent|sometimes|occasional|noise|smell|slow/i.test(text)) {
        return { level: 'medium', reason: 'Non-critical issue that should be addressed soon' };
    }

    // Default to low priority
    return { level: 'low', reason: 'Routine maintenance or non-urgent repair' };
}

/**
 * Estimate duration and complexity
 */
function estimateDurationAndComplexity(
    description: string,
    category: string
): { duration: number, complexity: 'simple' | 'medium' | 'complex' } {
    const text = description.toLowerCase();

    // Simple jobs (15-30 min)
    if (/filter|clean|inspect|check|adjust|reset|replace battery|change bulb/i.test(text)) {
        return { duration: 30, complexity: 'simple' };
    }

    // Complex jobs (2+ hours)
    if (/install|replace system|diagnose|troubleshoot|multiple|full service|repair and replace/i.test(text)) {
        return { duration: 120, complexity: 'complex' };
    }

    // Medium complexity (45-90 min)
    return { duration: 60, complexity: 'medium' };
}

/**
 * Determine required tools based on job description and company tool categories
 */
function determineRequiredTools(
    description: string,
    category: string,
    techTools: string[],
    toolCategories?: InventoryCategory[]
): Array<{ name: string, owned: boolean, essential: boolean }> {
    const tools: Array<{ name: string, owned: boolean, essential: boolean }> = [];
    const text = description.toLowerCase();
    const seen = new Set<string>();

    // 1. If toolCategories are available, extract relevant tools
    if (toolCategories && toolCategories.length > 0) {
        for (const cat of toolCategories) {
            const catMatches = text.includes(cat.name.toLowerCase());
            if (cat.subcategories) {
                for (const toolName of cat.subcategories) {
                    const normName = toolName.toLowerCase();
                    if (seen.has(normName)) continue;

                    const isDirectlyMentioned = text.includes(normName);
                    const isRelevantToCategory = catMatches;

                    if (isDirectlyMentioned || isRelevantToCategory) {
                        seen.add(normName);
                        const owned = techTools.some(t => t.toLowerCase().includes(normName) || normName.includes(t.toLowerCase()));
                        tools.push({
                            name: toolName,
                            owned,
                            essential: isDirectlyMentioned || isEssentialTool(toolName, category)
                        });
                    }
                }
            }
        }
    }

    // 2. Fall back / supplement with standard trade safety & hand tools
    const safetyTools = ['Safety Glasses', 'Work Gloves', 'Flashlight', 'Measuring Tape'];
    safetyTools.forEach(tool => {
        const norm = tool.toLowerCase();
        if (!seen.has(norm)) {
            seen.add(norm);
            const owned = techTools.some(t => t.toLowerCase().includes(norm));
            tools.push({
                name: tool,
                owned,
                essential: true
            });
        }
    });

    return tools.slice(0, 10); // Return top 10 most relevant
}

/**
 * Check if tool is essential for the job category
 */
function isEssentialTool(tool: string, category: string): boolean {
    const toolLower = tool.toLowerCase();
    const essentials = [
        'wrench', 'tester', 'multimeter', 'gauge', 'stripper', 'cutter',
        'level', 'drill', 'saw', 'auger', 'snake', 'camera', 'ladder', 'harness'
    ];
    return essentials.some(kw => toolLower.includes(kw));
}

/**
 * Determine materials/parts needed based on job description and company material categories
 */
function determineMaterials(
    description: string,
    category: string,
    materialCategories?: InventoryCategory[]
): Array<{ name: string, quantity?: string, estimatedCost?: number }> {
    const text = description.toLowerCase();
    const materials: Array<{ name: string, quantity?: string, estimatedCost?: number }> = [];
    const seen = new Set<string>();

    if (materialCategories && materialCategories.length > 0) {
        for (const cat of materialCategories) {
            if (cat.subcategories) {
                for (const matName of cat.subcategories) {
                    const norm = matName.toLowerCase();
                    if (seen.has(norm)) continue;

                    // Match keywords or full name in customer description
                    const words = norm.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3);
                    const isMentioned = text.includes(norm) || (words.length > 0 && words.some(w => text.includes(w)));

                    if (isMentioned) {
                        seen.add(norm);
                        materials.push({
                            name: matName,
                            quantity: '1',
                            estimatedCost: estimateMaterialCost(matName, category)
                        });
                    }
                }
            }
        }
    }

    // If no specific materials found, suggest common replacement part category
    if (materials.length === 0 && category !== 'general' && materialCategories && materialCategories.length > 0) {
        const firstCat = materialCategories[0];
        const samplePart = firstCat.subcategories?.[0] || firstCat.name;
        materials.push({
            name: `${samplePart} (or standard ${firstCat.name})`,
            quantity: '1',
            estimatedCost: 35
        });
    }

    return materials.slice(0, 6);
}

/**
 * Estimate material cost (rough estimate)
 */
function estimateMaterialCost(material: string, category: string): number {
    const matLower = material.toLowerCase();
    if (matLower.includes('refrigerant') || matLower.includes('compressor') || matLower.includes('water heater') || matLower.includes('panel')) return 180;
    if (matLower.includes('thermostat') || matLower.includes('motor') || matLower.includes('valve') || matLower.includes('fixture')) return 75;
    if (matLower.includes('capacitor') || matLower.includes('breaker') || matLower.includes('filter') || matLower.includes('faucet')) return 35;
    if (matLower.includes('fitting') || matLower.includes('seal') || matLower.includes('gasket') || matLower.includes('switch') || matLower.includes('outlet')) return 15;
    return 25; // Default $25
}

/**
 * Get fix instructions and video links
 */
function getFixInstructions(
    description: string,
    category: string
): { videoUrl?: string, stepByStepUrl?: string, summary: string } {
    const text = description.toLowerCase();

    // Generate YouTube search URL for relevant repair videos
    const searchQuery = encodeURIComponent(`how to fix ${category} ${extractKeyProblem(text)}`);
    const videoUrl = `https://www.youtube.com/results?search_query=${searchQuery}`;

    // Generate step-by-step guide URL (WikiHow or similar)
    const guideQuery = encodeURIComponent(`${category} ${extractKeyProblem(text)} repair`);
    const stepByStepUrl = `https://www.wikihow.com/wikiHowTo?search=${guideQuery}`;

    // Generate summary based on category
    const summary = generateFixSummary(text, category);

    return { videoUrl, stepByStepUrl, summary };
}

/**
 * Extract key problem from description
 */
function extractKeyProblem(text: string): string {
    // Common problem patterns
    const patterns = [
        /not (working|cooling|heating|turning on)/i,
        /(leak|drip)ing/i,
        /making (noise|sound)/i,
        /(broke|broken|fail|failed)/i
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return match[0];
    }

    // Return first few words as fallback
    return text.split(' ').slice(0, 3).join(' ');
}

/**
 * Generate fix summary based on category and problem
 */
function generateFixSummary(text: string, category: string): string {
    const summaries: Record<string, string> = {
        hvac: `1. Check power supply and thermostat settings
2. Inspect air filters and replace if needed
3. Check refrigerant levels and pressures
4. Inspect electrical connections
5. Test capacitors and contactors
6. Clean condenser coils if necessary`,

        plumbing: `1. Turn off water supply
2. Inspect for visible leaks or damage
3. Check connections and fittings
4. Clear any clogs or blockages
5. Replace worn washers or seals
6. Test for leaks after repair`,

        electrical: `1. Turn off power at breaker
2. Test circuits with voltage tester
3. Inspect wiring for damage
4. Check connections at outlets/switches
5. Replace faulty components
6. Test and verify proper operation`,

        general: `1. Assess the problem and safety risks
2. Gather necessary tools and materials
3. Follow manufacturer guidelines
4. Make repairs or replacements
5. Test functionality
6. Document work completed`
    };

    return summaries[category] || summaries.general;
}

/**
 * Get safety considerations
 */
function getSafetyConsiderations(description: string, category: string): string[] {
    const safety: string[] = [];
    const text = description.toLowerCase();

    // Electrical safety
    if (category === 'electrical' || /electric|power|outlet|wire/i.test(text)) {
        safety.push('Turn off power at breaker before working');
        safety.push('Use voltage tester to verify power is off');
        safety.push('Wear insulated gloves');
    }

    // HVAC safety
    if (category === 'hvac' || /hvac|refrigerant|gas/i.test(text)) {
        safety.push('Wear safety glasses and gloves');
        safety.push('Handle refrigerant with proper EPA certification');
        safety.push('Check for gas leaks with detector');
    }

    // Plumbing safety
    if (category === 'plumbing' || /water|leak|pipe/i.test(text)) {
        safety.push('Turn off water supply before starting');
        safety.push('Have towels and bucket ready for spills');
        safety.push('Check for mold or water damage');
    }

    // General safety
    safety.push('Wear appropriate PPE (gloves, safety glasses)');
    safety.push('Ensure adequate lighting');

    return safety;
}

/**
 * Determine skills required
 */
function determineSkills(description: string, category: string): string[] {
    const skills: string[] = [];
    const text = description.toLowerCase();

    if (category === 'hvac' || /hvac/i.test(text)) {
        skills.push('HVAC Systems', 'Refrigeration', 'Electrical Diagnostics');
    }
    if (category === 'plumbing' || /plumb/i.test(text)) {
        skills.push('Plumbing', 'Pipe Fitting', 'Leak Detection');
    }
    if (category === 'electrical' || /electric/i.test(text)) {
        skills.push('Electrical Wiring', 'Circuit Testing', 'Safety Protocols');
    }

    // Check for advanced skills needed
    if (/diagnose|troubleshoot/i.test(text)) {
        skills.push('Diagnostic Skills');
    }
    if (/install/i.test(text)) {
        skills.push('Installation');
    }

    return skills.length > 0 ? skills : ['General Repair'];
}

/**
 * Check if tech has required skills
 */
export function techHasRequiredSkills(
    recommendation: AIJobRecommendation,
    techProfile?: TechProfile | any
): { hasSkills: boolean, missingSkills: string[] } {
    if (!techProfile || !techProfile.specialties) {
        return { hasSkills: false, missingSkills: recommendation.skillsRequired };
    }

    const techSkills = techProfile.specialties.map(s => s.toLowerCase());
    const missingSkills: string[] = [];

    recommendation.skillsRequired.forEach(skill => {
        const hasSkill = techSkills.some(ts =>
            skill.toLowerCase().includes(ts) || ts.includes(skill.toLowerCase())
        );
        if (!hasSkill) {
            missingSkills.push(skill);
        }
    });

    return {
        hasSkills: missingSkills.length === 0,
        missingSkills
    };
}
