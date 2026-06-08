/**
 * Quote Terms & Conditions — Rule-Set Engine
 * ═══════════════════════════════════════════════════════════════════════════
 * Generates comprehensive, jurisdiction-aware terms for field service quotes.
 * Provides liability protection for technicians/contractors.
 *
 * Architecture:
 *   1. System defaults — legally-researched baseline terms for every jurisdiction
 *   2. Org overrides  — per-jurisdiction, per-section customizations (Firestore)
 *   3. Merge engine   — resolveQuoteTerms() combines defaults + overrides
 *
 * Organizations can:
 *   - Replace entire sections with custom terms
 *   - Append additional clauses to defaults
 *   - Remove specific default clauses by ID
 *   - Disable sections entirely
 *   - Set global overrides (apply to all jurisdictions)
 *   - Set jurisdiction-specific overrides (take precedence over global)
 */

// ═══════════════════════════════════════════════════════════════════════════
//  TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export type TermCategory = 'payment' | 'scope' | 'warranty' | 'liability' | 'general' | 'jurisdiction';

export interface TermItem {
    id: string;
    text: string;
    category: TermCategory;
}

export interface TermsConfig {
    jurisdictionState: string;   // e.g., "HI", "CA", "TX", "DE"
    country?: string;            // e.g., "US", "DE" — defaults to "US"
    requiresDeposit: boolean;
    depositAmount?: number;
    total: number;
    validDays: number;
    companyName?: string;
    // Configurable durations (org can set defaults)
    warrantyDays?: number;           // Default: 90
    cancellationHours?: number;      // Default: 24
    disputeResolutionDays?: number;  // Default: 30
    // Org overrides — loaded from Firestore
    orgTermsConfig?: OrgTermsConfig;
}

/** Organization-level T&C configuration stored in Firestore */
export interface OrgTermsConfig {
    customJurisdictions?: JurisdictionInfo[];
    globalOverrides?: {
        payment?: TermSectionOverride;
        scope?: TermSectionOverride;
        warranty?: TermSectionOverride;
        liability?: TermSectionOverride;
        general?: TermSectionOverride;
    };
    jurisdictionOverrides?: {
        [jurisdictionCode: string]: {
            payment?: TermSectionOverride;
            scope?: TermSectionOverride;
            warranty?: TermSectionOverride;
            liability?: TermSectionOverride;
            general?: TermSectionOverride;
            jurisdiction?: TermSectionOverride;
        };
    };
    defaultWarrantyDays?: number;
    defaultValidDays?: number;
    defaultCancellationHours?: number;
    defaultDisputeResolutionDays?: number;
    companyLegalName?: string;
    arbitrationVenue?: string;
    updatedAt?: any;
    updatedBy?: string;
}

export interface TermSectionOverride {
    enabled: boolean;           // false = hide this entire section from quotes
    customTerms?: string[];     // Replace ALL default terms in this section with these
    appendTerms?: string[];     // Add these terms AFTER the defaults
    removeTermIds?: string[];   // Remove specific default terms by ID
}

export interface JurisdictionInfo {
    code: string;
    name: string;
    country: string;
    countryName: string;
}

// ═══════════════════════════════════════════════════════════════════════════
//  JURISDICTION REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_JURISDICTIONS: JurisdictionInfo[] = [
    // ── US States ──
    { code: 'AL', name: 'Alabama', country: 'US', countryName: 'United States' },
    { code: 'AK', name: 'Alaska', country: 'US', countryName: 'United States' },
    { code: 'AZ', name: 'Arizona', country: 'US', countryName: 'United States' },
    { code: 'AR', name: 'Arkansas', country: 'US', countryName: 'United States' },
    { code: 'CA', name: 'California', country: 'US', countryName: 'United States' },
    { code: 'CO', name: 'Colorado', country: 'US', countryName: 'United States' },
    { code: 'CT', name: 'Connecticut', country: 'US', countryName: 'United States' },
    { code: 'DE', name: 'Delaware', country: 'US', countryName: 'United States' },
    { code: 'FL', name: 'Florida', country: 'US', countryName: 'United States' },
    { code: 'GA', name: 'Georgia', country: 'US', countryName: 'United States' },
    { code: 'HI', name: 'Hawaii', country: 'US', countryName: 'United States' },
    { code: 'ID', name: 'Idaho', country: 'US', countryName: 'United States' },
    { code: 'IL', name: 'Illinois', country: 'US', countryName: 'United States' },
    { code: 'IN', name: 'Indiana', country: 'US', countryName: 'United States' },
    { code: 'IA', name: 'Iowa', country: 'US', countryName: 'United States' },
    { code: 'KS', name: 'Kansas', country: 'US', countryName: 'United States' },
    { code: 'KY', name: 'Kentucky', country: 'US', countryName: 'United States' },
    { code: 'LA', name: 'Louisiana', country: 'US', countryName: 'United States' },
    { code: 'ME', name: 'Maine', country: 'US', countryName: 'United States' },
    { code: 'MD', name: 'Maryland', country: 'US', countryName: 'United States' },
    { code: 'MA', name: 'Massachusetts', country: 'US', countryName: 'United States' },
    { code: 'MI', name: 'Michigan', country: 'US', countryName: 'United States' },
    { code: 'MN', name: 'Minnesota', country: 'US', countryName: 'United States' },
    { code: 'MS', name: 'Mississippi', country: 'US', countryName: 'United States' },
    { code: 'MO', name: 'Missouri', country: 'US', countryName: 'United States' },
    { code: 'MT', name: 'Montana', country: 'US', countryName: 'United States' },
    { code: 'NE', name: 'Nebraska', country: 'US', countryName: 'United States' },
    { code: 'NV', name: 'Nevada', country: 'US', countryName: 'United States' },
    { code: 'NH', name: 'New Hampshire', country: 'US', countryName: 'United States' },
    { code: 'NJ', name: 'New Jersey', country: 'US', countryName: 'United States' },
    { code: 'NM', name: 'New Mexico', country: 'US', countryName: 'United States' },
    { code: 'NY', name: 'New York', country: 'US', countryName: 'United States' },
    { code: 'NC', name: 'North Carolina', country: 'US', countryName: 'United States' },
    { code: 'ND', name: 'North Dakota', country: 'US', countryName: 'United States' },
    { code: 'OH', name: 'Ohio', country: 'US', countryName: 'United States' },
    { code: 'OK', name: 'Oklahoma', country: 'US', countryName: 'United States' },
    { code: 'OR', name: 'Oregon', country: 'US', countryName: 'United States' },
    { code: 'PA', name: 'Pennsylvania', country: 'US', countryName: 'United States' },
    { code: 'RI', name: 'Rhode Island', country: 'US', countryName: 'United States' },
    { code: 'SC', name: 'South Carolina', country: 'US', countryName: 'United States' },
    { code: 'SD', name: 'South Dakota', country: 'US', countryName: 'United States' },
    { code: 'TN', name: 'Tennessee', country: 'US', countryName: 'United States' },
    { code: 'TX', name: 'Texas', country: 'US', countryName: 'United States' },
    { code: 'UT', name: 'Utah', country: 'US', countryName: 'United States' },
    { code: 'VT', name: 'Vermont', country: 'US', countryName: 'United States' },
    { code: 'VA', name: 'Virginia', country: 'US', countryName: 'United States' },
    { code: 'WA', name: 'Washington', country: 'US', countryName: 'United States' },
    { code: 'WV', name: 'West Virginia', country: 'US', countryName: 'United States' },
    { code: 'WI', name: 'Wisconsin', country: 'US', countryName: 'United States' },
    { code: 'WY', name: 'Wyoming', country: 'US', countryName: 'United States' },
    // ── US Territories ──
    { code: 'DC', name: 'District of Columbia', country: 'US', countryName: 'United States' },
    { code: 'PR', name: 'Puerto Rico', country: 'US', countryName: 'United States' },
    { code: 'GU', name: 'Guam', country: 'US', countryName: 'United States' },
    { code: 'VI', name: 'US Virgin Islands', country: 'US', countryName: 'United States' },
    // ── International ──
    { code: 'DE-DE', name: 'Germany', country: 'DE', countryName: 'Germany' },
];

// ═══════════════════════════════════════════════════════════════════════════
//  STATE DISCLOSURE ARRAYS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * US states that require specific consumer protection disclosures.
 * These are comprehensive — every state with a relevant statute is included.
 */
const RIGHT_TO_CANCEL_STATES = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
];

const MECHANICS_LIEN_NOTICE_STATES = [
    'AZ', 'CA', 'CO', 'FL', 'GA', 'HI', 'IL', 'MA', 'MI', 'MN',
    'NV', 'NJ', 'NY', 'NC', 'OH', 'OR', 'PA', 'TN', 'TX', 'WA'
];

const HOME_IMPROVEMENT_LICENSE_STATES = [
    'AL', 'AZ', 'AR', 'CA', 'CT', 'DE', 'FL', 'GA', 'HI', 'LA',
    'MD', 'MA', 'MI', 'MS', 'NV', 'NJ', 'NM', 'NY', 'NC', 'OR',
    'PA', 'RI', 'SC', 'TN', 'TX', 'UT', 'VA', 'WA', 'WV', 'WI', 'DC'
];

// ═══════════════════════════════════════════════════════════════════════════
//  TERM CATEGORIES — for UI display
// ═══════════════════════════════════════════════════════════════════════════

export const TERM_CATEGORIES: { key: TermCategory; label: string }[] = [
    { key: 'payment', label: 'Payment' },
    { key: 'scope', label: 'Scope of Work' },
    { key: 'warranty', label: 'Warranty' },
    { key: 'liability', label: 'Liability & Indemnification' },
    { key: 'general', label: 'General Provisions' },
    { key: 'jurisdiction', label: 'Jurisdiction-Specific Notices' },
];

// ═══════════════════════════════════════════════════════════════════════════
//  SYSTEM DEFAULT TERM GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate the raw system-default terms for a jurisdiction.
 * This is the baseline — no org overrides applied.
 */
export function generateSystemDefaultTerms(config: TermsConfig): TermItem[] {
    const {
        jurisdictionState,
        country = 'US',
        requiresDeposit,
        depositAmount,
        total,
        validDays,
        companyName,
        warrantyDays = 90,
        cancellationHours = 24,
        disputeResolutionDays = 30,
    } = config;

    // ── Custom jurisdictions generated by AI ──
    if (jurisdictionState.startsWith('CUSTOM_')) {
        return [];
    }

    const provider = companyName || 'Service Provider';

    // ── International routing ──
    if (country === 'DE' || jurisdictionState === 'DE-DE') {
        return generateGermanyTerms(config);
    }

    const terms: TermItem[] = [];

    // ── PAYMENT TERMS ──
    if (requiresDeposit && depositAmount) {
        const remainingBalance = Math.max(0, total - depositAmount);
        terms.push({
            id: 'payment-deposit',
            text: `A deposit of $${depositAmount.toFixed(2)} is due upon acceptance. The remaining balance of $${remainingBalance.toFixed(2)} is due upon completion of services.`,
            category: 'payment'
        });
    } else {
        terms.push({
            id: 'payment-completion',
            text: 'Payment is due upon completion of services unless otherwise agreed in writing.',
            category: 'payment'
        });
    }

    // ── SCOPE OF WORK ──
    terms.push({
        id: 'scope-access',
        text: 'Customer agrees to provide reasonable and safe access to the work area, including clear pathways, adequate lighting, and any necessary utilities (water, electricity) required for the work.',
        category: 'scope'
    });
    terms.push({
        id: 'scope-additional',
        text: 'Any additional work beyond the scope described in this quote requires separate written approval and may result in additional charges. The service provider will notify the customer before performing any out-of-scope work.',
        category: 'scope'
    });
    terms.push({
        id: 'scope-validity',
        text: `This quote is valid for ${validDays} days from the date of issue. After expiration, pricing and availability are subject to change.`,
        category: 'scope'
    });
    terms.push({
        id: 'scope-hidden',
        text: 'Quoted prices are based on visible and accessible conditions. If concealed or unforeseen conditions are discovered during the work (e.g., hidden damage, code violations, hazardous materials), the service provider reserves the right to adjust the scope and pricing with customer approval before proceeding.',
        category: 'scope'
    });

    // ── WARRANTY ──
    terms.push({
        id: 'warranty-workmanship',
        text: `${provider} warrants that all work will be performed in a professional and workmanlike manner consistent with industry standards. Workmanship is warranted for a period of ${warrantyDays} days from the date of completion. Manufacturer warranties on parts and materials, if any, are passed through to the customer and are subject to the manufacturer's terms.`,
        category: 'warranty'
    });
    terms.push({
        id: 'warranty-disclaimer',
        text: 'EXCEPT AS EXPRESSLY SET FORTH HEREIN, ALL SERVICES ARE PROVIDED "AS IS." THE SERVICE PROVIDER DISCLAIMS ALL OTHER WARRANTIES, WHETHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE.',
        category: 'warranty'
    });
    terms.push({
        id: 'warranty-exclusions',
        text: 'Warranty does not cover: damage caused by misuse, abuse, neglect, or unauthorized modifications; damage caused by acts of nature, power surges, or other events beyond the service provider\'s control; normal wear and tear; or cosmetic imperfections that do not affect functionality.',
        category: 'warranty'
    });

    // ── LIABILITY & INDEMNIFICATION ──
    terms.push({
        id: 'liability-cap',
        text: `TO THE FULLEST EXTENT PERMITTED BY LAW, ${provider.toUpperCase()}'S TOTAL LIABILITY FOR ANY CLAIMS, LOSSES, OR DAMAGES ARISING OUT OF OR RELATED TO THE SERVICES PROVIDED — WHETHER IN CONTRACT, TORT (INCLUDING NEGLIGENCE), OR OTHERWISE — SHALL NOT EXCEED THE TOTAL AMOUNT PAID BY THE CUSTOMER FOR THE SERVICES UNDER THIS QUOTE.`,
        category: 'liability'
    });
    terms.push({
        id: 'liability-consequential',
        text: `IN NO EVENT SHALL ${provider.toUpperCase()} BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF USE, LOSS OF INCOME, LOSS OF PROFITS, BUSINESS INTERRUPTION, OR DAMAGE TO PROPERTY NOT BEING SERVICED, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. THIS LIMITATION DOES NOT APPLY TO DAMAGES RESULTING FROM GROSS NEGLIGENCE OR WILLFUL MISCONDUCT.`,
        category: 'liability'
    });
    terms.push({
        id: 'liability-preexisting',
        text: 'The service provider is not responsible for pre-existing conditions, defects, or damage not caused by the service provider\'s work. The customer acknowledges that older systems and materials may be subject to wear, corrosion, or failure independent of the services performed.',
        category: 'liability'
    });
    terms.push({
        id: 'liability-code',
        text: 'If existing installations are found to be non-compliant with current building codes, the service provider may be required to bring them into compliance. Any additional costs for code compliance will be discussed with the customer and require written approval before proceeding.',
        category: 'liability'
    });
    terms.push({
        id: 'liability-indemnification',
        text: `Customer agrees to indemnify, defend, and hold harmless ${provider} and its employees, agents, and subcontractors from and against any claims, damages, losses, or expenses (including reasonable attorney's fees) arising from: (a) the customer's misuse of the repaired or serviced equipment; (b) the customer's failure to follow maintenance recommendations; (c) inaccurate or incomplete information provided by the customer; or (d) conditions at the work site not disclosed by the customer.`,
        category: 'liability'
    });

    // ── GENERAL PROVISIONS ──
    terms.push({
        id: 'general-cancellation',
        text: `Cancellations must be made at least ${cancellationHours} hours prior to a scheduled appointment. Cancellations made with less than ${cancellationHours} hours notice may be subject to a service call fee. If the customer cancels after work has begun, the customer is responsible for payment of all work completed and materials ordered or used.`,
        category: 'general'
    });
    terms.push({
        id: 'general-force-majeure',
        text: 'Neither party shall be liable for delays or failure to perform due to circumstances beyond reasonable control, including but not limited to acts of God, natural disasters, pandemics, government orders, supply chain disruptions, labor disputes, or utility failures.',
        category: 'general'
    });
    terms.push({
        id: 'general-photos',
        text: 'The service provider may take photographs of the work site before, during, and after service for documentation purposes. These photos will be used solely for internal records, quality assurance, and dispute resolution and will not be shared publicly without customer consent.',
        category: 'general'
    });
    terms.push({
        id: 'general-disputes',
        text: `Any disputes arising under this agreement shall first be subject to good-faith negotiation between the parties. If unresolved within ${disputeResolutionDays} days, disputes shall be resolved through binding arbitration in accordance with the rules of the American Arbitration Association, conducted in the State of ${getStateName(jurisdictionState)}. The prevailing party shall be entitled to recover reasonable attorney's fees.`,
        category: 'general'
    });
    terms.push({
        id: 'general-entire-agreement',
        text: 'This quote, including these terms and conditions, constitutes the entire agreement between the parties regarding the services described. Any modifications must be in writing and signed by both parties. The invalidity of any provision shall not affect the validity of the remaining provisions.',
        category: 'general'
    });

    // ── JURISDICTION-SPECIFIC NOTICES ──
    terms.push({
        id: 'jurisdiction-governing',
        text: `This agreement shall be governed by and construed in accordance with the laws of the State of ${getStateName(jurisdictionState)}, without regard to conflict of law principles.`,
        category: 'jurisdiction'
    });

    // Right to cancel — FTC Cooling-Off Rule (federal) applies to all states for door-to-door sales
    if (RIGHT_TO_CANCEL_STATES.includes(jurisdictionState)) {
        terms.push({
            id: 'jurisdiction-cancel-notice',
            text: `NOTICE OF RIGHT TO CANCEL: Under ${getStateName(jurisdictionState)} law and the federal Cooling-Off Rule, you may have the right to cancel this transaction within three (3) business days of signing if the services were solicited at your residence. See your state consumer protection office for details.`,
            category: 'jurisdiction'
        });
    }

    if (MECHANICS_LIEN_NOTICE_STATES.includes(jurisdictionState)) {
        terms.push({
            id: 'jurisdiction-lien-notice',
            text: `PRELIMINARY NOTICE: Under ${getStateName(jurisdictionState)} law, anyone who helps improve your property but is not paid may record a mechanic's lien on your property. A mechanic's lien is a claim against your property that could result in a court-ordered foreclosure sale. To preserve their rights, certain parties are required to provide you with this notice.`,
            category: 'jurisdiction'
        });
    }

    if (HOME_IMPROVEMENT_LICENSE_STATES.includes(jurisdictionState)) {
        terms.push({
            id: 'jurisdiction-license',
            text: `This work is performed in compliance with ${getStateName(jurisdictionState)} home improvement licensing requirements. License information is available upon request. Customers are encouraged to verify contractor licensing status through their state licensing board.`,
            category: 'jurisdiction'
        });
    }

    // ── State-specific notices ──
    const stateNotice = STATE_SPECIFIC_NOTICES[jurisdictionState];
    if (stateNotice) {
        terms.push({
            id: `jurisdiction-${jurisdictionState.toLowerCase()}-notice`,
            text: stateNotice,
            category: 'jurisdiction'
        });
    }

    return terms;
}

// ═══════════════════════════════════════════════════════════════════════════
//  STATE-SPECIFIC NOTICES
// ═══════════════════════════════════════════════════════════════════════════

const STATE_SPECIFIC_NOTICES: Record<string, string> = {
    HI: 'HAWAII NOTICE: This contractor is licensed by the State of Hawaii Department of Commerce and Consumer Affairs, Contractors License Board. Complaints may be filed with the Regulated Industries Complaints Office (RICO). Home improvement contracts exceeding $1,000 must comply with HRS Chapter 444.',

    CA: 'CALIFORNIA NOTICE: Contractors are required by law to be licensed and regulated by the Contractors\' State License Board (CSLB). Any questions concerning a contractor may be referred to the registrar of the CSLB at 1-800-321-CSLB (2752). Home improvement contracts over $500 must be in writing.',

    TX: 'TEXAS NOTICE: Under the Texas Deceptive Trade Practices — Consumer Protection Act, consumers have specific rights regarding home repair services. The contractor warrants that services will be performed in a good and workmanlike manner as defined by Texas Property Code §27.001. Texas does not require a state-wide general contractor license; however, certain trades (HVAC, electrical, plumbing) require state licensing.',

    FL: 'FLORIDA NOTICE: Under Florida Statute 713.015, this contractor may record a lien against your property if not paid. Florida law requires contractors to be licensed. Verify license status at myfloridalicense.com. Contracts for work over $2,500 must comply with Florida Home Improvement Contract requirements.',

    NY: 'NEW YORK NOTICE: Home improvement contractors must be registered with the New York Department of Consumer Protection or local county consumer affairs offices. In New York City, contractors must hold a Home Improvement Contractor (HIC) license. Consumers may contact the NYC Department of Consumer and Worker Protection at (212) 436-0345. Home improvement contracts must be in writing for work over $500.',

    IL: 'ILLINOIS NOTICE: Under the Illinois Home Repair and Remodeling Act (815 ILCS 513), contractors must provide consumers with a pamphlet about home repair fraud before work begins. Contracts for work over $1,000 must be in writing. The Illinois Attorney General\'s office handles consumer complaints at 1-800-243-0618.',

    PA: 'PENNSYLVANIA NOTICE: Under the Pennsylvania Home Improvement Consumer Protection Act (Act 132), home improvement contractors must register with the Attorney General\'s Office. Registration numbers must appear on all contracts, advertisements, and business cards. File complaints with the Bureau of Consumer Protection at 1-800-441-2555.',

    OH: 'OHIO NOTICE: Under the Ohio Consumer Sales Practices Act (ORC §1345), contractors must comply with home solicitation sales rules. The Ohio Attorney General\'s Consumer Protection Section handles complaints at 1-800-282-0515. Certain trades require licensing through the Ohio Construction Industry Licensing Board.',

    GA: 'GEORGIA NOTICE: Residential and general contractors must be licensed by the Georgia State Licensing Board for Residential and General Contractors. Verify license status at sos.ga.gov. Complaints may be filed with the Georgia Governor\'s Office of Consumer Protection at (404) 651-8600.',

    AZ: 'ARIZONA NOTICE: Contractors must be licensed by the Arizona Registrar of Contractors (ROC). Verify license status and file complaints at roc.az.gov or call (602) 542-1525. Home improvement contracts over $1,000 require a written agreement. The Residential Contractors\' Recovery Fund provides reimbursement for damages caused by licensed contractors.',

    WA: 'WASHINGTON NOTICE: Contractors must be registered with the Washington Department of Labor & Industries. Verify registration at lni.wa.gov. Unregistered contractors cannot file liens or sue for payment. The contractor must provide a statement of the customer\'s rights under the Washington State Contractor Registration Act.',

    OR: 'OREGON NOTICE: Contractors must be licensed by the Oregon Construction Contractors Board (CCB). Verify license status at ccb.oregon.gov or call (503) 378-4621. Unlicensed contractors cannot place liens, sue for payment, or recover for work performed. Contracts over $2,000 must be in writing.',

    CO: 'COLORADO NOTICE: Colorado does not require a general contractor state license, but certain trades (electrical, plumbing, HVAC) require state or local licensing. Contractors must comply with the Colorado Consumer Protection Act (CRS §6-1-101 et seq.). The Colorado Attorney General handles consumer complaints at (720) 508-6000.',

    NV: 'NEVADA NOTICE: Contractors must be licensed by the Nevada State Contractors Board. Verify license status at nscb.nv.gov or call (702) 486-1100. Working without a license is a misdemeanor. The Residential Recovery Fund provides compensation for homeowners damaged by licensed contractors.',

    VA: 'VIRGINIA NOTICE: Contractors must hold a license or registration from the Virginia Department of Professional and Occupational Regulation (DPOR). Class A license required for projects over $120,000; Class B for $10,000–$120,000; Class C for under $10,000. Verify at dpor.virginia.gov.',

    CT: 'CONNECTICUT NOTICE: Home improvement contractors must register with the Connecticut Department of Consumer Protection. Registration number: available upon request. Contracts for work over $200 must be in writing. File complaints at ct.gov/dcp or call 1-800-842-2649.',

    NJ: 'NEW JERSEY NOTICE: Home improvement contractors must register with the New Jersey Division of Consumer Affairs. Under the New Jersey Consumer Fraud Act (N.J.S.A. 56:8-1), consumers are protected against deceptive practices. File complaints at njconsumeraffairs.gov or call 1-800-242-5846.',

    MD: 'MARYLAND NOTICE: Home improvement contractors must be licensed by the Maryland Home Improvement Commission (MHIC). License number: available upon request. Contracts over $500 must be in writing. File complaints at dllr.state.md.us or call (410) 230-6309. The Home Improvement Guaranty Fund provides recovery for damages.',

    MA: 'MASSACHUSETTS NOTICE: Home improvement contractors must register with the Massachusetts Office of Consumer Affairs. Registration is required for work over $500. File complaints with the Office of Consumer Affairs at mass.gov/consumer or call (617) 973-8787.',

    LA: 'LOUISIANA NOTICE: Contractors must be licensed by the Louisiana State Licensing Board for Contractors (LSLBC) for work over $50,000 (commercial) or any residential work. Verify at lslbc.louisiana.gov or call (225) 765-2301. Subcontractors must hold appropriate specialty licenses.',

    TN: 'TENNESSEE NOTICE: Contractors must be licensed by the Tennessee Board for Licensing Contractors for projects over $25,000. Verify at tn.gov/commerce or call (615) 741-8307. Home improvement contracts must comply with the Tennessee Consumer Protection Act (TCA §47-18-101 et seq.).',

    NC: 'NORTH CAROLINA NOTICE: General contractors must be licensed by the North Carolina Licensing Board for General Contractors for projects over $30,000. Verify at nclbgc.org or call (919) 571-4183. Certain specialty trades require separate licensing.',

    MI: 'MICHIGAN NOTICE: Residential builders and maintenance/alteration contractors must be licensed by the Michigan Department of Licensing and Regulatory Affairs (LARA). Verify at michigan.gov/lara or call (517) 241-9288. Residential contracts over $600 require a written agreement.',

    MN: 'MINNESOTA NOTICE: Contractors must be licensed by the Minnesota Department of Labor and Industry for residential work. Verify at dli.mn.gov or call (651) 284-5005. The Contractor Recovery Fund provides compensation for damages by licensed contractors.',

    WI: 'WISCONSIN NOTICE: Dwelling contractors and subcontractors must register with the Wisconsin Department of Safety and Professional Services (DSPS). Verify at dsps.wi.gov or call (608) 266-2112.',

    IN: 'INDIANA NOTICE: Indiana does not require a state-wide general contractor license, but certain trades (plumbing, electrical, HVAC) require state or local licensing. Consumers may file complaints with the Indiana Attorney General\'s Consumer Protection Division at (317) 232-6201.',

    MO: 'MISSOURI NOTICE: Missouri does not require a state-wide general contractor license, but contractors must comply with the Missouri Merchandising Practices Act (RSMo §407). Certain municipalities require local licensing. File consumer complaints with the Missouri Attorney General at ago.mo.gov.',

    SC: 'SOUTH CAROLINA NOTICE: General and mechanical contractors must be licensed by the South Carolina Contractors\' Licensing Board for projects over $5,000. Verify at llr.sc.gov or call (803) 896-4686.',

    AL: 'ALABAMA NOTICE: General contractors must be licensed by the Alabama Licensing Board for General Contractors for projects over $50,000. Verify at genconbd.alabama.gov or call (334) 272-5030.',

    RI: 'RHODE ISLAND NOTICE: Contractors must register with the Rhode Island Contractors\' Registration and Licensing Board. Verify at crb.ri.gov or call (401) 462-9500. All home improvement contracts over $1,000 must be in writing.',

    DC: 'DISTRICT OF COLUMBIA NOTICE: Contractors must be licensed by the DC Department of Consumer and Regulatory Affairs (DCRA). Verify at dcra.dc.gov. Home improvement contracts must comply with the DC Consumer Protection Procedures Act.',
};

// ═══════════════════════════════════════════════════════════════════════════
//  GERMANY / INTERNATIONAL TERMS
// ═══════════════════════════════════════════════════════════════════════════

function generateGermanyTerms(config: TermsConfig): TermItem[] {
    const { requiresDeposit, depositAmount, total, validDays, companyName, warrantyDays = 365 } = config;
    const provider = companyName || 'Dienstleister';
    const terms: TermItem[] = [];

    // ── PAYMENT ──
    if (requiresDeposit && depositAmount) {
        const remaining = Math.max(0, total - depositAmount);
        terms.push({
            id: 'payment-deposit',
            text: `Eine Anzahlung von €${depositAmount.toFixed(2)} ist bei Auftragserteilung fällig. Der Restbetrag von €${remaining.toFixed(2)} ist nach Fertigstellung der Arbeiten fällig. / A deposit of €${depositAmount.toFixed(2)} is due upon acceptance. The remaining balance of €${remaining.toFixed(2)} is due upon completion.`,
            category: 'payment'
        });
    } else {
        terms.push({
            id: 'payment-completion',
            text: 'Die Zahlung ist nach Fertigstellung der Leistung fällig, sofern nichts anderes schriftlich vereinbart wurde. / Payment is due upon completion of services unless otherwise agreed in writing.',
            category: 'payment'
        });
    }

    // ── SCOPE ──
    terms.push({
        id: 'scope-access',
        text: 'Der Kunde verpflichtet sich, einen angemessenen und sicheren Zugang zum Arbeitsbereich zu gewähren. / Customer agrees to provide reasonable and safe access to the work area.',
        category: 'scope'
    });
    terms.push({
        id: 'scope-additional',
        text: 'Zusätzliche Arbeiten über den beschriebenen Umfang hinaus bedürfen einer gesonderten schriftlichen Genehmigung und können zu zusätzlichen Kosten führen. / Additional work beyond this quote requires separate written approval and may result in additional charges.',
        category: 'scope'
    });
    terms.push({
        id: 'scope-validity',
        text: `Dieses Angebot ist ${validDays} Tage ab Ausstellungsdatum gültig. / This quote is valid for ${validDays} days from the date of issue.`,
        category: 'scope'
    });
    terms.push({
        id: 'scope-hidden',
        text: 'Die Preise basieren auf sichtbaren und zugänglichen Bedingungen. Bei verdeckten oder unvorhergesehenen Umständen behält sich der Dienstleister das Recht vor, den Umfang und die Preisgestaltung mit Zustimmung des Kunden anzupassen. / Quoted prices are based on visible conditions. If concealed conditions are discovered, pricing may be adjusted with customer approval.',
        category: 'scope'
    });

    // ── WARRANTY (Gewährleistung — BGB §634 mandates min 2 years for construction) ──
    terms.push({
        id: 'warranty-workmanship',
        text: `${provider} gewährleistet, dass alle Arbeiten fachgerecht und nach den anerkannten Regeln der Technik ausgeführt werden. Die Gewährleistungsfrist beträgt ${warrantyDays} Tage gemäß den gesetzlichen Bestimmungen (BGB §634). / ${provider} warrants professional workmanship for ${warrantyDays} days per statutory requirements (BGB §634).`,
        category: 'warranty'
    });
    terms.push({
        id: 'warranty-exclusions',
        text: 'Die Gewährleistung umfasst keine Schäden durch unsachgemäße Nutzung, höhere Gewalt, normale Abnutzung oder nicht autorisierte Änderungen. / Warranty excludes damage from misuse, force majeure, normal wear and tear, or unauthorized modifications.',
        category: 'warranty'
    });

    // ── LIABILITY ──
    terms.push({
        id: 'liability-cap',
        text: `DIE GESAMTHAFTUNG DES DIENSTLEISTERS FÜR ANSPRÜCHE, DIE SICH AUS ODER IM ZUSAMMENHANG MIT DEN ERBRACHTEN LEISTUNGEN ERGEBEN, IST — SOWEIT GESETZLICH ZULÄSSIG — AUF DEN GESAMTBETRAG DER VOM KUNDEN FÜR DIE LEISTUNGEN GEZAHLTEN VERGÜTUNG BESCHRÄNKT. Dies gilt nicht bei Vorsatz und grober Fahrlässigkeit. / ${provider.toUpperCase()}'S TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT PAID FOR SERVICES. This does not apply in cases of intent or gross negligence.`,
        category: 'liability'
    });
    terms.push({
        id: 'liability-preexisting',
        text: 'Der Dienstleister haftet nicht für vorbestehende Mängel oder Schäden, die nicht durch seine Arbeiten verursacht wurden. / The service provider is not responsible for pre-existing defects or damage not caused by the provider\'s work.',
        category: 'liability'
    });

    // ── GENERAL ──
    terms.push({
        id: 'general-cancellation',
        text: 'Stornierungen müssen mindestens 24 Stunden vor dem vereinbarten Termin erfolgen. Bei kurzfristigen Stornierungen kann eine Anfahrtspauschale berechnet werden. / Cancellations must be made at least 24 hours before the scheduled appointment.',
        category: 'general'
    });
    terms.push({
        id: 'general-force-majeure',
        text: 'Keine der Parteien haftet für Verzögerungen aufgrund höherer Gewalt, Naturkatastrophen, Pandemien, behördlicher Anordnungen oder Lieferkettenunterbrechungen. / Neither party is liable for delays due to force majeure.',
        category: 'general'
    });
    terms.push({
        id: 'general-disputes',
        text: 'Streitigkeiten aus diesem Vertrag werden zunächst durch gütliche Verhandlung beigelegt. Gerichtsstand ist der Sitz des Dienstleisters, sofern gesetzlich zulässig. / Disputes shall first be resolved through good-faith negotiation. Legal venue is the service provider\'s place of business where legally permissible.',
        category: 'general'
    });
    terms.push({
        id: 'general-entire-agreement',
        text: 'Dieses Angebot einschließlich dieser AGB stellt die gesamte Vereinbarung zwischen den Parteien dar. Änderungen bedürfen der Schriftform. / This quote constitutes the entire agreement. Modifications must be in writing.',
        category: 'general'
    });

    // ── JURISDICTION-SPECIFIC (Germany) ──
    terms.push({
        id: 'jurisdiction-governing',
        text: 'Dieser Vertrag unterliegt dem Recht der Bundesrepublik Deutschland. / This agreement is governed by the laws of the Federal Republic of Germany.',
        category: 'jurisdiction'
    });
    terms.push({
        id: 'jurisdiction-de-widerrufsrecht',
        text: 'WIDERRUFSBELEHRUNG: Bei Verträgen, die außerhalb von Geschäftsräumen geschlossen werden, haben Sie das Recht, binnen 14 Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen (§ 355 BGB). / RIGHT OF WITHDRAWAL: For contracts concluded outside business premises, you have the right to withdraw within 14 days without giving reasons (§ 355 BGB).',
        category: 'jurisdiction'
    });
    terms.push({
        id: 'jurisdiction-de-handwerk',
        text: 'Dieser Betrieb ist in der Handwerksrolle der zuständigen Handwerkskammer eingetragen. Die Handwerkskarte-Nummer ist auf Anfrage erhältlich. / This business is registered in the trade register of the responsible Chamber of Crafts. Registration number available upon request.',
        category: 'jurisdiction'
    });
    terms.push({
        id: 'jurisdiction-de-dsgvo',
        text: 'DATENSCHUTZHINWEIS: Personenbezogene Daten werden gemäß der Datenschutz-Grundverordnung (DSGVO/GDPR) und dem Bundesdatenschutzgesetz (BDSG) verarbeitet. Die Datenverarbeitung erfolgt ausschließlich zum Zweck der Vertragserfüllung. Betroffene haben das Recht auf Auskunft, Berichtigung, Löschung und Datenübertragbarkeit. / DATA PROTECTION: Personal data is processed in accordance with GDPR and BDSG. Processing is solely for contract fulfillment. Data subjects have rights to access, rectification, erasure, and portability.',
        category: 'jurisdiction'
    });

    return terms;
}

// ═══════════════════════════════════════════════════════════════════════════
//  MERGE ENGINE — resolves system defaults + org overrides
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve the final terms for a quote by merging system defaults with org overrides.
 *
 * Override precedence:
 *   1. Jurisdiction-specific override (highest)
 *   2. Global override
 *   3. System default (lowest)
 */
export function resolveQuoteTerms(config: TermsConfig): TermItem[] {
    const orgConfig = config.orgTermsConfig;

    // Apply org-level defaults if present
    const resolvedConfig: TermsConfig = {
        ...config,
        warrantyDays: config.warrantyDays ?? orgConfig?.defaultWarrantyDays ?? 90,
        cancellationHours: config.cancellationHours ?? orgConfig?.defaultCancellationHours ?? 24,
        disputeResolutionDays: config.disputeResolutionDays ?? orgConfig?.defaultDisputeResolutionDays ?? 30,
        companyName: config.companyName || orgConfig?.companyLegalName,
        country: config.country ?? getCountryForJurisdiction(config.jurisdictionState, orgConfig?.customJurisdictions),
    };

    // Override arbitration venue if org has one set
    if (orgConfig?.arbitrationVenue) {
        resolvedConfig.companyName = resolvedConfig.companyName; // keep as-is, venue handled in post-processing
    }

    // Generate system defaults
    const systemTerms = generateSystemDefaultTerms(resolvedConfig);

    // If no org overrides, return system defaults as-is
    if (!orgConfig) {
        return systemTerms;
    }

    // Group system terms by category
    const termsByCategory = new Map<TermCategory, TermItem[]>();
    for (const term of systemTerms) {
        const existing = termsByCategory.get(term.category) || [];
        existing.push(term);
        termsByCategory.set(term.category, existing);
    }

    // Apply overrides per category
    const result: TermItem[] = [];
    const categories: TermCategory[] = ['payment', 'scope', 'warranty', 'liability', 'general', 'jurisdiction'];

    for (const category of categories) {
        const override = getOverrideForCategory(category, config.jurisdictionState, orgConfig);
        const defaults = termsByCategory.get(category) || [];

        if (override) {
            // Check if section is disabled
            if (!override.enabled) {
                continue; // Skip this entire section
            }

            // customTerms replaces ALL defaults
            if (override.customTerms && override.customTerms.length > 0) {
                result.push(...override.customTerms.map((text, i) => ({
                    id: `custom-${category}-${i}`,
                    text,
                    category
                })));
                // Still apply appendTerms even with customTerms
                if (override.appendTerms) {
                    result.push(...override.appendTerms.map((text, i) => ({
                        id: `appended-${category}-${i}`,
                        text,
                        category
                    })));
                }
                continue;
            }

            // Filter out removed terms
            let filtered = defaults;
            if (override.removeTermIds && override.removeTermIds.length > 0) {
                filtered = defaults.filter(t => !override.removeTermIds!.includes(t.id));
            }

            result.push(...filtered);

            // Append additional terms
            if (override.appendTerms && override.appendTerms.length > 0) {
                result.push(...override.appendTerms.map((text, i) => ({
                    id: `appended-${category}-${i}`,
                    text,
                    category
                })));
            }
        } else {
            // No override — use system defaults
            result.push(...defaults);
        }
    }

    // Post-process: override arbitration venue if set
    if (orgConfig.arbitrationVenue) {
        for (const term of result) {
            if (term.id === 'general-disputes') {
                term.text = term.text.replace(
                    /conducted in the State of [^.]+\./,
                    `conducted in ${orgConfig.arbitrationVenue}.`
                );
            }
        }
    }

    return result;
}

/**
 * Get the effective override for a category, considering jurisdiction-specific
 * overrides first, then falling back to global overrides.
 */
function getOverrideForCategory(
    category: TermCategory,
    jurisdictionState: string,
    orgConfig: OrgTermsConfig
): TermSectionOverride | undefined {
    // 1. Check jurisdiction-specific override
    const jurisdictionOverride = orgConfig.jurisdictionOverrides?.[jurisdictionState]?.[category];
    if (jurisdictionOverride) {
        return jurisdictionOverride;
    }

    // 2. Check global override (not for 'jurisdiction' category — those are inherently jurisdiction-specific)
    if (category !== 'jurisdiction') {
        const globalOverride = orgConfig.globalOverrides?.[category as keyof NonNullable<OrgTermsConfig['globalOverrides']>];
        if (globalOverride) {
            return globalOverride;
        }
    }

    return undefined;
}

// ═══════════════════════════════════════════════════════════════════════════
//  BACKWARD COMPATIBILITY — legacy generateQuoteTerms() wrapper
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Legacy wrapper — generates terms using the old API signature.
 * Internally delegates to the new resolveQuoteTerms() engine.
 * @deprecated Use resolveQuoteTerms() for new code
 */
export function generateQuoteTerms(config: TermsConfig): TermItem[] {
    return resolveQuoteTerms(config);
}

// ═══════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export function getStateName(code: string, customJurisdictions?: JurisdictionInfo[]): string {
    const found = (customJurisdictions || []).find(j => j.code === code) || ALL_JURISDICTIONS.find(j => j.code === code);
    if (found) return found.name;

    // Fallback legacy lookup
    const states: Record<string, string> = {
        AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
        CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
        HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
        KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
        MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
        MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
        NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
        OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
        SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
        VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
        DC: 'District of Columbia', PR: 'Puerto Rico', GU: 'Guam', VI: 'US Virgin Islands',
    };
    return states[code] || code;
}

/**
 * Determine the country for a jurisdiction code.
 */
export function getCountryForJurisdiction(code: string, customJurisdictions?: JurisdictionInfo[]): string {
    const found = (customJurisdictions || []).find(j => j.code === code) || ALL_JURISDICTIONS.find(j => j.code === code);
    return found?.country || 'US';
}

/**
 * Get all term IDs for a given jurisdiction (useful for the override UI).
 */
export function getDefaultTermIdsForJurisdiction(jurisdictionCode: string): { category: TermCategory; ids: string[] }[] {
    const terms = generateSystemDefaultTerms({
        jurisdictionState: jurisdictionCode,
        country: getCountryForJurisdiction(jurisdictionCode),
        requiresDeposit: false,
        total: 1000,
        validDays: 30,
    });

    const result: { category: TermCategory; ids: string[] }[] = [];
    const categories: TermCategory[] = ['payment', 'scope', 'warranty', 'liability', 'general', 'jurisdiction'];
    for (const cat of categories) {
        const ids = terms.filter(t => t.category === cat).map(t => t.id);
        if (ids.length > 0) {
            result.push({ category: cat, ids });
        }
    }
    return result;
}
