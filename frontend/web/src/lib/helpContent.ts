// Help Center content ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â edit this file to add/remove help articles as features change

export interface HelpStep {
    stepNumber: number;
    title: string;
    description: string;
    screenshotUrl?: string;  // path to annotated screenshot image
    tip?: string;            // optional pro-tip callout
}

export interface HelpArticle {
    id: string;
    title: string;
    category: string;
    content: string; // supports basic markdown-like formatting
    steps?: HelpStep[];      // structured step-by-step guide with screenshots
    lastUpdated: string;
    keywords: string[]; // for search
}

export interface HelpCategory {
    id: string;
    name: string;
    icon: string; // lucide icon name
    description: string;
}

export const HELP_CATEGORIES: HelpCategory[] = [
    { id: 'getting-started', name: 'Getting Started', icon: 'Rocket', description: 'First steps with DispatchBox' },
    { id: 'jobs', name: 'Jobs & Scheduling', icon: 'Calendar', description: 'Creating and managing service jobs' },
    { id: 'communications', name: 'Communications Hub', icon: 'MessageSquare', description: 'Unified inbox for all customer inquiries' },
    { id: 'invoicing', name: 'Invoicing & Quotes', icon: 'FileText', description: 'Billing your customers' },
    { id: 'inventory', name: 'Inventory', icon: 'Package', description: 'Materials and tools tracking' },
    { id: 'customers', name: 'Customers & Portal', icon: 'Users', description: 'Customer management and self-service portal' },
    { id: 'addons', name: 'Add-on Services', icon: 'Puzzle', description: 'Domain, Email, SMS, and AI Phone' },
    { id: 'reports', name: 'Reports & Analytics', icon: 'BarChart2', description: 'Business insights and data' },
    { id: 'account', name: 'Account & Billing', icon: 'CreditCard', description: 'Your plan, profile, and billing' },
];

export const HELP_ARTICLES: HelpArticle[] = [
    // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Getting Started ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
    {
        id: 'gs-first-login',
        title: 'Your First Login',
        category: 'getting-started',
        content: `After signing up, you'll land on your dashboard. Here's what to do first to get the most out of DispatchBox.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Land on Your Dashboard',
                description: 'After logging in, you\'ll see your Admin Dashboard Ã¢â‚¬â€ the command center for your business. It shows KPI cards at the top (revenue, open tickets, active technicians, pending inquiries), followed by your triage queue, quote pipeline, and job dispatch panels.',
                screenshotUrl: '/help-screenshots/getting-started/dashboard-overview.png',
                tip: 'Bookmark the dashboard page Ã¢â‚¬â€ it\'s your daily starting point for triaging work.'
            },
            {
                stepNumber: 2,
                title: 'Complete Your Profile',
                description: 'Click your avatar in the top-right corner of the screen and select "Your Profile." Add your photo, phone number, and job title. This information appears on quotes and invoices sent to customers.',
                screenshotUrl: '/help-screenshots/account/org-settings.png'
            },
            {
                stepNumber: 3,
                title: 'Set Up Your Organization',
                description: 'Go to Organization Settings (click avatar Ã¢â€ ’ Organization Settings) to add your company logo, set your primary brand color theme, configure your email prefix, and define your operating hours.',
                screenshotUrl: '/help-screenshots/account/org-settings.png',
                tip: 'Your brand color and logo will appear on all customer-facing documents Ã¢â‚¬â€ quotes, invoices, and the customer portal.'
            },
            {
                stepNumber: 4,
                title: 'Explore the Sidebar Navigation',
                description: 'The left sidebar is your main navigation. It\'s organized into logical sections: Work (Dashboard, Jobs, Calendar, Dispatch), Financial (Invoices, Quotes, Purchase Orders), Inventory (Materials, Tools), and People (Customers, Technicians). The prominent blue "+ New Job" button at the top lets you create jobs from anywhere.',
                screenshotUrl: '/help-screenshots/getting-started/sidebar-navigation.png'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['login', 'first', 'start', 'setup', 'begin', 'new', 'dashboard', 'profile']
    },
    {
        id: 'gs-onboarding-preferences-sync',
        title: 'Simplified Onboarding & Bidirectional Sync',
        category: 'getting-started',
        content: `When you sign up for DispatchBox, you are guided through a simplified onboarding setup designed to get you operating instantly.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Configure Your Shift Hours',
                description: 'During onboarding, set your standard daily work hours (e.g., 08:00 AM to 05:00 PM). This establishes timeline limits for your Dispatcher Console and Solopreneur calendars.',
                screenshotUrl: '/help-screenshots/account/org-settings.png',
                tip: 'These hours also control the grayed-out zones on the Dispatch Console timeline Ã¢â‚¬â€ non-working hours are automatically shaded.'
            },
            {
                stepNumber: 2,
                title: 'Set Your Home Base Address',
                description: 'Enter your shop, office, or home location. The AI route optimizer uses this as the starting anchor for all technician routes and proximity-based scoring in the Smart Tech Assignment modal.',
                screenshotUrl: '/help-screenshots/account/org-settings.png'
            },
            {
                stepNumber: 3,
                title: 'Configure Service Areas & Tax Rates',
                description: 'Define your service area ZIP codes and configure location-based tax rates for states/regions you service. Quotes and invoices will dynamically resolve the correct tax rate based on the job\'s service address.',
                screenshotUrl: '/help-screenshots/account/org-settings.png',
                tip: 'Tax rates are per-region, not a single company-wide default Ã¢â‚¬â€ so multi-state businesses get accurate tax calculations on every quote automatically.'
            },
            {
                stepNumber: 4,
                title: 'Bidirectional Syncing',
                description: 'Everything you configure during onboarding is saved to your core settings. Edit values later in Organization Settings (Financials), Scheduling Preferences (Route), or Service Zones Ã¢â‚¬â€ changes propagate back to your company profile in real-time, ensuring a single source of truth.',
                screenshotUrl: '/help-screenshots/account/org-settings.png'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['onboarding', 'signup', 'sync', 'tax', 'address', 'shift', 'operating hours', 'preferences', 'zip codes', 'skills']
    },
    {
        id: 'gs-create-first-job',
        title: 'Creating Your First Job',
        category: 'getting-started',
        content: `Creating a job is the core workflow in DispatchBox. Here's how to create your first service job from start to finish.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Click "+ New Job"',
                description: 'Click the prominent blue "+ New Job" button at the top of the sidebar. This button is always visible no matter where you are in the app.',
                screenshotUrl: '/help-screenshots/getting-started/sidebar-navigation.png',
                tip: 'The New Job button is intentionally placed at the top of the sidebar so you can create a job from any page without navigating away first.'
            },
            {
                stepNumber: 2,
                title: 'Fill In the Job Details',
                description: 'The job creation form opens with fields for: Job Title (e.g., "Water Heater Replacement"), Description (details for the technician), Customer (select existing or create new), Priority level (Low, Medium, High, Critical), and Estimated Duration.',
                screenshotUrl: '/help-screenshots/jobs/create-job-form.png'
            },
            {
                stepNumber: 3,
                title: 'Schedule and Assign',
                description: 'Set the scheduled date and time for the job. You can assign a technician now, or leave it unassigned to dispatch later from the Dispatcher Console. The smart tech assignment modal ranks technicians by skills, workload, and availability.',
                screenshotUrl: '/help-screenshots/jobs/create-job-form.png'
            },
            {
                stepNumber: 4,
                title: 'Confirm on Your Calendar',
                description: 'After creating the job, it immediately appears on your Calendar view and the assigned technician\'s schedule. Navigate to Calendar in the sidebar to see your jobs laid out visually across the timeline.',
                screenshotUrl: '/help-screenshots/jobs/calendar-view.png',
                tip: 'Jobs are color-coded by status: blue (scheduled), yellow (in progress), green (completed), red (cancelled).'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['job', 'create', 'new', 'service', 'work order', 'schedule', 'assign']
    },
    {
        id: 'gs-ai-job-estimate',
        title: 'AI Job Estimate with Cost Breakdown',
        category: 'getting-started',
        content: `When creating a new job, use the AI Estimate to get an instant diagnosis, parts list (including major fixtures), tools needed, labor costs, and drive time — all fully editable before submission. The estimate is saved to the job and visible when you open it from the calendar.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Enter a Job Description',
                description: 'On the New Job form, fill in the job type and a detailed description (at least 10 characters). The "Generate AI Estimate" button becomes active once the description is long enough.',
                tip: 'More detail in the description gives the AI higher confidence. Include symptoms, equipment brand/model, and location specifics when possible.'
            },
            {
                stepNumber: 2,
                title: 'Click "Generate AI Estimate"',
                description: 'Click the purple "Generate AI Estimate" button. The AI analyzes your description and returns a diagnosis, recommended solution, parts list (including major fixtures like toilets, faucets, etc.), tools the tech needs to bring, safety warnings, and a confidence score. Parts are priced from your company\'s vendor catalog when a match exists, otherwise realistic retail pricing is used.',
                tip: 'The AI cross-references your organization\'s materials inventory for real vendor pricing. If a part is in your catalog, its vendor cost is used automatically.'
            },
            {
                stepNumber: 3,
                title: 'Edit Parts & Materials',
                description: 'Each part is shown in an editable table with columns for Item name, Quantity, Base Cost, Markup %, and Customer Price. You can change any value inline — the customer price recalculates automatically when you adjust the base cost or markup. Click "+ Add Part" to add custom items, or the minus icon to remove a part.',
                tip: 'The default markup percentage comes from your organization\'s Rate Card settings. You can override it per-line for special pricing.'
            },
            {
                stepNumber: 4,
                title: 'Review Tools Needed',
                description: 'Below the drive time section, the AI lists the tools the technician should bring for this job (e.g., pipe wrench, basin wrench, drill). These are not charged to the customer — they\'re a checklist for the tech. The tools are saved to the job and visible when you open it from the calendar.',
                tip: 'Tools are also displayed in the Edit Job modal when you click on a scheduled job from the calendar.'
            },
            {
                stepNumber: 5,
                title: 'Adjust Labor & Drive Time',
                description: 'The Labor section shows hours × your hourly rate (both editable). The Drive Time / Service Call Fee section has a toggle to include a flat travel charge. If your org has a drive time fee configured in Settings → Financial → Rate Card, it auto-populates.',
                tip: 'Set your default drive time charge in Organization Settings → Financial → Rate Card. It will auto-apply to every new AI estimate.'
            },
            {
                stepNumber: 6,
                title: 'View Estimate on Scheduled Jobs',
                description: 'After scheduling the job, click on it from the Calendar to open the Edit Job modal. A "Job Estimate & Details" section displays the AI diagnosis, materials table with costs/markup, labor time and rate, drive time, grand total, tools needed as orange badges, safety warnings, and the customer\'s original description/notes.',
            }
        ],
        lastUpdated: '2026-06-24',
        keywords: ['ai', 'estimate', 'job', 'cost', 'markup', 'hourly rate', 'labor', 'materials', 'parts', 'drive time', 'service call fee', 'rate card', 'editable', 'line items', 'generate', 'diagnosis', 'confidence', 'tools', 'fixtures', 'vendor', 'inventory', 'calendar', 'edit job']
    },
    {
        id: 'gs-schedule-now',
        title: 'Schedule Now — Book While on the Phone',
        category: 'getting-started',
        content: `When creating a job while on the phone with a customer, use Schedule Now to see the live schedule, pick an available time, and automatically send confirmation via email and text.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Open Schedule Appointment',
                description: 'On the New Job form, the "Schedule Appointment" section defaults to Schedule Now mode. You can toggle to "Availability Windows" mode using the link in the blue header bar if you prefer the old workflow.',
                tip: 'Schedule Now is ideal for phone calls where you need to confirm the time right away. Availability Windows is better for online requests where the customer picks their own times later.'
            },
            {
                stepNumber: 2,
                title: 'Pick a Date and Technician',
                description: 'Select a date using the date picker (defaults to today or later). Optionally assign a specific technician from the dropdown, or leave it as "Unassigned" to see all scheduled jobs for the day.',
                tip: 'When you select a technician, the time slot grid filters to only show conflicts for that tech. "Unassigned" shows all org-wide conflicts.'
            },
            {
                stepNumber: 3,
                title: 'View Existing Jobs',
                description: 'After selecting a date, existing scheduled jobs for that day appear in an amber summary box. Each job shows the start time, customer name, duration, and which tech is assigned. This helps you avoid double-booking.',
            },
            {
                stepNumber: 4,
                title: 'Select an Available Time Slot',
                description: 'The time slot grid shows 30-minute intervals from 7 AM to 6 PM. Green slots are available; gray/strikethrough slots conflict with existing jobs or are in the past. Click a green slot to select it. Your chosen slot highlights in blue with a check mark.',
                tip: 'The availability check accounts for the job duration you selected above, not just a single time point. A 2-hour job at 10:00 will block 10:00-12:00.'
            },
            {
                stepNumber: 5,
                title: 'Review and Submit',
                description: 'After picking a time, a green confirmation banner shows the appointment date, time, assigned tech, and notification preview. The Submit button changes to "Schedule & Notify Customer." On submit, the job is created with status "Scheduled" and confirmation is sent via email and SMS (if the customer has a phone number on file).',
                tip: 'The confirmation email includes the date, time, address, and service description. The SMS is a concise message with the appointment details and opt-out language.'
            }
        ],
        lastUpdated: '2026-06-24',
        keywords: ['schedule', 'book', 'appointment', 'phone', 'call', 'time slot', 'availability', 'assign', 'technician', 'email', 'sms', 'text', 'notify', 'confirmation', 'calendar', 'conflict', 'double booking']
    },
    {
        id: 'gs-add-customers',
        title: 'Adding Customers',
        category: 'getting-started',
        content: `There are two ways to add customers to your system Ã¢â‚¬â€ from the Contacts directory or inline while creating a job.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Navigate to Contacts',
                description: 'Click "Customers" in the sidebar under the People section. This opens the Contact Directory showing all your existing and new contacts, split into two tabs.',
                screenshotUrl: '/help-screenshots/customers/contacts-directory.png'
            },
            {
                stepNumber: 2,
                title: 'Click "Add Customer"',
                description: 'Click the "+ Add Customer" button at the top of the Contacts page. A modal opens where you can enter the customer\'s name, email, phone number, and service address.',
                screenshotUrl: '/help-screenshots/customers/contacts-directory.png',
                tip: 'You can also add a customer inline while creating a new job Ã¢â‚¬â€ type a name and click "Create new customer" if they don\'t exist yet.'
            },
            {
                stepNumber: 3,
                title: 'Fill In Customer Details',
                description: 'Enter the customer\'s full name, email address, phone number, and street address. You can also set a custom Contact Type (Customer, Lead, Vendor, Partner). Click "Save" to add them to your directory.',
                screenshotUrl: '/help-screenshots/customers/contacts-directory.png'
            },
            {
                stepNumber: 4,
                title: 'Customer Portal Access',
                description: 'Once added, customers automatically get access to the Customer Portal where they can view their jobs, approve quotes, pay invoices, and communicate with you Ã¢â‚¬â€ all without needing to create a separate account.',
                tip: 'Customers in the "New Contacts" tab have no billing history yet. Once they complete a job with payment, they move to "Existing Contacts" automatically.'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['customer', 'client', 'add', 'contact', 'new', 'directory', 'portal']
    },
    {
        id: 'gs-navigation',
        title: 'Navigating the App',
        category: 'getting-started',
        content: `DispatchBox uses a left sidebar for navigation, organized into logical groups. Here's how to find everything.`,
        steps: [
            {
                stepNumber: 1,
                title: 'The Sidebar Navigation',
                description: 'The left sidebar is your primary navigation hub. It\'s organized into four main sections: Work (Dashboard, Jobs, Calendar, Dispatch Console, Kanban), Financial (Invoices, Quotes, Purchase Orders), Inventory (Materials, Tools), and People (Customers, Technicians).',
                screenshotUrl: '/help-screenshots/getting-started/sidebar-navigation.png',
                tip: 'Click the "Collapse" button at the bottom of the sidebar to shrink it to a slim icon rail for more screen space. Click again to expand.'
            },
            {
                stepNumber: 2,
                title: 'The Top Bar',
                description: 'The top bar shows a breadcrumb of your current page, plus a notification bell, Help icon, and your profile dropdown on the right. Click your avatar to access Profile, Organization Settings, Add-ons, and Sign Out.',
                screenshotUrl: '/help-screenshots/getting-started/dashboard-overview.png'
            },
            {
                stepNumber: 3,
                title: 'Quick Job Creation',
                description: 'The prominent blue "+ New Job" button at the top of the sidebar lets you create jobs instantly from any page. You never need to navigate away from what you\'re doing to create a new work order.',
                screenshotUrl: '/help-screenshots/getting-started/sidebar-navigation.png'
            },
            {
                stepNumber: 4,
                title: 'Reports, Settings & Help',
                description: 'At the bottom of the sidebar, you\'ll always find links to Reports (business analytics), Settings (organization configuration), and Help Center (this documentation). These are pinned to the bottom so they\'re always accessible.',
                screenshotUrl: '/help-screenshots/getting-started/sidebar-navigation.png',
                tip: 'On mobile devices, tap the hamburger menu (Ã¢ËœÂ°) in the top-left corner to open the sidebar as a slide-out drawer.'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['navigate', 'menu', 'sidebar', 'find', 'where', 'collapse', 'expand', 'jobs', 'top bar']
    },
    {
        id: 'gs-customer-inquiries',
        title: 'Customer Inquiries Dashboard',
        category: 'getting-started',
        content: `When a visitor submits a service request through your public website portal, it appears instantly on your Admin Dashboard as a Customer Inquiry.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Find Inquiries on Your Dashboard',
                description: 'Inquiries appear at the very top of the Corporate Admin Dashboard Ã¢â‚¬â€ above KPI cards and charts Ã¢â‚¬â€ so you never miss a lead. Each card shows the customer\'s name, phone, email, address, service description, urgency badge, and time since submission.',
                screenshotUrl: '/help-screenshots/getting-started/dashboard-overview.png',
                tip: 'The 4th KPI card on the dashboard shows the live count of pending inquiries with an amber highlight when there are active leads.'
            },
            {
                stepNumber: 2,
                title: 'Identify Urgency & Priority',
                description: 'Each inquiry shows an urgency badge: Normal (gray) or Emergency (red with pulse animation). Emergency requests should be prioritized Ã¢â‚¬â€ they indicate the customer selected "Emergency" on the portal form.',
                screenshotUrl: '/help-screenshots/getting-started/dashboard-overview.png'
            },
            {
                stepNumber: 3,
                title: 'Take Quick Actions',
                description: 'Each inquiry has quick action buttons: Call (one-tap dial), Send Quote (auto-creates a draft job and opens the Quote Builder with customer details pre-filled), Create Job (makes a job record), Add Customer (registers in your directory), and Dismiss (archives the inquiry for audit).',
                screenshotUrl: '/help-screenshots/getting-started/dashboard-overview.png',
                tip: 'The "Send Quote" button is the fastest path from lead to revenue Ã¢â‚¬â€ it creates the job AND opens the quote builder in one click.'
            },
            {
                stepNumber: 4,
                title: 'Respond Quickly for Best Results',
                description: 'Respond within 15 minutes for best conversion rates. Emergency requests show a red pulsing badge Ã¢â‚¬â€ prioritize these immediately. Once dismissed, inquiries are preserved for audit but removed from the active triage queue.',
                tip: 'The Triage section at the top of the Dashboard also shows voice call details and quote change requests Ã¢â‚¬â€ empty this section daily as your first task.'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['inquiry', 'inquiries', 'portal', 'lead', 'customer request', 'website', 'booking', 'ticket', 'pending', 'dashboard']
    },
    {
        id: 'gs-materials-needed',
        title: 'Materials & Tools Needed Dashboard',
        category: 'getting-started',
        content: `The Materials & Tools Needed section on the Admin Dashboard shows all items required for upcoming scheduled jobs, sorted by urgency. It cross-references your inventory to highlight out-of-stock items and lets you order directly.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Find the Section',
                description: 'On your Admin Dashboard, the "Materials & Tools Needed" panel appears directly below Customer Inquiries. It shows a blue header with the total count of items that need ordering.',
            },
            {
                stepNumber: 2,
                title: 'Understand Urgency Sorting',
                description: 'Items are sorted by urgency: out-of-stock items (red circle) appear first, then low-stock items (amber triangle), then in-stock items (green check). Within each group, items for higher-priority or sooner-scheduled jobs rank higher.',
                tip: 'The urgency score factors in job priority (critical > high > medium > low), how soon the job is scheduled, and whether the item is in stock.'
            },
            {
                stepNumber: 3,
                title: 'Hover for Job Details',
                description: 'Hover over any item to see a dark tooltip listing which specific jobs need it. Each job shows a priority dot (red=critical, orange=high, yellow=medium), the job title, customer name, and scheduled date.',
            },
            {
                stepNumber: 4,
                title: 'Order Out-of-Stock Items',
                description: 'Out-of-stock materials show a blue "Order" button. Clicking it navigates to Purchase Orders with the item name pre-filled so you can quickly create a PO. Tools show an orange "Tool" badge since they are not charged to the customer.',
                tip: 'Keep your Materials Inventory up to date so the dashboard can accurately report which items need ordering.'
            }
        ],
        lastUpdated: '2026-06-24',
        keywords: ['materials', 'tools', 'needed', 'inventory', 'stock', 'order', 'purchase', 'dashboard', 'urgency', 'shortfall', 'upcoming jobs']
    },
    {
        id: 'gs-receiving-module',
        title: 'Receiving Orders & Inventory',
        category: 'getting-started',
        content: `The Receiving module processes incoming deliveries with three receiving modes: Individual Scan (verify each item), Whole Order (scan PO/pallet), and Photo (snap the packing slip). Supports bin scanning for put-away, warehouse locations from your company settings, and automatic inventory updates.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Choose a Receiving Mode',
                description: 'When receiving a PO, choose from three modes: "Individual Scan" requires scanning each item\'s barcode for verification. "Whole Order" lets you scan one PO/pallet barcode or click "Receive All" to accept everything. "Photo / Slip" lets you take a photo of the packing slip for processing.',
                tip: 'Individual Scan is best for high-value or error-prone shipments. Whole Order is fastest for trusted vendors.'
            },
            {
                stepNumber: 2,
                title: 'Assign Warehouse Locations',
                description: 'Each item has a full warehouse location picker with Location (from your company settings like Truck, Warehouse), Zone (Receiving, Bulk Storage, Pick Area), and address fields: Aisle, Rack, Shelf, Level. The composite bin code (e.g., "A-1-3-2") is auto-generated.',
            },
            {
                stepNumber: 3,
                title: 'Scan Bin Labels for Put-Away',
                description: 'Click the "Scan Bin" button on any item\'s location picker to scan a printed bin QR label. This auto-fills all location fields from the label. Create and print labels from the Warehouse Bins page.',
                tip: 'Print bin labels and stick them on your shelves/racks. Techs scan during put-away — no manual entry needed.'
            },
            {
                stepNumber: 4,
                title: 'Track Condition & Discrepancies',
                description: 'Mark each item as Good, Damaged, or Wrong Item. When received quantity differs from expected, a discrepancy notes field appears. All records are saved to the History tab for a full audit trail.',
            },
            {
                stepNumber: 5,
                title: 'Ad-Hoc & History',
                description: 'The "Ad-Hoc Receive" tab handles walk-in purchases and returns without a PO. The "History" tab shows all receiving records with searchable audit trail.',
            }
        ],
        lastUpdated: '2026-06-25',
        keywords: ['receiving', 'receive', 'delivery', 'barcode', 'scan', 'scanner', 'bin', 'binning', 'inventory', 'partial', 'PO', 'purchase order', 'ad-hoc', 'put-away', 'warehouse', 'location', 'zone', 'aisle', 'rack', 'shelf']
    },
    {
        id: 'gs-warehouse-bins',
        title: 'Warehouse Management System',
        category: 'getting-started',
        content: `The Warehouse Management module is a full WMS with four tabs: Overview Dashboard, Bin Contents drill-down, Inventory Counts (full and cycle), and Bin Labels with QR printing.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Overview Dashboard',
                description: 'The Overview tab shows warehouse-wide stats: total SKUs, total bins, occupied vs. empty bins, and total inventory value. Below that, Inventory by Location breaks down SKU counts, item totals, and value per location. Low Stock Alerts and Zone Occupancy heatmaps complete the picture.',
                tip: 'Click any location row or zone card to jump directly to Bin Contents filtered to that area.'
            },
            {
                stepNumber: 2,
                title: 'Browse Bin Contents',
                description: 'The Bin Contents tab provides a hierarchical drill-down: All Locations, then Zones, Aisles, and finally individual Bins. Each level shows card-style navigation with SKU counts and item totals. Click a bin to open a slide-out panel showing every product stored there with quantities, unit costs, value, and low-stock warnings.',
                tip: 'Use the search bar at the bin/aisle level to find a product by name or SKU across all bins.'
            },
            {
                stepNumber: 3,
                title: 'Create and Run Inventory Counts',
                description: 'The Inventory Counts tab supports two modes: Full Physical Count (wall-to-wall snapshot) and Cycle Count (targeted subsets). Create a count by naming it, selecting scope (location/zone), and optionally enabling Blind Count mode which hides expected quantities. Choose from three input modes: Barcode Gun (keyboard input from USB/Bluetooth scanners), Camera QR (device camera), or Manual entry.',
                screenshotUrl: '/help-screenshots/inventory/created-count-list.png'
            },
            {
                stepNumber: 4,
                title: 'Review Variances and Apply Adjustments',
                description: 'After counting, move to the Review screen to see a variance table comparing Expected vs. Counted quantities with dollar impact. Filter by variances only or matches. Toggle the Create Audit Trail option to record each adjustment as a material usage entry for historical tracking, or turn it off for simple quantity updates.',
                tip: 'Enabling audit trail creates formal gain/loss records in your material usage history for accounting purposes.'
            },
            {
                stepNumber: 5,
                title: 'Print Bin Labels',
                description: 'The Labels tab preserves all existing functionality: create individual bins, batch create entire warehouse sections (Aisle A-E, 4 racks, 4 shelves), and print QR labels. Select bins by clicking them, then Print Labels. Each label includes bin code, location, zone, type, and a scannable QR code.',
            }
        ],
        lastUpdated: '2026-06-27',
        keywords: ['warehouse', 'WMS', 'bins', 'bin', 'labels', 'print', 'QR', 'inventory', 'count', 'cycle count', 'full count', 'variance', 'adjustment', 'audit', 'barcode', 'scan', 'overview', 'dashboard', 'zone', 'aisle', 'rack', 'shelf', 'drill-down', 'contents', 'occupancy']
    },
    {
        id: 'inv-cycle-count-config',
        title: 'Setting Up Cycle Count Schedules',
        category: 'getting-started',
        content: `Configure automatic ABC-based cycle counting to maintain inventory accuracy without shutting down operations.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Enable Cycle Count Scheduling',
                description: 'In the Warehouse Overview tab, find the Cycle Count Schedule panel at the bottom. Toggle it on to enable configuration.',
            },
            {
                stepNumber: 2,
                title: 'Choose a Classification Method',
                description: 'Select how materials are categorized into A/B/C classes: By Unit Cost (expensive items counted more often), By Monthly Usage (fast-moving items counted more often), or Manual Assignment (you set A/B/C per material in the Materials Inventory page).',
                tip: 'Unit Cost classification is the easiest to start with. Items over $50 become A-class, $10-50 become B-class, under $10 become C-class.'
            },
            {
                stepNumber: 3,
                title: 'Set Count Frequencies',
                description: 'Configure how often each class gets counted. Industry best practice: A-items weekly (7 days), B-items monthly (30 days), C-items quarterly (90 days). Pick a preferred count day (e.g., Monday) and set the variance recount threshold percentage.',
            },
            {
                stepNumber: 4,
                title: 'Generate and Execute Counts',
                description: 'Use the "New Count" button in the Inventory Counts tab to create a cycle count. The system checks which materials are due based on their ABC class and last count date, then generates a count list sorted by pick-path order for efficient warehouse walking.',
                screenshotUrl: '/help-screenshots/inventory/active-count-interface.png'
            }
        ],
        lastUpdated: '2026-06-27',
        keywords: ['cycle count', 'ABC', 'classification', 'schedule', 'frequency', 'A-items', 'B-items', 'C-items', 'variance', 'recount', 'threshold', 'automatic', 'unit cost', 'monthly usage']
    },
    {
        id: 'gs-admin-dashboard-triage',
        title: 'Reorganized Admin Dashboard & Triage Workflow',
        category: 'getting-started',
        content: `Your Admin Dashboard is organized as a top-to-bottom daily checklist to streamline dispatcher operations.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Triage Inquiries & Change Requests (Top Box)',
                description: 'Start your day here. The top section shows immediate action items: website portal requests, voice call details, and quote change requests. Review each item and dismiss, convert to jobs, or revise quotes. Empty this section daily.',
                screenshotUrl: '/help-screenshots/getting-started/dashboard-overview.png',
                tip: 'Emergency requests show a red pulsing badge Ã¢â‚¬â€ handle these first before moving down the dashboard.'
            },
            {
                stepNumber: 2,
                title: 'Manage Quotes & Pipeline (Middle Box)',
                description: 'View live counts of Draft, Sent, Review, Approved, and Declined quotes. Click any quote count card to instantly open the Quotes List filtered by that status. The table lists the 5 most recent quotes Ã¢â‚¬â€ click any row to edit or view.',
                screenshotUrl: '/help-screenshots/getting-started/dashboard-overview.png'
            },
            {
                stepNumber: 3,
                title: 'Dispatch & Monitor Jobs (Bottom Box)',
                description: 'Track active work orders. View live counts of Unscheduled, Scheduled, In Progress, Completed, and Cancelled jobs. Click job count cards to view the filtered Jobs List. Click table rows to manage specific jobs.',
                screenshotUrl: '/help-screenshots/getting-started/dashboard-overview.png'
            },
            {
                stepNumber: 4,
                title: 'Operational Analytics (Bottom Row)',
                description: 'Track monthly revenue trends with charts, view job status distribution breakdowns, and manage your field technician roster. These analytics update in real-time as jobs are completed and invoices are paid.',
                screenshotUrl: '/help-screenshots/getting-started/dashboard-overview.png',
                tip: 'Think of the dashboard as a top-to-bottom daily workflow: triage Ã¢â€ ’ quotes Ã¢â€ ’ jobs Ã¢â€ ’ analytics.'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['dashboard', 'workflow', 'checklist', 'triage', 'quotes', 'jobs', 'inquiries', 'change requests', 'dispatcher', 'daily operations']
    },
    {
        id: 'gs-active-modules',
        title: 'Active Modules & Granular Features Settings',
        category: 'getting-started',
        content: `Customize your DispatchBox workspace by enabling or disabling key operational modules and specific sub-features.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Access Module Settings',
                description: 'Navigate to Organization Settings from your profile avatar or the sidebar. Scroll to the Active Modules section. You\'ll see four major categories: Communications Hub, Invoicing & Estimates, Inventory Tracking, and Operations & Dispatch Ã¢â‚¬â€ each with granular sub-feature toggles.',
                screenshotUrl: '/help-screenshots/account/org-settings.png',
                tip: 'You can also configure modules during initial onboarding Ã¢â‚¬â€ changes are always bidirectionally synced.'
            },
            {
                stepNumber: 2,
                title: 'Toggle Modules & Sub-Features',
                description: 'Each module category has independent sub-feature toggles. For example, under Communications Hub you can individually enable/disable Email Client, SMS & Texting, and AI Voice Phone Agent. Under Inventory Tracking: Materials & Parts Catalog and Tool Fleet Audit.',
                screenshotUrl: '/help-screenshots/account/org-settings.png'
            },
            {
                stepNumber: 3,
                title: 'Understand Parent-Child Sync',
                description: 'The system keeps parent categories and child sub-features in sync automatically. Toggling off a parent (e.g., Inventory Tracking) disables all nested sub-features. Enabling any sub-feature auto-activates its parent. If you disable every sub-feature under a category, the parent switches off automatically.',
                screenshotUrl: '/help-screenshots/account/org-settings.png',
                tip: 'The sidebar updates in real-time Ã¢â‚¬â€ disabled modules vanish from the navigation instantly, and empty section headers collapse for a clean workspace.'
            },
            {
                stepNumber: 4,
                title: 'Graceful Degradation',
                description: 'When you disable modules, DispatchBox degrades gracefully. With Inventory disabled, Purchase Orders becomes a manual sourcing cockpit with a "+ Add Custom Item" form. Quote Builders continue working with manual line items even without an active materials catalog.',
                screenshotUrl: '/help-screenshots/account/org-settings.png'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['modules', 'active', 'toggle', 'hide', 'show', 'onboarding', 'signup', 'comms', 'financial', 'inventory', 'purchase orders', 'sidebar', 'settings', 'background sync', 'granular', 'kanban', 'sms', 'email', 'voice', 'materials', 'tools', 'manual PO', 'custom item']
    },

    // Ã¢â€â‚¬Ã¢â€â‚¬ Jobs & Scheduling Ã¢â€â‚¬Ã¢â€â‚¬
    {
        id: 'jobs-calendar',
        title: 'Using the Calendar',
        category: 'jobs',
        content: `The Calendar view gives you a visual overview of all scheduled jobs across your team.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Open the Calendar',
                description: 'Click "Calendar" in the sidebar under the Work section. The calendar loads showing your scheduled jobs as colored blocks on a timeline.',
                screenshotUrl: '/help-screenshots/jobs/calendar-view.png'
            },
            {
                stepNumber: 2,
                title: 'Switch Between Views',
                description: 'Use the view toggle buttons at the top to switch between Day, Week, and Month views. Each view shows your jobs at different levels of detail to suit your planning needs.',
                screenshotUrl: '/help-screenshots/jobs/calendar-view.png',
                tip: 'Day view is best for detailed scheduling. Week view gives you a broader overview. Month view is great for long-range planning.'
            },
            {
                stepNumber: 3,
                title: 'Read the Color Codes',
                description: 'Jobs are color-coded by their status so you can see at a glance where things stand: Blue = Scheduled, Yellow = In Progress, Green = Completed, Red = Cancelled.',
                screenshotUrl: '/help-screenshots/jobs/calendar-view.png'
            },
            {
                stepNumber: 4,
                title: 'Drag & Drop to Reschedule',
                description: 'To reschedule a job, simply drag it to a different time slot or date. The job\'s schedule updates automatically and the assigned technician is notified.',
                tip: 'Click any empty time slot to quickly create a new job at that exact time Ã¢â‚¬â€ no need to open the full creation form first.'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['calendar', 'schedule', 'drag', 'drop', 'view', 'day', 'week', 'month', 'active day', 'dispatch grid']
    },
    {
        id: 'jobs-status',
        title: 'Job Statuses Explained',
        category: 'jobs',
        content: `Every job in DispatchBox progresses through a defined lifecycle of statuses.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Understand the Job Lifecycle',
                description: 'Jobs flow through these statuses: Pending (created, not scheduled), Scheduled (date/time and technician assigned), In Progress (tech on-site working), Completed (work finished, customer signed off), Cancelled, and On Hold (paused for parts or customer decision).',
                screenshotUrl: '/help-screenshots/jobs/jobs-list-full.png'
            },
            {
                stepNumber: 2,
                title: 'View Status on the Jobs List',
                description: 'On the Jobs page, each row shows the current status as a color-coded badge. Use the status tabs at the top (All, Unscheduled, Scheduled, In Progress, Completed, Cancelled) to filter your view.',
                screenshotUrl: '/help-screenshots/jobs/jobs-list-full.png',
                tip: 'Status colors match across the app: Blue = Scheduled, Yellow/Orange = In Progress, Green = Completed, Red = Cancelled, Gray = Pending.'
            },
            {
                stepNumber: 3,
                title: 'Update Status',
                description: 'Technicians can update job status from their mobile dashboard as they arrive on-site and complete work. Admins and dispatchers can change any job\'s status from the job detail page using the status dropdown.',
                screenshotUrl: '/help-screenshots/jobs/jobs-list-full.png'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['status', 'pending', 'scheduled', 'progress', 'completed', 'cancelled', 'on hold']
    },
    {
        id: 'jobs-dispatch',
        title: 'Dispatcher Console',
        category: 'jobs',
        content: `The Dispatcher Console is your central command center for managing multiple technicians, assigning jobs, and optimizing field service operations. Available on Small Business and Enterprise plans.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Open the Dispatcher Console',
                description: 'Click "Dispatch" in the sidebar under the Work section. The console opens with four main panels: Unscheduled Jobs queue on the left, the Timeline Grid in the center, Tech Status panel on the right, and KPI stats bar at the top.',
                screenshotUrl: '/help-screenshots/jobs/dispatch-console.png'
            },
            {
                stepNumber: 2,
                title: 'Review the KPI Stats Bar',
                description: 'The live stats strip at the top shows: Unassigned jobs count (amber when > 0), Scheduled Today count, In Progress count, active Technicians, and Conflicts (red pulse when overlapping schedules detected).',
                screenshotUrl: '/help-screenshots/jobs/dispatch-console.png',
                tip: 'The Conflicts counter helps you immediately spot overlapping schedule issues Ã¢â‚¬â€ click it to see which technicians have conflicts.'
            },
            {
                stepNumber: 3,
                title: 'Drag Jobs onto the Timeline',
                description: 'Unscheduled jobs appear as draggable cards on the left panel. Drag any job onto a technician\'s row in the timeline to schedule it. The system automatically detects conflicts and prevents overlapping assignments.',
                screenshotUrl: '/help-screenshots/jobs/dispatch-console.png'
            },
            {
                stepNumber: 4,
                title: 'Use Smart Tech Assignment',
                description: 'Click "Quick Assign Best Tech" on any job card to open the AI-powered assignment modal. It ranks technicians on 5 factors: Skill Match (30%), Workload (25%), Availability (20%), Proximity (15%), and Certifications (10%).',
                screenshotUrl: '/help-screenshots/jobs/dispatch-console.png',
                tip: 'The "Auto-Assign Best Available" button picks the top-ranked technician and earliest available time slot with one click.'
            },
            {
                stepNumber: 5,
                title: 'Monitor Tech Status',
                description: 'The right panel shows each technician\'s real-time status: Available (green), On Job (blue pulse), At Capacity (red), or Off Duty (gray). You can see their completion progress and use "Send Next Job" to auto-assign the highest priority unscheduled job.',
                screenshotUrl: '/help-screenshots/jobs/dispatch-console.png'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['dispatch', 'dispatcher', 'console', 'map', 'assign', 'route', 'location', 'GPS', 'timeline', 'schedule', 'drag', 'drop', 'tech', 'technician', 'capacity', 'KPI', 'score', 'matching', 'smart assign', 'auto schedule', 'quick assign', 'unscheduled', 'conflict', 'status', 'availability', 'skills', 'workload', 'keyboard shortcut']
    },
    {
        id: 'jobs-list',
        title: 'Jobs / Work Orders List',
        category: 'jobs',
        content: `The Jobs page is your central hub for viewing and managing all work orders.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Navigate to Jobs',
                description: 'Click "Jobs" in the sidebar under the Work section. The page shows your total job count, unassigned count, and a prominent "+ New Job" button at the top.',
                screenshotUrl: '/help-screenshots/jobs/jobs-list-full.png'
            },
            {
                stepNumber: 2,
                title: 'Filter by Status & Priority',
                description: 'Use the status tabs at the top (All, Unscheduled, Scheduled, In Progress, Completed, Cancelled, Archived) to filter your view. Use the priority pills below to quick-filter by Critical, High, Medium, or Low. The search bar filters instantly by customer name, address, or job type.',
                screenshotUrl: '/help-screenshots/jobs/jobs-list-full.png',
                tip: 'Click any column header to sort the table Ã¢â‚¬â€ Priority, Customer, Type, Status, Tech, Duration, or Age.'
            },
            {
                stepNumber: 3,
                title: 'Use Bulk Actions',
                description: 'Select multiple jobs using the checkboxes on the left. A floating Bulk Actions Bar appears with options to Archive Selected, Unarchive Selected, or permanently Delete Selected. Use the master checkbox in the header to select all visible jobs at once.',
                screenshotUrl: '/help-screenshots/jobs/jobs-list-full.png'
            },
            {
                stepNumber: 4,
                title: 'Individual Row Actions',
                description: 'On the far right of each row, quick actions let you: View Job (full details), Assign (opens the AI-powered Smart Tech Assignment Modal for unassigned jobs), Archive/Unarchive, and Delete.',
                screenshotUrl: '/help-screenshots/jobs/jobs-list-full.png',
                tip: 'The Smart Tech Assignment Modal ranks technicians using an AI scoring engine based on skills, workload, availability, proximity, and certifications.'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['jobs', 'work orders', 'list', 'table', 'filter', 'search', 'assign', 'unassigned', 'priority', 'sort', 'status', 'pending', 'archive', 'delete', 'bulk actions', 'select', 'work order management']
    },
    {
        id: 'jobs-one-click-booking',
        title: 'Smart Scheduling & One-Click Booking',
        category: 'jobs',
        content: `DispatchBox automatically parses natural language time requests into actionable scheduling chips for lightning-fast dispatching.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Open the Smart Tech Assignment Modal',
                description: 'Click "Assign" on any job that has customer availability data. The Smart Tech Assignment Modal opens with technician rankings and scheduling options.',
                screenshotUrl: '/help-screenshots/jobs/dispatch-console.png'
            },
            {
                stepNumber: 2,
                title: 'View Customer Suggested Times',
                description: 'At the top of the modal, Customer Suggested Times appear as clickable date chips. These are parsed from the customer\'s original request (e.g., "next Tuesday morning" or "October 15th around 2 PM"). Click any chip to jump to that day.',
                screenshotUrl: '/help-screenshots/jobs/dispatch-console.png',
                tip: 'The AI parser understands relative dates like "tomorrow" or "next week" based on when the ticket was created.'
            },
            {
                stepNumber: 3,
                title: 'One-Click Booking',
                description: 'The Available Slots section refreshes to show time windows for the selected day. Hover over any slot to see "Book [Time]" Ã¢â‚¬â€ click it to instantly assign the technician to that exact time. No extra confirmation step needed.',
                screenshotUrl: '/help-screenshots/jobs/dispatch-console.png',
                tip: 'This is the fastest dispatch flow: click a suggested date chip Ã¢â€ ’ click a time slot Ã¢â€ ’ done. The tech is assigned and notified instantly.'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['schedule', 'booking', 'one-click', 'assign', 'availability', 'parse', 'smart scheduling', 'customer suggested times', 'fast dispatch']
    },
    {
        id: 'jobs-ai-estimate',
        title: 'AI Job Estimate (Pre-Save)',
        category: 'jobs',
        content: `Generate an AI-powered diagnosis, cost estimate, and duration forecast before saving a new job.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Enter Job Details',
                description: 'Navigate to the Create Job page via the "+ New Job" button. Fill in the customer details, select a Job Type category (repair, maintenance, installation, etc.), and write a detailed description of the issue — the more detail you provide, the better the AI estimate.',
                screenshotUrl: '/help-screenshots/jobs/create-job-form.png',
                tip: 'The AI Estimate button activates once your description is at least 10 characters long. More detail = higher confidence scores.'
            },
            {
                stepNumber: 2,
                title: 'Click "Generate AI Estimate"',
                description: 'Below the description field, click the purple "✨ Generate AI Estimate" button. The system sends your job description, category, priority, and address to the AI engine for analysis. A shimmer loading animation plays while the AI processes (typically 2-4 seconds).',
                screenshotUrl: '/help-screenshots/jobs/create-job-form.png'
            },
            {
                stepNumber: 3,
                title: 'Review the AI Estimate Panel',
                description: 'A detailed estimate panel appears with: Quick Stats (estimated duration, material costs, confidence score), Diagnosis (what the AI thinks the issue is), Recommended Solution (step-by-step approach), Parts & Materials (itemized list with estimated costs), and Safety Warnings (if applicable). The confidence gauge shows how reliable the estimate is based on the detail provided.',
                screenshotUrl: '/help-screenshots/jobs/create-job-form.png',
                tip: 'The estimated duration automatically fills the Duration dropdown — but you can still change it manually if you disagree with the AI suggestion.'
            },
            {
                stepNumber: 4,
                title: 'Submit the Job with AI Data Attached',
                description: 'After reviewing the estimate, click "Submit Request" to save the job. The AI estimate is saved alongside the job record as aiRecommendation, which downstream features (like the AI Quote Generator) use to create even more accurate quotes.',
                screenshotUrl: '/help-screenshots/jobs/create-job-form.png',
                tip: 'You can click "Regenerate" at the bottom of the estimate panel if you change the description and want a fresh analysis.'
            }
        ],
        lastUpdated: '2026-06-23',
        keywords: ['ai', 'estimate', 'diagnosis', 'cost', 'duration', 'parts', 'materials', 'generate', 'create job', 'pre-save', 'confidence', 'safety warnings', 'recommendation']
    },

    // Ã¢â€â‚¬Ã¢â€â‚¬ Invoicing & Quotes Ã¢â€â‚¬Ã¢â€â‚¬
    {
        id: 'inv-create',
        title: 'Creating Invoices',
        category: 'invoicing',
        content: `Invoices can be created from completed jobs or as standalone documents.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Navigate to Invoices',
                description: 'Click "Invoices" in the sidebar under the Financial section. You\'ll see your invoice list with status tabs: All, Draft, Sent, Paid, and Overdue.',
                screenshotUrl: '/help-screenshots/invoicing/invoices-page.png'
            },
            {
                stepNumber: 2,
                title: 'Create from a Completed Job',
                description: 'The fastest way: open a completed job\'s detail page and click "Generate Invoice." The invoice pre-fills with job costs, materials used, labor hours, and customer details Ã¢â‚¬â€ ready to review and send.',
                screenshotUrl: '/help-screenshots/invoicing/invoices-page.png',
                tip: 'You can also create standalone invoices from the Invoices page by clicking "+ New Invoice" and adding line items manually.'
            },
            {
                stepNumber: 3,
                title: 'Review & Adjust Line Items',
                description: 'Review the auto-populated line items (labor, materials, travel, etc.). Adjust quantities, unit prices, or add/remove items as needed. Set the tax rate and any applicable discounts.',
                screenshotUrl: '/help-screenshots/invoicing/invoices-page.png'
            },
            {
                stepNumber: 4,
                title: 'Send to Customer',
                description: 'Click "Send" to email the invoice to the customer. They receive a branded email with a secure link to view and pay the invoice online through the Customer Portal.',
                tip: 'Invoices include a tokenized link Ã¢â‚¬â€ customers can view and pay without logging in. You can also download invoices as PDF for offline delivery.'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['invoice', 'bill', 'create', 'send', 'payment', 'generate']
    },
    {
        id: 'inv-quotes',
        title: 'Quotes & Estimates',
        category: 'invoicing',
        content: `Create professional quotes for customers and convert approved quotes to invoices with one click.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Navigate to Quotes',
                description: 'Click "Quotes" in the sidebar under the Financial section. You\'ll see your quotes list with status filters: Draft, Sent, Approved, Declined, and Review.',
                screenshotUrl: '/help-screenshots/invoicing/quotes-page.png'
            },
            {
                stepNumber: 2,
                title: 'Create a New Quote',
                description: 'From a job detail page, click "Create Quote." Add line items with descriptions, quantities, and pricing. The AI Quote Generator can auto-populate items based on the job description.',
                screenshotUrl: '/help-screenshots/invoicing/quotes-page.png',
                tip: 'The AI Quote Generator gets smarter over time Ã¢â‚¬â€ it uses your past job history to calibrate estimates and cross-references your inventory for real pricing.'
            },
            {
                stepNumber: 3,
                title: 'Set Terms & Send',
                description: 'Set an expiration date and jurisdiction for terms & conditions. Choose your presentation mode (Detailed Line Items, Roll-up by Category, or Single Price Summary). Click "Send" to deliver the quote to your customer.',
                screenshotUrl: '/help-screenshots/invoicing/quotes-page.png'
            },
            {
                stepNumber: 4,
                title: 'Track & Convert',
                description: 'Monitor the quote timeline for customer views, approvals, and change requests. When approved, convert it to an invoice with one click.',
                tip: 'The quote activity timeline tracks every event — creation, delivery, views, revisions, and sign-off.'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['quote', 'estimate', 'proposal', 'pricing', 'AI', 'convert', 'approve']
    },
    {
        id: 'inv-ai-quotes',
        title: 'How AI Auto-Quoting Works',
        category: 'invoicing',
        content: `The AI Quote Generator learns from your job history and real inventory to produce accurate, profitable estimates.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Job History Calibration',
                description: 'When generating a quote, the AI searches your completed jobs for similar work. It compares **actual vs. estimated time** and adjusts future labor estimates automatically.',
                screenshotUrl: '/help-screenshots/invoicing/quotes-page.png',
                tip: 'The more jobs you complete, the smarter the AI gets. New companies get industry-standard estimates as a starting point.'
            },
            {
                stepNumber: 2,
                title: 'Parts & Inventory Matching',
                description: 'The AI cross-references suggested parts against your **Materials** inventory. Matches use your **real unit cost** with your markup percentage. Unknown parts use estimated retail pricing.',
                screenshotUrl: '/help-screenshots/inventory/materials-full.png'
            },
            {
                stepNumber: 3,
                title: 'Labor & Rate Cards',
                description: 'Labor is broken into phases (Diagnostic, Primary Repair, Testing & Cleanup) and priced using your **base hourly rate** or customer-specific tier rates from your rate card.',
                screenshotUrl: '/help-screenshots/invoicing/quotes-page.png',
                tip: 'Equipment and specialty tools are automatically added if the AI determines they are needed but not in your inventory.'
            }
        ],
        lastUpdated: '2026-06-22',
        keywords: ['quote', 'AI', 'estimate', 'smarter', 'history', 'calibration', 'parts', 'inventory', 'labor', 'rate card', 'auto-quote']
    },
    {
        id: 'inv-ai-learning',
        title: 'Making the AI Smarter with Editable Quotes',
        category: 'invoicing',
        content: `Every time you edit an AI-generated quote, the system learns from your corrections and improves future estimates.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Find the AI Recommendation Panel',
                description: 'Open any job detail page or the Communications Hub. The **Inline AI Recommendation & Quote Panel** shows suggested Materials and Tools for that job.',
                screenshotUrl: '/help-screenshots/invoicing/quotes-page.png'
            },
            {
                stepNumber: 2,
                title: 'Edit Materials & Tools',
                description: 'Click **Edit** next to the Materials & Tools section. Add items, change quantities, remove incorrect suggestions, or mark tools as required. Click **Save Changes**.',
                screenshotUrl: '/help-screenshots/invoicing/quotes-page.png',
                tip: 'Your corrections are stored in the job history. Next time a similar service is requested, the AI uses your edits to improve accuracy.'
            }
        ],
        lastUpdated: '2026-06-22',
        keywords: ['ai', 'quote', 'edit', 'materials', 'tools', 'learning', 'smarter', 'history', 'inline panel', 'job details']
    },
    {
        id: 'inv-quote-templates',
        title: 'Quote Display Templates',
        category: 'invoicing',
        content: `Control exactly how customers see their quotes — from detailed line items to a single summary price.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Open Display Settings',
                description: 'When creating or editing a quote, find **Quote Display Settings**. Choose a presentation mode: **Detailed Line Items**, **Roll-up by Category**, or **Single Price Summary**.',
                screenshotUrl: '/help-screenshots/invoicing/new-quote-form.png'
            },
            {
                stepNumber: 2,
                title: 'Configure Tax & Discounts',
                description: 'Toggle **Display Tax** to show/edit the tax rate. Add discounts as a **fixed dollar ($)** or **percentage (%)** amount, with an optional reason shown to the customer.',
                screenshotUrl: '/help-screenshots/invoicing/new-quote-form.png',
                tip: 'Settings save automatically with the quote. Preview how it looks by viewing the saved quote before sending.'
            }
        ],
        lastUpdated: '2026-06-22',
        keywords: ['quote', 'template', 'display', 'settings', 'presentation mode', 'single price', 'roll-up', 'category', 'tax', 'discount', 'percentage', 'fixed']
    },
    {
        id: 'inv-quote-change-requests',
        title: 'Quote Change Requests & AI Revisions',
        category: 'invoicing',
        content: `When a customer requests changes to a quote, DispatchBox automates the review and adjustment process to save you time:\n\n**1. Dashboard Action Items**\nQuotes with a status of "Change Requested" (tech_review) automatically show up in the main **"Customer Inquiries & Change Requests"** dashboard queue. They are marked with an amber **Change Requested** badge so you can instantly see that they require your attention.\n\n**2. Side-by-Side Comparison**\nIn the dashboard queue, quotes with pending changes display both the original quote total and the AI proposed revised total side-by-side. The review button adapts to say **Review AI Revision** with the proposed total.\n\n**3. AI Assisted Revision Workspace**\nWhen you click the **Needs Review** or **Revise** button for a quote (navigating to \`/quotes/:quoteId/edit\`), DispatchBox automatically intercepts the route and presents a premium **AI Assisted Quote Revision Workspace** instead of the manual quote change screen. This workspace loads the customer's last request and automatically generates the AI-proposed revision if it isn't ready yet.\n\n**4. One-Click Approval & Regeneration**\nIf the AI-revised quote is accurate, click the **Approve AI Revision** button inside the banner. If you want to re-run the AI quote generator to calibrate the recommendations again, click the **Regenerate AI** button next to it. This applies your edits to the root quote while keeping the quote in the review queue (\`tech_review\`) so you can continue editing or send it when ready.\n\n**5. Manual Adjustments & Saving**\nWithin the workspace, you can edit proposed line items manually, adjust markup, and modify the scope of work. Clicking **Save Changes** applies your edits to the root quote and clears the AI proposal, while keeping the quote in the review queue (\`tech_review\`) so it does not disappear from your dashboard. Once finalized, click **Send Quote** to deliver it to the customer. To bypass the AI workspace and access the classic manual editor, simply click the **Full Quote Editor** button inside the panel.\n\n**6. Inline Quote Editing & Sending**\nYou can also review, edit, and send quotes directly from the Quotes page timeline or the Quote detail page without navigating away:\n- **From Quotes List:** Click to expand the quote row to view its timeline. At the bottom of the timeline, click **Review & Edit AI Quote Inline** to open the editor directly in place, make your changes, and send the quote to the customer.\n- **From Quote Details:** In the **Customer Change Request** panel, click **Revise Quote Inline** to toggle the editing form right inside the panel, edit the proposed items, and send the updated quote immediately.`,
        lastUpdated: new Date().toISOString().split('T')[0],
        keywords: ['quote', 'change request', 'revision', 'ai quote', 'dashboard', 'communication history', 'timeline', 'tech review', 'approve revision', 'regenerate ai', 'inline edit', 'send inline']
    },
    {
        id: 'inv-quote-timeline-history',
        title: 'Quote Activity Timeline & Detailed History',
        category: 'invoicing',
        content: `DispatchBox maintains a comprehensive, visual audit trail for every service quote from inception to sign-off.\n\n**What the Timeline Tracks:**\n- **Quote Creation** Ã¢â€â‚¬Ã¢â€â‚¬ Logs when the quote was originally created and whether it was auto-generated by the AI agent.\n- **Delivery Status** Ã¢â€â‚¬Ã¢â€â‚¬ Records when the quote was sent and how it was communicated (e.g., via Email, SMS, or Voice Callback).\n- **Customer Views** Ã¢â€â‚¬Ã¢â€â‚¬ Logs the exact timestamp when the customer opened and viewed the quote.\n- **Revisions & Price Updates** Ã¢â€â‚¬Ã¢â€â‚¬ Visualizes version changes side-by-side, detailing price adjustments between revisions.\n- **Customer Notes & Change Requests** Ã¢â€â‚¬Ã¢â€â‚¬ Displays notes submitted by the customer requesting adjustments, prompting technician review.\n- **Sign-off / Decline** Ã¢â€â‚¬Ã¢â€â‚¬ Captures approval signatures or decline reasons along with final pricing.\n- **Deposit Payments** Ã¢â€â‚¬Ã¢â€â‚¬ Records deposit details and payment methods.\n\n**Visual Timeline Features:**\n- **Collapsed Summary on the Line** Ã¢â€â‚¬Ã¢â€â‚¬ Each timeline event shows a concise summary header (e.g., indicating AI generation, counts of line items like labor/materials, and communication status) so you can review history at a glance.\n- **Expanded Detail View** Ã¢â€â‚¬Ã¢â€â‚¬ Click any timeline row to expand and view the full details. For AI-generated quotes, this reveals a complete itemized breakdown of labor, materials, equipment, and travel, as well as the exact method and timestamp of customer communication.\n\n**Q: Who can see technician messages in the timeline?**\n**A:** Internal technician notes are visible to team members only. Customer-facing notes and system status changes are visible to both your staff and the customer.`,
        lastUpdated: '2026-06-08',
        keywords: ['timeline', 'history', 'quote activity', 'line items', 'audit trail', 'communication method', 'sent via', 'email', 'sms', 'voice', 'revisions']
    },

    // Ã¢â€â‚¬Ã¢â€â‚¬ Inventory Ã¢â€â‚¬Ã¢â€â‚¬
    {
        id: 'inv-materials',
        title: 'Managing Materials',
        category: 'inventory',
        content: `Track all your parts and supplies across warehouse, truck, and supplier locations.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Navigate to Materials',
                description: 'Click "Materials" in the sidebar under the Inventory section. You\'ll see three KPI cards at the top: Total Items in stock, items running Low on Stock, and your total Inventory Value.',
                screenshotUrl: '/help-screenshots/inventory/materials-inventory.png'
            },
            {
                stepNumber: 2,
                title: 'Add Materials',
                description: 'Click "+ Add Material" to add a new item. Enter the name, SKU, category, unit cost, current quantity, and reorder point. Assign it to a location (Warehouse, Truck, or At Supplier).',
                screenshotUrl: '/help-screenshots/inventory/materials-inventory.png',
                tip: 'Set reorder points to get automatic alerts when stock runs low. The Low Stock KPI card highlights items needing replenishment.'
            },
            {
                stepNumber: 3,
                title: 'Filter by Location',
                description: 'Use the location tabs Ã¢â‚¬â€ All Locations, Truck, Warehouse, At Supplier Ã¢â‚¬â€ to filter by where your materials are stored. The search bar lets you find specific items quickly by name or SKU.',
                screenshotUrl: '/help-screenshots/inventory/materials-inventory.png'
            },
            {
                stepNumber: 4,
                title: 'Track Usage on Jobs',
                description: 'When technicians close out a job, they log materials used. This automatically decrements your inventory count and adds the material costs to the job record and any generated invoices.',
                tip: 'Adjust quantities directly from the list using the plus and minus buttons on each item Ã¢â‚¬â€ no need to open the item detail page.'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['materials', 'parts', 'inventory', 'stock', 'reorder', 'warehouse', 'truck']
    },
    {
        id: 'inv-tools',
        title: 'Tool Tracking',
        category: 'inventory',
        content: `Keep track of all your company tools and equipment Ã¢â‚¬â€ assignments, conditions, and maintenance schedules.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Navigate to Tools',
                description: 'Click "Tools" in the sidebar under the Inventory section. You\'ll see your complete tool inventory with each item showing its name, category, assigned technician, and condition status.',
                screenshotUrl: '/help-screenshots/inventory/tools-inventory.png'
            },
            {
                stepNumber: 2,
                title: 'Add a Tool',
                description: 'Click "+ Add Tool" to register a new piece of equipment. Enter the tool name, serial number, category, condition (New, Good, Fair, Poor), and optionally assign it to a technician.',
                screenshotUrl: '/help-screenshots/inventory/tools-inventory.png'
            },
            {
                stepNumber: 3,
                title: 'Assign to Technicians',
                description: 'Each tool can be assigned to a specific technician for accountability. The assignment history is tracked, so you always know who had which tool and when.',
                screenshotUrl: '/help-screenshots/inventory/tools-inventory.png',
                tip: 'Use tool tracking to prevent losses of expensive equipment Ã¢â‚¬â€ you\'ll always know which tech has which tool.'
            },
            {
                stepNumber: 4,
                title: 'Track Condition & Maintenance',
                description: 'Update tool conditions as they age. Set maintenance reminders for critical equipment that needs periodic servicing or calibration. Click the edit button on any tool to update its details.',
                tip: 'Tools can also be tracked across specific jobs Ã¢â‚¬â€ assign tools to a job and track which equipment was used on-site.'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['tools', 'equipment', 'track', 'assign', 'condition', 'maintenance', 'serial number']
    },
    {
        id: 'inventory-web-portal-order',
        title: 'Vendor Portals & Direct Checkout',
        category: 'inventory',
        content: `DispatchBox integrates online vendor portals with your material sourcing workflow, allowing you to copy credentials, promo codes, and bulk order list inputs in one click.\n\n**Setting Up Web Portals & Credentials:**\nWhen adding or editing a vendor in your inventory directory (under **Manage Vendors**):\n1. Provide the **Website URL** (e.g., \`https://business.amazon.com\` or \`https://www.grainger.com\`).\n2. Store the secure **Web Username** and **Web Password** for the portal. Browser password managers will automatically recognize these inputs to help you save credentials natively!\n3. Add active **Discount Codes** (comma-separated list) and customized **Special Ordering Instructions** (e.g. gate codes, delivery times).\n\n**Ordering from Purchase Orders Backlog:**\nWhen evaluating competitive sourcing offers under the *Upcoming Job Materials* or *Stock Deficit Materials* tab in the **Purchase Orders** cockpit:\n1. Select any deficit item in either the Upcoming Orders Backlog or Stock Deficits Backlog, and click **"Quick Web Order"** next to your chosen vendor option.\n2. This launches the **Quick Checkout Helper Drawer** containing:\n   - **Step 1:** Launch the vendor's portal directly in a new browser tab.\n   - **Step 2:** Copy Username/Password for immediate copy-pasting.\n   - **Step 3:** Access the bulk **TSV (Tab-Separated Values) SKU Table** to copy all deficit SKUs and quantities in one tab-delimited line for fast bulk upload directly into the vendor's bulk order form.\n   - **Step 4:** Fast-copy active promo/discount codes.\n3. Once complete, click **"Save as Draft PO"** or **"Complete & Mark Sent"** to automatically record the PO inside Firestore with a \`sent\` or \`draft\` status!`,
        lastUpdated: new Date().toISOString().split('T')[0],
        keywords: ['vendor', 'portal', 'checkout', 'amazon', 'grainger', 'password', 'promo code', 'discount', 'tsv', 'sku', 'purchase order', 'direct order']
    },
    {
        id: 'inventory-ai-sourcing',
        title: 'AI Auto-Sourcing & Bulk Procurement',
        category: 'inventory',
        content: `Let AI analyze your backlog deficits and generate optimized multi-vendor purchase orders automatically.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Select Deficit Items',
                description: 'In **Purchase Orders**, review the Upcoming Job Materials and Stock Deficit backlogs. Select items to include in the AI sourcing run.',
                screenshotUrl: '/help-screenshots/inventory/purchase-orders-full.png'
            },
            {
                stepNumber: 2,
                title: 'Run AI Auto-Sourcing',
                description: 'Click **"Run AI Auto-Sourcing Agent"**. The AI splits items across vendors based on your selected strategy (cost, speed, quality, or preferred vendor), then generates draft POs for review.',
                screenshotUrl: '/help-screenshots/inventory/purchase-orders-full.png',
                tip: 'Review AI-generated POs before sending. The AI logs its reasoning in the terminal output so you can see why it chose each vendor.'
            }
        ],
        lastUpdated: '2026-06-22',
        keywords: ['ai', 'sourcing', 'auto-source', 'procurement', 'purchase order', 'backlog', 'deficit', 'vendor split', 'grainger', 'amazon', 'automatic order', 'bulk ordering', 'stock deficit', 'strategy']
    },

    // â”€â”€ Customers & Portal â”€â”€
    {
        id: 'cust-directory',
        title: 'Contact Directory & Lifecycle',
        category: 'customers',
        content: `Your full customer list, automatically split into New and Existing contacts based on billing history.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Open the Directory',
                description: 'Click **Customers** in the sidebar. The list shows all contacts with name, email, phone, total spent, and contact type.',
                screenshotUrl: '/help-screenshots/customers/customer-directory.png'
            },
            {
                stepNumber: 2,
                title: 'New vs. Existing',
                description: 'Toggle between **Existing Contacts** (customers with completed jobs and revenue) and **New Contacts** (leads with no billing history yet).',
                screenshotUrl: '/help-screenshots/customers/customer-directory.png',
                tip: 'Use this split to identify new leads who need nurturing vs. established revenue-generating clients.'
            },
            {
                stepNumber: 3,
                title: 'Filter, Sort & Add',
                description: 'Search by name/email/phone. Filter by contact type (Customer, Lead, Vendor, Partner). Sort by Name, Total Spent, or Type. Click **"+ Add Customer"** to create a new record.',
                screenshotUrl: '/help-screenshots/customers/customer-directory.png'
            }
        ],
        lastUpdated: '2026-06-22',
        keywords: ['directory', 'list', 'new customer', 'existing customer', 'lifecycle', 'total spent', 'revenue', 'filter', 'sort', 'contact type', 'vendor', 'lead', 'delete', 'archive']
    },
    {
        id: 'cust-multiple-locations-contacts',
        title: 'Multiple Locations & Contacts Management',
        category: 'customers',
        content: `Add multiple service addresses, billing contacts, and phone numbers to any customer profile.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Add Service Locations',
                description: 'Open a customer profile → **Locations** tab → **"Add Location"**. Set the type (Primary, Billing, Service Site), enter the address and access notes.',
                screenshotUrl: '/help-screenshots/customers/customer-directory.png'
            },
            {
                stepNumber: 2,
                title: 'Add Auxiliary Contacts',
                description: 'Go to the **Contacts** tab → **"Add Contact"**. Enter name, role (Primary, Billing, Technical), and notes. Mark one as default for the account.',
                screenshotUrl: '/help-screenshots/customers/customer-directory.png',
                tip: 'Enter multiple emails or phone numbers as comma-separated values (e.g., office@co.com, jane@co.com). The comms hub uses all of them automatically.'
            }
        ],
        lastUpdated: '2026-06-22',
        keywords: ['multiple addresses', 'multiple emails', 'multiple phones', 'auxiliary contact', 'sites', 'locations', 'billing contact', 'delete contact', 'delete location']
    },
    {
        id: 'cust-portal',
        title: 'Customer Portal',
        category: 'customers',
        content: `Your customers get a self-service portal to view jobs, pay invoices, send messages, and approve quotes.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Share the Portal Link',
                description: 'Find your Customer Portal URL in **Organization Settings → Branding**. Share it with customers via email or embed it on your website.',
                screenshotUrl: '/help-screenshots/account/org-settings-top.png'
            },
            {
                stepNumber: 2,
                title: 'Customer Login',
                description: 'Customers log in with their email + a one-time verification code. No password needed. They see their jobs, invoices, quotes, and messages.',
                screenshotUrl: '/help-screenshots/customers/customer-directory.png',
                tip: 'The portal is fully branded with your logo, colors, and company name from Organization Settings.'
            }
        ],
        lastUpdated: '2026-06-22',
        keywords: ['portal', 'customer', 'self-service', 'access', 'login']
    },

    // â”€â”€ Add-on Services â”€â”€
    {
        id: 'addon-domain',
        title: 'Custom Domain Setup',
        category: 'addons',
        content: `Register a custom domain so your portal and emails use your own business URL.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Open Add-ons',
                description: 'Go to **Add-ons & Services** from the sidebar or profile menu. Find the **Custom Domain** card and click **Enable**.',
                screenshotUrl: '/help-screenshots/account/addons-page.png'
            },
            {
                stepNumber: 2,
                title: 'Register Your Domain',
                description: 'Search for your domain (e.g., "billsplumbing.com"). DNS is configured automatically. Your customer portal will be accessible at your custom URL.',
                screenshotUrl: '/help-screenshots/account/addons-page.png',
                tip: '$14.99/month includes domain registration and DNS management. No technical setup required.'
            }
        ],
        lastUpdated: '2026-06-22',
        keywords: ['domain', 'website', 'URL', 'custom', 'DNS']
    },
    {
        id: 'addon-email',
        title: 'Business Email',
        category: 'addons',
        content: `Get professional email addresses at your custom domain — forwarded to your existing inbox.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Choose a Plan',
                description: 'In Add-ons, enable **Business Email**. Pick **Starter** ($4.99/mo — 2 aliases) or **Professional** ($9.99/mo — 5 aliases + catch-all forwarding).',
                screenshotUrl: '/help-screenshots/account/addons-page.png'
            },
            {
                stepNumber: 2,
                title: 'Set Up Aliases',
                description: 'Create aliases like info@yourdomain.com or support@yourdomain.com. All emails forward to your existing inbox — no new inbox to manage.',
                screenshotUrl: '/help-screenshots/communications/email-client.png',
                tip: 'Requires Custom Domain to be enabled first. Emails sent from DispatchBox will use your professional "from" address.'
            }
        ],
        lastUpdated: '2026-06-22',
        keywords: ['email', 'forwarding', 'alias', 'professional', 'inbox']
    },
    {
        id: 'addon-sms',
        title: 'Text Communications',
        category: 'addons',
        content: `Send and receive SMS messages with your customers from a dedicated business phone number.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Choose a Plan',
                description: 'In Add-ons, enable **SMS Communications**. Plans: **Basic** ($24.99/mo — 500 msg), **Professional** ($49.99/mo — 2,000 msg), **Enterprise** ($99.99/mo — unlimited).',
                screenshotUrl: '/help-screenshots/account/addons-page.png'
            },
            {
                stepNumber: 2,
                title: 'Start Messaging',
                description: 'Once enabled, manage conversations from the **Communications** hub. Appointment reminders and follow-ups can be automated.',
                screenshotUrl: '/help-screenshots/communications/comms-hub-full.png',
                tip: 'You get a dedicated phone number. Professional tier adds automated follow-ups after job completion.'
            }
        ],
        lastUpdated: '2026-06-22',
        keywords: ['SMS', 'text', 'message', 'phone', 'communication']
    },
    {
        id: 'addon-ai-phone',
        title: 'AI Voice Agent',
        category: 'addons',
        content: `Let AI handle your phone calls 24/7 with Amy, your AI receptionist.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Select a Plan',
                description: 'In Add-ons, choose **AI Voice Agent**: **Starter** ($49.99/mo), **Professional** ($99.99/mo), or **Enterprise** ($199.99/mo).',
                screenshotUrl: '/help-screenshots/account/addons-page.png'
            },
            {
                stepNumber: 2,
                title: 'Customize Your Agent',
                description: 'Go to **AI Phone Agent** under the Business Profile section. Define call flows, human transfer numbers, and custom greetings.',
                screenshotUrl: '/help-screenshots/account/ai-voice-setup.png',
                tip: 'Amy handles scheduling, quote requests, and address verification. If she gets stuck, she gracefully hands off to your specified human transfer number.'
            }
        ],
        lastUpdated: '2026-06-22',
        keywords: ['AI', 'phone', 'agent', 'receptionist', 'call', 'answering', 'Amy', 'callback', 'email spelling', 'navigation', 'transfer', 'quote', 'address confirmation']
    },
    {
        id: 'addon-ai-admin',
        title: 'AI Voice Management Dashboard',
        category: 'addons',
        content: `Manage and troubleshoot your AI Voice Agent calls, transcripts, and data collection.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Open AI Voice Dashboard',
                description: 'Accessible to Site Admins under **Platform > AI Voice**. View real-time inbound call activity and call logs.',
                screenshotUrl: '/help-screenshots/account/ai-voice-dashboard.png'
            },
            {
                stepNumber: 2,
                title: 'Review Calls & Transcripts',
                description: 'Click any session in **Call History** to see the full transcript, AI-extracted data (name, address, intent), and summary notes.',
                screenshotUrl: '/help-screenshots/account/ai-voice-dashboard.png',
                tip: 'Instantly convert any call into a Job or Quote inquiry with one click directly from the session log.'
            }
        ],
        lastUpdated: '2026-06-22',
        keywords: ['admin', 'dashboard', 'voice', 'history', 'transcript', 'collection', 'confirmation', 'fallback', 'profile', 'template']
    },
    {
        id: 'addon-ai-quote-callbacks',
        title: 'AI Outbound Quote Callbacks',
        category: 'addons',
        content: `Streamline your quote approval process with LLM-powered natural voice conversations that automatically guide customers from quote details to appointment scheduling.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Enable Outbound Quote Callbacks',
                description: 'Go to Organization Settings (click your avatar → Organization Settings) and scroll to Active Modules. Make sure Invoicing & Estimates and the AI Voice Phone Agent are enabled. Enable the option to automatically initiate a voice callback when a quote is approved.',
                screenshotUrl: '/help-screenshots/account/org-settings.png',
                tip: 'You can choose email, text, or phone callbacks as the customer\'s preferred scheduling method.'
            },
            {
                stepNumber: 2,
                title: 'Queue Callbacks from the Quotes Panel',
                description: 'When viewing any pending quote draft in your Quotes List or Dashboard, select the "Voice Callback" delivery method and click send. This registers a pending callback in the queue.',
                screenshotUrl: '/help-screenshots/invoicing/quotes-page.png'
            },
            {
                stepNumber: 3,
                title: 'AI-Powered Natural Conversation',
                description: 'The system initiates the outbound call during customer business hours. Amy, the AI assistant (powered by Twilio ConversationRelay and Gemini 3.5 Flash), introduces herself and recites the quote details. She handles natural speech for approvals, changes, and email requests without rigid keyword requirements.',
                screenshotUrl: '/help-screenshots/getting-started/dashboard-overview.png',
                tip: 'If a connection is dropped, the system will queue a callback 5 minutes later to resume the conversation.'
            },
            {
                stepNumber: 4,
                title: 'Automated Booking & Handoff',
                description: 'If the customer approves the quote, Amy reads available slots from the technician\'s schedule, schedules the appointment upon confirmation, and triggers a confirmation SMS. Change requests are logged to the dispatcher dashboard, and human transfer is initiated if requested.',
                screenshotUrl: '/help-screenshots/getting-started/dashboard-overview.png'
            }
        ],
        lastUpdated: '2026-06-17',
        keywords: ['voice', 'callback', 'outbound', 'quote callback', 'schedule', 'approve', 'conversation relay', 'gemini']
    },

    // â”€â”€ Reports & Analytics â”€â”€
    {
        id: 'reports-overview',
        title: 'Reports Dashboard',
        category: 'reports',
        content: `Track revenue, technician performance, and job metrics with visual charts and exportable data.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Open Reports',
                description: 'Click **Reports** in the sidebar. The dashboard shows Revenue Summary, Technician Utilization, and Job Completion Rate charts.',
                screenshotUrl: '/help-screenshots/reports/reports-full.png'
            },
            {
                stepNumber: 2,
                title: 'Filter by Date Range',
                description: 'Use the date range picker to view any time period. Charts update in real time. Click **Export CSV** to download data for your accountant.',
                screenshotUrl: '/help-screenshots/reports/reports-full.png',
                tip: 'Schedule automated reports to be delivered to your email or phone — see the Scheduled Reports article for setup.'
            }
        ],
        lastUpdated: '2026-06-22',
        keywords: ['report', 'analytics', 'revenue', 'chart', 'data', 'export']
    },

    // â”€â”€ Account & Billing â”€â”€
    {
        id: 'acct-plans',
        title: 'Plans & Pricing',
        category: 'account',
        content: `Three plans to fit your business size — from solo tech to enterprise.`,
        steps: [
            {
                stepNumber: 1,
                title: 'View Available Plans',
                description: 'Go to **Organization Settings** (click your avatar → Organization Settings). Scroll to **Plan Management** to see: **Individual** (solo), **Small Business** (teams), and **Enterprise** (unlimited).',
                screenshotUrl: '/help-screenshots/account/org-settings-top.png'
            },
            {
                stepNumber: 2,
                title: 'Upgrade Anytime',
                description: 'Click **Upgrade** to move to a higher plan. Changes take effect immediately. Features like Dispatcher Console and Team Management unlock on Small Business and above.',
                screenshotUrl: '/help-screenshots/account/org-settings-top.png'
            }
        ],
        lastUpdated: '2026-06-22',
        keywords: ['plan', 'pricing', 'upgrade', 'subscription', 'tier']
    },
    {
        id: 'acct-org-settings',
        title: 'Organization Settings',
        category: 'account',
        content: `Your business hub — company info, branding, email signatures, tax rates, and active modules all in one place.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Open Settings',
                description: 'Click your avatar → **Organization Settings**, or click **Settings** in the sidebar. The top section shows Company Info (name, email prefix) and Branding (logo, colors, fonts).',
                screenshotUrl: '/help-screenshots/account/org-settings-top.png'
            },
            {
                stepNumber: 2,
                title: 'Configure Branding',
                description: 'Upload your **Company Logo** and **Hero Background** via drag & drop. Set primary/secondary colors, choose fonts, and add social links. Use the **Visual Signature Builder** for branded email signatures.',
                screenshotUrl: '/help-screenshots/account/org-settings-top.png'
            },
            {
                stepNumber: 3,
                title: 'Tax Rates & Modules',
                description: 'Scroll down to set **Location-Based Tax Rates** per state (auto-resolved from service address). Toggle **Active Modules** to enable/disable features like Invoicing, AI Voice, Inventory, etc.',
                screenshotUrl: '/help-screenshots/account/org-settings-modules.png',
                tip: 'Tax rates are auto-detected from the customer\'s service address. You can override per-jurisdiction or let the AI resolve it.'
            }
        ],
        lastUpdated: '2026-06-22',
        keywords: ['settings', 'organization', 'company', 'branding', 'configure', 'upload', 'logo', 'signature', 'email signature']
    },
    // â”€â”€ Purchasing & Vendors â”€â”€
    {
        id: 'po-workflow',
        title: 'Purchase Orders & Backlog Sourcing',
        category: 'inventory',
        content: `Manage purchasing and material deficits with split procurement queues and vendor web ordering.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Review the Backlog Pipeline',
                description: 'Go to **Purchase Orders**. The dashboard splits deficits into two queues: **Order Materials** (parts promised on approved quotes/jobs) and **Stock Materials** (items below warehouse minimums or tools needing replacement).',
                screenshotUrl: '/help-screenshots/inventory/purchase-orders-full.png'
            },
            {
                stepNumber: 2,
                title: 'Place Orders',
                description: 'Run independent manual or AI-assisted ordering for each queue. Vendors with web portals open an integrated browser helper with stored credentials and promo codes for fast placement.',
                screenshotUrl: '/help-screenshots/inventory/purchase-orders-full.png',
                tip: 'Split procurement keeps warehouse restocking separate from job-specific parts, so neither blocks the other.'
            }
        ],
        lastUpdated: '2026-06-22',
        keywords: ['purchase orders', 'PO', 'vendor', 'shopping cart', 'buy', 'parts', 'deficit', 'stock backlog', 'job materials']
    },
    {
        id: 'vendor-ai-sourcing',
        title: 'AI Procurement & Auto-Sourcing Strategies',
        category: 'inventory',
        content: `Let AI optimize your purchasing across vendors based on cost, speed, quality, or preference.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Choose a Strategy',
                description: 'On the backlog panel, select your optimization strategy: **Optimal Priority** (balanced), **Lowest Cost**, **Fastest Shipping**, **Highest Quality**, or **Preferred Vendor**.',
                screenshotUrl: '/help-screenshots/inventory/purchase-orders-full.png'
            },
            {
                stepNumber: 2,
                title: 'Run AI Auto-Sourcing',
                description: 'Click **"Run AI Auto-Sourcing Agent"**. The AI evaluates every item in both queues, splits them into optimized multi-vendor purchase orders, and logs real-time progress.',
                screenshotUrl: '/help-screenshots/inventory/purchase-orders-full.png',
                tip: 'Each strategy card shows a live preview of how orders would be split before you commit.'
            }
        ],
        lastUpdated: '2026-06-22',
        keywords: ['AI', 'vendor', 'price', 'sourcing', 'cost', 'savings', 'criteria', 'strategy', 'optimization', 'split order']
    },
    {
        id: 'inventory-locations',
        title: 'Inventory Locations (Trucks & Warehouses)',
        category: 'inventory',
        content: `Track exactly where your materials and tools are:\n\n1. In the **Materials** or **Tools** tab, you'll see a **Location** column.\n2. Use the location tabs at the top to filter between "Warehouse A", "Van 1", etc.\n3. **Transfers:** Easily select items and transfer them from a Main Warehouse to a specific Technician's Van.\n4. This ensures your techs never arrive on-site missing a critical part.`,
        lastUpdated: '2026-04-03',
        keywords: ['locations', 'warehouse', 'van', 'truck', 'transfer']
    },
    // Ã¢â€â‚¬Ã¢â€â‚¬ Advanced Billing Ã¢â€â‚¬Ã¢â€â‚¬
    {
        id: 'batch-invoicing',
        title: 'Batch Invoicing & Editing',
        category: 'invoicing',
        content: `Speed up your billing workflow and handle disputes:\n\n**Batch Invoicing:**\n1. Go to **Jobs** and filter by "Completed" status.\n2. Select multiple jobs using the checkboxes.\n3. Click **"Batch Invoice"** to instantly generate individual invoices for all selected jobs.\n\n**Unlock & Edit Invoices:**\n1. If a customer disputes a sent invoice, open it and click **"Unlock to Edit"**.\n2. Add a discount line item or modify charges.\n3. Click **"Save and Resend"** to update their Customer Portal view.`,
        lastUpdated: '2026-04-03',
        keywords: ['batch', 'invoice', 'multiple', 'edit', 'unlock', 'dispute']
    },
    {
        id: 'terms-conditions-rulesets',
        title: 'Terms & Conditions Rule Sets',
        category: 'invoicing',
        content: `DispatchBox includes a powerful, jurisdiction-aware Terms & Conditions engine that automatically generates legally compliant terms for every quote, customizable section-by-section per jurisdiction.\n\n**How It Works:**\n- Every quote includes auto-generated T&C based on the customer's jurisdiction (state/country)\n- System defaults cover all 50 US states, DC, US territories, and Germany (international)\n- Each jurisdiction gets state-specific legal notices (licensing boards, consumer protection statutes, right-to-cancel rules, mechanics lien notices)\n- Dispute resolution and governing law automatically reference the correct jurisdiction Ã¢â‚¬â€ not hardcoded\n\n**Automatic Jurisdiction Detection:**\nThe system automatically detects the correct jurisdiction from the customer's address across ALL intake channels:\n- **Web Portal / Email Intake** Ã¢â‚¬â€ extracted from the service address the customer submits\n- **Phone Calls (AI Voice)** Ã¢â‚¬â€ extracted from the address collected during the call\n- **SMS / Text Messages** Ã¢â‚¬â€ pulled from the existing customer record if they are a known customer\n- **Manual Quote Creation** Ã¢â‚¬â€ auto-detected from the customer's address on file when creating a quote; can be overridden in the jurisdiction dropdown\n- **AI Auto-Quote** Ã¢â‚¬â€ extracted from the job address, falls back to org service area settings\nIf no address is available, the system falls back to the organization's primary service area.\n\n**Smart Caching (Cost Savings):**\nThe generic jurisdiction defaults are **cached in Firestore** the first time they are used for any jurisdiction. This means:\n- The first customer in a jurisdiction triggers a one-time computation and save\n- Every subsequent customer in the same area uses the cached version instantly Ã¢â‚¬â€ no regeneration needed\n- This saves significant AI/compute costs across all SaaS customers\n- Org-specific customizations are stored separately and never affect the shared cache\n- If platform terms are updated, the cache is automatically refreshed\n\n**Configuring Rule Sets (Organization Settings Ã¢â€ ’ Legal & Terms):**\n\n***Global Defaults:***\n- **Company Legal Name** Ã¢â‚¬â€ Used in liability and indemnification clauses\n- **Arbitration Venue** Ã¢â‚¬â€ Override the default dispute resolution location\n- **Warranty Period** Ã¢â‚¬â€ Default workmanship warranty (days)\n- **Quote Validity** Ã¢â‚¬â€ How many days quotes remain valid\n- **Cancellation Notice** Ã¢â‚¬â€ Required advance notice for cancellations (hours)\n- **Dispute Resolution Period** Ã¢â‚¬â€ Days for good-faith negotiation before arbitration\n\n***Jurisdiction Rule Sets:***\n1. Select a jurisdiction from the dropdown (all 50 states + Germany)\n2. Each jurisdiction shows 6 expandable term sections: **Payment**, **Scope of Work**, **Warranty**, **Liability & Indemnification**, **General Provisions**, **Jurisdiction-Specific Notices**\n3. For each section you can:\n   - **Use System Defaults** Ã¢â‚¬â€ zero-config, legally researched baseline\n   - **Customize** Ã¢â‚¬â€ modify, add, or remove individual clauses\n   - **Disable** Ã¢â‚¬â€ completely hide the section from quotes\n   - **Reset** Ã¢â‚¬â€ revert all changes back to system defaults\n\n***Customization Options:***\n- **Uncheck a term** Ã¢â‚¬â€ removes that specific clause from quotes in this jurisdiction\n- **Add Custom Clauses** Ã¢â‚¬â€ your clauses appear after the system defaults\n- **Preview Terms** Ã¢â‚¬â€ see exactly how the merged terms will render on a quote\n\n**Override Precedence:**\n1. Jurisdiction-specific override (highest priority)\n2. Global override\n3. System default / cached baseline (lowest)\n\n**International Support:**\nGermany (DE) terms include bilingual German/English text with BGB contract law, Widerrufsrecht (14-day right of withdrawal), GewÃƒÂ¤hrleistung (statutory warranty), Handwerkskammer registration, and GDPR/DSGVO data protection notices.\n\n**Q: Do I need to configure anything for T&C to work?**\n**A:** No Ã¢â‚¬â€ system defaults provide comprehensive coverage out of the box. Only customize if you need specific changes for your business.\n\n**Q: Are my customizations shared with other businesses?**\n**A:** No Ã¢â‚¬â€ only the generic system defaults are shared (cached). Your org's customizations are private and stored separately.\n\n**Q: How does the system know which state my customer is in?**\n**A:** It extracts the state from the customer's service address (e.g., "123 Main St, Honolulu, HI 96815" Ã¢â€ ’ Hawaii). This works for all channels: web form, email, phone, and SMS. You can always override the jurisdiction manually when creating a quote.\n\n**Q: What happens if I select the wrong jurisdiction on a quote?**\n**A:** You can change the jurisdiction on the quote creation page. The system auto-detects from the customer's address when possible.`,
        lastUpdated: new Date().toISOString().split('T')[0],
        keywords: ['terms', 'conditions', 'legal', 'jurisdiction', 'state', 'warranty', 'liability', 'arbitration', 'rule set', 'customize', 'override', 'germany', 'international', 'consumer protection', 'licensing', 'cache', 'shared', 'auto-detect', 'address']
    },
    {
        id: 'quote-activity-timeline',
        title: 'Quote Activity Timeline & Approve-and-Pay',
        category: 'invoicing',
        content: `Every quote includes a **Quote Activity Timeline** Ã¢â‚¬â€ a color-coded, expandable history of every interaction from creation to payment.\n\n**Quotes Dashboard Ã¢â‚¬â€ Expandable Timeline:**\nThe main Quotes page now shows an inline communication summary for each quote:\n- Each quote row displays a **one-line summary** of the latest interaction (e.g., "Customer requested changes", "Waiting for customer response")\n- A **message count badge** shows how many communications have occurred\n- Click the **Ã¢—Â¼ chevron** on any quote to expand its full communication timeline inline Ã¢â‚¬â€ no need to navigate away\n- **Expand all / Collapse all** controls let you view all timelines at once\n- Quotes needing review (tech_review) **auto-expand** so you see the customer's message immediately\n- Chat-style bubbles show customer messages (blue, right-aligned) and tech replies (white, left-aligned)\n- Status transitions appear as centered pills with "Waiting forÃ¢â‚¬Â¦" indicators\n\n**Saving a Quote:**\nWhen you save a quote as a **draft**, you stay on the Quotes dashboard and can see your saved quote immediately. When you **send** a quote, you're taken to the quote detail view.\n\n**Timeline Events (color-coded):**\n- Ã°Å¸â€œâ€ž **Quote Created** (gray) Ã¢â‚¬â€ when the quote was first generated\n- Ã¢Å“â€°Ã¯Â¸Â **Quote Sent** (blue) Ã¢â‚¬â€ when emailed/shared with the customer\n- Ã°Å¸â€˜Â **Quote Viewed** (purple) Ã¢â‚¬â€ when the customer first opened the link\n- Ã°Å¸’Â¬ **Customer Message** (blue bubble, right-aligned) Ã¢â‚¬â€ customer's change requests or questions\n- Ã°Å¸’Â¬ **Tech Reply** (amber bubble, left-aligned) Ã¢â‚¬â€ technician's responses\n- Ã¢Å“ÂÃ¯Â¸Â **Quote Revised** (amber) Ã¢â‚¬â€ when the quote was updated and re-sent\n- Ã¢Å¡â„¢Ã¯Â¸Â **Status Change** (gray pill, centered) Ã¢â‚¬â€ workflow state transitions\n- Ã¢Å“â€¦ **Quote Approved** (green) Ã¢â‚¬â€ with signer name\n- Ã¢ÂÅ’ **Quote Declined** (red) Ã¢â‚¬â€ with reason\n- Ã°Å¸’Â³ **Deposit Paid** (emerald) Ã¢â‚¬â€ payment confirmation\n\n**Step-by-Step Price History:**\n- **Active Price Badges** Ã¢â‚¬â€ Each event header displays the active quote total at that specific step.\n- **Revision Tracking** Ã¢â‚¬â€ Quote revisions explicitly list the pricing transition (e.g., "Version 1 ($100.00) Ã¢Å¾â€ Version 2 ($125.00)") so the history of changes is clear.\n\n**Customer Portal Access & Tech Notes Privacy:**\n- Customers can view the timeline from their portal, but **internal technician messages** (such as internal technician notes and tech chat messages) are automatically filtered out. Customers only see system updates, customer notes, and the pricing history.\n\n**Approve & Pay (Inline Deposit):**\nWhen a quote requires a deposit, customers see a prominent **"Approve & Pay $X.XX Deposit"** button that:\n1. Approves the quote (saves signature and agreement)\n2. Immediately redirects to Stripe's secure checkout for the deposit amount\n3. Returns to the quote showing both approval and payment confirmation\n\nCustomers can also choose **"Approve Only (pay later)"** to approve without paying immediately Ã¢â‚¬â€ the deposit CTA will appear on the quote page.\n\n**Customer Scheduling & Portal Time Slot Selection:**\nWhen approving a quote, customers choose how they prefer to be contacted for scheduling: **Email me**, **Call me** (triggers AI Voice callback), or **Text me** (sends SMS schedule options).\n\nOnce approved (and any required deposit is collected), the customer is prompted directly on the portal to pick **2 to 3 preferred dates & time windows** (Morning, Afternoon, Evening) for the work:\n- **Urgent Jobs** (High/Critical priority): Standard 3-day buffer is bypassed, allowing selection starting the next day.\n- **Standard Jobs**: Enforces a minimum 3-day buffer for scheduling preparation.\nThese choices sync instantly to both the quote and the linked job for the dispatcher to schedule.\n\n**For Technicians/Dispatchers:**\nThe timeline is also visible from the internal quote view, showing who sent what and when. When a customer requests changes, the tech review panel appears above the timeline with quick-reply and revise options.`,
        lastUpdated: '2026-06-05',
        keywords: ['quote', 'timeline', 'activity', 'history', 'approve', 'pay', 'deposit', 'workflow', 'communication', 'message', 'reply', 'revised', 'status', 'stripe', 'expand', 'collapse', 'dashboard', 'save', 'scheduling', 'preferences', 'appointment slots', 'calendar', 'customer choice', 'price history', 'privacy', 'internal notes']
    },
    {
        id: 'customer-rate-cards',
        title: 'Customer Rate Cards',
        category: 'customers',
        content: `Offer VIP pricing to specific clients or commercial accounts:\n\n1. Open a customer's profile in the CRM.\n2. Navigate to the **Pricing Details** or **Rate Card** section.\n3. Set a specific **Hourly Labor Rate** or a flat **Material Discount** just for them.\n4. Whenever a job is booked for this customer, invoices and quotes will automatically pull via their negotiated Rate Card instead of your standard prices.`,
        lastUpdated: '2026-04-03',
        keywords: ['rate card', 'discount', 'VIP', 'commercial', 'hourly', 'pricing']
    },
    // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Team Management ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
    {
        id: 'tech-resume-parsing',
        title: 'AI Resume Parsing for Technicians',
        category: 'getting-started',
        content: `Onboard new technicians in seconds:\n\n1. Go to the **Technicians** management page.\n2. Click the **Upload Resume** icon (magic sparkle).\n3. Upload a PDF or Word document of their resume.\n4. DispatchBox AI will analyze their work history and auto-generate their Profile, pre-populating their **Skills**, Certifications, and Experience level.\n5. This directly feeds into smart-dispatching!`,
        lastUpdated: '2026-04-03',
        keywords: ['resume', 'CV', 'tech', 'technician', 'hire', 'skills', 'AI']
    },
    // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Website & Portal Builder ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
    {
        id: 'website-builder',
        title: 'Website & Portal Builder',
        category: 'addons',
        content: `Transform your Customer Portal into a fully branded Website:\n\n**Share Your Portal**\nAt the top of the Branding tab you'll find your Customer Portal URL and Service Email with one-click copy buttons.\n\n**Logos & Imagery**\n- Upload your **Company Logo** and **Hero Background Image** via drag & drop.\n\n**Colors & Typography**\n- **10 Quick Theme presets** (Ocean, Sunset, Forest, Royal, etc.)\n- **3 color pickers**: Primary, Secondary, and Accent\n- **10 font families**: Inter, Poppins, Montserrat, Playfair Display, and more\n\n**Button & Layout**\n- Button Style: Rounded, Pill, or Square\n- Custom Button Text, Header Subtitle, and Business Tagline\n\n**Full-Screen Website Builder**\nClick **"Launch Website Builder"** to open a full-screen editor with a 3-step flow:\n\n***Step 1 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Choose Your Theme:***\nPick from 6 visual website themes that control how your site looks:\n- **Classic Business** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Clean, centered layout with bordered cards\n- **Modern Dark** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Bold dark hero with frosted glass cards\n- **Bold & Colorful** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Split hero with vivid color accents\n- **Clean Minimal** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Spacious white design with flat cards\n- **Warm & Personal** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Serif headings with warm tones\n- **Professional Edge** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Compact, data-driven dark header\n\nEach theme shows a live mini-preview using your brand color. Themes are non-destructive ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â changing your theme only changes the visual style, never your content.\n\n***Step 2 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Choose Your Pages:***\nSelect which content groups to include on your website:\n- **Home** (Hero, About, CTA) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â always included\n- **Services** (Service listings, Stats)\n- **Portfolio** (Gallery, Before & After)\n- **Trust & Reviews** (Testimonials, Certifications)\n- **Info & FAQ** (FAQ, Hours, Service Areas)\n- **Team** (Team member profiles)\n\nPage groups are additive ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â sections from selected groups are created without overwriting anything that already exists.\n\n***Step 3 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Edit Sections:***\nThe main editor features:\n- **Grouped sidebar** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Sections organized by page group with collapsible headers\n- **Section editor** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Full editing panel for titles, descriptions, and sub-items\n- **Section ideas** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â 14 quick-add section suggestions with descriptions\n- **Reorder, toggle, delete** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Use the sidebar controls on hover\n\n**Public Portal Design**\nThe portal is designed as a lead-generation landing page:\n- **Hero + Booking Form** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â The service request form sits prominently beside the hero text on desktop (stacked on mobile). Customers can immediately submit a request.\n- **Trust Signals** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â "Licensed & Insured" and "Free Estimates" badges appear below the hero.\n- **Call Now Button** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â One-tap calling from the hero area and header.\n- **CTA Strip** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â A gradient call-to-action strip at the bottom with "Request Service Now" and direct phone buttons that scroll back to the form.\n- **Dark Mode Header** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â The header automatically matches the theme color mode (dark themes get a dark glass header).\n\nYour active theme badge appears in both the builder top bar and the compact summary on the Branding tab.\n\nYour public website is live at **/p/your-org-slug**.`,
        lastUpdated: '2026-04-14',
        keywords: ['website', 'builder', 'portal', 'layout', 'theme', 'classic', 'bold', 'minimal', 'modern', 'dark', 'warm', 'professional', 'section', 'about', 'services', 'gallery', 'faq', 'testimonials', 'cta', 'team', 'hours', 'certifications', 'stats', 'pages', 'ideas', 'page groups', 'booking form', 'request service', 'lead generation']
    },
    {
        id: 'addons-integrations',
        title: 'Ticketing System Integrations',
        category: 'addons',
        content: `Connect your existing helpdesk or ITSM platform to pull tickets directly into DispatchBox.\n\n**Supported Platforms:**\n- ServiceNow (Incidents & Service Requests)\n- Salesforce Service Cloud (Cases)\n- Zendesk Support (Tickets)\n- Jira Service Management (Issues)\n- Freshdesk (Tickets)\n- HubSpot Service Hub (Tickets)\n- ConnectWise Manage (Service Tickets)\n\n**How to Connect:**\n1. Go to **Communications Hub** ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ **Integrations** tab.\n2. Click a platform card to start the setup.\n3. Enter your connection credentials (Instance URL, API Key, etc.).\n4. Click **Test Connection** to verify.\n5. Configure **Sync Criteria** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â choose which tickets to pull by category, priority, status, or assignment group.\n6. Set a **Sync Frequency** (real-time, every 5/15/30 min, or hourly).\n7. Click **Connect & Import Tickets**.\n\n**Managing Imported Tickets:**\n- Imported tickets appear in the Imported Tickets panel with source badge, priority, and requester info.\n- Click **Convert to Job** to create a DispatchBox job from any ticket ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â customer info and description are auto-filled.\n- Use the source filter dropdown to view tickets from a specific platform.\n- Tickets that have been converted show a green "Job Created" badge with a link to the job.\n\n**Tips:**\n- Use narrow sync criteria (specific categories + high priorities) to avoid importing noise.\n- The "Test Connection" button verifies credentials before saving.\n- You can pause/resume any integration using the toggle switch.\n- Removing an integration keeps previously imported tickets for audit purposes.`,
        lastUpdated: '2026-04-14',
        keywords: ['integration', 'servicenow', 'salesforce', 'zendesk', 'jira', 'freshdesk', 'hubspot', 'connectwise', 'ticket', 'sync', 'import', 'ITSM', 'helpdesk', 'connect']
    },
    // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Communications Hub ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
    {
        id: 'comms-hub',
        title: 'Communications Hub & Inbox',
        category: 'communications',
        content: `The Communications Hub is your central nerve center for all customer interactions Ã¢â‚¬â€ portal forms, phone calls, emails, and integration tickets in one unified inbox.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Open the Communications Hub',
                description: 'Click "Communications" in the sidebar under the Comms section. The Inbox tab loads by default, showing a real-time unified feed of all incoming customer requests from every channel: Portal Forms, Phone Calls, Emails, and Integration Tickets.',
                screenshotUrl: '/help-screenshots/communications/comms-hub-inbox.png'
            },
            {
                stepNumber: 2,
                title: 'Enable AI Auto-Quote Generation',
                description: 'Go to the Overview tab and find the AI Auto-Quote Generation card. Toggle it ON. Now when customers submit portal requests, DispatchBox automatically creates a job, runs AI analysis, and generates a complete draft quote with labor, materials, equipment, and travel costs.',
                screenshotUrl: '/help-screenshots/communications/comms-hub-inbox.png',
                tip: 'AI auto-quoting is OFF by default. When enabled, portal submissions take ~15-20 seconds as the AI analysis runs in the background.'
            },
            {
                stepNumber: 3,
                title: 'Review AI-Generated Quotes',
                description: 'When a quote is ready, click the "Review AI Quote" button on the inquiry card. An inline panel expands showing: AI Diagnosis, Recommended Resolution, Safety Notes, Tools Required, and a full editable cost breakdown with Labor, Materials, Equipment, and Travel categories.',
                screenshotUrl: '/help-screenshots/communications/comms-hub-inbox.png'
            },
            {
                stepNumber: 4,
                title: 'Edit and Send Quotes',
                description: 'Edit any line item inline by hovering to reveal Edit and Delete buttons. Use the add buttons for Labor, Material, Tool, and Travel to add new items. Click Send Quote to Customer to email it with a branded checkout link, or use Full Quote Editor for advanced editing.',
                screenshotUrl: '/help-screenshots/communications/comms-hub-inbox.png',
                tip: 'If no auto-quote exists yet, click Generate AI Recommendation to create one on the fly.'
            },
            {
                stepNumber: 5,
                title: 'Explore Other Tabs',
                description: 'Beyond the Inbox, the Communications Hub has: Overview (dashboard cards, AI toggle), Integrations (ServiceNow, Salesforce, Zendesk, etc.), Email and Phone (configure contact info), and Portal (toggle your public customer portal).',
                screenshotUrl: '/help-screenshots/communications/comms-hub-inbox.png'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['communications', 'hub', 'inbox', 'unified', 'portal', 'phone', 'email', 'ticket', 'inquiry', 'dispatcher', 'create job', 'quote', 'ai quote', 'auto quote', 'comms', 'estimate', 'review', 'edit', 'auto-generate', 'draft', 'toggle', 'send quote', 'line items', 'editable']
    },
    // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Smart Email Triage ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
    {
        id: 'email-triage',
        title: 'Smart Inbound Email Triage',
        category: 'communications',
        content: `DispatchBox automatically processes inbound emails and intelligently routes them into the right workflow based on sender recognition.`,
        steps: [
            {
                stepNumber: 1,
                title: 'How Smart Triage Works',
                description: 'When someone emails your service address (e.g., acmeplumbing@dispatch-box.com), DispatchBox AI analyzes the email and classifies it into one of three lanes: Trusted Customer (auto-create ticket), Unknown Sender (send intake form), or Spam (silently discard).',
                screenshotUrl: '/help-screenshots/communications/email-inbox.png'
            },
            {
                stepNumber: 2,
                title: 'Trusted Customers Get Auto-Created Tickets',
                description: 'If the sender is a known customer in your system, a support ticket is created automatically with AI-extracted details (issue description, urgency, suggested fixes). If Auto-Quote is enabled, a Job and AI Quote are also generated instantly.',
                screenshotUrl: '/help-screenshots/communications/email-inbox.png',
                tip: 'Add known customers to your Contacts directory so they are auto-recognized and get the fast-track treatment.'
            },
            {
                stepNumber: 3,
                title: 'Unknown Senders Get an Intake Form',
                description: 'Unrecognized senders receive a branded email with a secure link to a short intake form. The form pre-fills AI-parsed data so they just confirm their name, phone, and address. The link expires after 48 hours.',
                screenshotUrl: '/help-screenshots/communications/email-inbox.png'
            },
            {
                stepNumber: 4,
                title: 'Configure Triage Settings',
                description: 'In Organization Settings > Email Settings, configure: Triage Mode (SMART or ALWAYS_CREATE), Forward Inbound Emails (to your personal inbox), Reply-As Proxy (send replies from your dispatch-box address), Auto-Quote on Email, and Spam Filter toggle.',
                screenshotUrl: '/help-screenshots/account/org-settings.png',
                tip: 'Reply-As Proxy works with any email client (Gmail, Outlook, Apple Mail) Ã¢â‚¬â€ customers never see your personal email address.'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['email', 'triage', 'inbound', 'smart', 'intake', 'form', 'spam', 'filter', 'unknown', 'trusted', 'auto-create', 'ticket', 'AI', 'forwarding', 'forward', 'reply', 'proxy']
    },
    {
        id: 'email-batch-actions',
        title: 'Multi-Select & Batch Email Actions',
        category: 'communications',
        content: `Manage your team inbox efficiently with powerful multi-select and batch operation tools.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Select Multiple Emails',
                description: 'Hover over any email row to see the selection checkbox on the far left. Click to select individual emails, or use the master checkbox at the top to select all visible emails matching your current folder and mailbox filter.',
                screenshotUrl: '/help-screenshots/communications/email-inbox.png'
            },
            {
                stepNumber: 2,
                title: 'Use the Batch Actions Bar',
                description: 'When emails are selected, the folder path header transitions into a contextual actions bar showing: Selected Count, Archive/Unarchive, Trash/Delete, and Mark as Read/Unread. All operations apply to every selected email at once.',
                screenshotUrl: '/help-screenshots/communications/email-inbox.png',
                tip: 'Selections automatically clear when you switch folders to prevent accidental batch operations on hidden messages.'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['email', 'multi-select', 'select all', 'batch', 'trash', 'delete', 'archive', 'read', 'unread', 'inbox', 'folder', 'actions bar']
    },
    // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Inbound Voice & SMS Pipeline ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
    {
        id: 'inbound-voice-sms',
        title: 'Inbound Calls & Text Messages',
        category: 'communications',
        content: `When customers call or text your dedicated business number, DispatchBox automatically processes the interaction and creates actionable tickets.`,
        steps: [
            {
                stepNumber: 1,
                title: 'How Voice Calls Work',
                description: 'When a customer calls your provisioned number, the AI Phone Agent (Amy) answers and conducts a natural, multi-turn conversation. Amy collects: caller name, service address, issue description, urgency level, and preferred availability Ã¢â‚¬â€ then creates a ticket and job with structured data.',
                screenshotUrl: '/help-screenshots/communications/ai-voice-agent.png'
            },
            {
                stepNumber: 2,
                title: 'Talk to a Human (Call Transfer)',
                description: 'If a caller wants to speak with a real person, Amy can transfer them instantly. Enable this in Communications Hub > Overview > Talk to a Human toggle. Enter your forward number (dispatcher, office manager, or on-call tech). When disabled, callers who request a person are offered voicemail.',
                screenshotUrl: '/help-screenshots/communications/ai-voice-agent.png',
                tip: 'Amy offers the transfer option in her greeting: "or speak with someone directly." If a caller says "I want to talk to a person" at any point, Amy connects them.'
            },
            {
                stepNumber: 3,
                title: 'How Text Messages (SMS) Work',
                description: 'When a customer texts your number, DispatchBox analyzes the message intent (new ticket, status check, or cancellation). For new service requests, a ticket and job are created automatically. The customer receives an instant reply confirming their ticket number.',
                screenshotUrl: '/help-screenshots/communications/comms-hub-inbox.png'
            },
            {
                stepNumber: 4,
                title: 'A2P 10DLC Compliance',
                description: 'When you provision a new phone number, DispatchBox automatically creates a Twilio Messaging Service, registers an A2P Brand and Campaign for carrier-compliant texting. Carrier approval typically takes 2-3 weeks. A daily background job monitors status automatically.',
                tip: 'Each provisioned phone number is linked to your organization. Tickets and jobs are scoped accordingly, and replies come from your own number.'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['voice', 'call', 'SMS', 'text', 'inbound', 'phone', 'AI', 'ticket', 'job', 'intake', 'A2P', '10DLC', 'compliance', 'multi-turn', 'Amy', 'transfer', 'human', 'forward']
    },
    // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ AI Outbound Callback & Scheduling ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
    {
        id: 'ai-outbound-callback',
        title: 'AI Outbound Callback & Scheduling',
        category: 'communications',
        content: `After a quote is generated, DispatchBox can automatically call the customer back to share the quote, secure approval, and schedule the appointment Ã¢â‚¬â€ all in one AI-powered call.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Trigger a Callback',
                description: 'After reviewing a quote, click "Send Quote to Customer" with Voice selected. The customer is added to the callback queue. DispatchBox calls during local business hours (8 AM - 6 PM). Amy starts with an availability check before presenting details.',
                screenshotUrl: '/help-screenshots/communications/ai-voice-agent.png'
            },
            {
                stepNumber: 2,
                title: 'Quote Presentation by Amy',
                description: 'Amy reads the quote using your configured Presentation Mode: Single Price Summary, Roll-up by Category, or Detailed Line Items. The customer can approve, request details, ask for text/email delivery, or request a human callback.',
                screenshotUrl: '/help-screenshots/communications/ai-voice-agent.png',
                tip: 'Asking for quote details does NOT approve the quote Ã¢â‚¬â€ the customer must explicitly say "approve" or "go ahead" to confirm.'
            },
            {
                stepNumber: 3,
                title: 'Customer-Driven Scheduling',
                description: 'After approval, Amy asks "What day of the week works best for you?" The customer picks their preferred day, and Amy checks the assigned technician s actual schedule for matching availability. Amy always confirms: "Just to confirm, I have you down for [day/time]. Is that correct?"',
                screenshotUrl: '/help-screenshots/communications/ai-voice-agent.png'
            },
            {
                stepNumber: 4,
                title: 'SMS Fallback',
                description: 'If the customer does not answer or respond, an SMS with the quote review link is sent automatically. They can approve directly from their phone. Choose between Full Callback, Schedule Only, or No Callback modes.',
                tip: 'All call sessions are logged with full transcripts. Dispatchers can see callback status on the job detail view.'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['outbound', 'callback', 'scheduling', 'appointment', 'time slot', 'AI', 'phone', 'auto', 'quote', 'approved', 'SMS', 'fallback', 'technician', 'schedule', 'callback mode', 'customer driven', 'Amy']
    },
    // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Quote Inquiry Workflow ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
    {
        id: 'quote-inquiry-workflow',
        title: 'Quote Inquiry Workflow',
        category: 'communications',
        content: `When a customer contacts you specifically for a quote (via phone, email, or portal), DispatchBox creates a Quote Inquiry instead of a standard Service Job.`,
        steps: [
            {
                stepNumber: 1,
                title: 'How Quote Inquiries Differ',
                description: 'The AI Voice Agent or Smart Triage identifies the intent as a Quote Request. A blue "Quote Inquiry" badge distinguishes it from standard Service Requests in the Communications Hub. The AI collects the issue and address but skips asking for availability since the quote must be approved first.',
                screenshotUrl: '/help-screenshots/communications/comms-hub-inbox.png'
            },
            {
                stepNumber: 2,
                title: 'Review and Send the Quote',
                description: 'If AI Auto-Quote is enabled, a draft quote is generated directly on the inquiry. Click "Review AI Quote" to open the inline panel. Edit the materials and labor, then click "Send Quote to Customer." You can also check "Queue AI Voice Callback" to have Amy follow up proactively.',
                screenshotUrl: '/help-screenshots/communications/comms-hub-inbox.png',
                tip: 'The callback queue schedules Amy to call during the customer s time zone business hours to secure the booking.'
            },
            {
                stepNumber: 3,
                title: 'Convert Quotes to Jobs',
                description: 'Once a quote is approved by the customer (or if you decide to proceed manually), click "Create Job" from the inquiry. The system converts the inquiry to a scheduled job and links the existing quote, preserving all history.',
                screenshotUrl: '/help-screenshots/communications/comms-hub-inbox.png'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['quote', 'inquiry', 'workflow', 'intent', 'AI', 'callback', 'convert', 'job', 'quote request']
    },
    // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Job Completion & Auto-Invoice ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
    {
        id: 'job-completion-auto-invoice',
        title: 'Job Completion & Automatic Invoice',
        category: 'invoicing',
        content: `When you complete a job using the **Job Completion Wizard**, DispatchBox now automatically generates a **draft invoice** from the finalized costs.\n\n**How It Works**\n1. Open a job and click **"Complete Job"** to launch the wizard.\n2. Walk through the steps: scan or select parts used, capture customer signature, add final notes.\n3. When you click **"Complete & Submit"**, the system:\n   - Marks the job as completed\n   - Deducts parts from your inventory\n   - Logs all inventory transactions\n   - **Automatically creates a Draft Invoice** with all line items\n\n**What Goes on the Invoice**\nThe auto-generated invoice includes:\n- **Parts** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Each part used, priced at the customer-facing unit price (or cost if no price set)\n- **Labor** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Hours worked at the tracked hourly rate\n- **Mileage** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Travel charges if mileage was logged on the job\n- **Other Charges** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Any additional fees recorded in the job cost tracker\n\n**After Completion**\n- The invoice is created as **"Draft"** status ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â you can review and adjust before sending.\n- The job's detail page shows a linked invoice ID for easy navigation.\n- Navigate to **Invoices** to review, edit, and send the draft to your customer.\n\n**If no billable items exist** (e.g., a free warranty visit), no invoice is created ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â the job simply completes.\n\n**Tips:**\n- Set customer-facing prices (unitPrice) on your materials for accurate invoicing\n- Track labor hours during the job using the Cost Tracker tab for automatic labor line items\n- The invoice links back to the source job for complete audit trail`,
        lastUpdated: '2026-04-27',
        keywords: ['job', 'complete', 'finish', 'invoice', 'auto', 'automatic', 'draft', 'wizard', 'parts', 'labor', 'mileage', 'cost', 'billing', 'inventory']
    },
    // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Scheduled Reports ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
    {
        id: 'scheduled-reports',
        title: 'Scheduled Reports',
        category: 'reports',
        content: `Automate report delivery to your email or phone on a daily, weekly, or monthly schedule.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Create a Schedule',
                description: 'Go to **Reports** in the sidebar. Click **"Schedule Report"**. Choose from 11 report types (Revenue Trend, Tech Utilization, Job Pipeline, Invoice Aging, and more).',
                screenshotUrl: '/help-screenshots/reports/reports-full.png'
            },
            {
                stepNumber: 2,
                title: 'Set Delivery & Format',
                description: 'Choose **Email** (attached file) or **SMS** (7-day download link). Pick a format: **CSV**, **Excel**, or **PDF**. Set frequency: Daily, Weekly, or Monthly.',
                screenshotUrl: '/help-screenshots/reports/reports-full.png',
                tip: 'Reports check every 15 minutes if they are due. You can schedule multiple runs per day (e.g., 8 AM and 5 PM). Pause/resume without deleting.'
            }
        ],
        lastUpdated: '2026-04-27',
        keywords: ['report', 'schedule', 'automated', 'email', 'SMS', 'revenue', 'utilization', 'pipeline', 'aging', 'profitability', 'quote conversion', 'customer leaderboard', 'inventory alerts', 'CSV', 'Excel', 'PDF', 'daily', 'weekly', 'monthly']
    },
    // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ AI Voice Receptionist ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
    {
        id: 'ai-voice-receptionist',
        title: 'AI Voice Receptionist (Amy)',
        category: 'addons',
        content: `Amy is your 24/7 AI phone receptionist. She answers calls, collects customer details, and creates jobs and quotes automatically.`,
        steps: [
            {
                stepNumber: 1,
                title: 'How Amy Handles Calls',
                description: 'A customer calls your DispatchBox number. Amy greets them by your company name, then collects: **Name**, **Issue**, **Service Address**, **Contact Preference**, and **Availability** — one question at a time.',
                screenshotUrl: '/help-screenshots/communications/comms-hub-full.png'
            },
            {
                stepNumber: 2,
                title: 'Smart Recognition & Recap',
                description: 'If the caller\'s number matches a customer, Amy greets them by name and uses the address on file. She mandatorily recaps all details before ending the call.',
                screenshotUrl: '/help-screenshots/communications/comms-hub-full.png',
                tip: 'Amy auto-creates a support ticket, job, and AI quote after each call. If disconnected, she calls back in 5 minutes and picks up where she left off.'
            }
        ],
        lastUpdated: new Date().toISOString().split('T')[0],
        keywords: ['voice', 'phone', 'call', 'AI', 'Amy', 'receptionist', 'inbound', 'callback', 'retry', 'ticket', 'speech', 'greeting', 'forwarding', 'voicemail', 'knowledge', 'learning', 'training', 'FAQ', 'questions', 'address', 'required', 'fast', 'response', 'recap']
    },
    {
        id: 'ai-voice-management',
        title: 'Platform AI Voice Management',
        category: 'addons',
        content: `Site Administrators can centrally manage AI Voice settings and review call data across all tenants.\n\n**Voice Profiles**\nCreate and edit global \`ai_voice_profiles\`. Each profile defines:\n- **Greeting** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬  The initial script the AI uses to answer calls.\n- **Data Collection** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬  Required fields to gather (name, address, issue) and retry limits.\n- **Confirmation** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬  The final script used before ending the call.\n- **Behavior** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬  AI tone and call hand-off or transfer conditions.\n\n**Customer Search & Assignment**\nUse the **Customer Search** tab to locate an organization and assign them a specific AI Voice Profile. This allows you to deploy custom profiles for different industries or VIP clients.\n\n**Call History Audit & Actions**\nThe **Call History** tab provides real-time access to all \`voice_sessions\` across the platform. You can search by phone number or Organization ID to review full call transcripts, AI summaries, and call statuses for troubleshooting.\n- **Expand Details** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬  Click on any session to see the full transcript, AI summary, and collected data fields.\n- **Direct Conversion** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬  If a call didn't automatically convert to a job or quote, you can manually trigger "Create Job" or "Create Quote" directly from the expanded session view to ensure no leads are lost.\n\n**System Configuration**\nThe **System Config** tab controls global timeouts and defaults, such as the 15-second Twilio Gather timeout that prevents premature "no-speech" errors.\n\n**Access**\nNavigate to **Platform > AI Voice** from the sidebar (restricted to Site Admins).`,
        lastUpdated: '2026-04-30',
        keywords: ['voice', 'admin', 'management', 'platform', 'profiles', 'history', 'transcripts', 'system config', 'tenant', 'convert', 'job', 'quote']
    },
    // ÃƒÂ¢Ã¢â‚¬ Ã¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ Ã¢â€šÂ¬ Invoice PDF, Email & Overdue Detection ÃƒÂ¢Ã¢â‚¬ Ã¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ Ã¢â€šÂ¬
    {
        id: 'inv-pdf-email',
        title: 'Invoice PDF & Email Delivery',
        category: 'invoicing',
        content: `Download invoices as PDF or send them directly to customers via branded email.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Download PDF',
                description: 'On any invoice detail page, click **"Download PDF"**. The PDF includes your invoice number, line items, tax, payments, and balance due. Downloads instantly.',
                screenshotUrl: '/help-screenshots/invoicing/invoices-list.png'
            },
            {
                stepNumber: 2,
                title: 'Send & Lock via Email',
                description: 'Click **"Send & Lock"** on a draft invoice. This emails a branded HTML invoice to the customer, locks it from editing, and marks it as "Sent".',
                screenshotUrl: '/help-screenshots/invoicing/invoices-list.png',
                tip: 'Every sent invoice is logged with recipient, timestamp, and sender for compliance. Use "Unlock to Edit" if changes are needed later.'
            }
        ],
        lastUpdated: '2026-06-22',
        keywords: ['invoice', 'PDF', 'download', 'email', 'send', 'lock', 'delivery', 'sendgrid', 'branded', 'template']
    },
    {
        id: 'inv-overdue',
        title: 'Overdue Invoice Detection',
        category: 'invoicing',
        content: `Invoices are automatically flagged as overdue when they pass their due date — no manual action needed.`,
        steps: [
            {
                stepNumber: 1,
                title: 'How It Works',
                description: 'Any "Sent" or "Partial" invoice past its due date automatically shows a pulsing red **OVERDUE** badge in the Invoices list and detail page.',
                screenshotUrl: '/help-screenshots/invoicing/invoices-list.png',
                tip: 'Set due dates when creating invoices (Net 30, Net 60) to activate automatic overdue detection. Paid/voided invoices are never flagged.'
            }
        ],
        lastUpdated: '2026-06-22',
        keywords: ['overdue', 'past due', 'late', 'payment', 'due date', 'delinquent', 'aging', 'unpaid', 'outstanding']
    },
    {
        id: 'inv-lifecycle',
        title: 'Invoice Lifecycle & Statuses',
        category: 'invoicing',
        content: `Invoices flow through defined stages: Draft → Sent → Partial → Paid (or Overdue/Void).`,
        steps: [
            {
                stepNumber: 1,
                title: 'Status Flow',
                description: '**Draft** (yellow) → **Sent** (blue) → **Partial** (orange) → **Paid** (green). Overdue shows a pulsing red badge. Void is strikethrough.',
                screenshotUrl: '/help-screenshots/invoicing/invoices-list.png'
            },
            {
                stepNumber: 2,
                title: 'Key Actions',
                description: '**Send & Lock** emails and locks it. **Record Payment** logs check/cash/card. **Unlock to Edit** re-opens for corrections. **Void** cancels permanently.',
                screenshotUrl: '/help-screenshots/invoicing/invoices-list.png',
                tip: 'Completing a job via the Job Completion Wizard auto-creates a draft invoice with all parts, labor, and mileage charges.'
            }
        ],
        lastUpdated: '2026-06-22',
        keywords: ['invoice', 'lifecycle', 'status', 'draft', 'sent', 'paid', 'void', 'partial', 'overdue', 'workflow', 'lock', 'unlock']
    },
    {
        id: 'inv-upfront-payment-policy',
        title: 'Upfront Payment & Paid Estimate Policy',
        category: 'invoicing',
        content: `Protect your business by requiring upfront deposits or paid estimate fees before service begins.\n\n**Setting Up Your Policy**\n1. Go to **Organization Settings ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Financial**.\n2. Enable the **Upfront Payment Policy** toggle.\n3. Choose your **Default Deposit Rule**:\n   - **No Default** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â set deposits per-quote manually\n   - **Always Require** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â 50% of every quote total\n   - **New Customers Only** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â deposits only for first-time customers\n   - **Over $ Threshold** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â require deposits when the quote exceeds your set dollar amount\n   - **100% of Materials/Parts** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â collect the full materials cost upfront\n   - **Paid Estimate** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â charge a flat fee for on-site evaluations\n\n4. Set your **Deposit Percentage**, **Threshold Amount**, or **Paid Estimate Fee** depending on the selected rule.\n5. Write a **Payment Disclaimer** that will be shown to customers on the payment form.\n6. Click **Save Changes**.\n\n**How It Works**\nWhen you create a new quote, the deposit rule is auto-applied based on your organization's policy. Technicians can override the deposit condition per-quote if needed.\n\nAfter the customer approves the quote, they'll see a prominent **"Pay Now"** button linking to a secure Stripe Checkout page. Payment is collected instantly and recorded on both the quote and linked job.\n\n**Q: Will the deposit be deducted from the final invoice?**\n**A:** Yes ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â when you convert an approved quote to an invoice, the system automatically deducts the paid deposit from the balance due.\n\n**Q: What if the customer doesn't pay the deposit?**\n**A:** The quote and job remain in their current status. The technician can follow up manually or resend the payment link.`,
        lastUpdated: '2026-05-07',
        keywords: ['deposit', 'upfront', 'payment', 'paid estimate', 'policy', 'stripe', 'checkout', 'prepay', 'materials', 'threshold', 'new customer']
    },
    {
        id: 'inv-customer-deposit-payment',
        title: 'Customer Deposit Payment Flow',
        category: 'invoicing',
        content: `When a deposit or paid estimate fee is required, customers receive a secure payment link via text or email.\n\n**Customer Experience**\n1. Customer receives a link to the quote page (QuoteView).\n2. After approving the quote, a **"Pay Deposit"** banner appears with the amount and a link to the payment page.\n3. The payment page shows:\n   - Your company branding and logo\n   - Quote summary and scope of work\n   - Deposit/paid estimate amount breakdown\n   - A legal disclaimer from your organization settings\n   - A **"Pay Now"** button powered by Stripe\n4. After clicking **Pay**, the customer is redirected to Stripe's hosted checkout.\n5. Upon successful payment, the page updates in real-time to confirm receipt.\n\n**For Technicians & Dispatchers**\nOnce the deposit is paid:\n- The **Quote** is marked with a green "Deposit Paid" badge\n- The linked **Job** record is updated with the payment reference\n- When you **convert the quote to an invoice**, the deposit is automatically deducted from the balance due and shown as "Deposit Applied (via Stripe)" in the payment history\n\n**Payment Security**\nAll payments are processed through **Stripe Checkout** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â card details never touch your servers. Stripe handles PCI compliance automatically.\n\n**Troubleshooting**\n- *Customer says payment failed* ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Check the Stripe Dashboard for declined transactions\n- *Deposit not showing as paid* ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â The webhook may be delayed; refresh the quote page in a few seconds\n- *Need to refund a deposit* ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Process the refund directly through your Stripe Dashboard`,
        lastUpdated: '2026-05-07',
        keywords: ['deposit', 'payment', 'customer', 'stripe', 'checkout', 'paid estimate', 'refund', 'link', 'text', 'email', 'secure']
    },
    // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Quote Change Requests & Revisions ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
    {
        id: 'quote-change-requests',
        title: 'Quote Change Requests & Revisions',
        category: 'invoicing',
        content: `Customers can request changes to a quote before approving it. DispatchBox supports this through multiple channels ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â the web quote page, AI voice callback, and the admin Quotes Management panel.\n\n**Customer Channels for Requesting Changes**\n\n1. **Web Quote Page** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â On the customer-facing quote page, if the quote is not yet approved, the customer sees an **"Approve"**, **"Propose Changes"**, and **"Decline"** button. Clicking "Propose Changes" opens a text box where they can describe what they'd like changed.\n\n2. **AI Voice Callback** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â When Amy calls the customer with a quote, the customer can verbally request changes (e.g., "Can we just do the sink?" or "That's too much, can you lower the price?"). Amy records the request, sets the quote to "Tech Review," texts the customer a link to the current quote, and notifies the technician.\n\n**What Happens Internally**\nWhen a customer submits a change request (via web or phone):\n- The quote status changes to **"tech_review"** (displayed as "Needs Review" in your Quotes list)\n- The customer's message is logged in the **Communication History** on the quote\n- If the request came via AI voice, Amy texts the customer the quote link for reference\n\n**Technician / Dispatcher Response Options**\n\nFrom the **Quotes** page, you'll see a banner when quotes need review. Each "Needs Review" quote shows:\n- The customer's change request message\n- Two quick-action buttons: **"Revise Quote"** and **"View Details"**\n\nFrom the **Quote Detail** page (click into any tech_review quote), you get a full response panel:\n\n1. **Revise & Resend Quote** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Opens the quote editor pre-populated with the current line items. Make your changes, then click "Send to Customer" to push the updated quote back to the customer. The previous version is archived for history.\n\n2. **Send Reply (No Price Change)** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Add a message to the customer explaining why the quote stands as-is, then send it back for re-approval without changing any line items. The quote status returns to "Sent."\n\n3. **Trigger AI Callback** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Schedule an AI callback to the customer to discuss the quote over the phone. Useful when the customer's request is unclear or needs a conversational follow-up.\n\n**Communication History**\nAll messages between customer and tech are displayed in a chat-style history on the quote page. Customer messages appear on the right (blue), technician messages on the left (white). This ensures complete transparency for everyone.\n\n**Quote Versioning**\nWhen you revise and resend a quote, the system automatically:\n- Archives the previous version in a "previousVersions" array\n- Increments the version number\n- Timestamps the revision\n\n**Q: Can a customer submit multiple change requests?**\n**A:** Yes ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â if the tech sends a revised quote and the customer still wants changes, they can click "Propose Changes" again, triggering another review cycle.\n\n**Q: Can the AI accept change requests during the callback?**\n**A:** Yes ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â if the customer says something like "can we change," "that's too expensive," "remove," "just the sink," etc., Amy will log the request and set the quote to tech review.\n\n**Q: What statuses can a quote have?**\n**A:** Draft ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Sent ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Viewed ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Approved / Declined / Tech Review (change requested). From Tech Review, the tech sends it back as Sent after revising or replying.`,
        lastUpdated: '2026-05-08',
        keywords: ['quote', 'change', 'request', 'revision', 'modify', 'tech review', 'propose changes', 'callback', 'voice', 'revise', 'resend', 'negotiate', 'price', 'dashboard', 'notification', 'banner']
    },
    // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Quote Communication History & Status Tracking ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
    {
        id: 'quote-communication-history',
        title: 'Quote Communication History & Status Tracking',
        category: 'invoicing',
        content: `Every quote includes a **Communication History** section that tracks all messages and status changes between customers and technicians in a visual timeline.\n\n**Message Types**\n\n1. **Customer Messages** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Shown as blue chat bubbles on the right side, these are change requests or comments from the customer.\n\n2. **Technician Messages** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Shown as white chat bubbles on the left side, these are replies from the tech or dispatcher.\n\n3. **Status Changes** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Shown as centered gray pills with an amber dot, these automatically record when the quote changes hands. Each status change shows:\n   - A description of what happened (e.g., "Quote revised and resent by John")\n   - A **"Waiting for..."** badge indicating who needs to act next\n\n**"Waiting for" Indicators**\n\nThe communication history shows who has the ball in their court:\n- **ÃƒÂ¢Ã¯Â¿Â½Ã‚Â³ Waiting for Customer** (blue badge) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â The tech has sent or updated the quote; it's the customer's turn to review and respond\n- **ÃƒÂ¢Ã¯Â¿Â½Ã‚Â³ Waiting for Technician** (amber badge) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â The customer has requested changes; the tech needs to revise or reply\n\nThese indicators appear both in the timeline history and as a current status badge at the bottom of the Communication History section.\n\n**Adding Revision Comments**\n\nWhen editing an existing quote, a **"Reply to Customer"** (or "Add a Note") section appears above the save buttons:\n- If the quote is in tech_review status, the customer's latest change request is displayed for context\n- Type your response explaining the changes you made\n- The comment is automatically added to the communication history when you save\n\n**Automatic Tracking**\n\nStatus change entries are added automatically whenever:\n- A customer proposes changes ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ "Change requested by customer ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â awaiting technician review"\n- A tech revises and resends ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ "Quote revised and resent by [Name] ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â awaiting customer response"\n- A tech replies without price change ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ "Technician replied ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â awaiting customer response"\n\n**Q: Do I have to add a comment when revising a quote?**\n**A:** No, it's optional. But it's recommended ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â the customer can see your explanation in the communication history.\n\n**Q: Can the customer see the "Waiting for" indicators?**\n**A:** Yes, both parties see the full communication history including all status changes.`,
        lastUpdated: '2026-05-08',
        keywords: ['communication', 'history', 'status', 'tracking', 'waiting', 'timeline', 'comment', 'revision', 'note', 'message', 'customer', 'technician']
    },
    // Ã¢â‚¬â€ Portal AI Quote Generation Ã¢â‚¬â€
    {
        id: 'portal-ai-quote-generation',
        title: 'AI Quote Generation from Portal Submissions',
        category: 'invoicing',
        content: `When a customer submits a **Quote Request** through your public portal, DispatchBox instantly confirms the request and generates an AI draft quote in the background for your review.\n\n**How It Works**\n\n1. Customer fills out your portal's quote request form.\n2. The form submits **instantly** (2-3 seconds) Ã¢â‚¬â€ creating a ticket, generating a tracking code, and returning a confirmation.\n3. The customer receives a **confirmation email** with their tracking code.\n4. **In the background**, DispatchBox's AI analyzes the request and generates a draft quote with:\n   - **Labor line items** Ã¢â‚¬â€ diagnostic time, repair work, testing & cleanup\n   - **Material line items** Ã¢â‚¬â€ matched against your inventory with vendor pricing\n   - **Equipment charges** Ã¢â‚¬â€ specialized tools if needed\n   - **Tax** Ã¢â‚¬â€ automatically resolved dynamically in the background based on the customer's service address\n5. The draft quote appears in your **Intake Dashboard** for review. **It is NOT sent to the customer automatically.**\n\n**Tech Review Workflow**\n1. Go to **Intake** or **Communications Hub** to see the new ticket.\n2. Click **"Review AI Quote"** to see the AI-generated estimate.\n3. Adjust line items, labor hours, materials, or pricing as needed.\n4. Click **"Send to Customer"** when ready Ã¢â‚¬â€ only then does the customer receive the quote.\n\n**Customer-Facing Quote View & Pending Review Visibility**\nWhen a customer clicks their tracking link before the quote has been approved by a technician (while it is still a draft), the quote details (line items, pricing, estimated duration, and terms) are **automatically hidden**.\n- They see an **"Under Technician Review"** status card.\n- They see the **Scope of Request** (showing their original service request).\n- They can **Propose Changes / Send Message** to submit request updates. These updates are logged directly to the quote's communication history, and the status transitions to **"tech_review"** so the technician is alerted on the admin dashboard (Needs Review).\nOnce a technician reviews, modifies, and sends the quote:\n- Clicking the link unlocks the full customer-friendly quote view (pricing, line items, and terms).\n- The customer can then Approve, Propose Changes (which transitions the status back to tech review for revisions), or Decline the quote.\n- Technical repair steps and AI diagnosis details remain **hidden**. Only the customer's original service description is shown as the "Scope of Work".\n- Line item totals, tax, and grand total are clearly displayed.\n\n**Quote Recovery**\nIf the background AI quote generation fails for any reason, you'll see a prompt in the AI Recommendation panel:\n- Click **"Generate Quote"** to retry quote creation manually\n- The ticket is always created successfully Ã¢â‚¬â€ only the AI analysis might need retry\n\n**Tax Rate Configuration**\nAI quotes automatically resolve taxes based on the job's service location. To customize service regions:\n1. Go to **Organization Settings** Ã¢â€ ’ **Financial**\n2. Configure custom tax rates under the **Location-Based Tax Rates** section\n3. All future quotes will dynamically resolve the exact rate for the worked area\n\n**Tips:**\n- Portal submissions return in under 5 seconds Ã¢â‚¬â€ no more long loading screens\n- AI quotes are always drafts Ã¢â‚¬â€ they require your approval before the customer sees them\n- You can edit any line item before sending the quote\n- The tracking code works immediately Ã¢â‚¬â€ the customer can check status before the quote is ready`,
        lastUpdated: '2026-05-27',
        keywords: ['portal', 'AI', 'quote', 'generate', 'automatic', 'labor', 'materials', 'tax', 'customer view', 'scope', 'recovery', 'timeout', 'line items', 'estimate', 'background', 'async', 'instant', 'fast', 'review', 'approval']
    },
    // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Call Transcript & Detail Viewer ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
    {
        id: 'comms-call-transcript-viewer',
        title: 'Viewing Call Transcripts & AI Details',
        category: 'communications',
        content: `Every phone call handled by your AI Voice Agent is recorded as a full transcript viewable from multiple places in the app.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Find Call Transcripts',
                description: 'Go to Communications Hub > Inbox tab. Look for ticket cards with a "View Transcript and Details" link (shown in indigo text). Click anywhere on the ticket card to expand the detail panel showing AI Extracted Details and the full Call Transcript.',
                screenshotUrl: '/help-screenshots/communications/comms-hub-inbox.png'
            },
            {
                stepNumber: 2,
                title: 'Read AI Extracted Details',
                description: 'The expanded panel shows a grid of key data points the AI collected: Name, Description of issue, Service Address, Contact Preference, Intent (service request or quote request), and Availability. Internal fields are automatically hidden.',
                screenshotUrl: '/help-screenshots/communications/comms-hub-inbox.png'
            },
            {
                stepNumber: 3,
                title: 'View the Chat-Style Transcript',
                description: 'Below the extracted details, the full conversation log appears in a chat-style format. AI Agent messages appear on the left (purple) and Caller messages on the right (blue). Timestamps are shown when available.',
                screenshotUrl: '/help-screenshots/communications/comms-hub-inbox.png',
                tip: 'The transcript is also embedded inside the AI Quote review panel Ã¢â‚¬â€ so you can read what the customer actually said while editing quote line items. No view-switching needed.'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['transcript', 'call', 'details', 'view', 'expand', 'history', 'AI', 'voice', 'conversation', 'log', 'inbox', 'communications']
    },
    // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ AI Voice Quote Callback ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
    {
        id: 'ai-voice-quote-callback',
        title: 'AI Voice Quote Callbacks',
        category: 'communications',
        content: `When a customer requests a quote via phone, Amy can call them back to present the quote details and facilitate approval Ã¢â‚¬â€ all hands-free.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Identity Verification',
                description: 'Amy calls and asks: "Am I speaking with [Name]?" before sharing any financial details. If the customer is not available, Amy politely texts the quote link and ends the call.',
                screenshotUrl: '/help-screenshots/communications/ai-voice-agent.png'
            },
            {
                stepNumber: 2,
                title: 'Quote Presentation',
                description: 'Once confirmed, Amy reads the quote based on your Presentation Mode (Single Price, Category Rollup, or Detailed Line Items). The customer can: Approve, request text/email delivery, ask questions, request a human callback, or decline.',
                screenshotUrl: '/help-screenshots/communications/ai-voice-agent.png',
                tip: 'Callbacks are set to "Awaiting Review" by default Ã¢â‚¬â€ they will not call automatically until you trigger them from the dashboard.'
            },
            {
                stepNumber: 3,
                title: 'Customer-Driven Scheduling After Approval',
                description: 'After approval, Amy asks what day works best. She checks the assigned technician s real schedule for matching availability, presents 1-3 time windows, and always confirms the selection before booking. If the requested day is not available, Amy tells them which days ARE open.',
                screenshotUrl: '/help-screenshots/communications/ai-voice-agent.png'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['callback', 'voice', 'quote', 'AI', 'Amy', 'phone', 'call', 'approval', 'review', 'identity', 'verification', 'scheduling', 'customer driven']
    },
    // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Unified Communications Hub ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
    {
        id: 'unified-communications-hub',
        title: 'Unified Communications Hub (Customer Detail)',
        category: 'customers',
        content: `The **Unified Communications** tab on the Customer Detail page consolidates ALL communication history with a customer into a single searchable, filterable timeline.\\n\\n**What It Shows**\\nThe hub aggregates data from six different sources into one chronological view:\\n- **Phone Calls** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â AI voice sessions (inbound & outbound callbacks) with full expandable transcripts\\n- **Text Messages (SMS)** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â All sent and received text messages\\n- **Emails** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Every outbound email (automated and manual) with type labels (e.g., Quote Sent, Auto Reply, Proxy Reply), sender name, subject, and delivery status\\n- **Quote Interactions** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Quote-related notes, approval records, and change requests\\n- **Internal Notes** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Internal communication notes from ticket workflows\\n- **Automated Messages** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Scheduled follow-ups, reminders, and surveys\\n\\n**Search & Filter**\\n- **Search bar** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Search across all message content, titles, and summaries\\n- **Filter pills** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â One-click filters: All, Calls, Emails, Texts, Quotes\\n- Each filter shows a count badge so you know how many records exist per type\\n\\n**Expandable Transcripts**\\nFor AI voice calls, click any call entry to expand the full transcript in a chat-style view with AI messages on the left and customer messages on the right.\\n\\n**Status Badges**\\nColor-coded badges: Sent, Pending, Completed, Scheduled, Approved, Failed, Cancelled, or Logged.\\n\\n**Deep Links**\\nEntries linked to jobs or quotes include a "View" link navigating directly to the associated record.\\n\\n**How to Access**\\n1. Navigate to **Customers** in the sidebar\\n2. Click on any customer\\n3. Select the **Communications** tab\\n4. The timeline loads automatically with all history\\n\\n**Tips:**\\n- Data is fetched lazily ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â only loads when you open the Communications tab\\n- All phone number variants are matched (with/without +1 prefix)\\n- The timeline is sorted newest-first by default\\\\n- Automated emails (confirmations, intake links, proxy replies) are logged here automatically`,
        lastUpdated: new Date().toISOString().split('T')[0],
        keywords: ['communications', 'hub', 'timeline', 'history', 'customer', 'search', 'filter', 'transcript', 'call', 'email', 'sms', 'text', 'quote', 'unified', 'detail']
    },
    {
        id: 'platform-comms-monitor',
        title: 'Platform Communications Monitor',
        category: 'addons',
        content: `The **Communications Monitor** is a Site Admin tool for tracking email deliverability, SMS health, and voice call activity across all organizations on the platform.\n\n**How to Access**\nFrom the **Site Administration** page, click the purple **Comms Monitor** button in the header. Or navigate directly to **/platform/comms-monitor**.\n\n**Email Events Tab**\nShows real-time webhook events from SendGrid:\n- **Bounces** (red) Ã¢â‚¬â€ The recipient's mail server rejected the email.\n- **Spam Reports** (rose) Ã¢â‚¬â€ A recipient marked the email as spam.\n- **Unsubscribes** (amber) Ã¢â‚¬â€ A recipient clicked the unsubscribe link.\n- **Delivered / Opened / Clicked** (green/blue) Ã¢â‚¬â€ Successful delivery engagement.\n- Click any row to expand full bounce details, classification, and response.\n\n**Email Logs Tab**\nShows every email sent by the system with status:\n- **Sent** Ã¢â‚¬â€ Delivered to SendGrid successfully.\n- **Failed** Ã¢â‚¬â€ SendGrid rejected or errored. Expand for error details.\n- **Skipped (Suppressed)** Ã¢â‚¬â€ Address is on the suppression list, email was not sent.\n\n**Suppressions Tab**\nLists all email addresses that have been auto-blocked due to bounces, spam complaints, or unsubscribes.\n- **Blocked** Ã¢â‚¬â€ Active suppression; no emails will be sent to this address.\n- **Cleared** Ã¢â‚¬â€ Previously suppressed, manually removed by admin.\n- Click **Unsuppress** to re-enable email delivery to an address.\n\n**Voice & Calls Tab**\nShows all AI voice sessions across organizations:\n- Caller phone, customer name, org, intent, and status.\n- Expand any row to view the full conversation transcript.\n\n**Stats Bar**\nFour summary cards at the top show current counts: Bounces/Issues, Delivered, Suppressed Addresses, and Voice Sessions.\n\n**Tips:**\n- Search works across all tabs Ã¢â‚¬â€ filter by email address, org, status, or phone number.\n- Bounces automatically suppress the address to protect domain reputation.\n- Check this page after large email campaigns to catch delivery issues early.`,
        lastUpdated: new Date().toISOString().split('T')[0],
        keywords: ['communications', 'monitor', 'email', 'bounce', 'spam', 'suppression', 'webhook', 'sendgrid', 'voice', 'calls', 'platform', 'admin', 'deliverability']
    },
    // Ã¢â‚¬â€ Automated Email Notifications Ã¢â‚¬â€
    {
        id: 'automated-email-notifications',
        title: 'Automated Email Notifications & Communication Tracking',
        category: 'communications',
        content: `DispatchBox automatically sends branded email notifications at key moments in the service lifecycle Ã¢â‚¬â€ every email is recorded in the customer s Communication History.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Customer-Facing Emails',
                description: 'Customers automatically receive: Request Confirmation (when they submit a service request), Quote Delivery (branded email with "View Full Quote" button), and Job Status Updates (when status changes to Scheduled, In Progress, or Completed).',
                screenshotUrl: '/help-screenshots/communications/email-inbox.png'
            },
            {
                stepNumber: 2,
                title: 'Technician and Dispatcher Emails',
                description: 'Your team automatically receives: New Service Request alerts, Quote Approved notifications, Quote Declined notifications with decline reasons, Quote Change Request emails, and Job Assignment emails with location, priority, and schedule details.',
                screenshotUrl: '/help-screenshots/communications/email-inbox.png'
            },
            {
                stepNumber: 3,
                title: 'Email Type Labels and Tracking',
                description: 'Each logged email is tagged with a descriptive type: Quote Sent, Quote Approved, Quote Declined, Quote Change Request, New Ticket, Auto Reply, Intake Form, Proxy Reply, or Custom Email. These badges appear in the Communications timeline for easy filtering.',
                screenshotUrl: '/help-screenshots/communications/email-inbox.png',
                tip: 'View the complete email audit trail for any customer under Customers > [Customer] > Communications tab > Emails filter.'
            },
            {
                stepNumber: 4,
                title: 'Branding and Sender Identity',
                description: 'All emails use your configured branding: company name and logo in the header, primary color for headers and buttons, and your configured outbound email as the From address. Configure in Organization Settings > Branding and Email Settings.',
                screenshotUrl: '/help-screenshots/account/org-settings.png'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['email', 'notification', 'automated', 'confirmation', 'quote', 'approval', 'decline', 'change request', 'branding', 'tracking', 'audit', 'history']
    },
    // Ã¢â‚¬â€ Email Aliases Ã¢â‚¬â€
    {
        id: 'email-aliases',
        title: 'Email Aliases (Multi-Address Routing)',
        category: 'communications',
        content: `Email Aliases let you create multiple inbound email addresses that all route to the same organization Ã¢â‚¬â€ perfect for department-based routing.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Understand Email Aliases',
                description: 'Beyond your primary email prefix (e.g., hitopplumbers@dispatch-box.com), you can add aliases like support.hitopplumbers, billing.hitopplumbers, or emergency.hitopplumbers. All route to the same organization through the same AI triage pipeline.',
                screenshotUrl: '/help-screenshots/account/org-settings.png'
            },
            {
                stepNumber: 2,
                title: 'Set Up Aliases',
                description: 'Go to Organization Settings > Email Settings. Scroll to the Email Aliases section. Type a new alias prefix and click Add. Aliases must be globally unique, lowercase, using letters, numbers, dots, and hyphens only. Click Save Changes.',
                screenshotUrl: '/help-screenshots/account/org-settings.png',
                tip: 'Each ticket created from an alias email is tagged with a sourceAlias field (e.g., "support") for filtering and auto-assignment rules.'
            },
            {
                stepNumber: 3,
                title: 'Use Aliases Across Your Business',
                description: 'Add aliases to business cards, website contact pages, and marketing materials for different departments. Common patterns: department.company (support.acme), location.company (maui.acme), or service.company (plumbing.acme).',
                tip: 'Aliases work with all existing features: AI triage, auto-reply, forwarding, and proxy reply. Remove an alias anytime by clicking the X button in Email Settings.'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['email', 'alias', 'aliases', 'multi-address', 'routing', 'department', 'support', 'billing', 'emergency', 'prefix', 'inbound']
    },
    {
        id: 'email-inbox',
        title: 'Email Inbox',
        category: 'communications',
        content: `The Email Inbox gives you a built-in email client to manage all inbound and outbound messages directly within DispatchBox.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Open the Email Inbox',
                description: 'Navigate to Comms > Email in the sidebar. The inbox opens with a three-panel layout: Folder navigation on the left (Inbox, Sent, Deleted, Archive), searchable email list in the center, and full reading pane on the right.',
                screenshotUrl: '/help-screenshots/communications/email-inbox.png'
            },
            {
                stepNumber: 2,
                title: 'Navigate Folders and Mailboxes',
                description: 'The left sidebar shows standard folders (Inbox with unread count, Sent Items, Deleted Items, Archive). Below folders, you can filter by mailbox Ã¢â‚¬â€ your primary address and any configured aliases. Switch between personal and shared mailboxes.',
                screenshotUrl: '/help-screenshots/communications/email-inbox.png'
            },
            {
                stepNumber: 3,
                title: 'Read and Reply to Emails',
                description: 'Click any email in the list to view it in the reading pane. Use Reply, Reply All, or Forward buttons to respond. The reading pane shows full HTML content with headers, attachments, and action buttons for archive, delete, and restore.',
                screenshotUrl: '/help-screenshots/communications/email-inbox.png',
                tip: 'Emails are automatically threaded Ã¢â‚¬â€ view the full conversation history with a customer in chronological order with collapsible message cards.'
            },
            {
                stepNumber: 4,
                title: 'Compose New Emails',
                description: 'Click the Compose button in the left panel to create a new email. Select your From address (primary or alias), enter recipients, subject, and compose your message. Attach files and use your alias-specific signature. Click Send to deliver.',
                screenshotUrl: '/help-screenshots/communications/email-inbox.png'
            },
            {
                stepNumber: 5,
                title: 'Configure Email Settings',
                description: 'Click "Email Settings" at the bottom of the left panel to configure: forwarding rules, reply-as proxy, spam filtering, auto-replies, and email signature customization for each alias address.',
                screenshotUrl: '/help-screenshots/account/org-settings.png',
                tip: 'The email inbox syncs with the Customer Communications timeline Ã¢â‚¬â€ every email you send or receive appears in the customer unified history.'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['email', 'inbox', 'compose', 'reply', 'forward', 'folder', 'sent', 'archive', 'delete', 'mailbox', 'alias', 'reading pane']
    },
    {
        id: 'portal-appointment-scheduling',
        title: 'Portal Intents & Appointment Scheduling',
        category: 'customers',
        content: `Your public portal now supports **four distinct customer intents** Ã¢â‚¬â€ matching the same workflow your AI Voice Agent uses. Customers no longer need to sign in for any of these actions.\n\n## The Four Intents\n\nOn your public portal, visitors see a booking card with four tabs:\n\n| Tab | Purpose |\n|-----|--------|\n| **Request** | General service inquiry Ã¢â‚¬â€ submit a description and get a callback. |\n| **Quote** | Request a free estimate. Automatically triggers job + quote generation. |\n| **Schedule** | Book an available appointment slot via a 4-step wizard. |\n| **Manage** | Look up existing appointments by phone number. |\n\n## Requesting a Service\n\nFill in name, phone, address, description, and urgency. The system creates a ticket and (if enabled) auto-generates a job and quote. You'll receive a **tracking code** you can use to check status.\n\n## Getting a Free Quote\n\nSame form as Request, but the backend tags it as a quote request and always triggers auto-quote generation regardless of org settings. The customer gets a tracking code linked to their quote.\n\n## Scheduling an Appointment (4 Steps)\n\n1. **Your Information** Ã¢â‚¬â€ Name, phone, email, address, issue description.\n2. **Pick a Date & Time** Ã¢â‚¬â€ Select a date; the system checks real-time technician availability and shows Morning (8 AMÃ¢â‚¬â€œ12 PM) / Afternoon (12 PMÃ¢â‚¬â€œ5 PM) slots.\n3. **Service Agreement** Ã¢â‚¬â€ Acknowledge waiver, CC on file policy, and terms.\n4. **Confirm** Ã¢â‚¬â€ Review and submit. Final availability re-check prevents double-bookings.\n\n## Managing Appointments\n\nClick the **Manage** tab and enter your phone number. The system looks up all recent bookings associated with that number and displays them with status, date, and a **View Details** link that opens the tokenized resource viewer.\n\n## Tracking Codes\n\nAfter any submission, you receive an 8-character tracking code (e.g., **KXPV7N3R**). This code can be:\n- Entered at \`/t/KXPV7N3R\` to view your ticket, appointment, or quote status.\n- Shared over the phone, via SMS, or email for easy access.\n- Used without any login or account.\n\n## Availability Logic\n\n- Each technician handles up to **2 morning** + **2 afternoon** jobs/day.\n- Fully booked slots are grayed out.\n- Days off show a warning message.\n\n**Q: Can customers book same-day appointments?**\n**A:** No Ã¢â‚¬â€ the earliest available date is tomorrow, up to 60 days out.\n\n**Q: What happens to the tracking code?**\n**A:** It expires after 90 days. The customer can always look up their appointments again via the Manage tab.`,
        lastUpdated: new Date().toISOString().split('T')[0],
        keywords: ['portal', 'appointment', 'scheduling', 'booking', 'availability', 'time slot', 'guest', 'waiver', 'prerequisites', 'calendar', 'public portal', 'quote', 'manage', 'intent', 'tracking code']
    },
    {
        id: 'tokenized-access-system',
        title: 'Tokenized Access & Tracking Codes',
        category: 'customers',
        content: `DispatchBox uses **tokenized access links** to give customers frictionless access to their tickets, quotes, appointments, and invoices Ã¢â‚¬â€ no login required.\n\n## How It Works\n\nWhen a resource is created through any channel (portal, AI voice, email, SMS), the system generates an **8-character tracking code** like \`KXPV7N3R\`. This code:\n\n- Is embedded in all outbound communications (emails, SMS, AI callbacks).\n- Can be entered at \`yourdomain.com/t/KXPV7N3R\` to access the resource.\n- Is read-aloud-friendly (no ambiguous characters like 0/O or 1/I/L).\n\n## Supported Resource Types\n\n| Type | What the Customer Sees |\n|------|------------------------|\n| **Ticket** | Status, description, linked quote if available. |\n| **Quote** | Full quote with line items, approve/decline options. |\n| **Appointment** | Scheduled date, time slot, reschedule contact info. |\n| **Invoice** | Balance due, payment link. |\n| **Job** | Job status, scheduling info, assigned technician. |\n\n## Security Features\n\n- **Scoped permissions**: Each token only grants access to specific actions (view, approve, reschedule, pay).\n- **Expiry**: Tokens expire after 90 days by default.\n- **Phone verification**: Sensitive actions (approvals, payments) can require phone number verification.\n- **Access logging**: Every token access is recorded in an audit trail.\n- **Status control**: Tokens can be consumed, expired, or revoked.\n\n## Outbound Token Distribution\n\nTokens are automatically embedded in every outbound customer communication:\n\n| Channel | What Gets a Token | Example |\n|---------|-------------------|----------|\n| **Quote Email** | The "View & Approve" CTA button links to \`/t/TOKEN\` instead of raw IDs. | One-click quote approval from email. |\n| **Invoice Email** | "View Invoice Online" CTA + visible tracking code in the email body. | Customers can view/pay invoices without login. |\n| **Ticket Confirmation** | Includes a tracking code block + "Track Your Request" button. | Customers check status anytime. |\n| **SMS (New Ticket)** | Reply includes tracking code and a short token link. | \`Your tracking code: KXPV7N3R. View status: .../t/KXPV7N3R\` |\n| **SMS (Auto-Quote)** | Quote link uses token URL instead of raw Firestore ID. | \`Your quote is ready! View and approve: .../t/TOKEN\` |\n| **AI Voice** | Phone-created tickets generate tokens; quote SMS/email uses token links. | Callers can track their request via portal. |\n| **Appointment Reminders** | SMS and email reminders include a "View Appointment" token link. | Manage or reschedule from the reminder. |\n\n## Where Tokens Are Generated\n\n- **Public Portal**: After any service request, quote, or appointment booking.\n- **AI Voice Agent**: When tickets are created from phone calls.\n- **Quote/Invoice Emails**: When techs send quotes or invoices to customers.\n- **SMS Flows**: When new tickets or auto-quotes are created via inbound SMS.\n- **Appointment Reminders**: When scheduled reminders fire for upcoming appointments.\n- **Manage Appointments**: Legacy bookings get tokens auto-generated on lookup.\n\n## Graceful Fallback\n\nIf token generation fails for any reason (e.g., temporary Firestore issue), the system falls back to direct resource links. This ensures emails and SMS are always delivered Ã¢â‚¬â€ never blocked by token errors.\n\n## For Administrators\n\nTokens are stored in the \`access_tokens\` Firestore collection. Each token document includes the resource type, ID, org, customer info, permissions, and a full access log. Tokens are also back-linked to their source resource (e.g., the quote or invoice document stores its \`accessToken\` field).\n\n**Q: What if a customer loses their tracking code?**\n**A:** They can use the "Manage" tab on your portal to look up bookings by phone number. New tokens are generated automatically.\n\n**Q: Can I revoke a token?**\n**A:** Yes Ã¢â‚¬â€ update the token's status to "revoked" in Firestore. The customer will see a "link revoked" message.\n\n**Q: Do tokens work for both email and SMS?**\n**A:** Yes Ã¢â‚¬â€ the same \`/t/TOKEN\` URL works universally. Emails include styled CTA buttons and tracking code blocks; SMS includes a short text link.`,
        lastUpdated: new Date().toISOString().split('T')[0],
        keywords: ['token', 'access', 'tracking code', 'tokenized', 'link', 'no login', 'frictionless', 'share', 'SMS', 'email', 'quote', 'invoice', 'appointment', 'ticket', 'outbound', 'distribution', 'reminder']
    },
    {
        id: 'customer-photo-uploads',
        title: 'Customer Photo Uploads',
        category: 'customers',
        content: `Customers can now attach photos directly from the public portal when submitting service requests or scheduling appointments Ã¢â‚¬â€ no login required.\n\n## How Customers Upload Photos\n\n1. On your public portal, the customer fills out the service request or appointment form as usual.\n2. Below the description field, they'll see an **"Attach Photos"** section.\n3. They can click to browse or drag-and-drop up to **5 images** (max 10 MB each).\n4. Thumbnail previews appear instantly Ã¢â‚¬â€ they can remove any photo before submitting.\n5. Photos upload automatically when the form is submitted.\n\n## Where Technicians See Customer Photos\n\nOnce a customer submits photos, they appear in the **Job Detail Ã¢â€ ’ Photos** tab with an **orange "Customer"** badge. This makes it easy for techs to distinguish customer-provided images from their own before/after/issue photos.\n\nCustomer photos are stored securely in Firebase Storage under a dedicated portal uploads path and are linked to both the ticket and the auto-created job.\n\n## File Requirements\n\n| Constraint | Limit |\n|------------|-------|\n| **Max files per submission** | 5 |\n| **Max file size** | 10 MB per file |\n| **Accepted formats** | JPEG, PNG, GIF, WebP, BMP |\n\n## Security\n\n- Photos are uploaded to a **write-only public path** Ã¢â‚¬â€ customers cannot browse or read other uploads.\n- Only authenticated staff (technicians, dispatchers, admins) can view the uploaded images.\n- Each photo is scoped to the organization and ticket token for tenant isolation.\n\n**Q: Can customers upload photos after submitting a request?**\n**A:** Currently, photos can only be attached during the initial submission. Future updates may allow adding photos via the tracking code link.\n\n**Q: Do customer photos count against the job's photo gallery?**\n**A:** Yes Ã¢â‚¬â€ they appear alongside technician photos in the Job Detail Photos tab, categorized under the "Customer" type with an orange badge.`,
        lastUpdated: new Date().toISOString().split('T')[0],
        keywords: ['photo', 'upload', 'image', 'picture', 'attachment', 'customer', 'portal', 'before', 'issue', 'technician', 'job photos', 'drag drop']
    },
    // Ã¢â‚¬â€ Email Signature Builder Ã¢â‚¬â€
    {
        id: 'email-signature-builder',
        title: 'Email Signature Builder',
        category: 'account',
        content: `Create a professional, branded email signature that is automatically appended to every outbound email Ã¢â‚¬â€ compose replies, automated notifications, quote deliveries, and more.\n\n## Accessing the Signature Builder\n\n1. Go to **Organization Settings Ã¢â€ ’ Email Settings**\n2. Scroll to the **Email Signature** section\n3. Toggle the signature **on** to enable it\n\n## Visual Builder Mode (Default)\n\nThe Visual Builder provides structured fields so you don't need to write any HTML:\n\n| Field | Description |\n|-------|-------------|\n| **Name** | Your full name or the company representative name |\n| **Title** | Job title (e.g., "Owner", "Service Manager") |\n| **Company** | Your company/organization name |\n| **Phone** | Business phone number |\n| **Email** | Contact email address |\n| **Website** | Company website URL |\n| **Logo URL** | Direct link to your logo image (or use the Upload button) |\n| **Social Links** | Up to 4 social media profile URLs (LinkedIn, Facebook, Instagram, Twitter/X) |\n| **Tagline** | A short company tagline or motto |\n| **Brand Color** | Hex color used for accent lines and link styling |\n\n## Uploading a Logo\n\nClick the **Upload Logo** button (camera icon) to upload an image directly from your computer. The logo is stored in Firebase Storage under your organization's namespace and the URL is automatically filled in. Supported formats: JPEG, PNG, GIF, WebP.\n\n## Live Preview\n\nAs you fill in the fields, a **live HTML preview** renders below the form showing exactly how your signature will appear in emails. The preview updates in real time as you type.\n\n## Raw HTML Mode\n\nFor advanced users, click **"Raw HTML"** to switch to a code editor where you can paste or write custom HTML for your signature. This gives you full control over layout, styling, and formatting.\n\n## How It Works\n\nWhen a signature is enabled:\n- All outbound emails (compose, reply, automated notifications, quote emails, etc.) automatically include your signature at the bottom\n- The backend renders the structured data into a professional HTML signature with your logo, social icons, and brand colors\n- If you use Raw HTML mode, that HTML is injected directly\n\n## Tips\n\n- Use a **square or horizontal logo** for best results (recommended max width: 150px)\n- Keep your tagline short Ã¢â‚¬â€ one line works best in email clients\n- Test your signature by sending a compose email to yourself\n- The signature is organization-wide Ã¢â‚¬â€ all users in your org share the same outbound signature\n- Social links render as clickable icon buttons in the email footer`,
        lastUpdated: new Date().toISOString().split('T')[0],
        keywords: ['signature', 'email signature', 'branding', 'logo', 'builder', 'visual', 'HTML', 'social links', 'tagline', 'brand color', 'compose', 'outbound', 'footer']
    },
    {
        id: 'ai-quote-pricing-transparency',
        title: 'AI Quote Pricing Transparency',
        category: 'jobs',
        content: `When DispatchBox generates an AI quote for a job, each material line item now shows exactly where the pricing comes from Ã¢â‚¬â€ giving dispatchers and technicians full confidence in the numbers before sending a quote to the customer.

## Price Source Badges

Each material line item displays a colored badge indicating its pricing source:

| Badge | Meaning |
|-------|----------|
| **Vendor** (green) | Price sourced from a vendor in your materials inventory. Shows the vendor name (e.g., "Ferguson Supply"). |
| **Inventory** (blue) | Price from your company's materials inventory (no specific vendor assigned). |
| **AI Estimate** (amber) | Price estimated by AI based on typical retail pricing. Should be verified before sending. |
| **Fallback** (red) | Default placeholder price ($25). Replace with an actual price before sending the quote. |

## Markup & Cost Breakdown

For material items, the unit price column now shows a secondary line with the complete cost breakdown:
- **cost $X.XX +Y%** Ã¢â‚¬â€ Displays the raw base cost and your organization's markup percentage (e.g., \`cost $10.00 +20%\`) so you see how the final billing price is derived.
- This helps you quickly verify that the profit margin is correct.

## Inline Tax Customization

You can now toggle tax calculations and edit the tax rate directly inline on the quote panel:
- **Display Tax** Ã¢â‚¬â€ Toggle whether tax is calculated and displayed in the totals section.
- **Tax Rate (%)** Ã¢â‚¬â€ Adjust the custom tax percentage inline to handle specific client jurisdictions. The system dynamically pre-fills the correct tax rate resolved based on the work area's address.

## Location-Based Taxes & AI Auto-Lookup

DispatchBox automatically resolves and applies the correct tax rates for jobs based on their location/address:
- **Location Tax Configuration** Ã¢â‚¬â€ Set up custom tax names and rates for specific states or regions in **Organization Settings Ã¢â€ ’ Financial**. For example, configure "HI" (Hawaii) with "GET" at 4.712% and "CA" (California) with "Sales Tax" at 8.25%.
- **Automatic Matching** Ã¢â‚¬â€ When a work location/address is entered or edited, the system instantly matches it against your configured regions and applies the matching rate.
- **AI-Powered Fallback Lookup** Ã¢â‚¬â€ If an address is outside your pre-configured regions, **Gemini AI** is automatically triggered to analyze the location and trade category, look up the standard applicable local tax rate and tax name, and apply it in real time.
- **Visual Source Badges** Ã¢â‚¬â€ The tax settings card displays a clear badge indicating where the tax rate was sourced:
  - **Settings Rate** (green) Ã¢â‚¬â€ Sourced directly from your configured service regions.
  - **AI Resolved** (blue) Ã¢â‚¬â€ Sourced dynamically using AI lookup. A tool tip provides the tax justification.
- **Shared Global Tax Database** Ã¢â‚¬â€ Once an AI-resolved tax rate for a state or region is generated and verified (i.e., not changed or overridden by a technician or customer), it is securely cached in a shared, global database collection (\`global_tax_rates\`). Any new customers or organizations creating jobs in that same state/region will instantly retrieve this verified shared rate without triggering a new AI query, speeding up load times and saving API token usage. No private customer, job, or organization details are ever shared.
- **Manual Overrides** Ã¢â‚¬â€ Technicians and dispatchers can fully customize and override the tax rate or toggle taxes inline on the quote panel at any time.

## Product Links

Each material line item includes a clickable link to verify pricing:
- **"View Product"** Ã¢â‚¬â€ If the material has a vendor with a product URL, this links directly to the vendor's product page
- **"Look Up Price"** Ã¢â‚¬â€ If no vendor URL exists, this opens a Google Shopping search for the item name so you can quickly verify the AI's price estimate

## Stock Level Indicators

When a material is matched to your inventory, a stock badge appears:
- **Green** Ã¢â‚¬â€ Sufficient stock (more than 5 units)
- **Amber** Ã¢â‚¬â€ Low stock (5 or fewer units remaining)
- **Red** Ã¢â‚¬â€ Out of stock (0 units)

## Automatic Tool Filtering

To ensure your quotes remain professional and clean, **technician-owned tools** (such as tape measures, wrenches, screwdrivers, drills, levels, multimeters, etc.) are **automatically filtered out** of the materials list and quote line items. The customer will never be charged for standard tools that a professional tradesperson is expected to own. You only ever need 1 tape measure or tool in the field, and we ensure the customer isn't billed for it.

## How Pricing Priority Works

The system determines material prices using this priority order:
1. **Preferred vendor cost** Ã¢â‚¬â€ If the material has a preferred vendor with pricing, that cost is used
2. **Any vendor cost** Ã¢â‚¬â€ If no preferred vendor, the first vendor with a valid cost is used
3. **Inventory cost** Ã¢â‚¬â€ Falls back to the material's own unit cost in inventory
4. **AI estimate** Ã¢â‚¬â€ If no inventory match, uses the AI's retail price estimate
5. **Fallback** Ã¢â‚¬â€ If all else fails, uses a $25 default (flagged in red)

## Tips

- Always review **AI Estimate** and **Fallback** items before sending a quote
- Click **"Look Up Price"** on AI-estimated items to verify against current market pricing
- Add vendor pricing to your materials inventory to automatically get accurate quotes
- The markup percentage comes from your organization's Rate Card settings`,
        lastUpdated: new Date().toISOString().split('T')[0],
        keywords: ['ai quote', 'pricing', 'transparency', 'vendor', 'inventory', 'markup', 'price source', 'badge', 'stock', 'estimate', 'fallback', 'material', 'cost', 'google shopping', 'tool filtering', 'tape measure', 'location tax', 'tax rates', 'sales tax', 'GET', 'AI tax resolution', 'shared global tax rate']
    },
    {
        id: 'materials-procurement-backlog',
        title: 'Job Materials Procurement & Backlog',
        category: 'inventory',
        content: `DispatchBox's Job Materials Procurement Pipeline automates sourcing and purchasing for your approved quotes and work orders. Accessible via the **Purchase Orders** page under the **Materials Backlog** tab.

## 1. Aggregated Materials Backlog
The backlog panel automatically aggregates and groups all needed materials from:
- **Approved Quotes** Ã¢â‚¬â€ Material line items for scheduled or in-progress jobs.
- **Technician Work Requests** Ã¢â‚¬â€ Specific parts requested by technicians on-site directly from their mobile app.

## 2. AI-Driven Vendor Selection
The system evaluates available suppliers and recommends the best vendor based on unit cost, historical shipping performance, and current lead times.

## 3. Availability Validator & Lead Time Checks
We cross-reference expected delivery times with job schedules:
- **On-Time (Green)** Ã¢â‚¬â€ Arrives before the scheduled appointment.
- **Late / Risk (Red)** Ã¢â‚¬â€ Arrives after the job start. Warning flags are shown so you can choose alternative vendors or expedite delivery.
- **Unscheduled (Amber)** Ã¢â‚¬â€ The job lacks a scheduled date. Helpful prompts guide you to schedule the job so timelines can be validated.

## 4. Add to Order
Instead of manual entry, select any needed part in the backlog and click **"Add to Order"**. This lets you:
- Create a brand new draft Purchase Order (PO) for the recommended vendor.
- Append the materials directly to an existing draft PO for that vendor, consolidating shipments and saving on shipping fees.

## 5. Review & Place Orders with Vendor Integration
Once your draft PO is compiled, open the PO details page. You can now place the order directly with the vendor:
- **Real Credentials Integration** Ã¢â‚¬â€ Input your actual vendor account number, API key, or portal credentials directly, or use credentials saved in Organization Settings.
- **Sandbox Environment Switch** Ã¢â‚¬â€ Easily toggle between **Sandbox (Testing)** and **Production (Real Order)** to test integrations safely before committing funds.
- **Confirm & Place Order** Ã¢â‚¬â€ Send the order immediately via supplier APIs (e.g. Ferguson, Johnstone, or automated email integrations).

## 6. Live Audit Logs & Email Alerts
- **PO Audit Logs** Ã¢â‚¬â€ Every placement attempt logs a rich status entry in the PO details page, recording the user, timestamp, vendor response, transaction ID, and mode (Sandbox vs. Production).
- **Automated Notifications** Ã¢â‚¬â€ The system immediately fires email alerts to procurement admins and managers once an order is successfully placed, complete with product links and tracking summaries.

Once materials are received, click **"Mark Received"** on the PO details page to automatically update your warehouse or truck inventory levels!`,
        lastUpdated: '2026-05-22',
        keywords: ['procurement', 'backlog', 'purchase orders', 'PO', 'vendor', 'materials', 'parts', 'shipping', 'lead time', 'validator', 'add to order', 'place order', 'ferguson', 'johnstone', 'credentials', 'sandbox', 'audit logs', 'notification']
    },
    // Ã¢â‚¬â€ Enhanced Terms & Conditions Ã¢â‚¬â€
    {
        id: 'quote-terms-conditions',
        title: 'Quote Terms & Conditions (Liability Protection)',
        category: 'invoicing',
        content: `Every quote sent to a customer includes comprehensive **Terms & Conditions** that protect the technician, the service provider, and the business from legal liability.\\n\\n**What's Included**\\nThe Terms & Conditions are organized into six sections, automatically generated based on the **Jurisdiction State** set on the quote:\\n\\n1. **Payment** Ã¢â‚¬â€ Deposit requirements, payment-on-completion terms.\\n2. **Scope of Work** Ã¢â‚¬â€ Access requirements, additional work authorization, quote validity period, and concealed/unforeseen conditions clause.\\n3. **Warranty** Ã¢â‚¬â€ 90-day workmanship warranty, manufacturer pass-through warranty, warranty exclusions (misuse, neglect, acts of nature), and express disclaimer of implied warranties.\\n4. **Liability & Indemnification** Ã¢â‚¬â€ Limitation of total liability to the contract amount, exclusion of consequential/punitive damages, pre-existing condition disclaimers, code compliance notice, and customer indemnification clause.\\n5. **General Provisions** Ã¢â‚¬â€ Cancellation policy, force majeure, photo documentation notice, dispute resolution (binding arbitration), and entire agreement clause.\\n6. **Jurisdiction-Specific Notices** Ã¢â‚¬â€ Auto-generated based on the state selected on the quote.\\n\\n**Jurisdiction-Specific Protections**\\nThe system automatically adds required legal notices based on the state:\\n- **Right to Cancel Notice** Ã¢â‚¬â€ Required in most US states for home solicitation contracts (CA, TX, FL, NY, etc.)\\n- **Mechanics Lien Notice** Ã¢â‚¬â€ Required in states like CA, TX, FL, AZ, WA for home improvement work\\n- **Home Improvement License Notice** Ã¢â‚¬â€ Required in CA, CT, MD, NJ, NY, PA, VA, TN, LA, HI\\n- **State-Specific Notices** Ã¢â‚¬â€ California CSLB notice, Texas DTPA notice, Florida lien statute, Hawaii RICO notice\\n\\n**Key Legal Protections for Technicians**\\n- **Liability Cap** Ã¢â‚¬â€ Total liability is capped at the amount paid for services\\n- **Consequential Damages Exclusion** Ã¢â‚¬â€ No liability for lost profits, business interruption, or property damage not being serviced\\n- **Pre-existing Conditions** Ã¢â‚¬â€ Not responsible for wear, corrosion, or failure independent of work performed\\n- **Customer Indemnification** Ã¢â‚¬â€ Customer holds provider harmless for misuse, failure to follow recommendations, inaccurate info, or undisclosed conditions\\n- **Warranty Disclaimer** Ã¢â‚¬â€ Services provided "as is" beyond the express workmanship warranty\\n\\n**Setting the Jurisdiction**\\nWhen creating or editing a quote:\\n1. Scroll to the **Agreement** section\\n2. Select the applicable **State** from the dropdown\\n3. The Terms & Conditions will automatically adjust to include that state's required notices\\n\\n**Important Notes**\\n- These terms are displayed to the customer before they can approve a quote\\n- The customer must check "I have read and agree to the terms and conditions" before approving\\n- All liability-related clauses use conspicuous formatting (bold/uppercase) as required by most state courts\\n- Terms version is tracked on each quote for audit purposes\\n\\n**Q: Are these terms legally enforceable?**\\n**A:** These terms follow standard industry best practices and are drafted to be enforceable in most US jurisdictions. However, contract law varies by state. We recommend having a qualified attorney review the terms for your specific jurisdiction and business type.\\n\\n**Q: Can I customize the terms?**\\n**A:** The terms are currently auto-generated based on the jurisdiction. Custom terms will be available in a future update.\\n\\n**Q: What if my state isn't listed?**\\n**A:** All 50 US states are supported. The core protections (liability cap, warranty, indemnification) apply universally. State-specific notices are added for states with explicit requirements.`,
        lastUpdated: new Date().toISOString().split('T')[0],
        keywords: ['terms', 'conditions', 'liability', 'protection', 'indemnification', 'warranty', 'disclaimer', 'legal', 'jurisdiction', 'state', 'mechanics lien', 'right to cancel', 'force majeure', 'consequential damages', 'arbitration', 'technician protection']
    },
    {
        id: 'comms-reply-all',
        title: 'Using Reply All and Unified Inbox',
        category: 'communications',
        content: `Maintain full context of customer threads and communicate with multiple recipients seamlessly.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Reply vs Reply All',
                description: 'Reply emails only the primary sender. Reply All emails the primary sender and all CC recipients, keeping all relevant customers, managers, or partners in the loop. Choose the appropriate option based on whether the thread involves multiple stakeholders.',
                screenshotUrl: '/help-screenshots/communications/email-inbox.png'
            },
            {
                stepNumber: 2,
                title: 'Unified Inbox Feed',
                description: 'Outbound sent replies are automatically synchronized and visible in your primary Inbox view, forming a chronological conversation timeline of incoming and outgoing messages. All correspondence is also synced to the customer s Communication History on the Customer Portal.',
                screenshotUrl: '/help-screenshots/communications/email-inbox.png',
                tip: 'Customers can review the entire back-and-forth thread on their self-service Customer Portal under the Messages tab in real-time.'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['email', 'reply all', 'reply', 'cc', 'carbon copy', 'inbox', 'messages', 'portal', 'sync', 'communications']
    },
    {
        id: 'comms-alias-signatures-resize',
        title: 'Alias-Specific Signatures & Customizing the Email Grid',
        category: 'communications',
        content: `Customize your professional email identity for each address and dynamically adjust your workspace layout.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Configure Alias-Specific Signatures',
                description: 'Go to Organization Settings > Email Signature section. Use the "Configure Signature For Address" dropdown to select each email alias. Design a unique signature with your name, title, logo, and phone number. Click Save Changes.',
                screenshotUrl: '/help-screenshots/account/org-settings.png',
                tip: 'When sending from an alias address, DispatchBox automatically appends the signature you designed for that specific address.'
            },
            {
                stepNumber: 2,
                title: 'Resize and Sort Email Columns',
                description: 'In the email list, you can sort by the To column header (ascending/descending). Hover over any column border header and drag left or right to resize columns. Your custom widths save in local storage and persist between sessions.',
                screenshotUrl: '/help-screenshots/communications/email-inbox.png'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['email', 'signature', 'alias', 'resize', 'drag', 'columns', 'to', 'sort', 'mailbox', 'settings']
    },
    {
        id: 'comms-forwarding-threads',
        title: 'Email Forwarding & Chronological Conversation Threads',
        category: 'communications',
        content: `DispatchBox compiles every historical email exchanged with a customer into a unified conversation thread and supports direct forwarding.`,
        steps: [
            {
                stepNumber: 1,
                title: 'View Chronological Conversation Threads',
                description: 'When viewing any email in the Reading Pane, the system automatically groups all historical inbound and outbound emails with that customer in oldest-to-newest order. Past messages are in collapsible cards Ã¢â‚¬â€ click to expand. The selected message auto-expands by default.',
                screenshotUrl: '/help-screenshots/communications/email-inbox.png'
            },
            {
                stepNumber: 2,
                title: 'Forward Emails',
                description: 'Click the Forward button next to Reply All inside the active message view. Enter any email address in the Forward To field. Original attachments are automatically included, and you can attach new files. Standard forwarded headers (From, Date, Subject, To) are auto-generated.',
                screenshotUrl: '/help-screenshots/communications/email-inbox.png',
                tip: 'Forwarding preserves the full thread context Ã¢â‚¬â€ the recipient sees the entire conversation history, not just the last message.'
            }
        ],
        lastUpdated: '2026-06-15',
        keywords: ['forward', 'email forwarding', 'thread', 'conversation thread', 'chronological', 'expand', 'collapse', 'attachments']
    },
    {
        id: 'quote-internal-navigation-and-messages',
        title: 'Quote Dashboard Navigation & Timeline Messages',
        category: 'invoicing',
        content: `DispatchBox makes managing quote communications simple and integrated for technicians, dispatchers, and customers:

## 1. Dashboard Layout for Authenticated Staff
When a logged-in technician, dispatcher, owner, or administrator opens a quote link (e.g., /quote/QUOTE_ID), the page automatically adapts. Instead of showing the customer-facing public view of the quote, the system loads the technician's full **AI Recommendation & Quote** dashboard view.

This view provides comprehensive management tools in one place:
- **Customer details**: View and edit customer name, phone, email, and service address.
- **Call transcript**: Review phone call conversation history with the customer (collapsible).
- **AI Recommendation**: Access AI-generated diagnosis, recommended solutions, complexity estimates, confidence scores, and safety warnings.
- **Cost breakdown**: Summary cards for Labor, Materials, Equipment, and Travel.
- **Editable line items**: Directly add, edit, or delete items from the quote before sending.
- **Display settings**: Configure presentation mode (detailed, category roll-up, single price), display tax options, and customize discounts.
- **Communication history**: View chronological notes and messages from both customer and internal staff.

This ensures staff can make any necessary adjustments and send the final quote to the customer directly from the page.

## 2. Inline Activity Timeline Messages
Both customers and technicians can add notes and messages directly to the quote's activity timeline at any time:
- **Technician / Dispatcher Notes**: Add internal or customer-facing messages to keep the client updated.
- **Customer Messages**: Customers can add questions, updates, or notes directly to the quote even after it has been approved or declined, without affecting the quote's approval state.

## 3. How to Post a Note
1. Open the quote view page.
2. Scroll to the **Quote Activity** or **Add Message or Note** section.
3. Type your note in the input textarea.
4. Click **Send** to post. The note instantly appears in the chronologically ordered activity list.`,
        lastUpdated: '2026-06-08',
        keywords: ['quote', 'navigation', 'menus', 'messages', 'notes', 'timeline', 'customer portal', 'communication', 'post-approval', 'discussion', 'dashboard', 'edit quote', 'AI recommendation']
    },
    {
        id: 'upfront-payment-policy-rules',
        title: 'Upfront Deposit Policies & Dynamic Max-Deposit Rules',
        category: 'invoicing',
        content: `DispatchBox offers advanced deposit settings to help protect your business and automate upfront payments from customers.

**1. Configuring Multiple Deposit Rules:**
To configure how deposits are required:
1. Navigate to **Organization Settings** from your profile avatar menu.
2. Scroll to the **Upfront Payment Policy** section.
3. Toggle the policy status to **Enabled**.
4. Instead of choosing a single rule, you can check **multiple rules** to apply to your organization:
   - **Always Require Deposit** Ã¢â€â‚¬Ã¢â€â‚¬ Requires a percentage-based deposit on all quotes.
   - **New Customers Only** Ã¢â€â‚¬Ã¢â€â‚¬ Requires a percentage-based deposit if the customer has no past billing history.
   - **Quotes Over $ Threshold** Ã¢â€â‚¬Ã¢â€â‚¬ Requires a percentage-based deposit only for quotes exceeding a set threshold.
   - **100% of Materials/Parts Cost** Ã¢â€â‚¬Ã¢â€â‚¬ Requires a deposit matching the sum of all material items on the quote.
   - **Paid Estimate** Ã¢â€â‚¬Ã¢â€â‚¬ Requires a flat upfront fee (for diagnostic/on-site evaluation) that will be deducted from the invoice.
5. If you select threshold-based or flat fee rules, configure the **Threshold Amount**, **Paid Estimate Fee**, and **Default Deposit Percentage** fields that appear conditionally.
6. Click **Save Changes** to commit.

**2. Dynamic Highest-Amount Selection:**
When a technician or dispatcher creates a new quote:
- The system automatically evaluates all checked rules in your upfront policy.
- It calculates the deposit amount for each rule against the quote total and items.
- It automatically applies the **highest computed deposit amount** on the quote, assigning that rule as the active condition.
- As you edit the quote (adding/removing materials or changing prices), the system reactively recalculates and adjusts to the highest matching rule dynamically!

**3. Manually Selecting & Overriding Rules:**
Technicians and dispatchers have full control prior to sending the quote:
- In the quote creator under **Payment Terms & Deposit**, use the **Deposit Requirement** dropdown.
- By default, it is set to **Follow Organization Policy (Auto-evaluate)**.
- If you need to lock in a specific rule, choose it from the dropdown (e.g. Always, Over Threshold, Paid Estimate).
- You can also choose **Custom Amount** to manually type a deposit dollar figure, or select **No Deposit Required** to clear the deposit entirely.`,
        lastUpdated: '2026-06-05',
        keywords: ['deposit', 'upfront payment', 'down payment', 'policy', 'threshold', 'estimate fee', 'always require deposit', 'new customers', 'materials cost', 'highest deposit', 'auto-evaluate', 'manual override']
    },
    {
        id: 'quote-communication-history',
        title: 'Quote & Job Activity Timeline (Chronological History)',
        category: 'invoicing',
        content: `DispatchBox displays the entire history of a quote, job, and payment in a clean, chronological timeline sorted from the first step (top) to the latest (bottom).

## 1. Collapsible Activity Accordion
Instead of scrolling through a long list, each milestone in the process is presented as a summary row. You can click on any row to expand it and view detailed descriptions, timestamps, and notes. This timeline format is available across multiple areas:
- **Quotes** Ã¢â€â‚¬Ã¢â€â‚¬ Directly inside the expanded quote rows or on the Quote details page.
- **Jobs** Ã¢â€â‚¬Ã¢â€â‚¬ Expand any active job row inside the Jobs List to view its timeline instantly.
- **CRM Customer Profile** Ã¢â€â‚¬Ã¢â€â‚¬ Expand any historical job in the Customer's Job Ledger to see its activity.
- **Customer Portal** Ã¢â€â‚¬Ã¢â€â‚¬ Visible to customers inside their self-service portal under Job details.

## 2. Color-Coded Actions
To protect company communications:
- **Staff-Facing Timelines** Ã¢â€â‚¬Ã¢â€â‚¬ Display all communications, including internal technician notes and chat messages.
- **Customer-Facing Timelines** Ã¢â€â‚¬Ã¢â€â‚¬ Filter out all free-form technician messages (\`isInternal={false}\`), keeping internal notes hidden, while preserving customer notes, status updates, and price revision events.`,
        lastUpdated: '2026-06-05',
        keywords: ['timeline', 'history', 'quote history', 'job history', 'communication history', 'accordion', 'milestone', 'colors', 'notes', 'payments', 'approvals', 'price history', 'privacy', 'internal notes']
    },
    {
        id: 'ai-legal-jurisdictions',
        title: 'AI-Generated Legal Terms & Custom Jurisdictions',
        category: 'invoicing',
        content: `You can now generate custom legal Terms & Conditions for any country, state, or region globally using Gemini AI.

## 1. Adding a Custom Jurisdiction
To add a new custom region:
1. Go to **Organization Settings Ã¢â€ ’ Financial Settings**.
2. Scroll to **Jurisdiction Rule Sets**.
3. Under the custom region creator, type the name of the country, province, or region (e.g., "United Kingdom", "Ontario, Canada", or "Tokyo, Japan").
4. Click **Generate with Gemini**.
5. Gemini AI will analyze the region's specific commercial and service laws and generate customized T&C clauses for all six standard sections (Payment, Scope of Work, Warranty, Liability, General, and Local Notices).

## 2. Managing and Editing AI-Generated Terms
Once generated, the custom terms are loaded into your organization settings as editable overrides:
- You can modify the text for any clause directly in the textareas.
- Click **Save Changes** to store your overrides in Firestore.

## 3. Applying Custom Terms to Quotes
When creating a quote, select your custom region from the **Jurisdiction State** dropdown (listed under the "Custom / AI Generated" section). The quote's Terms & Conditions will dynamically load your customized legal clauses, protecting your business internationally.`,
        lastUpdated: '2026-06-05',
        keywords: ['legal', 'terms', 'T&C', 'jurisdiction', 'AI terms', 'Gemini', 'custom region', 'global', 'clauses', 'liability', 'warranty', 'payment']
    },
    {
        id: 'addon-ai-voice-email-callbacks',
        title: 'AI Voice Receptionist: Email Notifications & Scheduling Callback',
        category: 'addons',
        content: `DispatchBox's AI Voice Receptionist (Amy) supports automated outbound quote callbacks and scheduling calls. In the event that SMS services are unavailable or if a customer prefers email communications, the system automatically redirects all text notifications to email.

## 1. Outbound Quote & Scheduling Flow
When a quote is approved, Amy calls the customer to:
1. Verify the customer's identity.
2. Present available timeslots computed from the assigned technician's calendar.
3. Book and confirm the appointment instantly.

## 2. Dynamic Email Sourcing & Fallbacks
If texting (SMS) is disabled or experiencing service issues, the system shifts communication to emails:
- **Quote Links & Details**: Sent directly to the email address on the quote (\`customer.email\`).
- **Available Slots list**: Emailed to the customer if they prefer email or if the call goes unanswered.
- **Appointment Confirmations**: Emailed with full technician details, date/time, and a portal link for check-in.

## 3. Days of the Week Scheduling
When coordinating appointments, Amy asks: *"Which days of the week work best for you for scheduling?"* rather than restricting lookups to a single day.
- Callers can state multiple days (e.g. "Mondays and Wednesdays") and time-of-day preferences (e.g. "morning or afternoon").
- Amy retrieves and filters available 2-hour windows matching all requested preferences simultaneously.
- If no slots match, Amy contextually lists alternate available days and times.

## 4. Speech-to-Text Homophone Resolution
To prevent appointment selection errors due to transcription artifacts, Amy uses advanced phonetic matching rules:
- **Option 1**: Matches "one", "first", "won".
- **Option 2**: Matches "two", "too", "2", "second", "through", "thru", and "to" (when preceded by option).
- **Option 3**: Matches "three", "third", "3", "tree", "free" (when preceded by option).`,
        lastUpdated: '2026-06-08',
        keywords: ['AI Voice', 'voice callback', 'email notification', 'scheduling', 'slot filtering', 'homophones', 'Twilio', 'SendGrid', 'Amy', 'receptionist']
    },
    {
        id: 'automated-customer-followup-engine',
        title: 'Automated Customer Follow-up Engine',
        category: 'invoicing',
        content: `The **Automated Follow-up Engine** helps technicians and dispatchers configure customized outreach rules when customers do not respond to quotes, questions, invoices, or missed appointments.

## 1. Configuring Follow-up Rules

To set up rules:
1. Navigate to **Business Settings** via the sidebar (under the Settings gear icon) or your profile dropdown.
2. Select the **Follow-up Engine** tab.
3. Click the **"Build Custom Rule"** button in the top right.
4. Fill in the orchestrator form:
   - **Trigger Event** Ã¢â€â‚¬Ã¢â€â‚¬ Choose the event to monitor, organized by category:
     - **Quotes & Estimates**: Quote Sent but Unanswered, Quote Approved but Job Unscheduled, or Quote Declined by Customer.
     - **Jobs & Scheduling**: Appointment Missed, Appointment Unconfirmed, Technician Running Late, or Job Completed & Signed.
     - **Invoicing & Customer Care**: Invoice Past Due Date, Customer Question Pending, or Seasonal Service / Maintenance Due.
   - **Action to Take** Ã¢â€â‚¬Ã¢â€â‚¬ Select from context-specific actions filtered by your selected trigger:
     - *Resend via Email & SMS* or *Queue AI Phone Receptionist Call* (for unanswered quotes, unpaid invoices, pending questions, unconfirmed appointments, and seasonal maintenance).
     - *Request Feedback Survey* (for declined quotes).
     - *Send ETA Update SMS* (for when a technician runs late).
     - *Send Review Request & Receipt* (for completed jobs).
     - *Auto-Reschedule & Notify* (for missed appointments).
   - **Delay Settings** Ã¢â€â‚¬Ã¢â€â‚¬ Specify how long to wait before triggering the action (e.g., 24 hours, 3 days).
   - **Max Execution Retries** Ã¢â€â‚¬Ã¢â€â‚¬ Set how many times the engine should try this follow-up (up to 5 attempts).
5. Click **"Save Follow-up Rule"** to persist.

## 2. Rule Actions & Automatic Routing

- **Contextual Actions** Ã¢â€â‚¬Ã¢â€â‚¬ The builder automatically restricts and presents only appropriate actions for each trigger type to prevent scheduling conflicts or misrouted messages.
- **AI Phone Agent Call** Ã¢â€â‚¬Ã¢â€â‚¬ Choosing this option queues an autonomous phone call callback that calls the customer to ask if they want to approve a quote or reschedule.
- **Resending Quote / Invoice** Ã¢â€â‚¬Ã¢â€â‚¬ Automatically delivers the customer-facing tokenized quote/invoice links over email and SMS.

## 3. Managing the Pending Queue

The **Pending Action Queue** tab lists all automated follow-ups that have been scheduled by your rules:
- **Run Now** Ã¢â€â‚¬Ã¢â€â‚¬ Trigger the follow-up action immediately instead of waiting for the scheduled execution time.
- **Cancel** Ã¢â€â‚¬Ã¢â€â‚¬ Permanently remove a follow-up task from the queue to prevent further automated outreach for that customer.
- **Retry Count** Ã¢â€â‚¬Ã¢â€â‚¬ View how many times a follow-up has run (e.g., \`1 / 3\` attempts). If a manual or automated action runs, the retry count increments and the next attempt schedules for 1 day later until the limit is reached.`,
        lastUpdated: '2026-06-15',
        keywords: ['followup', 'follow-up', 'rules', 'outreach', 'resend quote', 'ai call', 'missed appointment', 'auto-reschedule', 'retry limit', 'pending queue', 'run now', 'cancel follow-up', 'categories']
    },
    {
        id: 'standalone-quote-creation',
        title: 'Create a Standalone Quote (No Job Required)',
        category: 'invoicing',
        content: `Create a quote directly from the Quotes page — no job needed. Great for phone inquiries, walk-in customers, or quick estimates.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Go to Quotes',
                description: 'Click **Quotes** in the left sidebar. You\'ll see all your existing quotes organized by status tabs.',
                screenshotUrl: '/help-screenshots/invoicing/quotes-page.png',
                tip: 'Look for the blue "+ New Quote" button in the top-right corner.'
            },
            {
                stepNumber: 2,
                title: 'Click "+ New Quote"',
                description: 'Click the blue **"+ New Quote"** button in the top-right corner. This opens the standalone quote builder — no job required.',
                screenshotUrl: '/help-screenshots/invoicing/quotes-page.png'
            },
            {
                stepNumber: 3,
                title: 'Add Customer Info',
                description: 'Fill in the customer\'s name and email (required). Phone and address are optional but helpful for tax calculation.',
                tip: 'The address auto-detects your tax jurisdiction so the right rates are applied.'
            },
            {
                stepNumber: 4,
                title: 'Add Line Items',
                description: 'Use the type buttons (Labor, Material, Equipment, Travel, Fee, Discount) to add items. Set quantities and prices for each.',
                tip: 'Materials from your inventory auto-populate with your stored pricing.'
            },
            {
                stepNumber: 5,
                title: 'Save or Send',
                description: 'Click **Save Draft** to come back later, or **Send to Customer** to email it with a secure viewing link.',
                screenshotUrl: '/help-screenshots/invoicing/quotes-page.png'
            }
        ],
        lastUpdated: '2026-06-22',
        keywords: ['standalone quote', 'new quote', 'manual quote', 'create quote', 'no job', 'quick estimate', 'walk-in', 'phone quote', 'quotes page']
    },
    {
        id: 'jobs-completion-signoff',
        title: 'Job Completion & Customer Sign-off',
        category: 'jobs',
        content: `When you finish a job on-site, use the Completion Wizard to upload photos, confirm parts used, and get the customer's signature — all in 3 quick steps.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Start the Completion Wizard',
                description: 'Open the job you just finished. Click the green **"Complete Job"** button in the top-right corner. This launches a 3-step wizard.',
                screenshotUrl: '/help-screenshots/jobs/jobs-list-full.png',
                tip: 'You can only complete jobs that are Scheduled or In Progress.'
            },
            {
                stepNumber: 2,
                title: 'Step 1: Upload Photos',
                description: 'Take or upload photos of the completed work. The AI automatically scans your photos to identify parts and materials used.',
                screenshotUrl: '/help-screenshots/jobs/jobs-list-full.png'
            },
            {
                stepNumber: 3,
                title: 'Step 2: Confirm Parts Used',
                description: 'Review the AI-identified parts list. Add or remove items, mark whether each came from stock or was purchased for the job. Inventory updates automatically.',
                screenshotUrl: '/help-screenshots/jobs/jobs-list-full.png'
            },
            {
                stepNumber: 4,
                title: 'Step 3: Get Customer Signature',
                description: 'Enter the signer\'s name and role (Customer, Property Manager, Tenant). Have them draw their signature on the digital pad. A legal consent clause is recorded automatically.',
                screenshotUrl: '/help-screenshots/jobs/jobs-list-full.png',
                tip: 'The signature, consent text, and timestamp are permanently saved. View them anytime from the completed Job Details page.'
            }
        ],
        lastUpdated: '2026-06-22',
        keywords: ['complete job', 'signature', 'sign-off', 'customer sign-off', 'satisfaction', 'consent', 'job completion', 'wizard', 'evidence', 'parts used']
    },
    {
        id: 'jobs-calendar-map-toggle',
        title: 'Hide or Show the Route Map',
        category: 'jobs',
        content: `Need more screen space? Hide the map panel on the Calendar page to see your full schedule grid.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Find the Toggle Button',
                description: 'On the Calendar page, look for the **"Hide Map"** button in the top-right header area, next to Auto-Assign.',
                screenshotUrl: '/help-screenshots/jobs/calendar-view.png',
                tip: 'Your preference saves automatically — it sticks between sessions.'
            },
            {
                stepNumber: 2,
                title: 'Hide the Map',
                description: 'Click **Hide Map**. The route map collapses and the schedule grid expands to full width. Great when you have many technicians.',
                screenshotUrl: '/help-screenshots/jobs/calendar-no-map.png',
                tip: 'Especially useful on smaller screens or when focused on time scheduling rather than routes.'
            },
            {
                stepNumber: 3,
                title: 'Show the Map Again',
                description: 'Click **Show Map** to bring the route map back. It slides in smoothly, showing technician routes for the selected day.',
                screenshotUrl: '/help-screenshots/jobs/calendar-view.png'
            }
        ],
        lastUpdated: '2026-06-22',
        keywords: ['map', 'hide', 'show', 'toggle', 'route', 'collapse', 'expand', 'calendar', 'screen space', 'full width']
    },
    {
        id: 'jobs-calendar-individual-tech',
        title: 'View an Individual Technician Schedule',
        category: 'jobs',
        content: `Zoom into one technician's schedule with a dedicated week or month view for detailed planning.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Click a Tech\'s Name',
                description: 'On the Calendar, hover over any technician\'s column header. You\'ll see a "Click for solo view" hint. Click it to open their dedicated calendar.',
                screenshotUrl: '/help-screenshots/jobs/calendar-view.png',
                tip: 'The solo view gives you a full-width calendar for just one tech — much easier to plan their day.'
            },
            {
                stepNumber: 2,
                title: 'Browse the Week View',
                description: 'The **Week** tab shows day-by-day tabs across the top. Click any day to see their hourly schedule. Each tab shows a badge with how many jobs are on that day.',
                screenshotUrl: '/help-screenshots/jobs/calendar-tech-week.png'
            },
            {
                stepNumber: 3,
                title: 'Switch to Month View',
                description: 'Click the **Month** toggle to see a full monthly grid. Each day shows compact job pills with time, customer name, and a priority color dot.',
                screenshotUrl: '/help-screenshots/jobs/calendar-tech-week.png',
                tip: 'Click any day in the month grid to zoom into that day\'s hour-by-hour view.'
            },
            {
                stepNumber: 4,
                title: 'Go Back',
                description: 'Click **"â† All Technicians"** in the top-left to return to the full team calendar view.',
                screenshotUrl: '/help-screenshots/jobs/calendar-tech-week.png'
            }
        ],
        lastUpdated: '2026-06-22',
        keywords: ['individual', 'technician', 'solo', 'focus', 'week', 'month', 'schedule', 'single tech', 'calendar view', 'navigate']
    },
    {
        id: 'jobs-calendar-click-to-create',
        title: 'Create a Job from the Calendar',
        category: 'jobs',
        content: `The fastest way to schedule a job: click an empty time slot on the calendar and the technician and time are filled in automatically.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Click an Empty Slot',
                description: 'Hover over any empty time slot on the calendar under a tech\'s column. A "ï¼‹ New Job" indicator appears. Click it.',
                screenshotUrl: '/help-screenshots/jobs/calendar-view.png',
                tip: 'The tech and time are pre-filled — you just need to add the customer and job details.'
            },
            {
                stepNumber: 2,
                title: 'Fill in the Details',
                description: 'Enter the customer name, phone, email, and address. Add a description, pick the job type, set priority, and choose a duration.',
                screenshotUrl: '/help-screenshots/jobs/create-job-form.png'
            },
            {
                stepNumber: 3,
                title: 'Click Create Job',
                description: 'Hit **Create Job**. The job is instantly scheduled and assigned. It appears on the calendar right away.',
                screenshotUrl: '/help-screenshots/jobs/create-job-form.png',
                tip: 'After creating, you\'ll see an option to generate an AI Quote with an instant cost estimate and materials list.'
            }
        ],
        lastUpdated: '2026-06-22',
        keywords: ['create job', 'calendar', 'click', 'empty slot', 'quick create', 'new job', 'time slot', 'schedule', 'fast', 'inline']
    },
    {
        id: 'jobs-calendar-ai-quote',
        title: 'Generate AI Quote & Materials from Calendar',
        category: 'jobs',
        content: `After creating a job from the calendar, one click generates a full AI-powered quote with recommended tools and materials.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Create a Job First',
                description: 'Click an empty time slot, fill in the details, and hit Create Job. A success screen appears.',
                screenshotUrl: '/help-screenshots/jobs/create-job-form.png'
            },
            {
                stepNumber: 2,
                title: 'Click "Generate AI Quote"',
                description: 'On the success screen, click the purple **"Generate AI Quote and Materials"** button. The AI reads the job description, checks your inventory, and builds a complete quote.',
                screenshotUrl: '/help-screenshots/jobs/create-job-form.png',
                tip: 'The AI uses your past job history for accurate labor estimates and your inventory for real pricing.'
            },
            {
                stepNumber: 3,
                title: 'Review What AI Built',
                description: 'The AI Quote Panel shows: diagnosis, recommended tools (with owned/needed status), materials (with stock levels), and a full editable quote breakdown.',
                screenshotUrl: '/help-screenshots/invoicing/quotes-page.png'
            },
            {
                stepNumber: 4,
                title: 'Edit & Send',
                description: 'Adjust any line items, then click **Save**. Send the quote to the customer via email, SMS, or AI voice callback.',
                screenshotUrl: '/help-screenshots/invoicing/quotes-page.png',
                tip: 'You can skip the AI quote now and generate it later from the job detail page.'
            }
        ],
        lastUpdated: '2026-06-22',
        keywords: ['AI', 'quote', 'materials', 'tools', 'generate', 'calendar', 'estimate', 'auto-quote', 'inline', 'inventory', 'parts', 'recommendation']
    },

    // -- Tech Dashboard Multi-Layout Views --
    {
        id: 'tech-dashboard-views',
        title: 'Tech Dashboard — 5 Job Views',
        category: 'jobs',
        content: `Pick the layout that works best for you. Your dashboard has 5 different views for managing your daily jobs — from a quick briefing to a full route planner with live traffic.`,
        steps: [
            {
                stepNumber: 1,
                title: 'Find the View Switcher',
                description: 'On your dashboard, scroll to **"My Jobs View"**. The pill-bar in the top-right has 5 buttons: ðŸ“‹ Briefing, ðŸ—ºï¸ Route, ðŸŽ¯ Priority, ðŸ“Š Dossier, ðŸ“… Week. Click any to switch.',
                screenshotUrl: '/help-screenshots/jobs/tech-briefing-view.png',
                tip: 'Your choice saves automatically and persists next time you log in.'
            },
            {
                stepNumber: 2,
                title: 'ðŸ“‹ Mission Briefing',
                description: 'Card-style view showing each job with customer info, address, time, priority, and description. Quick action buttons: **Start Job**, **Call**, and **Navigate**.',
                screenshotUrl: '/help-screenshots/jobs/tech-briefing-view.png'
            },
            {
                stepNumber: 3,
                title: 'ðŸ—ºï¸ Route Planner',
                description: 'See your jobs in order with **real Google Maps drive times** between each stop. The header shows your total drive time for the day. Green badges show live traffic data.',
                screenshotUrl: '/help-screenshots/jobs/tech-route-view.png',
                tip: 'Drive times come from Google Maps with real-time traffic. Results are cached to keep things fast.'
            },
            {
                stepNumber: 4,
                title: 'ðŸŽ¯ Smart Priority',
                description: 'A 3-column kanban board: **Ready to Go**, **Needs Prep**, and **Blocked**. An AI banner at the top recommends which job to start with.',
                screenshotUrl: '/help-screenshots/jobs/tech-priority-view.png'
            },
            {
                stepNumber: 5,
                title: 'ðŸ“Š Job Dossier',
                description: 'Split-panel view — job list on the left, full job details on the right with tabs for Description, Materials & Quote, and Notes. Includes a live timer for in-progress work.',
                screenshotUrl: '/help-screenshots/jobs/tech-dossier-view.png'
            },
            {
                stepNumber: 6,
                title: 'ðŸ“… Week at a Glance',
                description: 'Mon—Fri columns showing mini job cards for each day. See your whole week at once. Click any card to expand it for actions.',
                screenshotUrl: '/help-screenshots/jobs/tech-week-view.png',
                tip: 'Dispatchers can set the default view for any tech (or all techs) from the Technician Manager page using "Set View for All".'
            }
        ],
        lastUpdated: '2026-06-22',
        keywords: ['dashboard', 'view', 'layout', 'mission briefing', 'route planner', 'smart priority', 'job dossier', 'week at a glance', 'drive time', 'traffic', 'kanban', 'tech view', 'switcher']
    }
];

export interface HelpVideo {
    id: string;
    title: string;
    description: string;
    category: string;
    duration: string; // e.g. "3:45"
    thumbnailUrl?: string;
    videoUrl?: string; // YouTube embed URL or hosted URL
    lastUpdated: string;
}

// Default videos ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â these can also be managed via Firestore `help_videos` collection
export const DEFAULT_HELP_VIDEOS: HelpVideo[] = [
    {
        id: 'vid-getting-started',
        title: 'Getting Started with DispatchBox',
        description: 'A quick tour of the dashboard, sidebar navigation, and key business metrics at a glance.',
        category: 'getting-started',
        duration: '0:45',
        videoUrl: '/videos/tutorial-dashboard.webp',
        lastUpdated: '2026-04-08',
    },
    {
        id: 'vid-create-job',
        title: 'Creating & Managing Jobs',
        description: 'How to create new service jobs using the sidebar, fill in details, and assign technicians.',
        category: 'jobs',
        duration: '0:40',
        videoUrl: '/videos/tutorial-creating-jobs.webp',
        lastUpdated: '2026-04-08',
    },
    {
        id: 'vid-calendar',
        title: 'Calendar & Scheduling',
        description: 'Master the calendar view with day, week, and month modes for scheduling your team.',
        category: 'jobs',
        duration: '0:35',
        videoUrl: '/videos/tutorial-calendar.webp',
        lastUpdated: '2026-04-08',
    },
    {
        id: 'vid-invoicing',
        title: 'Invoicing & Getting Paid',
        description: 'Create invoices, filter by status, view details, and send to customers for payment.',
        category: 'invoicing',
        duration: '0:50',
        videoUrl: '/videos/tutorial-invoicing.webp',
        lastUpdated: '2026-04-08',
    },
    {
        id: 'vid-materials',
        title: 'Materials Inventory',
        description: 'Track materials and parts across locations ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â filter by truck, warehouse, and manage stock levels.',
        category: 'inventory',
        duration: '0:40',
        videoUrl: '/videos/tutorial-materials.webp',
        lastUpdated: '2026-04-08',
    },
    {
        id: 'vid-tools',
        title: 'Tool Tracking',
        description: 'Keep track of company tools and equipment ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â assignments, conditions, and check-in/check-out.',
        category: 'inventory',
        duration: '0:45',
        videoUrl: '/videos/tutorial-tools.webp',
        lastUpdated: '2026-04-08',
    },
    {
        id: 'vid-customers',
        title: 'Customer Management',
        description: 'Manage your customer database ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â search contacts, view profiles, job history, and rate cards.',
        category: 'customers',
        duration: '0:45',
        videoUrl: '/videos/tutorial-customers.webp',
        lastUpdated: '2026-04-08',
    },
];
