import { Timestamp } from 'firebase/firestore';

export interface AddressInfo {
    street1?: string;
    street2?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    formattedAddress?: string;
}

export interface ShippingLocation {
    id: string;
    name: string; // e.g. "Main Warehouse", "North Shop", "Job Site"
    address: AddressInfo;
    isDefault?: boolean;
    contactName?: string;
    contactPhone?: string;
    deliveryNotes?: string;
}

export interface VendorOrderField {
    id: string;
    key: string;               // e.g. "accountNumber", "jobReference", "deliveryContactPhone", "receivingDockCode"
    label: string;             // e.g. "Account Number", "Job / Work Order Reference", "Receiving Contact Phone"
    description?: string;      // e.g. "Required by vendor for commercial order processing"
    type: 'text' | 'phone' | 'email' | 'select' | 'number';
    required: boolean;
    defaultValue?: string;
    options?: string[];
}

export interface Vendor {
    id?: string;
    organizationId: string;
    name: string;
    accountNumber?: string;
    taxId?: string; // EIN / Tax ID
    email: string;
    phone?: string;
    supportEmail?: string;
    supportPhone?: string;
    website?: string;
    portalUrl?: string;
    address?: string; // legacy string
    contactPerson?: string;
    contactPhone?: string;
    contactEmail?: string;
    paymentTerms?: string; // e.g. 'Net 30', 'Net 15', 'Due Upon Receipt', 'Credit Card on File', 'COD', 'Prepaid'
    orderInstructions?: string;
    discountCodes?: string;
    tradeDiscountPercent?: number;
    active: boolean;
    
    // Structured Addresses
    shippingAddress?: string;
    billingAddress?: string;
    structuredShippingAddress?: AddressInfo;
    structuredBillingAddress?: AddressInfo;
    savedShippingLocations?: ShippingLocation[];

    // Vendor Specific Required Order Fields
    requiredOrderFields?: VendorOrderField[];

    customerApiId?: string;
    vaultedPaymentId?: string;
    integrationType?: 'email_pdf' | 'dynamic_api';
    apiConfig?: {
        endpointUrl: string;
        method: 'POST' | 'PUT';
        headersTemplate: Record<string, string>;
        bodyTemplate: string;
    };
    sourcingStrength?: 'local_pickup' | 'commodity_lowest' | 'urgent_callout' | 'specialty_quality' | 'general';
    webUsername?: string;
    webPassword?: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

export interface PurchaseOrder {
    id?: string;
    organizationId: string;
    vendorId: string;
    vendorName: string;
    status: 'draft' | 'sent' | 'partially_received' | 'received' | 'canceled';
    items: POItem[];
    subtotal: number;
    tax: number;
    shipping: number;
    total: number;
    notes?: string;
    // Shipping & Billing Destination Verification
    shippingAddress?: string;
    billingAddress?: string;
    structuredShippingAddress?: AddressInfo;
    structuredBillingAddress?: AddressInfo;
    shippingLocationName?: string;
    shippingVerified?: boolean;
    destinationType?: 'warehouse' | 'shop' | 'job_site' | 'custom';
    jobId?: string;
    jobTitle?: string;
    
    // Filled-in vendor required fields
    orderFieldValues?: Record<string, any>;

    sentAt: Timestamp | null;
    receivedAt?: Timestamp | null;
    receivedBy?: string;
    createdAt: Timestamp;
    createdBy: string;
    masterOrderId?: string; // Links this sub-order to a MasterPurchaseOrder
}

export interface POItem {
    materialId: string;
    name: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    receivedQty?: number;    // How many received so far
    binLocation?: string;    // Where received items were binned
}

export interface ReceivingRecord {
    id?: string;
    org_id: string;
    purchaseOrderId?: string;
    vendorId?: string;
    vendorName?: string;
    receivedBy: string;
    receivedByName: string;
    receivedAt: Timestamp;
    items: ReceivingLineItem[];
    notes?: string;
    status: 'complete' | 'partial';
}

export interface ReceivingLineItem {
    materialId?: string;
    toolId?: string;
    name: string;
    sku?: string;
    upc?: string;
    quantityExpected: number;
    quantityReceived: number;
    discrepancy: boolean;
    discrepancyNotes?: string;
    binLocation?: string;
    condition?: 'good' | 'damaged' | 'wrong_item';
    photoUrl?: string;
}

// ─── Sourcing Strategy ───────────────────────────────────────────────────────
export type SourcingStrategy = 'optimal' | 'lowest_cost' | 'total_visit_cost' | 'local_availability' | 'urgent_local_availability' | 'fastest_shipping' | 'highest_quality' | 'preferred_vendor' | 'item_default';

// ─── Master Purchase Order (groups vendor sub-orders) ────────────────────────
export interface MasterPurchaseOrder {
    id?: string;
    organizationId: string;
    status: 'draft' | 'review' | 'approved' | 'partially_sent' | 'sent' | 'completed';
    sourcingStrategy: SourcingStrategy;
    items: MasterPOItem[];          // All items across all vendors
    subOrderIds: string[];          // Linked PurchaseOrder IDs (one per vendor)
    subtotal: number;
    total: number;
    notes?: string;
    createdAt: Timestamp;
    createdBy: string;
    approvedAt?: Timestamp | null;
    approvedBy?: string;
}

export interface MasterPOItem {
    materialId: string;
    name: string;
    sku: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    vendorId: string;               // Which vendor this item is routed to
    vendorName: string;
    vendorProductUrl?: string;      // Link for user to verify item
    routingMethod: string;          // "Lowest Cost", "Fastest Shipping", etc.
    estimatedDeliveryDays?: number;
    alternativeVendors?: Array<{    // Other vendor options for this item
        vendorId: string;
        vendorName: string;
        unitCost: number;
        estimatedDeliveryDays?: number;
        vendorProductUrl?: string;
    }>;
    reviewStatus?: 'pending' | 'approved' | 'changed';
    customerNotes?: string;
}
