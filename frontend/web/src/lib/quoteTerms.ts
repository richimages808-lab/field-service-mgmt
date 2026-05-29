/**
 * Quote Terms & Conditions Generator
 * Generates comprehensive, jurisdiction-aware terms for field service quotes.
 * Provides liability protection for technicians/contractors.
 */

export interface TermsConfig {
    jurisdictionState: string;
    requiresDeposit: boolean;
    depositAmount?: number;
    total: number;
    validDays: number;
    companyName?: string;
}

interface TermItem {
    id: string;
    text: string;
    category: 'payment' | 'scope' | 'liability' | 'warranty' | 'general' | 'jurisdiction';
}

/**
 * US states that require specific consumer protection disclosures
 */
const RIGHT_TO_CANCEL_STATES = ['CA', 'TX', 'FL', 'NY', 'IL', 'PA', 'OH', 'MI', 'NJ', 'MA', 'WA', 'OR', 'CO', 'MN', 'WI', 'MD', 'VA', 'CT', 'NC', 'AZ'];
const MECHANICS_LIEN_NOTICE_STATES = ['CA', 'TX', 'FL', 'AZ', 'WA', 'OR', 'CO', 'NV', 'GA', 'TN'];
const HOME_IMPROVEMENT_LICENSE_STATES = ['CA', 'CT', 'MD', 'NJ', 'NY', 'PA', 'VA', 'TN', 'LA', 'HI'];

export function generateQuoteTerms(config: TermsConfig): TermItem[] {
    const { jurisdictionState, requiresDeposit, depositAmount, total, validDays, companyName } = config;
    const provider = companyName || 'Service Provider';
    const terms: TermItem[] = [];

    // ── PAYMENT TERMS ──
    if (requiresDeposit && depositAmount) {
        terms.push({
            id: 'payment-deposit',
            text: `A deposit of $${depositAmount.toFixed(2)} is due upon acceptance. The remaining balance of $${(total - depositAmount).toFixed(2)} is due upon completion of services.`,
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

    // ── LIABILITY PROTECTION ──
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

    // ── WARRANTY ──
    terms.push({
        id: 'warranty-workmanship',
        text: `${provider} warrants that all work will be performed in a professional and workmanlike manner consistent with industry standards. Workmanship is warranted for a period of 90 days from the date of completion. Manufacturer warranties on parts and materials, if any, are passed through to the customer and are subject to the manufacturer's terms.`,
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

    // ── GENERAL ──
    terms.push({
        id: 'general-cancellation',
        text: 'Cancellations must be made at least 24 hours prior to a scheduled appointment. Cancellations made with less than 24 hours notice may be subject to a service call fee. If the customer cancels after work has begun, the customer is responsible for payment of all work completed and materials ordered or used.',
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
        text: `Any disputes arising under this agreement shall first be subject to good-faith negotiation between the parties. If unresolved within 30 days, disputes shall be resolved through binding arbitration in accordance with the rules of the American Arbitration Association, conducted in ${jurisdictionState}. The prevailing party shall be entitled to recover reasonable attorney's fees.`,
        category: 'general'
    });
    terms.push({
        id: 'general-entire-agreement',
        text: 'This quote, including these terms and conditions, constitutes the entire agreement between the parties regarding the services described. Any modifications must be in writing and signed by both parties. The invalidity of any provision shall not affect the validity of the remaining provisions.',
        category: 'general'
    });

    // ── JURISDICTION-SPECIFIC ──
    terms.push({
        id: 'jurisdiction-governing',
        text: `This agreement shall be governed by and construed in accordance with the laws of the State of ${getStateName(jurisdictionState)}, without regard to conflict of law principles.`,
        category: 'jurisdiction'
    });

    if (RIGHT_TO_CANCEL_STATES.includes(jurisdictionState)) {
        terms.push({
            id: 'jurisdiction-cancel-notice',
            text: `NOTICE OF RIGHT TO CANCEL: Under ${getStateName(jurisdictionState)} law, you may have the right to cancel this transaction within three (3) business days of signing if the services were solicited at your residence. See your state consumer protection office for details.`,
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

    // Hawaii-specific
    if (jurisdictionState === 'HI') {
        terms.push({
            id: 'jurisdiction-hi-notice',
            text: 'HAWAII NOTICE: This contractor is licensed by the State of Hawaii Department of Commerce and Consumer Affairs, Contractors License Board. Complaints may be filed with the Regulated Industries Complaints Office (RICO). Home improvement contracts exceeding $1,000 must comply with HRS Chapter 444.',
            category: 'jurisdiction'
        });
    }

    // California-specific
    if (jurisdictionState === 'CA') {
        terms.push({
            id: 'jurisdiction-ca-notice',
            text: 'CALIFORNIA NOTICE: Contractors are required by law to be licensed and regulated by the Contractors\' State License Board (CSLB). Any questions concerning a contractor may be referred to the registrar of the CSLB at 1-800-321-CSLB (2752). Home improvement contracts over $500 must be in writing.',
            category: 'jurisdiction'
        });
    }

    // Texas-specific
    if (jurisdictionState === 'TX') {
        terms.push({
            id: 'jurisdiction-tx-notice',
            text: 'TEXAS NOTICE: Under the Texas Deceptive Trade Practices — Consumer Protection Act, consumers have specific rights regarding home repair services. The contractor warrants that services will be performed in a good and workmanlike manner as defined by Texas Property Code §27.001.',
            category: 'jurisdiction'
        });
    }

    // Florida-specific
    if (jurisdictionState === 'FL') {
        terms.push({
            id: 'jurisdiction-fl-notice',
            text: 'FLORIDA NOTICE: Under Florida Statute 713.015, this contractor may record a lien against your property if not paid. Florida law requires contractors to be licensed. Verify license status at myfloridalicense.com.',
            category: 'jurisdiction'
        });
    }

    return terms;
}

function getStateName(code: string): string {
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
