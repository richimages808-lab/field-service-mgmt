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
}
