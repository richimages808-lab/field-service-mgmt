import { collection, addDoc, getDoc, getDocs, doc, updateDoc, serverTimestamp, query, where, orderBy, limit, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Job, Quote, QuoteLineItem } from '../types';
import { getCanonicalMaterialKey, findAllMaterialMatches } from './materialUtils';

/**
 * Enhanced AI Quote Generator
 * ─────────────────────────────────────────────────────────
 * Generates a complete, detailed quote with:
 *   • Trade/job-type specific estimation rules
 *   • Company history calibration (comparing actual vs estimated from past completed jobs)
 *   • Multiple labor categories (diagnostic, repair, cleanup)
 *   • Materials cross-referenced against company inventory for real costs
 *   • Equipment / tool line items (cross-referenced against company owned tools)
 *   • Travel charges & rate card multipliers
 *   • Multi-pass re-estimation versioning (assumes user disagreement on re-generation)
 *   • Firestore undefined field sanitization
 */

// ─── Helper: Sanitize objects for Firestore (removes all undefined fields) ───────────
export function sanitizeForFirestore<T>(data: T): T {
  if (data === undefined) return null as any;
  if (data === null || typeof data !== 'object') return data;
  if (data instanceof Date) return data;
  if (typeof (data as any).toMillis === 'function' || typeof (data as any).isEqual === 'function') {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(item => sanitizeForFirestore(item)) as any;
  }
  const cleanObj: any = {};
  for (const key of Object.keys(data)) {
    const val = (data as any)[key];
    if (val !== undefined) {
      cleanObj[key] = sanitizeForFirestore(val);
    }
  }
  return cleanObj;
}

// ─── Trade / Job Type Rules Interface & Resolver ───────────────────────────
export interface TradeRules {
  trade: string;
  minDiagnosticHours: number;
  laborVerb: string;
  safetyCheck: string;
  diagnosticNotes: string;
  cleanupNotes: string;
  hourlyRateMultiplier: number;
}

export function getTradeCategoryRules(category?: string, description?: string): TradeRules {
  const text = `${category || ''} ${description || ''}`.toLowerCase();
  
  if (text.includes('hvac') || text.includes('ac ') || text.includes('air condition') || text.includes('heat') || text.includes('furnace') || text.includes('boiler') || text.includes('refrigerat')) {
    return {
      trade: 'HVAC',
      minDiagnosticHours: 1.0,
      laborVerb: 'HVAC System Service & Diagnostic',
      safetyCheck: 'Pressure test & refrigerant containment check',
      diagnosticNotes: 'On-site HVAC diagnostic, electrical testing & pressure evaluation',
      cleanupNotes: 'Refrigerant check, airflow testing & thermostat calibration',
      hourlyRateMultiplier: 1.05
    };
  }
  
  if (text.includes('electric') || text.includes('wire') || text.includes('breaker') || text.includes('outlet') || text.includes('panel') || text.includes('light')) {
    return {
      trade: 'Electrical',
      minDiagnosticHours: 1.0,
      laborVerb: 'Electrical Circuit & Component Service',
      safetyCheck: 'Voltage verification & circuit breaker load test',
      diagnosticNotes: 'Diagnostic trace of electrical faults & panel inspection',
      cleanupNotes: 'Grounding verification, polarity test & clean enclosure sign-off',
      hourlyRateMultiplier: 1.05
    };
  }
  
  if (text.includes('plumb') || text.includes('drain') || text.includes('pipe') || text.includes('leak') || text.includes('faucet') || text.includes('toilet') || text.includes('water heater') || text.includes('sink')) {
    return {
      trade: 'Plumbing',
      minDiagnosticHours: 0.75,
      laborVerb: 'Plumbing Repair & Pipe Service',
      safetyCheck: 'Water pressure & backflow verification',
      diagnosticNotes: 'Leak detection, line pressure check & fitting inspection',
      cleanupNotes: 'Flow test, seal verification & workplace dry-down',
      hourlyRateMultiplier: 1.0
    };
  }
  
  if (text.includes('roof') || text.includes('gutter') || text.includes('shingle') || text.includes('flashing')) {
    return {
      trade: 'Roofing',
      minDiagnosticHours: 1.0,
      laborVerb: 'Roof & Gutter Repair',
      safetyCheck: 'Ladder stability & fall protection check',
      diagnosticNotes: 'Elevation inspection, structural leak trace & underlayment check',
      cleanupNotes: 'Debris clear, seal check & water runoff verification',
      hourlyRateMultiplier: 1.10
    };
  }

  if (text.includes('appliance') || text.includes('washer') || text.includes('dryer') || text.includes('fridge') || text.includes('dishwasher') || text.includes('oven')) {
    return {
      trade: 'Appliance Repair',
      minDiagnosticHours: 0.5,
      laborVerb: 'Appliance Diagnosis & Repair',
      safetyCheck: 'Power disconnect & thermal safety check',
      diagnosticNotes: 'Component testing, motor check & control board diagnostic',
      cleanupNotes: 'Cycle test, leak check & recalibration',
      hourlyRateMultiplier: 1.0
    };
  }

  return {
    trade: 'General Service',
    minDiagnosticHours: 0.5,
    laborVerb: 'Service & Repair Work',
    safetyCheck: 'General job-site safety inspection',
    diagnosticNotes: 'On-site evaluation and diagnosis of the issue',
    cleanupNotes: 'System verification, cleanup, and walkthrough with customer',
    hourlyRateMultiplier: 1.0
  };
}

// ─── Helper: fetch organization materials inventory ───────────────────────
async function fetchOrgMaterials(orgId: string): Promise<any[]> {
  try {
    const q = query(collection(db, 'materials'), where('org_id', '==', orgId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}

// ─── Helper: fetch organization tools ─────────────────────────────────────
async function fetchOrgTools(orgId: string): Promise<any[]> {
  try {
    const q = query(collection(db, 'tools'), where('org_id', '==', orgId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}

// ─── Helper: fetch similar past jobs for company history calibration ──────
async function fetchSimilarJobs(orgId: string, description: string, category?: string): Promise<any[]> {
  try {
    const q = query(
      collection(db, 'jobs'),
      where('org_id', '==', orgId),
      where('status', '==', 'completed'),
      orderBy('finished_at', 'desc'),
      limit(50)
    );
    const snap = await getDocs(q);
    const completedJobs: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (!description && !category || completedJobs.length === 0) return completedJobs.slice(0, 5);

    const stopWords = new Set(['a', 'an', 'the', 'to', 'in', 'my', 'is', 'and', 'or', 'for', 'of', 'on', 'at', 'it', 'i', 'we', 'need', 'have', 'has']);
    const keywords = (description || '').toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));

    const scored = completedJobs
      .map(job => {
        const jobDesc = (job.request?.description || '').toLowerCase();
        const jobCat = (job.category || '').toLowerCase();
        let matches = keywords.filter(kw => jobDesc.includes(kw)).length;
        if (category && jobCat && category.toLowerCase() === jobCat) {
          matches += 2;
        }
        return { ...job, matchScore: matches / Math.max(keywords.length, 1) };
      })
      .filter(j => j.matchScore >= 0.2)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 10);

    return scored.length > 0 ? scored : completedJobs.slice(0, 5);
  } catch { return []; }
}

// ─── Helper: find matching inventory material by name ─────────────────────
function findInventoryMatch(name: string, inventory: any[]): any | null {
  const normalizedName = name.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  
  let match = inventory.find(m => m.name.toLowerCase() === normalizedName);
  if (match) return match;
  
  const majorCategories = new Set(['toilet', 'sink', 'faucet', 'shower', 'tub', 'bathtub', 'ac', 'hvac', 'boiler', 'furnace', 'pipe', 'water heater', 'drain', 'pump', 'unit', 'fixture', 'appliance', 'disposal']);

  match = inventory.find(m => {
    const mName = m.name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    return mName.length >= normalizedName.length && mName.includes(normalizedName);
  });
  if (match) return match;

  match = inventory.find(m => {
    const mName = m.name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    if (majorCategories.has(mName)) return false;
    return mName.length >= 4 && normalizedName.includes(mName);
  });
  if (match) return match;

  const nameWords = normalizedName.split(/\s+/);
  match = inventory.find(m => {
    const mWords = m.name.toLowerCase().split(/\s+/);
    const overlap = nameWords.filter(w => mWords.some((mw: string) => mw.includes(w) || w.includes(mw))).length;
    return overlap / Math.max(nameWords.length, 1) >= 0.6;
  });

  return match || null;
}

// ─── Helper: find matching tool by name ───────────────────────────────────
function findToolMatch(name: string, tools: any[]): any | null {
  const normalizedName = name.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  return tools.find(t => {
    const tName = (t.name || '').toLowerCase();
    return tName.includes(normalizedName) || normalizedName.includes(tName);
  }) || null;
}

/**
 * Helper to extract state abbreviation or name from a service address
 */
function extractStateOrArea(address: string): string | null {
  if (!address) return null;
  const upperAddress = address.toUpperCase();
  
  const stateRegex = /\b([A-Z]{2})\b\s+\d{5}(-\d{4})?$/;
  const match = address.match(stateRegex);
  if (match) return match[1].toUpperCase();

  const states = [
    'ALABAMA','ALASKA','ARIZONA','ARKANSAS','CALIFORNIA','COLORADO','CONNECTICUT','DELAWARE','FLORIDA','GEORGIA',
    'HAWAII','IDAHO','ILLINOIS','INDIANA','IOWA','KANSAS','KENTUCKY','LOUISIANA','MAINE','MARYLAND',
    'MASSACHUSETTS','MICHIGAN','MINNESOTA','MISSISSIPPI','MISSOURI','MONTANA','NEBRASKA','NEVADA',
    'NEW HAMPSHIRE','NEW JERSEY','NEW MEXICO','NEW YORK','NORTH CAROLINA','NORTH DAKOTA','OHIO','OKLAHOMA',
    'OREGON','PENNSYLVANIA','RHODE ISLAND','SOUTH CAROLINA','SOUTH DAKOTA','TENNESSEE','TEXAS','UTAH',
    'VERMONT','VIRGINIA','WASHINGTON','WEST VIRGINIA','WISCONSIN','WYOMING'
  ];
  
  for (const state of states) {
    if (upperAddress.includes(state)) {
      return state;
    }
  }
  
  const stateAbbrs = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
    'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
    'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
  ];
  for (const abbr of stateAbbrs) {
    const regex = new RegExp(`\\b${abbr}\\b`);
    if (regex.test(upperAddress)) {
      return abbr;
    }
  }

  return null;
}

/**
 * Generate a comprehensive AI quote for a job with multi-pass re-estimation versioning.
 *
 * @param job            The job document (must include intakeReview.aiRecommendation if available)
 * @param techId         UID of the technician/dispatcher creating the quote
 * @param techName       Display name for the quote author
 * @param rateCard       Rate card from technician/org profile
 * @param defaultRateTierId  Customer's default rate tier (if any)
 * @returns              The Firestore document ID of the created quote
 */
export async function generateAIDefaultQuote(
  job: Job,
  techId: string,
  techName: string,
  rateCard: any,
  defaultRateTierId: string
): Promise<string> {
  const aiRec = job.intakeReview?.aiRecommendation;
  const aiAnalysis = (job as any).aiRecommendation; // From autoAnalyzeNewJob

  // ─── Version Tracking & Multi-Pass Re-Estimation ─────────────────────
  let previousQuoteVersion = 0;
  let targetQuoteNumber: string | null = null;
  const existingQuoteId = (job as any).active_quote_id || (job as any).latestQuoteId;
  if (existingQuoteId) {
    try {
      const prevDoc = await getDoc(doc(db, 'quotes', existingQuoteId));
      if (prevDoc.exists()) {
        const pData = prevDoc.data();
        previousQuoteVersion = pData.version || 1;
        targetQuoteNumber = pData.quoteNumber || null;
      }
    } catch (e) {
      console.warn('Could not fetch previous quote for versioning:', e);
    }
  }
  const version = previousQuoteVersion + 1;
  const isReestimation = version > 1;

  // ─── Trade Rules ──────────────────────────────────────────────────────
  const tradeRules = getTradeCategoryRules(job.category, job.request?.description);

  // ─── Duration / complexity ────────────────────────────────────────────
  const estimatedMinutes = aiRec?.estimatedDuration
    || aiAnalysis?.estimatedDuration
    || (job.estimated_duration ? Number(job.estimated_duration) : 120);
  const baseEstimatedHours = Math.max(1, Math.ceil(estimatedMinutes / 60));
  const complexity = aiRec?.complexity || (job as any).complexity || 'medium';

  // ─── Rate card values ─────────────────────────────────────────────────
  let hourlyRate = rateCard?.baseHourlyRate || 100;
  if (defaultRateTierId && rateCard?.tiers?.[defaultRateTierId]) {
    hourlyRate = rateCard.tiers[defaultRateTierId].hourlyRate;
  }
  // Apply trade category multiplier
  hourlyRate = Math.round(hourlyRate * tradeRules.hourlyRateMultiplier * 100) / 100;

  const materialMarkup = rateCard?.materialMarkup ?? 30; // percent
  const equipmentDayRate = rateCard?.equipmentDayRate || 35;

  // ─── Fetch company inventory, tools, and similar jobs ─────────────────
  const orgId = job.org_id as string;
  const [orgMaterials, orgTools, similarJobs, orgSnap] = await Promise.all([
    fetchOrgMaterials(orgId),
    fetchOrgTools(orgId),
    fetchSimilarJobs(orgId, job.request?.description || '', job.category),
    getDoc(doc(db, 'organizations', orgId))
  ]);

  let taxRate = 0;
  let taxSourceInfo: any = null;

  if (orgSnap && orgSnap.exists()) {
    const orgData = orgSnap.data();
    const serviceLocations = orgData?.settings?.serviceLocations || [];
    const jobAddress = job.customer?.address || (job.location as any)?.address || '';

    const detectedState = extractStateOrArea(jobAddress);
    if (detectedState && serviceLocations.length > 0) {
      const matchedLoc = serviceLocations.find((loc: any) => 
        loc.state?.toUpperCase() === detectedState || 
        detectedState.includes(loc.state?.toUpperCase()) ||
        loc.state?.toUpperCase().includes(detectedState)
      );

      if (matchedLoc) {
        taxRate = matchedLoc.taxRate;
        taxSourceInfo = {
          source: 'settings',
          justification: `Matched configured settings for service area: ${matchedLoc.state}`
        };
      }
    }

    if (!taxSourceInfo && jobAddress) {
      try {
        const { functions } = await import('../firebase');
        const { httpsCallable } = await import('firebase/functions');
        const lookupLocationTaxRateFn = httpsCallable(functions, 'lookupLocationTaxRate');
        const res = await lookupLocationTaxRateFn({
          address: jobAddress,
          orgId,
          tradeCategory: getServiceVerb(job)
        });
        const data = res.data as any;
        if (data && data.taxRate !== undefined) {
          taxRate = data.taxRate;
          taxSourceInfo = {
            source: data.source,
            justification: data.justification
          };

          if (data.source === 'ai' && detectedState) {
            try {
              await setDoc(doc(db, 'global_tax_rates', detectedState), sanitizeForFirestore({
                stateOrArea: detectedState,
                taxRate: data.taxRate,
                taxName: data.taxName || 'Sales Tax',
                justification: data.justification || `Shared rate for ${detectedState}`,
                verified: true,
                updatedAt: new Date()
              }), { merge: true });
            } catch (err) {
              console.error('Failed to cache AI tax rate in global_tax_rates:', err);
            }
          }
        }
      } catch (err) {
        console.error('Failed to resolve AI tax fallback for job default quote:', err);
      }
    }
  }

  // ─── Company Job History Calibration ──────────────────────────────────
  let durationMultiplier = 1.0;
  if (similarJobs.length > 0) {
    const ratios = similarJobs
      .filter(j => j.estimated_duration && j.finished_at && j.scheduled_at)
      .map(j => {
        const actualMs = (j.finished_at?.toDate?.() || new Date(j.finished_at)).getTime() - (j.scheduled_at?.toDate?.() || new Date(j.scheduled_at)).getTime();
        const actualMins = actualMs / 60000;
        return actualMins > 0 ? actualMins / j.estimated_duration : 1;
      })
      .filter(r => r > 0.2 && r < 5);

    if (ratios.length > 0) {
      durationMultiplier = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    }
  }

  // Refine calibration if user requested re-estimation (assuming past quote was inaccurate)
  if (isReestimation) {
    // If re-estimating, adjust duration calibration factor slightly upwards/downwards based on complexity
    durationMultiplier *= complexity === 'complex' ? 1.15 : complexity === 'simple' ? 0.95 : 1.05;
  }

  const calibratedHours = Math.max(1, Math.round(baseEstimatedHours * durationMultiplier * 10) / 10);

  // ═══════════════════════════════════════════════════════════════════════
  //  BUILD LINE ITEMS
  // ═══════════════════════════════════════════════════════════════════════
  const lineItems: QuoteLineItem[] = [];

  // ──── 1. LABOR LINE ITEMS ─────────────────────────────────────────────
  const diagnosticHours = Math.max(tradeRules.minDiagnosticHours, complexity === 'complex' ? 1.0 : 0.5);
  lineItems.push({
    id: crypto.randomUUID(),
    type: 'labor',
    description: `Initial Diagnostic & Assessment (${tradeRules.trade})`,
    quantity: diagnosticHours,
    unit: 'hours',
    unitPrice: hourlyRate,
    total: diagnosticHours * hourlyRate,
    taxable: false,
    isOptional: false,
    notes: tradeRules.diagnosticNotes
  });

  const repairHours = Math.max(0.5, calibratedHours - diagnosticHours - 0.25);
  lineItems.push({
    id: crypto.randomUUID(),
    type: 'labor',
    description: `${getServiceVerb(job)} — Labor`,
    quantity: repairHours,
    unit: 'hours',
    unitPrice: hourlyRate,
    total: repairHours * hourlyRate,
    taxable: false,
    isOptional: false,
    notes: aiAnalysis?.solution || aiRec?.fixInstructions?.summary || tradeRules.safetyCheck
  });

  lineItems.push({
    id: crypto.randomUUID(),
    type: 'labor',
    description: 'Testing, Safety Check & Final Cleanup',
    quantity: 0.25,
    unit: 'hours',
    unitPrice: hourlyRate,
    total: 0.25 * hourlyRate,
    taxable: false,
    isOptional: false,
    notes: tradeRules.cleanupNotes
  });

  // ──── 2. TRAVEL ────────────────────────────────────────────────────────
  if (rateCard?.driveTimeCharge?.enabled) {
    lineItems.push({
      id: crypto.randomUUID(),
      type: 'travel',
      description: 'Service Call / Trip Charge',
      quantity: 1,
      unit: 'flat',
      unitPrice: rateCard.driveTimeCharge.rate || 50,
      total: rateCard.driveTimeCharge.rate || 50,
      taxable: false,
      isOptional: false,
      notes: 'Includes travel to and from job site'
    });
  }

  // ──── 3. MATERIALS ─────────────────────────────────────────────────────
  const materialSources = [
    ...(aiRec?.recommendedMaterials || []),
    ...(aiAnalysis?.partsNeeded || [])
  ];

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
    'drop cloth', 'tarp', 'bucket', 'hand truck', 'dolly',
    'caulk gun', 'heat gun', 'reciprocating saw', 'jigsaw',
    'angle grinder', 'oscillating tool', 'clamp', 'manifold gauge'
  ];

  const customerDescription = (job.request?.description || '').toLowerCase();
  const seenMaterials = new Set<string>();
  const detectedToolsFromMaterials: any[] = [];
  const uniqueMaterials = materialSources.filter(m => {
    if ((m as any)._irrelevantFlag || (m as any)._repairOverride || !m.name) return false;

    const nameLower = (m.name || '').toLowerCase();
    const normKey = getCanonicalMaterialKey(m.name);
    if (!normKey || seenMaterials.has(normKey)) return false;
    seenMaterials.add(normKey);

    const isActuallyATool = toolKeywords.some(kw => nameLower.includes(kw));
    if (isActuallyATool) {
      const customerMentionedIt = toolKeywords
        .filter(kw => nameLower.includes(kw))
        .some(kw => customerDescription.includes(kw));
      
      if (customerMentionedIt) {
        return true;
      }
      detectedToolsFromMaterials.push(m);
      return false;
    }
    return true;
  });

  for (const mat of uniqueMaterials) {
    const qty = Number(mat.quantity) || 1;
    const inventoryMatch = findInventoryMatch(mat.name, orgMaterials);
    
    let baseCost = 25;
    let priceSource: 'vendor' | 'inventory' | 'ai_estimate' | 'fallback' = 'fallback';
    let vendorName: string | undefined;
    let vendorProductUrl: string | undefined;
    let stockQuantity: number | undefined;
    let description = mat.name;
    let materialId: string | undefined;
    
    const alternateVendorsMap = new Map<string, {
      vendorId: string;
      vendorName: string;
      unitCost: number;
      vendorProductUrl?: string;
      estimatedDeliveryDays?: number;
    }>();

    // Include existing alternateVendors from AI analysis if available
    if ((mat as any).alternateVendors && Array.isArray((mat as any).alternateVendors)) {
      for (const av of (mat as any).alternateVendors) {
        if (av.unitCost != null && av.unitCost > 0) {
          const vKey = (av.vendorName || av.vendorId || '').toLowerCase();
          alternateVendorsMap.set(vKey, {
            vendorId: av.vendorId || av.vendorName || '',
            vendorName: av.vendorName || 'Unknown Vendor',
            unitCost: av.unitCost,
            vendorProductUrl: av.vendorProductUrl || undefined,
            estimatedDeliveryDays: av.estimatedDeliveryDays || undefined,
          });
        }
      }
    }

    if (inventoryMatch) {
      description = inventoryMatch.name;
      materialId = inventoryMatch.id;
      stockQuantity = inventoryMatch.quantity ?? 0;
      const vendors = inventoryMatch.vendors as any[] | undefined;
      const preferredVendorId = inventoryMatch.preferredVendorId;

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

        let bestVendor: any = null;
        if (preferredVendorId) {
          bestVendor = vendors.find((v: any) => v.vendorId === preferredVendorId);
        }
        if (!bestVendor) {
          bestVendor = vendors.find((v: any) => v.unitCost != null && v.unitCost > 0);
        }

        if (bestVendor && bestVendor.unitCost != null && bestVendor.unitCost > 0) {
          baseCost = bestVendor.unitCost;
          priceSource = 'vendor';
          vendorName = bestVendor.vendorName || undefined;
          vendorProductUrl = bestVendor.vendorProductUrl || undefined;
        } else if (inventoryMatch.unitCost && inventoryMatch.unitCost > 0) {
          baseCost = inventoryMatch.unitCost;
          priceSource = 'inventory';
        } else if (inventoryMatch.unitPrice && inventoryMatch.unitPrice > 0) {
          baseCost = inventoryMatch.unitPrice;
          priceSource = 'inventory';
        } else if (mat.estimatedCost && mat.estimatedCost > 0) {
          baseCost = mat.estimatedCost;
          priceSource = 'ai_estimate';
        }
      } else if (inventoryMatch.unitCost && inventoryMatch.unitCost > 0) {
        baseCost = inventoryMatch.unitCost;
        priceSource = 'inventory';
      } else if (inventoryMatch.unitPrice && inventoryMatch.unitPrice > 0) {
        baseCost = inventoryMatch.unitPrice;
        priceSource = 'inventory';
      } else if (mat.estimatedCost && mat.estimatedCost > 0) {
        baseCost = mat.estimatedCost;
        priceSource = 'ai_estimate';
      }
    } else if (mat.estimatedCost && mat.estimatedCost > 0) {
      baseCost = mat.estimatedCost;
      priceSource = 'ai_estimate';
    }

    const finalDescLower = description.toLowerCase();
    const isToolAfterMatch = toolKeywords.some(kw => finalDescLower.includes(kw));
    if (isToolAfterMatch) {
      const customerWantsIt = toolKeywords
        .filter(kw => finalDescLower.includes(kw))
        .some(kw => customerDescription.includes(kw));
      if (!customerWantsIt) {
        detectedToolsFromMaterials.push({ ...mat, name: description });
        continue;
      }
    }

    const activeVendorKey = (vendorName || '').toLowerCase();
    const finalAlternateVendors = Array.from(alternateVendorsMap.values())
      .filter(v => (v.vendorName || '').toLowerCase() !== activeVendorKey);

    const markupMultiplier = 1 + (materialMarkup / 100);
    const customerPrice = Math.round(baseCost * markupMultiplier * 100) / 100;

    lineItems.push({
      id: crypto.randomUUID(),
      type: 'material',
      description,
      quantity: qty,
      unit: inventoryMatch?.unit || 'each',
      baseCost,
      markupPercentage: materialMarkup,
      unitPrice: customerPrice,
      total: qty * customerPrice,
      taxable: true,
      ...(materialId && { materialId }),
      isOptional: !(mat as any).isRequired && !(mat as any).essential,
      priceSource,
      ...(vendorName && { vendorName }),
      ...(vendorProductUrl && { vendorProductUrl }),
      ...(finalAlternateVendors.length > 0 && { alternateVendors: finalAlternateVendors }),
      ...(stockQuantity !== undefined && { stockQuantity }),
      notes: priceSource === 'vendor'
        ? `Vendor: ${vendorName || 'Preferred supplier'} (${stockQuantity ?? 0} in stock)`
        : priceSource === 'inventory'
          ? `From inventory (${stockQuantity ?? 0} in stock)`
          : priceSource === 'ai_estimate'
            ? 'AI estimated cost — cross-referenced'
            : 'Fallback pricing — verify before sending'
    });
  }

  // ──── 4. EQUIPMENT / TOOLS ─────────────────────────────────────────────
  const toolSources: Array<{ name: string; owned: boolean; essential: boolean; estimatedCost?: number }> = [
    ...(aiRec?.requiredTools || []).map(t => ({ ...t, estimatedCost: undefined as number | undefined })),
  ];
  
  const seenTools = new Set<string>();
  for (const t of toolSources) {
    seenTools.add((t.name || '').toLowerCase());
  }
  for (const dt of detectedToolsFromMaterials) {
    const dtName = (dt.name || '').toLowerCase();
    if (!seenTools.has(dtName)) {
      seenTools.add(dtName);
      toolSources.push({
        name: dt.name,
        owned: false,
        essential: (dt as any).essential ?? false,
        estimatedCost: dt.estimatedCost
      });
    }
  }

  for (const tool of toolSources) {
    const toolMatch = findToolMatch(tool.name, orgTools);
    const techOwnsIt = tool.owned || !!toolMatch;

    if (techOwnsIt) {
      continue;
    }

    const toolCost = tool.estimatedCost
      || toolMatch?.rentalRate
      || toolMatch?.dailyRate
      || toolMatch?.unitCost
      || equipmentDayRate;

    lineItems.push({
      id: crypto.randomUUID(),
      type: 'equipment',
      description: `${tool.name}`,
      quantity: 1,
      unit: 'each',
      unitPrice: toolCost,
      total: toolCost,
      taxable: true,
      isOptional: true,
      notes: 'Tool not in inventory — review if you want to charge customer or absorb cost'
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  CALCULATE TOTALS
  // ═══════════════════════════════════════════════════════════════════════
  const nonOptionalItems = lineItems.filter(i => !i.isOptional);
  const subtotal = nonOptionalItems.reduce((sum, item) => sum + item.total, 0);
  const taxableAmount = nonOptionalItems.filter(i => i.taxable).reduce((sum, item) => sum + item.total, 0);
  const taxAmount = Math.round(taxableAmount * (taxRate / 100) * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;
  const fullSubtotal = lineItems.reduce((sum, item) => sum + item.total, 0);

  // ═══════════════════════════════════════════════════════════════════════
  //  BUILD SCOPE OF WORK
  // ═══════════════════════════════════════════════════════════════════════
  const scopeParts: string[] = [];
  if (isReestimation) {
    scopeParts.push(`[Refined AI Estimate Iteration v${version}]`);
  }
  if (aiAnalysis?.diagnosis) {
    scopeParts.push(`Assessment: ${aiAnalysis.diagnosis}`);
  }
  if (aiAnalysis?.solution) {
    scopeParts.push(`\nProposed Work:\n${aiAnalysis.solution}`);
  }
  if (job.request?.description) {
    scopeParts.push(`\nCustomer Request: ${job.request.description}`);
  }
  if (aiRec?.safetyConsiderations?.length) {
    scopeParts.push(`\nSafety Notes: ${aiRec.safetyConsiderations.join('; ')}`);
  }
  
  const scopeOfWork = scopeParts.length > 0
    ? scopeParts.join('\n')
    : job.request?.description || 'Service call and repairs based on initial assessment';

  // ═══════════════════════════════════════════════════════════════════════
  //  GENERATE QUOTE DOCUMENT
  // ═══════════════════════════════════════════════════════════════════════
  const year = new Date().getFullYear();
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const quoteNumber = targetQuoteNumber || `Q-${year}-${randomNum}`;

  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 30);

  const draftQuote: Omit<Quote, 'id'> = {
    org_id: orgId,
    job_id: job.id,
    customer_id: job.customer_id || '',
    tech_id: techId,
    customer: job.customer,
    quoteNumber,
    version,
    scopeOfWork,
    lineItems,
    subtotal: fullSubtotal,
    taxRate,
    taxAmount,
    taxSourceInfo: taxSourceInfo || null,
    discount: 0,
    total,
    overrunProtection: {
      enabled: true,
      maxOverrunPercent: 15,
      overrunApprovalRequired: true,
      customerAgreed: false
    },
    estimatedDuration: Math.round(calibratedHours * 60),
    validUntil: validUntil.toISOString(),
    agreement: (() => {
      const orgData = orgSnap?.exists() ? orgSnap.data() : null;
      const policy = orgData?.settings?.upfrontPaymentPolicy;

      let requiresDeposit = false;
      let depositAmount = 0;
      let depositCondition = 'none';

      if (policy?.enabled) {
        const rules = policy.defaultRules || (policy.defaultRule && policy.defaultRule !== 'none' ? [policy.defaultRule] : []);
        const depositPercent = policy.depositPercent ?? 50;
        const threshold = policy.overThreshold ?? 500;
        const paidEstimateAmount = policy.paidEstimateAmount ?? 75;

        let highestAmount = 0;
        let highestRule = 'none';

        rules.forEach((rule: string) => {
          let amount = 0;
          if (rule === 'always') {
            amount = total * (depositPercent / 100);
          } else if (rule === 'over_threshold') {
            if (total > threshold) {
              amount = total * (depositPercent / 100);
            }
          } else if (rule === 'materials_only' || rule === '100_percent_materials') {
            amount = lineItems.filter(i => i.type === 'material').reduce((sum, item) => sum + item.total, 0);
          } else if (rule === 'paid_estimate') {
            amount = paidEstimateAmount;
          }

          if (amount > highestAmount) {
            highestAmount = amount;
            highestRule = rule;
          }
        });

        if (highestAmount > 0) {
          requiresDeposit = true;
          depositAmount = Math.round(highestAmount * 100) / 100;
          depositCondition = highestRule;
        }
      }

      return {
        termsVersion: '1.0',
        jurisdictionState: rateCard?.jurisdictionState || (() => {
          const addr = job.customer?.address || (job.location as any)?.address || '';
          const detected = extractStateOrArea(addr);
          if (detected) return detected;
          const locs = orgData?.settings?.serviceLocations || [];
          if (locs.length > 0) return locs[0].state || 'HI';
          return 'HI';
        })(),
        requiresDeposit,
        ...(requiresDeposit && { depositAmount }),
        signatureRequired: true
      };
    })(),
    depositCondition: (() => {
      const orgData = orgSnap?.exists() ? orgSnap.data() : null;
      const policy = orgData?.settings?.upfrontPaymentPolicy;
      if (!policy?.enabled) return 'none';
      const rules = policy.defaultRules || (policy.defaultRule && policy.defaultRule !== 'none' ? [policy.defaultRule] : []);
      const depositPercent = policy.depositPercent ?? 50;
      const threshold = policy.overThreshold ?? 500;
      const paidEstimateAmount = policy.paidEstimateAmount ?? 75;
      let highestAmount = 0;
      let highestRule = 'none';
      rules.forEach((rule: string) => {
        let amount = 0;
        if (rule === 'always') amount = total * (depositPercent / 100);
        else if (rule === 'over_threshold' && total > threshold) amount = total * (depositPercent / 100);
        else if ((rule === 'materials_only' || rule === '100_percent_materials')) amount = lineItems.filter(i => i.type === 'material').reduce((sum, item) => sum + item.total, 0);
        else if (rule === 'paid_estimate') amount = paidEstimateAmount;
        if (amount > highestAmount) { highestAmount = amount; highestRule = rule; }
      });
      return highestRule;
    })(),
    status: 'draft',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: techName,
    aiMetadata: {
      calibratedFrom: similarJobs.length,
      durationMultiplier: Math.round(durationMultiplier * 100) / 100,
      inventoryMatchCount: lineItems.filter(i => i.materialId).length,
      isReestimation,
      tradeCategory: tradeRules.trade,
      generatedAt: new Date().toISOString()
    }
  };

  const sanitizedQuote = sanitizeForFirestore(draftQuote);
  const docRef = await addDoc(collection(db, 'quotes'), sanitizedQuote);

  // Link quote to job
  const jobUpdates: any = {
    latestQuoteId: docRef.id,
    active_quote_id: docRef.id
  };
  if (job.status === 'pending') {
    jobUpdates.status = 'quote_pending';
  }

  // Also update job's aiRecommendation to stay in sync with refined estimate
  const updatedAiRec = {
    diagnosis: aiAnalysis?.diagnosis || aiRec?.diagnosis || `${tradeRules.trade} evaluation based on customer request`,
    solution: aiAnalysis?.solution || aiRec?.solution || scopeOfWork,
    estimatedDuration: Math.round(calibratedHours * 60),
    complexity,
    confidence: Math.min(0.95, 0.85 + (similarJobs.length * 0.02)),
    partsNeeded: uniqueMaterials.map(m => ({
      name: m.name,
      quantity: Number(m.quantity) || 1,
      estimatedCost: m.estimatedCost || 25,
      essential: true
    })),
    toolsRequired: toolSources.map(t => ({
      name: t.name,
      essential: t.essential,
      owned: t.owned
    })),
    safetyWarnings: [tradeRules.safetyCheck],
    priority: job.priority || 'medium',
    priorityReason: `${tradeRules.trade} trade rules & company history calibrated (v${version})`
  };

  jobUpdates.aiRecommendation = updatedAiRec;

  await updateDoc(doc(db, 'jobs', job.id), sanitizeForFirestore(jobUpdates));

  return docRef.id;
}

// ─── Helper: generate a meaningful service description verb ───────────────
function getServiceVerb(job: Job): string {
  const desc = (job.request?.description || '').toLowerCase();
  
  if (desc.includes('install')) return 'Installation';
  if (desc.includes('replac')) return 'Replacement';
  if (desc.includes('repair')) return 'Repair';
  if (desc.includes('inspect') || desc.includes('check')) return 'Inspection & Service';
  if (desc.includes('clean')) return 'Cleaning & Maintenance';
  if (desc.includes('unclog') || desc.includes('drain')) return 'Drain Service';
  if (desc.includes('leak')) return 'Leak Repair';
  if (desc.includes('water heater')) return 'Water Heater Service';
  if (desc.includes('ac ') || desc.includes('air condition') || desc.includes('hvac')) return 'HVAC Service';
  if (desc.includes('electric')) return 'Electrical Work';
  if (desc.includes('plumb')) return 'Plumbing Service';
  
  return 'Service & Repair';
}
