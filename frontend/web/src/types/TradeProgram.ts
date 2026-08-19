import { VendorOrderField } from './Vendor';

export type TradeCategory = 
    | 'all'
    | 'general_hardware'
    | 'hvac_refrigeration'
    | 'plumbing_piping'
    | 'electrical_lighting'
    | 'roofing_siding'
    | 'paint_coatings'
    | 'tools_equipment'
    | 'facility_maintenance'
    | 'safety_ppe';

export interface TradeProgram {
    id: string;
    supplierName: string;
    programName: string; // e.g. "ProXtra", "MVP Pro", "ProPlus", "Amazon Business Prime"
    tagline: string;     // e.g. "Up to 20% Volume Pricing & Bulk Paint Rewards"
    tradeCategory: TradeCategory;
    categoryLabel: string;
    country: string;     // 'US' | 'CA' | 'GB' | 'AU' | 'GLOBAL'
    countryLabel: string;
    stateScope: 'national' | string[]; // 'national' or array of state codes ['CA', 'TX', 'HI', etc.]
    stateScopeLabel?: string;
    typicalDiscountPercent?: number;
    discountDescription: string;
    perks: string[];
    enrollmentUrl: string;
    portalLoginUrl?: string;
    defaultPaymentTerms?: string;
    discountCodeTemplate?: string;
    logoUrl?: string;
    sourcingStrength?: 'local_pickup' | 'commodity_lowest' | 'urgent_callout' | 'specialty_quality' | 'general';
    integrationType?: 'email_pdf' | 'dynamic_api';
    requiredOrderFields?: VendorOrderField[];
    notesForContractor?: string;
}
