import { Job, AIJobRecommendation } from '../types';
import { Timestamp } from 'firebase/firestore';

/**
 * AI-powered job intake analysis system
 * Analyzes job requests and provides recommendations for:
 * - Priority level
 * - Estimated duration
 * - Required tools and materials
 * - Fix instructions and videos
 * - Safety considerations
 */

// Tech profile interface for recommendation engine
interface TechProfile {
    tools?: string[];
    specialties?: string[];
}

// Common tool database
const COMMON_TOOLS = {
    hvac: ['Multimeter', 'Refrigerant Gauges', 'Vacuum Pump', 'Leak Detector', 'Thermometer', 'Screwdriver Set', 'Wrench Set', 'Drill'],
    plumbing: ['Pipe Wrench', 'Plunger', 'Snake/Auger', 'Basin Wrench', 'Tubing Cutter', 'Torch/Solder', 'Level', 'Teflon Tape'],
    electrical: ['Multimeter', 'Wire Strippers', 'Voltage Tester', 'Circuit Tester', 'Screwdriver Set', 'Wire Connectors', 'Electrical Tape', 'Fish Tape'],
    general: ['Flashlight', 'Tool Bag', 'Safety Glasses', 'Gloves', 'Ladder', 'Measuring Tape', 'Utility Knife']
};

// Common materials/parts
const COMMON_MATERIALS = {
    hvac: ['Refrigerant', 'Air Filter', 'Capacitor', 'Contactor', 'Thermostat', 'Condensate Drain Pan', 'Evaporator Coil'],
    plumbing: ['PVC Pipe', 'Pipe Fittings', 'Plumber\'s Putty', 'Washers', 'Gaskets', 'Shut-off Valve', 'Wax Ring'],
    electrical: ['Wire Nuts', 'Electrical Wire', 'Breaker', 'Outlet', 'Switch', 'Junction Box', 'Conduit'],
    general: ['Screws', 'Bolts', 'Caulk', 'Sealant']
};

/**
 * Analyze job description and generate AI recommendations
 */
export async function generateJobRecommendation(
    job: Job,
    techProfile?: TechProfile | any
): Promise<AIJobRecommendation> {
    const description = (job.request?.description || '').toLowerCase();
    const jobType = job.request?.type?.toLowerCase() || '';
    const techTools = techProfile?.tools || [];

    // Determine job category
    const category = detectJobCategory(description, jobType);

    // Analyze urgency/priority
    const priority = analyzePriority(description);

    // Estimate duration and complexity
    const { duration, complexity } = estimateDurationAndComplexity(description, category);

    // Determine required tools
    const requiredTools = determineRequiredTools(description, category, techTools);

    // Determine materials needed
    const materials = determineMaterials(description, category);

    // Get fix instructions
    const fixInstructions = getFixInstructions(description, category);

    // Safety considerations
    const safety = getSafetyConsiderations(description, category);

    // Determine skills required
    const skills = determineSkills(description, category);

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
        generatedAt: Timestamp.now()
    };
}

/**
 * Detect job category from description
 */
function detectJobCategory(description: string, jobType: string): string {
    const text = `${description} ${jobType}`;

    if (/hvac|air condit|ac |heating|cooling|furnace|heat pump|thermostat/i.test(text)) {
        return 'hvac';
    }
    if (/plumb|pipe|leak|drain|faucet|toilet|sink|water heater/i.test(text)) {
        return 'plumbing';
    }
    if (/electric|outlet|switch|breaker|wiring|light|power/i.test(text)) {
        return 'electrical';
    }

    return 'general';
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
 * Determine required tools based on job description
 */
function determineRequiredTools(
    description: string,
    category: string,
    techTools: string[]
): Array<{ name: string, owned: boolean, essential: boolean }> {
    const tools: Array<{ name: string, owned: boolean, essential: boolean }> = [];
    const categoryTools = COMMON_TOOLS[category as keyof typeof COMMON_TOOLS] || COMMON_TOOLS.general;

    // Add category-specific tools
    categoryTools.forEach(tool => {
        const owned = techTools.some(t => t.toLowerCase().includes(tool.toLowerCase()));
        tools.push({
            name: tool,
            owned,
            essential: isEssentialTool(tool, category)
        });
    });

    // Add general tools
    COMMON_TOOLS.general.forEach(tool => {
        if (!tools.find(t => t.name === tool)) {
            const owned = techTools.some(t => t.toLowerCase().includes(tool.toLowerCase()));
            tools.push({
                name: tool,
                owned,
                essential: tool === 'Safety Glasses' || tool === 'Gloves'
            });
        }
    });

    return tools.slice(0, 10); // Return top 10 most relevant
}

/**
 * Check if tool is essential for the job category
 */
function isEssentialTool(tool: string, category: string): boolean {
    const essentialMap: Record<string, string[]> = {
        hvac: ['Multimeter', 'Refrigerant Gauges', 'Vacuum Pump'],
        plumbing: ['Pipe Wrench', 'Plunger', 'Snake/Auger'],
        electrical: ['Multimeter', 'Voltage Tester', 'Wire Strippers'],
        general: ['Screwdriver Set', 'Wrench Set']
    };

    const essentials = essentialMap[category] || [];
    return essentials.includes(tool);
}

/**
 * Determine materials/parts needed
 */
function determineMaterials(
    description: string,
    category: string
): Array<{ name: string, quantity?: string, estimatedCost?: number }> {
    const text = description.toLowerCase();
    const materials: Array<{ name: string, quantity?: string, estimatedCost?: number }> = [];
    const categoryMaterials = COMMON_MATERIALS[category as keyof typeof COMMON_MATERIALS] || COMMON_MATERIALS.general;

    // Analyze description for specific materials mentioned
    categoryMaterials.forEach(material => {
        if (text.includes(material.toLowerCase())) {
            materials.push({
                name: material,
                quantity: '1',
                estimatedCost: estimateMaterialCost(material, category)
            });
        }
    });

    // If no specific materials found, suggest common ones for the category
    if (materials.length === 0 && category !== 'general') {
        materials.push({
            name: `Common ${category} parts`,
            quantity: 'TBD',
            estimatedCost: 50
        });
    }

    return materials;
}

/**
 * Estimate material cost (rough estimate)
 */
function estimateMaterialCost(material: string, category: string): number {
    const costMap: Record<string, number> = {
        'Air Filter': 25,
        'Capacitor': 40,
        'Thermostat': 150,
        'Refrigerant': 200,
        'Pipe Fittings': 15,
        'Shut-off Valve': 30,
        'Outlet': 5,
        'Switch': 5,
        'Breaker': 25,
        'Wire Nuts': 10
    };

    return costMap[material] || 25; // Default $25
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
