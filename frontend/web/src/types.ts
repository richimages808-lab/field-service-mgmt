// Organization settings for multi-tenant SaaS
export interface Organization {
    id: string;
    name: string;
    slug: string; // URL-friendly identifier (e.g., "acme-hvac")

    // Inbound Email Configuration
    inboundEmail: {
        // Email prefix for @service.dispatch-box.com (e.g., "acme" → acme@service.dispatch-box.com)
        prefix?: string;
        // Custom domains that route to this org (e.g., ["support@acme-hvac.com"])
        customDomains?: string[];
        // Auto-reply settings
        autoReplyEnabled: boolean;
        autoReplyTemplate?: string;
    };

    // Outbound Email Configuration
    outboundEmail: {
        fromName: string; // e.g., "ACME HVAC Support"
        fromEmail: string; // e.g., "support@acme-hvac.com" or uses dispatch-box.com
        replyTo?: string;
    };

    // Branding
    branding?: {
        logoUrl?: string;
        primaryColor?: string;
        companyName?: string;
    };

    // Billing
    plan?: 'trial' | 'individual' | 'small_business' | 'enterprise';
    trialEndsAt?: any;
    maxTechs?: number;
    createdAt?: any;
    updatedAt?: any;

    // Settings
    settings?: {
        defaultTaxRate?: number;
    };
}

export interface SchedulingPreferences {
    // Work Schedule
    workStartTime: string; // "08:00"
    workEndTime: string; // "17:00"
    maxDailyHours: number; // 8
    maxDailyDriveTime: number; // 180 minutes
    workDays: number[]; // 0=Sunday, 1=Monday, etc. Default: [1,2,3,4,5] (Mon-Fri)

    // Breaks
    lunchBreak: {
        enabled: boolean;
        startTime: string; // "12:00"
        duration: number; // 30 minutes
        flexible: boolean; // Allow AI to adjust lunch time
    };
    morningBreak: {
        enabled: boolean;
        preferredTime: string; // "10:00"
        duration: number; // 15 minutes
    };
    afternoonBreak: {
        enabled: boolean;
        preferredTime: string; // "15:00"
        duration: number; // 15 minutes
    };

    // Parts Pickup Strategy
    partsPickup: {
        enabled: boolean;
        strategy: 'morning' | 'enroute' | 'asneeded' | 'endofday';
        preferredStore?: string;
        maxDetourMinutes: number; // 15 minutes max detour for en-route
    };

    // Route Optimization
    routePreferences: {
        minimizeDriving: boolean; // Prioritize reducing drive time
        clusterJobs: boolean; // Group nearby jobs together
        avoidRushHour: boolean; // Try to schedule around 7-9am and 4-6pm
        preferredStartLocation: 'home' | 'office' | 'custom';
        customStartLocation?: { lat: number; lng: number; address: string };
    };

    // Job Preferences
    jobPreferences: {
        bufferBetweenJobs: number; // 10 minutes default
        preferComplexJobsEarly: boolean; // Schedule complex jobs in morning
        maxJobsPerDay: number; // 6 default
        allowBackToBack: boolean; // Allow jobs with no buffer
    };

    // Customer Preferences
    customerPreferences: {
        respectTimeWindows: boolean; // Strictly respect customer availability
        callAheadBuffer: number; // 15 min buffer before arrival to call
        allowEarlyArrivals: boolean; // Can arrive before scheduled time
    };

    // Advanced
    advanced: {
        considerTraffic: boolean; // Use rush hour multiplier
        weatherAware: boolean; // Future: Consider weather
        priorityWeighting: number; // 0-100, how much to weight priority vs efficiency
    };
}

// =============================================================================
// TECHNICIAN PROFILE - Extended data for comprehensive tech management
// =============================================================================

export interface Certification {
    id: string;
    name: string;
    issuer: string;
    dateObtained: any; // Timestamp
    expiryDate?: any; // Timestamp
    certificateNumber?: string;
    documentUrl?: string; // Firebase Storage URL
    verified: boolean;
}

export interface ToolItem {
    id: string;
    name: string;
    category: 'hand_tool' | 'power_tool' | 'diagnostic' | 'safety' | 'specialized' | 'other';
    imageUrl?: string; // Firebase Storage URL
    condition: 'excellent' | 'good' | 'fair' | 'needs_replacement';
    notes?: string;
    purchaseDate?: any; // Timestamp
    lastServicedDate?: any; // Timestamp

    // AI Identification Metadata
    aiMetadata?: {
        identifiedFromPhoto: boolean;
        photoUrl?: string; // Firebase Storage URL
        confidence?: number; // 0-100
        originalAIName?: string; // What AI first suggested
        manuallyEdited?: boolean;
        identifiedAt?: any; // Timestamp
    };
}

// AI Identification Result Types
export interface AIIdentifiedMaterial {
    id: string; // Temporary ID
    name: string;
    quantity: number;
    unit: string;
    category: 'parts' | 'consumables' | 'materials' | 'equipment' | 'other';
    confidence: number; // 0-100
    photoUrl: string;
    suggestedSKU?: string;
    suggestedUnitCost?: number;
    suggestedUnitPrice?: number;
    notes?: string;
}

export interface AIIdentifiedTool {
    id: string; // Temporary ID
    name: string;
    category: 'hand_tool' | 'power_tool' | 'diagnostic' | 'safety' | 'specialized' | 'other';
    condition: 'excellent' | 'good' | 'fair' | 'needs_replacement';
    confidence: number; // 0-100
    photoUrl: string;
    notes?: string;
}

export interface ServiceArea {
    id: string;
    zipCode: string;
    city: string;
    state: string;
    maxDistanceMiles?: number;
    priority: 'primary' | 'secondary' | 'emergency_only';
}

export interface TechnicianPaymentInfo {
    paymentMethod: 'direct_deposit' | 'check' | 'paypal' | 'venmo' | 'zelle';
    // Bank info (masked for display, secure storage)
    bankName?: string;
    accountLast4?: string;
    routingLast4?: string;
    // Digital payments
    paypalEmail?: string;
    venmoHandle?: string;
    zellePhone?: string;
    // Tax & rates
    w9OnFile: boolean;
    w9UploadedAt?: any; // Timestamp
    hourlyRate?: number;
    overtimeRate?: number;
    calloutFee?: number;
    preferredPaySchedule: 'weekly' | 'biweekly' | 'monthly';
}

export interface TechCommunicationPrefs {
    preferredMethod: 'sms' | 'email' | 'push' | 'call';
    // Notification toggles
    jobAssignments: boolean;
    scheduleChanges: boolean;
    customerMessages: boolean;
    emergencyAlerts: boolean;
    dailySummary: boolean;
    weeklyReport: boolean;
    // Quiet hours
    quietHoursEnabled: boolean;
    quietHoursStart?: string; // "22:00"
    quietHoursEnd?: string; // "07:00"
}

export interface DayAvailability {
    available: boolean;
    startTime?: string; // "08:00"
    endTime?: string; // "17:00"
    note?: string; // e.g., "Dental appointment 2-3pm"
}

export interface WeeklyAvailability {
    sunday: DayAvailability;
    monday: DayAvailability;
    tuesday: DayAvailability;
    wednesday: DayAvailability;
    thursday: DayAvailability;
    friday: DayAvailability;
    saturday: DayAvailability;
    effectiveFrom?: any; // Timestamp - for recurring overrides
    effectiveUntil?: any; // Timestamp
}

export interface UserProfile {
    id: string;
    email: string;
    role: 'admin' | 'dispatcher' | 'technician';
    techType?: 'corporate' | 'solopreneur';
    name: string;
    org_id: string;
    preferences?: {
        working_hours?: { start: string; end: string };
        preferred_days?: number[];
    };
    schedulingPreferences?: SchedulingPreferences;
    specialties?: string[];
    tools?: string[]; // Legacy text-based tools list
    phone?: string;
    address?: string;
    homeLocation?: {
        address: string;
        lat?: number;
        lng?: number;
    };
    status?: 'active' | 'pending_verification' | 'new' | 'inactive';
    emailVerified?: boolean;

    // Extended Profile Fields
    profilePhoto?: string; // Firebase Storage URL
    bio?: string; // Short professional bio
    yearsExperience?: number;

    // Certifications & Compliance
    certifications?: Certification[];
    licenseNumber?: string;
    licenseState?: string;
    licenseExpiry?: any; // Timestamp
    insuranceProvider?: string;
    insuranceExpiry?: any; // Timestamp
    backgroundCheckStatus?: 'not_submitted' | 'pending' | 'verified' | 'expired' | 'failed';
    backgroundCheckDate?: any; // Timestamp

    // Tools & Equipment (with images)
    toolInventory?: ToolItem[];

    // Service Coverage
    serviceAreas?: ServiceArea[];
    maxTravelDistance?: number; // miles

    // Payment Information
    paymentInfo?: TechnicianPaymentInfo;

    // Communication Preferences
    communicationPrefs?: TechCommunicationPrefs;

    // Availability
    weeklyAvailability?: WeeklyAvailability;
    vacationDates?: Array<{ start: any; end: any; note?: string }>;

    // Emergency Contact
    emergencyContact?: {
        name: string;
        phone: string;
        relationship: string;
    };

    // Vehicle Information
    vehicleInfo?: {
        make: string;
        model: string;
        year: string;
        color?: string;
        licensePlate: string;
        insuranceExpiry?: any;
    };

    // Metadata
    createdAt?: any;
    updatedAt?: any;
    lastActiveAt?: any;
}

// AI-powered job recommendations for intake review
export interface AIJobRecommendation {
    priority: 'low' | 'medium' | 'high' | 'critical';
    priorityReason: string;
    estimatedDuration: number; // minutes
    complexity: 'simple' | 'medium' | 'complex';
    requiredTools: Array<{
        name: string;
        owned: boolean; // Does tech report having this tool?
        essential: boolean; // Is it required or optional?
    }>;
    recommendedMaterials: Array<{
        name: string;
        quantity?: string;
        estimatedCost?: number;
    }>;
    skillsRequired: string[];
    fixInstructions?: {
        videoUrl?: string;
        stepByStepUrl?: string;
        summary: string;
    };
    safetyConsiderations?: string[];
    generatedAt: any;
}

// Job intake review status and workflow
export interface JobIntakeReview {
    status: 'new' | 'in_review' | 'needs_info' | 'approved' | 'rejected';
    reviewedBy?: string; // Tech user ID who reviewed
    reviewedAt?: any;
    techNotes?: string; // Internal notes added by tech during review
    questionsForCustomer?: Array<{
        question: string;
        askedAt: any;
        askedBy: string;
        answer?: string;
        answeredAt?: any;
    }>;
    aiRecommendation?: AIJobRecommendation;
    overrides?: {
        priority?: 'low' | 'medium' | 'high' | 'critical';
        estimatedDuration?: number;
        additionalTools?: string[];
        additionalMaterials?: string[];
    };
    approvalNotes?: string; // Why approved/rejected
}

export interface Job {
    id: string;
    org_id: string;
    customer_id?: string; // Reference to customers collection (new)
    site_name?: string;
    status: 'pending' | 'unscheduled' | 'quote_pending' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
    priority: 'low' | 'medium' | 'high' | 'critical';
    customer: {
        name: string;
        address: string;
        phone: string;
        email: string;
    };
    request: {
        description: string;
        photos: string[];
        videos?: string[]; // Customer-uploaded videos
        availability: string[]; // Legacy text availability
        availabilityWindows?: Array<{
            day: string; // 'monday', 'tuesday', etc. or specific date 'YYYY-MM-DD'
            startTime: string; // '09:00'
            endTime: string; // '17:00'
            preferredTime?: string; // 'morning', 'afternoon', 'evening'
        }>;
        type?: string;
        source?: 'web' | 'email' | 'phone' | 'sms' | 'manual'; // How was this job created?
        communicationPreference?: 'phone' | 'text' | 'email'; // How customer wants to be contacted
    };
    intakeReview?: JobIntakeReview; // New intake review workflow
    assigned_tech_id?: string;
    assigned_tech_name?: string;
    assigned_tech_email?: string;
    scheduled_at?: any;
    finished_at?: any;
    createdAt?: any;
    estimated_duration?: number;
    parts_needed?: boolean;
    parts_description?: string;
    complexity?: 'simple' | 'medium' | 'complex';
    difficulty?: string;
    location?: {
        lat: number;
        lng: number;
    };
    notes?: {
        public?: string;
        internal?: string;
    };
    estimates?: {
        duration_minutes: number;
        materials_cost: number;
        discount_amount: number;
        total: number;
        createdAt: any;
    };
    type?: string;
    // New fields for enhanced features
    category?: 'repair' | 'maintenance' | 'installation' | 'inspection' | 'consultation' | 'emergency' | 'warranty' | 'other';
    recurring_schedule_id?: string; // If generated from recurring schedule
    checklist_id?: string;
    checklist_completed?: boolean;
    photos?: {
        before: string[];
        after: string[];
        during: string[];
    };
    signature?: {
        dataUrl: string;
        signerName: string;
        signedAt: any;
    };
    actual_duration?: number; // Actual time spent (minutes)
    actual_start?: any;
    actual_end?: any;
    mileage?: number;
    costs?: {
        labor: number | { estimatedMinutes?: number; actualMinutes: number; hourlyRate: number; total: number };
        parts: number | { estimated: number; actual: number; items: any[] };
        mileage: number | { miles: number; ratePerMile: number; total: number };
        other: number | { description: string; amount: number }[];
        total: number;
    };
    customer_rating?: number; // 1-5
    customer_feedback?: string;

    // Quote and Payment Accountability
    active_quote_id?: string; // Current valid quote for this job
    invoice_id?: string; // Linked invoice
    deposit_required?: boolean;
    deposit_amount?: number;
    deposit_paid?: boolean;
    deposit_paid_at?: any;
}

export interface CustomerBillingSettings {
    payment_terms: 'net30' | 'net60' | 'net90' | 'due_on_receipt';
    discount_percent: number;
    preferred_invoice_method: 'email' | 'mail';
}

// Financial & Accounting
export interface Payment {
    id: string;
    invoice_id: string;
    amount: number;
    method: 'check' | 'cash' | 'card' | 'transfer' | 'other';
    reference_number?: string; // Check # or Stripe ID
    date: any; // Timestamp
    notes?: string;
    recorded_by: string; // User ID
}

export interface ProductService {
    id: string;
    name: string;
    description?: string;
    unit_price: number;
    tax_rate?: number; // percentage, e.g., 0.08
    gl_code?: string; // General Ledger code for accounting
    type: 'service' | 'material';
    org_id: string;
}

export interface Invoice {
    id: string;
    org_id: string;
    customer_id?: string;
    customer: {
        name: string;
        address: string;
        email?: string;
    };
    items: {
        description: string;
        amount?: number;
        quantity?: number;
        unit_price?: number;
        total?: number;
        service_id?: string; // Link to ProductService
    }[];
    total: number;
    subtotal?: number;
    tax_amount?: number;
    payments_applied?: number;
    balance_due?: number;
    status: 'draft' | 'sent' | 'paid' | 'overdue' | 'void' | 'partial';
    is_locked?: boolean; // True if sent/finalized
    createdAt: any;
    dueDate?: any;
    amount?: number; // legacy?
    customer_name?: string; // legacy?
    job_id?: string;
    quote_id?: string;
    deposit_applied?: number;
}

export interface SchedulingSettings {
    agingThresholds: {
        medium: number;
        high: number;
        critical: number;
    };
    lunch: {
        startHour: number;
        durationMinutes: number;
    };
    partsPickupMinutes: number;
}

export const DEFAULT_SETTINGS: SchedulingSettings = {
    agingThresholds: {
        medium: 3,
        high: 7,
        critical: 14
    },
    lunch: {
        startHour: 12,
        durationMinutes: 60
    },
    partsPickupMinutes: 30
};

// Job Type/Category
export type JobCategory =
    | 'repair'
    | 'maintenance'
    | 'installation'
    | 'inspection'
    | 'consultation'
    | 'emergency'
    | 'warranty'
    | 'other';

export const JOB_CATEGORIES: { value: JobCategory; label: string; icon?: string }[] = [
    { value: 'repair', label: 'Repair' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'installation', label: 'Installation' },
    { value: 'inspection', label: 'Inspection' },
    { value: 'consultation', label: 'Consultation' },
    { value: 'emergency', label: 'Emergency' },
    { value: 'warranty', label: 'Warranty Work' },
    { value: 'other', label: 'Other' }
];

// Recurring Job Configuration
export interface RecurringSchedule {
    id: string;
    org_id: string;
    customer_id?: string;
    frequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
    dayOfWeek?: number; // 0-6 for weekly
    dayOfMonth?: number; // 1-31 for monthly
    preferredTime?: string; // '09:00'
    jobTemplate: Partial<Job>;
    startDate: any;
    endDate?: any;
    lastGenerated?: any;
    nextDue?: any;
    isActive: boolean;
    createdAt: any;
    createdBy: string;
}

// Customer Notes (persistent across jobs)
export interface CustomerNote {
    id: string;
    customer_id: string;
    org_id: string;
    note: string;
    category: 'general' | 'access' | 'billing' | 'preferences' | 'warning';
    isPinned: boolean;
    createdAt: any;
    createdBy: string;
    updatedAt?: any;
}

// Service Area/Zone
export interface ServiceZone {
    id: string;
    org_id: string;
    name: string;
    color: string;
    zipCodes?: string[];
    radius?: {
        centerLat: number;
        centerLng: number;
        miles: number;
    };
    travelTimeBuffer: number; // minutes to add between jobs in this zone
    isActive: boolean;
    createdAt: any;
}

// Quote Template
export interface QuoteTemplate {
    id: string;
    org_id: string;
    name: string;
    jobCategory: JobCategory;
    description: string;
    lineItems: {
        description: string;
        unitPrice: number;
        quantity: number;
        isOptional: boolean;
    }[];
    estimatedDuration: number;
    requiredTools: string[];
    requiredMaterials: string[];
    notes?: string;
    isActive: boolean;
    createdAt: any;
    updatedAt?: any;
}

// Parts Inventory
export interface InventoryItem {
    id: string;
    org_id: string;
    tech_id?: string; // if null, it's warehouse inventory
    name: string;
    sku?: string;
    description?: string;
    category: string;
    quantity: number;
    minQuantity: number; // alert when below this
    unitCost: number;
    unitPrice: number; // what to charge customer
    location?: string; // 'truck', 'warehouse', 'bin-A1'
    lastRestocked?: any;
    createdAt: any;
    updatedAt?: any;
}

export interface InventoryTransaction {
    id: string;
    org_id: string;
    item_id: string;
    type: 'restock' | 'job_usage' | 'correction' | 'return' | 'initial';
    quantity_change: number; // +10 or -5
    quantity_after: number; // Snapshot of balance
    reference_id?: string; // Job ID or PO Number
    notes?: string;
    performed_by: string; // User ID
    createdAt: any;
}

export interface InventoryUsage {
    id: string;
    org_id: string;
    job_id: string;
    item_id: string;
    quantity: number;
    unitPrice: number;
    total: number;
    usedAt: any;
    usedBy: string;
}

// Mileage Tracking
export interface MileageEntry {
    id: string;
    org_id: string;
    tech_id: string;
    job_id?: string;
    date: any;
    startLocation: string;
    endLocation: string;
    distance: number; // miles
    purpose: 'job' | 'parts_run' | 'personal' | 'other';
    isDeductible: boolean;
    notes?: string;
    createdAt: any;
}

// Job Checklist
export interface ChecklistTemplate {
    id: string;
    org_id: string;
    name: string;
    jobCategory?: JobCategory;
    items: {
        id: string;
        text: string;
        isRequired: boolean;
        order: number;
    }[];
    isActive: boolean;
    createdAt: any;
}

export interface JobChecklist {
    id: string;
    job_id: string;
    template_id?: string;
    items: {
        id: string;
        text: string;
        isRequired: boolean;
        isCompleted: boolean;
        completedAt?: any;
        completedBy?: string;
        notes?: string;
        photoUrl?: string;
    }[];
    completedAt?: any;
}

// Job Photos (Before/After)
export interface JobPhoto {
    id: string;
    job_id: string;
    org_id: string;
    type: 'before' | 'after' | 'during' | 'issue' | 'parts';
    url: string;
    thumbnailUrl?: string;
    caption?: string;
    takenAt: any;
    takenBy: string;
    location?: {
        lat: number;
        lng: number;
    };
}

// Customer Signature
export interface JobSignature {
    id: string;
    job_id: string;
    org_id: string;
    signatureDataUrl: string; // base64 PNG
    signerName: string;
    signerRole: 'customer' | 'property_manager' | 'tenant' | 'other';
    signedAt: any;
    ipAddress?: string;
    deviceInfo?: string;
}

// Appointment Reminder
export interface AppointmentReminder {
    id: string;
    job_id: string;
    org_id: string;
    type: 'sms' | 'email';
    scheduledFor: any;
    sentAt?: any;
    status: 'pending' | 'sent' | 'failed' | 'cancelled';
    recipientPhone?: string;
    recipientEmail?: string;
    message: string;
    errorMessage?: string;
}

// Job Cost Tracking
export interface JobCost {
    job_id: string;
    org_id: string;
    labor: {
        estimatedMinutes: number;
        actualMinutes: number;
        hourlyRate: number;
        total: number;
    };
    parts: {
        estimated: number;
        actual: number;
        items: {
            name: string;
            quantity: number;
            unitCost: number;
            total: number;
        }[];
    };
    mileage: {
        miles: number;
        ratePerMile: number;
        total: number;
    };
    other: {
        description: string;
        amount: number;
    }[];
    totalEstimated: number;
    totalActual: number;
    profit: number;
    profitMargin: number;
}

// Dashboard Analytics
export interface AnalyticsPeriod {
    startDate: any;
    endDate: any;
    jobsCompleted: number;
    jobsCancelled: number;
    totalRevenue: number;
    totalCosts: number;
    profit: number;
    avgJobDuration: number;
    avgJobValue: number;
    jobsByCategory: Record<JobCategory, number>;
    jobsByStatus: Record<string, number>;
    topCustomers: {
        customerId: string;
        customerName: string;
        jobCount: number;
        revenue: number;
    }[];
    techPerformance?: {
        techId: string;
        techName: string;
        jobsCompleted: number;
        avgRating?: number;
        revenue: number;
    }[];
}

// =============================================================================
// CUSTOMER MANAGEMENT - Proper customer entity with GDPR support
// =============================================================================

export interface CustomerAddress {
    id: string;
    type: 'primary' | 'billing' | 'service';
    label?: string; // "Main Office", "Warehouse", etc.
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string; // ISO 3166-1 alpha-2 (e.g., "US", "DE", "FR")
    location?: {
        lat: number;
        lng: number;
    };
    accessNotes?: string; // Gate code, parking, etc.
    isDefault: boolean;
}

export interface CustomerPreferences {
    contactMethod: 'phone' | 'email' | 'sms';
    language: 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt'; // Support EU languages
    timezone?: string; // IANA timezone (e.g., "Europe/Berlin")
    preferredTechId?: string;
    doNotContact: boolean; // GDPR: Marketing opt-out
    reminderPreferences?: {
        enabled: boolean;
        advanceHours: number; // How many hours before appointment
        method: 'email' | 'sms' | 'both';
    };
}

export interface CustomerBilling {
    terms: 'due_on_receipt' | 'net15' | 'net30' | 'net60' | 'net90';
    discountPercent: number;
    invoiceMethod: 'email' | 'mail' | 'both';
    taxExempt: boolean;
    taxId?: string; // VAT number for EU
    paymentMethods?: {
        type: 'card' | 'ach' | 'check';
        isDefault: boolean;
        lastFour?: string;
        expiryMonth?: number;
        expiryYear?: number;
    }[];
    billingEmail?: string; // If different from main contact
    billingAddress?: CustomerAddress;
}

export interface GDPRConsent {
    consentGiven: boolean;
    consentDate?: any; // Timestamp
    consentVersion: string; // Version of terms/privacy policy
    marketingOptIn: boolean;
    dataProcessingAgreed: boolean;
    privacyPolicyAccepted?: any; // Timestamp
    termsAccepted?: any; // Timestamp
    ipAddress?: string; // For audit
    userAgent?: string; // For audit
}

export interface Customer {
    id: string;
    org_id: string;

    // Identity
    name: string;
    companyName?: string; // For B2B customers
    email?: string;
    phone?: string;
    alternatePhone?: string;

    // Portal Access (Customer self-service)
    portalAccess?: {
        enabled: boolean;
        userId?: string; // Firebase Auth UID for customer login
        lastLogin?: any; // Timestamp
        invitedAt?: any; // Timestamp
        invitedBy?: string; // User ID who sent invite
    };

    // Addresses
    addresses: CustomerAddress[];
    primaryAddressId?: string;

    // Preferences
    preferences: CustomerPreferences;

    // Billing
    billing: CustomerBilling;

    // Tags & Categorization
    tags: string[]; // "VIP", "commercial", "residential", etc.
    source?: 'website' | 'referral' | 'advertising' | 'phone' | 'email' | 'other';
    referredBy?: string; // Customer ID if referral

    // GDPR Consent Tracking
    gdpr: GDPRConsent;

    // Statistics (denormalized for performance)
    stats: {
        totalJobs: number;
        completedJobs: number;
        cancelledJobs: number;
        totalSpent: number;
        outstandingBalance: number;
        lastJobDate?: any; // Timestamp
        firstJobDate?: any; // Timestamp
        avgRating?: number;
        lifetimeValue: number;
    };

    // Lifecycle
    status: 'active' | 'inactive' | 'archived' | 'pending_deletion';

    // GDPR: Deletion tracking
    deletionRequest?: {
        requestedAt: any; // Timestamp
        requestedBy: string; // User ID or 'customer'
        scheduledDeletionDate: any; // Timestamp (30 days grace)
        reason?: string;
    };

    // Metadata
    createdAt: any; // Timestamp
    updatedAt: any; // Timestamp
    createdBy: string;
    lastModifiedBy?: string;

    // Notes (internal, not shown to customer)
    internalNotes?: string;
}

// =============================================================================
// COMMUNICATIONS - All customer interactions (email, SMS, voicemail, etc.)
// =============================================================================

export type CommunicationType = 'email' | 'sms' | 'voicemail' | 'call' | 'note' | 'system';
export type CommunicationDirection = 'inbound' | 'outbound' | 'internal';
export type CommunicationStatus = 'pending' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'bounced';

export interface Communication {
    id: string;
    org_id: string;
    customer_id: string;
    job_id?: string; // Optional link to specific job
    invoice_id?: string; // Optional link to specific invoice
    quote_id?: string; // Optional link to specific quote

    // Threading
    thread_id?: string; // Group related messages
    parent_id?: string; // For replies
    subject?: string;

    // Type & Direction
    type: CommunicationType;
    direction: CommunicationDirection;
    status: CommunicationStatus;

    // Content
    content: string; // Plain text
    contentHtml?: string; // Rich HTML for emails

    // Participants
    from: string; // Email/phone/user name
    to: string | string[];
    cc?: string[];
    bcc?: string[];

    // Attachments (references to attachments collection)
    attachmentIds?: string[];
    attachmentCount?: number;

    // Voicemail specific
    voicemail?: {
        duration: number; // seconds
        audioPath: string; // Firebase Storage path
        transcription?: string;
        transcriptionConfidence?: number;
        transcriptionStatus: 'pending' | 'processing' | 'completed' | 'failed';
    };

    // Call specific
    call?: {
        duration: number; // seconds
        outcome: 'answered' | 'voicemail' | 'no_answer' | 'busy' | 'failed';
        recordingPath?: string;
    };

    // Automation
    isAutomated: boolean;
    templateId?: string;
    triggerEvent?: 'job_scheduled' | 'job_reminder' | 'job_started' | 'job_completed' |
    'invoice_sent' | 'invoice_reminder' | 'payment_received' | 'feedback_request';

    // Tracking
    sentAt?: any; // Timestamp
    deliveredAt?: any; // Timestamp
    readAt?: any; // Timestamp
    openCount?: number;
    clickCount?: number;
    failureReason?: string;

    // Archival
    isArchived: boolean;
    archivedAt?: any; // Timestamp
    archivePath?: string; // GCS path for archived content

    // GDPR
    containsPII: boolean; // For data export identification

    // Metadata
    createdAt: any; // Timestamp
    createdBy?: string; // User ID (null for automated/inbound)
}

// =============================================================================
// ATTACHMENTS - Files linked to customers, jobs, communications
// =============================================================================

export type AttachmentCategory = 'photo' | 'document' | 'invoice' | 'signature' | 'audio' | 'video' | 'other';

export interface Attachment {
    id: string;
    org_id: string;

    // Parent references (at least one should be set)
    customer_id?: string;
    job_id?: string;
    invoice_id?: string;
    communication_id?: string;

    // File info
    name: string; // Display name
    originalName: string; // Original upload filename
    mimeType: string;
    size: number; // bytes
    extension: string; // File extension

    // Storage
    storagePath: string; // Firebase Storage path
    downloadUrl?: string; // Cached signed URL (expires)
    urlExpiresAt?: any; // Timestamp
    thumbnailPath?: string;
    thumbnailUrl?: string;

    // Categorization
    category: AttachmentCategory;
    tags?: string[];

    // Photo-specific metadata
    photoMeta?: {
        type: 'before' | 'after' | 'during' | 'issue' | 'parts' | 'general';
        location?: { lat: number; lng: number };
        capturedAt?: any; // Timestamp from EXIF
        deviceInfo?: string;
        width?: number;
        height?: number;
    };

    // Document-specific
    documentMeta?: {
        pageCount?: number;
        isSignable?: boolean;
        signedAt?: any;
        signedBy?: string;
    };

    // Archival
    isArchived: boolean;
    archivedAt?: any; // Timestamp
    archivePath?: string; // GCS archive bucket path

    // GDPR
    containsPII: boolean;

    // Metadata
    createdAt: any; // Timestamp
    createdBy: string;
    lastAccessedAt?: any; // Timestamp
}

// =============================================================================
// GDPR & COMPLIANCE - Consent records and audit logs
// =============================================================================

export interface ConsentRecord {
    id: string;
    org_id: string;
    customer_id: string;

    // Consent type
    type: 'terms_of_service' | 'privacy_policy' | 'marketing' | 'data_processing' | 'cookies';
    version: string; // Version of document they agreed to

    // Status
    given: boolean;
    givenAt?: any; // Timestamp
    withdrawnAt?: any; // Timestamp

    // Audit trail
    ipAddress?: string;
    userAgent?: string;
    method: 'web_form' | 'email_link' | 'portal' | 'verbal' | 'paper';

    // Reference
    documentUrl: string; // Link to version of terms they accepted
}

export type AuditAction =
    | 'create'
    | 'read'
    | 'update'
    | 'delete'
    | 'export'
    | 'login'
    | 'logout'
    | 'invite'
    | 'archive'
    | 'restore'
    | 'consent_given'
    | 'consent_withdrawn'
    | 'deletion_requested'
    | 'deletion_cancelled'
    | 'deletion_executed';

export interface AuditLog {
    id: string;
    org_id: string;

    // Who
    userId: string;
    userEmail: string;
    userRole: string;
    userType: 'staff' | 'customer' | 'system';

    // What
    action: AuditAction;
    resource: string; // Collection name (e.g., 'customers', 'jobs')
    resourceId: string;
    resourceName?: string; // Human-readable (e.g., customer name)

    // Details
    description?: string;
    changes?: {
        field: string;
        oldValue?: any;
        newValue?: any;
    }[];
    metadata?: Record<string, any>;

    // When/Where
    timestamp: any; // Timestamp
    ipAddress?: string;
    userAgent?: string;
    location?: {
        country?: string;
        region?: string;
        city?: string;
    };

    // GDPR specific
    isGDPRRelated: boolean;
    gdprRightExercised?: 'access' | 'rectification' | 'erasure' | 'restriction' | 'portability' | 'objection';
}

// =============================================================================
// DATA EXPORT - GDPR Right to Access / Portability
// =============================================================================

export interface DataExportRequest {
    id: string;
    org_id: string;
    customer_id: string;

    // Request details
    requestedAt: any; // Timestamp
    requestedBy: string; // 'customer' or staff user ID
    requestMethod: 'portal' | 'email' | 'phone' | 'letter';

    // Status
    status: 'pending' | 'processing' | 'ready' | 'downloaded' | 'expired' | 'failed';

    // Processing
    startedAt?: any; // Timestamp
    completedAt?: any; // Timestamp
    failureReason?: string;

    // Export file
    format: 'json' | 'pdf' | 'both';
    downloadUrl?: string;
    downloadUrlExpiresAt?: any; // Timestamp (48 hours)
    downloadedAt?: any; // Timestamp

    // What was included
    includedData: {
        profile: boolean;
        addresses: boolean;
        jobs: boolean;
        invoices: boolean;
        communications: boolean;
        attachments: boolean;
        consents: boolean;
    };

    // Statistics
    recordCounts?: {
        jobs: number;
        invoices: number;
        communications: number;
        attachments: number;
    };
}

// =============================================================================
// ARCHIVAL - For 2-year-old data moved to cold storage
// =============================================================================

export interface ArchivedRecord {
    id: string;
    org_id: string;
    customer_id?: string;

    // Original document info
    collection: string; // 'jobs', 'communications', etc.
    originalId: string;

    // Summary (kept for reporting even after archive)
    summary: Record<string, any>;

    // Archive info
    archivedAt: any; // Timestamp
    archivePath: string; // GCS path (e.g., gs://bucket/archives/org123/jobs/2024/job456.json.gz)
    archiveSize: number; // bytes (compressed)

    // Restoration
    isRestorable: boolean;
    lastRestoredAt?: any; // Timestamp
    restorationCount?: number;

    // Retention
    retentionPolicy: 'standard' | 'legal_hold' | 'permanent';
    expiresAt?: any; // Timestamp - when permanently deleted (null = never)
}

// =============================================================================
// MATERIALS INVENTORY - Robust parts and materials tracking
// =============================================================================

export interface MaterialItem {
    id: string;
    org_id: string;
    tech_id?: string; // null = warehouse, set = truck stock

    // Identity
    name: string;
    sku?: string;
    upc?: string;
    description?: string;
    category: 'parts' | 'consumables' | 'materials' | 'equipment' | 'other';
    subcategory?: string;

    // Inventory
    quantity: number;
    minQuantity: number; // Alert threshold
    maxQuantity?: number; // Reorder cap
    unit: 'each' | 'box' | 'case' | 'ft' | 'lb' | 'gal' | 'other';

    // Pricing
    unitCost: number; // What tech pays
    unitPrice: number; // What customer pays
    markupPercent?: number; // Auto-calculate price from cost
    taxable: boolean;

    // Location & Tracking
    location: 'truck' | 'warehouse' | 'supplier' | 'on_order';
    binLocation?: string; // e.g., "A-12", "Truck Bin 3"
    supplier?: string;
    supplierPartNumber?: string;

    // Lifecycle
    lastRestockedAt?: any;
    lastUsedAt?: any;
    averageMonthlyUsage?: number;
    createdAt: any;
    updatedAt?: any;

    // AI Identification Metadata
    aiMetadata?: {
        identifiedFromPhoto: boolean;
        photoUrl?: string; // Firebase Storage URL
        confidence?: number; // 0-100
        originalAIName?: string; // What AI first suggested
        manuallyEdited?: boolean;
        identifiedAt?: any; // Timestamp
    };
}

export interface MaterialUsage {
    id: string;
    org_id: string;
    job_id: string;
    quote_id?: string; // Link to approved quote
    material_id: string;

    // What was used
    materialName: string; // Denormalized for history
    quantity: number;
    unit: string;

    // Pricing at time of use
    unitCost: number;
    unitPrice: number;
    total: number;

    // Context
    usedAt: any;
    usedBy: string; // Tech user ID
    notes?: string;
    wasQuoted: boolean; // Was this in the original quote?
}

// =============================================================================
// QUOTE SYSTEM - Customer-approved estimates with overrun protection
// =============================================================================

export type QuoteStatus =
    | 'draft'           // Being created
    | 'sent'            // Sent to customer, awaiting response
    | 'viewed'          // Customer opened the quote
    | 'approved'        // Customer signed/approved
    | 'declined'        // Customer rejected
    | 'expired'         // Past validity period
    | 'superseded'      // Replaced by new quote
    | 'completed';      // Work done, invoice generated

export interface QuoteLineItem {
    id: string;
    type: 'labor' | 'material' | 'equipment' | 'travel' | 'fee' | 'discount';
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    total: number;
    taxable: boolean;
    materialId?: string; // Link to inventory
    isOptional: boolean;
    notes?: string;
}

export interface Quote {
    id: string;
    org_id: string;
    job_id: string;
    customer_id: string;
    tech_id: string;
    customer?: {
        name: string;
        email?: string;
        phone?: string;
        address?: string;
    };

    // Quote Details
    quoteNumber: string; // e.g., "Q-2026-0042"
    version: number; // For revisions

    // Scope of Work
    scopeOfWork: string; // Detailed description
    lineItems: QuoteLineItem[];

    // Pricing
    subtotal: number;
    taxRate: number;
    taxAmount: number;
    discount: number;
    discountReason?: string;
    total: number;

    // Overrun Protection
    overrunProtection: {
        enabled: boolean;
        maxOverrunPercent: number; // e.g., 15
        overrunApprovalRequired: boolean; // If > maxOverrunPercent
        customerAgreed: boolean;
        agreedAt?: any;
    };

    // Time Estimate
    estimatedDuration: number; // minutes
    estimatedStartDate?: any;
    validUntil: any; // Quote expiry

    // Agreement
    agreement: {
        termsVersion: string;
        jurisdictionState: string; // e.g., "HI", "CA"
        requiresDeposit: boolean;
        depositAmount?: number;
        depositPaid?: boolean;
        depositPaidAt?: any;
        signatureRequired: boolean;
        customerSignature?: {
            dataUrl: string;
            signedAt: any;
            signerName: string;
            ipAddress?: string;
        };
        agreementPdfUrl?: string; // Generated PDF
    };

    // Communication
    sentAt?: any;
    sentVia?: 'email' | 'sms' | 'link';
    viewedAt?: any;
    approvedAt?: any;
    declinedAt?: any;
    declineReason?: string;

    // Lifecycle
    status: QuoteStatus;
    createdAt: any;
    updatedAt: any;
    createdBy: string;
    expiresAt?: any;
}

export interface OverrunRequest {
    id: string;
    org_id: string;
    job_id: string;
    quote_id: string;

    // What changed
    reason: string;
    additionalItems: QuoteLineItem[];
    additionalTotal: number;
    newTotal: number;
    percentOverOriginal: number;

    // Communication
    requestedAt: any;
    requestedBy: string; // Tech ID
    sentToCustomer: boolean;
    sentVia?: 'sms' | 'email' | 'phone';

    // Customer Response
    customerResponse?: 'approved' | 'declined' | 'pending';
    respondedAt?: any;
    customerNotes?: string;

    // Approval
    approvalMethod?: 'digital_signature' | 'verbal' | 'text_confirmation';
    signature?: {
        dataUrl: string;
        signedAt: any;
        signerName: string;
    };
    verbalApprovalNotes?: string;
    confirmationScreenshot?: string;

    status: 'pending' | 'approved' | 'declined' | 'expired';
}

// Default overrun protection settings
export const DEFAULT_OVERRUN_PROTECTION = {
    enabled: true,
    maxOverrunPercent: 15,
    overrunApprovalRequired: true,
    customerAgreed: false
};
