import { Timestamp } from 'firebase/firestore';

export interface Vendor {
    id?: string;
    organizationId: string;
    name: string;
    accountNumber?: string;
    email: string;
    phone?: string;
    website?: string;
    address?: string;
    orderInstructions?: string;
    discountCodes?: string;
    active: boolean;
    shippingAddress?: string;
    billingAddress?: string;
    customerApiId?: string;
    vaultedPaymentId?: string;
    integrationType?: 'email_pdf' | 'dynamic_api';
    apiConfig?: {
        endpointUrl: string;
        method: 'POST' | 'PUT';
        headersTemplate: Record<string, string>;
        bodyTemplate: string;
    };
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
    sentAt: Timestamp | null;
    receivedAt?: Timestamp | null;
    receivedBy?: string;
    createdAt: Timestamp;
    createdBy: string;
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
