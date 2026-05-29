import { collection, addDoc, getDoc, getDocs, doc, updateDoc, serverTimestamp, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { Job, Quote, QuoteLineItem } from '../types';

/**
 * Enhanced AI Quote Generator
 * ─────────────────────────────────────────────────────────
 * Generates a complete, detailed quote with:
 *   • Multiple labor categories (diagnostic, repair, cleanup)
 *   • Materials cross-referenced against company inventory for real costs
 *   • Equipment / tool line items (rental or usage fees)
 *   • Travel charges
 *   • Job-history calibration (adjust estimates from past similar work)
 *
 * The generated quote is immediately editable by the dispatcher/solo tech.
 */

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

// ─── Helper: fetch similar past jobs for calibration ──────────────────────
async function fetchSimilarJobs(orgId: string, description: string): Promise<any[]> {
  try {
    // Get completed jobs for the org; we'll do keyword matching client-side
    const q = query(
      collection(db, 'jobs'),
      where('org_id', '==', orgId),
      where('status', '==', 'completed'),
      orderBy('finished_at', 'desc'),
      limit(50)
    );
    const snap = await getDocs(q);
    const completedJobs: any[] = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (!description || completedJobs.length === 0) return [];

    // Simple keyword matching: extract significant words from the current description
    const stopWords = new Set(['a', 'an', 'the', 'to', 'in', 'my', 'is', 'and', 'or', 'for', 'of', 'on', 'at', 'it', 'i', 'we', 'need', 'have', 'has']);
    const keywords = description.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));

    if (keywords.length === 0) return [];

    // Score each completed job by keyword overlap
    const scored = completedJobs
      .map(job => {
        const jobDesc = (job.request?.description || '').toLowerCase();
        const matches = keywords.filter(kw => jobDesc.includes(kw)).length;
        return { ...job, matchScore: matches / keywords.length };
      })
      .filter(j => j.matchScore >= 0.3) // At least 30% keyword overlap
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 5); // Top 5 similar jobs

    return scored;
  } catch { return []; }
}

// ─── Helper: find matching inventory material by name ─────────────────────
function findInventoryMatch(name: string, inventory: any[]): any | null {
  const normalizedName = name.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  
  // Exact match first
  let match = inventory.find(m => m.name.toLowerCase() === normalizedName);
  if (match) return match;
  
  // Substring match
  match = inventory.find(m => {
    const mName = m.name.toLowerCase();
    return mName.includes(normalizedName) || normalizedName.includes(mName);
  });
  if (match) return match;

  // Word overlap match (at least 60% of words match)
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
 * Generate a comprehensive AI quote for a job.
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

  // ─── Duration / complexity ────────────────────────────────────────────
  const estimatedMinutes = aiRec?.estimatedDuration
    || aiAnalysis?.estimatedDuration
    || (job.estimated_duration ? Number(job.estimated_duration) : 120);
  const estimatedHours = Math.max(1, Math.ceil(estimatedMinutes / 60));
  const complexity = aiRec?.complexity || (job as any).complexity || 'medium';

  // ─── Rate card values ─────────────────────────────────────────────────
  let hourlyRate = rateCard?.baseHourlyRate || 100;
  if (defaultRateTierId && rateCard?.tiers?.[defaultRateTierId]) {
    hourlyRate = rateCard.tiers[defaultRateTierId].hourlyRate;
  }
  const materialMarkup = rateCard?.materialMarkup ?? 30; // percent
  const taxRate = rateCard?.defaultTaxRate || 0;
  const equipmentDayRate = rateCard?.equipmentDayRate || 35;

  // ─── Fetch company inventory, tools, and similar jobs ─────────────────
  const orgId = job.org_id as string;
  const [orgMaterials, orgTools, similarJobs] = await Promise.all([
    fetchOrgMaterials(orgId),
    fetchOrgTools(orgId),
    fetchSimilarJobs(orgId, job.request?.description || '')
  ]);

  // ─── Job history calibration ──────────────────────────────────────────
  let durationMultiplier = 1.0;
  if (similarJobs.length > 0) {
    // Compare actual vs estimated on past jobs
    const ratios = similarJobs
      .filter(j => j.estimated_duration && j.finished_at && j.scheduled_at)
      .map(j => {
        const actualMs = (j.finished_at?.toDate?.() || new Date()).getTime() - (j.scheduled_at?.toDate?.() || new Date()).getTime();
        const actualMins = actualMs / 60000;
        return actualMins > 0 ? actualMins / j.estimated_duration : 1;
      })
      .filter(r => r > 0.2 && r < 5); // Filter outliers

    if (ratios.length > 0) {
      durationMultiplier = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    }
  }

  const calibratedHours = Math.max(1, Math.round(estimatedHours * durationMultiplier * 10) / 10);

  // ═══════════════════════════════════════════════════════════════════════
  //  BUILD LINE ITEMS
  // ═══════════════════════════════════════════════════════════════════════
  const lineItems: QuoteLineItem[] = [];

  // ──── 1. LABOR LINE ITEMS ─────────────────────────────────────────────
  // Diagnostic / assessment time (always 0.5–1 hour)
  const diagnosticHours = complexity === 'complex' ? 1 : 0.5;
  lineItems.push({
    id: crypto.randomUUID(),
    type: 'labor',
    description: 'Initial Diagnostic & Assessment',
    quantity: diagnosticHours,
    unit: 'hours',
    unitPrice: hourlyRate,
    total: diagnosticHours * hourlyRate,
    taxable: false,
    isOptional: false,
    notes: 'On-site evaluation and diagnosis of the issue'
  });

  // Primary repair/service labor
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
    notes: aiAnalysis?.solution || aiRec?.fixInstructions?.summary || 'Repair and service work as described'
  });

  // Cleanup / testing time
  lineItems.push({
    id: crypto.randomUUID(),
    type: 'labor',
    description: 'Testing, Cleanup & Final Inspection',
    quantity: 0.25,
    unit: 'hours',
    unitPrice: hourlyRate,
    total: 0.25 * hourlyRate,
    taxable: false,
    isOptional: false,
    notes: 'System verification, cleanup, and walkthrough with customer'
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

  // Deduplicate by name
  const seenMaterials = new Set<string>();
  const uniqueMaterials = materialSources.filter(m => {
    const key = m.name.toLowerCase();
    if (seenMaterials.has(key)) return false;
    seenMaterials.add(key);
    return true;
  });

  for (const mat of uniqueMaterials) {
    const qty = Number(mat.quantity) || 1;
    
    // Try to match against company inventory for real costs
    const inventoryMatch = findInventoryMatch(mat.name, orgMaterials);
    
    // Determine price source using vendor-first priority:
    // 1. Preferred vendor cost → 2. Any vendor cost → 3. Inventory unitCost → 4. AI estimate → 5. Fallback
    let baseCost = 25; // fallback
    let priceSource: 'vendor' | 'inventory' | 'ai_estimate' | 'fallback' = 'fallback';
    let vendorName: string | undefined;
    let vendorProductUrl: string | undefined;
    let stockQuantity: number | undefined;
    let description = mat.name;
    let materialId: string | undefined;
    
    if (inventoryMatch) {
      description = inventoryMatch.name; // Use canonical inventory name
      materialId = inventoryMatch.id;
      stockQuantity = inventoryMatch.quantity ?? 0;
      const vendors = inventoryMatch.vendors as any[] | undefined;
      const preferredVendorId = inventoryMatch.preferredVendorId;

      // Try preferred vendor first, then any vendor with a cost
      let bestVendor: any = null;
      if (vendors && vendors.length > 0) {
        if (preferredVendorId) {
          bestVendor = vendors.find((v: any) => v.vendorId === preferredVendorId);
        }
        if (!bestVendor) {
          bestVendor = vendors.find((v: any) => v.unitCost != null && v.unitCost > 0);
        }
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
    } else if (mat.estimatedCost && mat.estimatedCost > 0) {
      baseCost = mat.estimatedCost;
      priceSource = 'ai_estimate';
    }

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
      materialId,
      isOptional: !(mat as any).isRequired && !(mat as any).essential,
      priceSource,
      vendorName,
      vendorProductUrl,
      stockQuantity,
      notes: priceSource === 'vendor'
        ? `Vendor: ${vendorName || 'Preferred supplier'} (${stockQuantity ?? 0} in stock)`
        : priceSource === 'inventory'
          ? `From inventory (${stockQuantity ?? 0} in stock)`
          : priceSource === 'ai_estimate'
            ? 'AI estimated cost — may need sourcing'
            : 'Fallback pricing — verify before sending'
    });
  }

  // ──── 4. EQUIPMENT / TOOLS ─────────────────────────────────────────────
  const toolSources = [
    ...(aiRec?.requiredTools || []),
  ];
  
  // Only charge for tools that are NOT owned (rental/specialty tools)
  const rentalTools = toolSources.filter(t => !t.owned);
  
  for (const tool of rentalTools) {
    const toolMatch = findToolMatch(tool.name, orgTools);
    const toolRate = toolMatch?.rentalRate || toolMatch?.dailyRate || equipmentDayRate;
    
    lineItems.push({
      id: crypto.randomUUID(),
      type: 'equipment',
      description: `${tool.name} — ${tool.essential ? 'Required' : 'Recommended'} Equipment`,
      quantity: 1,
      unit: 'day',
      unitPrice: toolRate,
      total: toolRate,
      taxable: true,
      isOptional: !tool.essential,
      notes: toolMatch ? 'Company-owned equipment' : 'Specialty equipment — rental may apply'
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

  // Full subtotal including optional items (for reference)
  const fullSubtotal = lineItems.reduce((sum, item) => sum + item.total, 0);

  // ═══════════════════════════════════════════════════════════════════════
  //  BUILD SCOPE OF WORK
  // ═══════════════════════════════════════════════════════════════════════
  const scopeParts: string[] = [];
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
  const quoteNumber = `Q-${year}-${randomNum}`;

  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 30);

  const draftQuote: Omit<Quote, 'id'> = {
    org_id: orgId,
    job_id: job.id,
    customer_id: job.customer_id || '',
    tech_id: techId,
    customer: job.customer,
    quoteNumber,
    version: 1,
    scopeOfWork,
    lineItems,
    subtotal: fullSubtotal,
    taxRate,
    taxAmount,
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
    agreement: {
      termsVersion: '1.0',
      jurisdictionState: rateCard?.jurisdictionState || 'CA',
      requiresDeposit: total >= 500,
      ...(total >= 500 && { depositAmount: Math.round(total * 0.5 * 100) / 100 }),
      signatureRequired: true
    },
    status: 'draft',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: techName,
    // Metadata for tracking AI generation
    ...(similarJobs.length > 0 && {
      aiMetadata: {
        calibratedFrom: similarJobs.length,
        durationMultiplier: Math.round(durationMultiplier * 100) / 100,
        inventoryMatchCount: lineItems.filter(i => i.materialId).length,
        generatedAt: new Date().toISOString()
      }
    })
  };

  const docRef = await addDoc(collection(db, 'quotes'), draftQuote);

  // Link quote to job
  const jobUpdates: any = {};
  if (job.status === 'pending') {
    jobUpdates.status = 'quote_pending';
  }
  jobUpdates.latestQuoteId = docRef.id;
  await updateDoc(doc(db, 'jobs', job.id), jobUpdates);

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
