import { TradeProgram } from '../types/TradeProgram';

export const TRADE_PROGRAMS_CATALOG: TradeProgram[] = [
    // ─── General Hardware & Building ──────────────────────────────────────────
    {
        id: 'home_depot_proxtra',
        supplierName: 'The Home Depot',
        programName: 'ProXtra Loyalty & Trade Discount',
        tagline: 'Volume Pricing Program (VPP) & Up to 20% Paint Rewards',
        tradeCategory: 'general_hardware',
        categoryLabel: 'General Hardware & Building',
        country: 'US',
        countryLabel: 'United States',
        stateScope: 'national',
        stateScopeLabel: 'National (All 50 States)',
        typicalDiscountPercent: 15,
        discountDescription: 'Tiered volume pricing on bulk lumber, electrical, plumbing, wire & up to 20% off paint & stains.',
        perks: [
            'Volume Pricing Program (VPP) on orders over $1,500',
            'Up to 20% off paints, primers, and stains',
            'Dedicated Pro Desk checkout & reserved contractor parking',
            'Purchase tracking & digital receipt storage for tax accounting',
            'Direct job-site flatbed delivery discounts'
        ],
        enrollmentUrl: 'https://www.homedepot.com/c/Pro_Xtra',
        portalLoginUrl: 'https://www.homedepot.com/auth/view/signin',
        defaultPaymentTerms: 'Credit Card on File',
        discountCodeTemplate: 'PROXTRA',
        sourcingStrength: 'local_pickup',
        integrationType: 'email_pdf',
        requiredOrderFields: [
            {
                id: 'hd_proxtra_num',
                key: 'proXtraAccountNumber',
                label: 'ProXtra Account / Phone #',
                description: 'Registered ProXtra phone number or contractor account ID',
                type: 'text',
                required: true,
                defaultValue: ''
            },
            {
                id: 'hd_job_name',
                key: 'jobName',
                label: 'Job Name / PO #',
                description: 'Assigned job name for receipt itemization and tax grouping',
                type: 'text',
                required: true,
                defaultValue: ''
            }
        ],
        notesForContractor: 'Once enrolled, provide your ProXtra phone number on all purchase orders to automatically earn quarterly rebate spend.'
    },
    {
        id: 'amazon_business_prime',
        supplierName: 'Amazon Business',
        programName: 'Amazon Business Prime & Contractor Pricing',
        tagline: 'Wholesale Quantity Discounts & Tax-Exempt Purchasing',
        tradeCategory: 'general_hardware',
        categoryLabel: 'General Hardware & MRO',
        country: 'US',
        countryLabel: 'United States',
        stateScope: 'national',
        stateScopeLabel: 'National / Global',
        typicalDiscountPercent: 10,
        discountDescription: 'B2B-only quantity price breaks on 50M+ commercial items, tools, safety gear, and hardware.',
        perks: [
            'Quantity Discounts starting at 2+ units on commercial SKUs',
            'Tax-Exempt Purchasing Program (ATEP) auto-applied at checkout',
            'Fast Free Business Prime delivery directly to service vans or shops',
            'Multi-user purchasing workflows & expense approvals',
            'PunchOut & Dynamic API e-procurement ready'
        ],
        enrollmentUrl: 'https://business.amazon.com/',
        portalLoginUrl: 'https://www.amazon.com/ap/signin',
        defaultPaymentTerms: 'Credit Card on File',
        discountCodeTemplate: 'AMZBIZ',
        sourcingStrength: 'commodity_lowest',
        integrationType: 'dynamic_api',
        requiredOrderFields: [
            {
                id: 'amz_biz_email',
                key: 'businessEmail',
                label: 'Amazon Business Email',
                description: 'Email associated with your verified Amazon Business account',
                type: 'email',
                required: true,
                defaultValue: ''
            },
            {
                id: 'amz_po_num',
                key: 'poNumber',
                label: 'Purchase Order Reference',
                description: 'Internal PO number to print on Amazon packing slips',
                type: 'text',
                required: true,
                defaultValue: ''
            }
        ]
    },
    {
        id: 'lowes_mvp_pro',
        supplierName: "Lowe's",
        programName: 'Lowe’s MVP Pro Rewards',
        tagline: '5% Everyday Discount with Lowe’s Commercial Card + Volume Savings',
        tradeCategory: 'general_hardware',
        categoryLabel: 'General Hardware & Building',
        country: 'US',
        countryLabel: 'United States',
        stateScope: 'national',
        stateScopeLabel: 'National (All 50 States)',
        typicalDiscountPercent: 10,
        discountDescription: '5% off every purchase on Lowe’s Commercial Accounts + Volume Savings discounts on bulk orders.',
        perks: [
            '5% off everyday purchases with Lowe’s Commercial credit cards',
            'Volume Savings Program on bulk orders over $1,500',
            'MVP Bonus Points redeemable for tools, gift cards, and merchandise',
            'Exclusive Paint Rewards program with up to 20% back',
            'Reduced standard delivery rates on bulk materials'
        ],
        enrollmentUrl: 'https://www.lowes.com/l/pro/mvp-pro-rewards',
        portalLoginUrl: 'https://www.lowes.com/login',
        defaultPaymentTerms: 'Credit Card on File',
        discountCodeTemplate: 'LOWESMVP',
        sourcingStrength: 'local_pickup',
        integrationType: 'email_pdf',
        requiredOrderFields: [
            {
                id: 'lowes_mvp_id',
                key: 'mvpAccountId',
                label: 'MVP Account / Phone #',
                description: 'Registered MVP phone number or Pro ID',
                type: 'text',
                required: true,
                defaultValue: ''
            }
        ]
    },

    // ─── HVAC & Refrigeration ──────────────────────────────────────────────────
    {
        id: 'johnstone_supply_pro',
        supplierName: 'Johnstone Supply',
        programName: 'Johnstone Contractor Pro Portal & OEM Rewards',
        tagline: 'Wholesale HVAC/R Parts, Equipment & Contractor Credit Terms',
        tradeCategory: 'hvac_refrigeration',
        categoryLabel: 'HVAC & Refrigeration',
        country: 'US',
        countryLabel: 'United States',
        stateScope: 'national',
        stateScopeLabel: 'National (450+ Locations)',
        typicalDiscountPercent: 20,
        discountDescription: 'Wholesale trade pricing on OEM compressors, motors, refrigerants, thermostats, and coils.',
        perks: [
            'Wholesale contractor-only catalog & tiered pricing',
            'OE Parts Cross-Reference tool & live branch counter availability',
            'Net 30 / Net 60 commercial credit accounts',
            'Same-day express local counter pickup and emergency after-hours dispatch',
            'Free contractor training & EPA certification support'
        ],
        enrollmentUrl: 'https://www.johnstonesupply.com/contractor-registration',
        portalLoginUrl: 'https://www.johnstonesupply.com/login',
        defaultPaymentTerms: 'Net 30',
        discountCodeTemplate: 'JSPRO',
        sourcingStrength: 'urgent_callout',
        integrationType: 'email_pdf',
        requiredOrderFields: [
            {
                id: 'js_acct_num',
                key: 'johnstoneAccountNumber',
                label: 'Johnstone Account Number',
                description: 'Your trade account number for wholesale price lookup',
                type: 'text',
                required: true,
                defaultValue: ''
            },
            {
                id: 'js_store_num',
                key: 'preferredBranch',
                label: 'Local Branch / Store #',
                description: 'Primary local branch for counter pickup or courier dispatch',
                type: 'text',
                required: true,
                defaultValue: ''
            },
            {
                id: 'js_epa_num',
                key: 'epaCertNumber',
                label: 'EPA 608 Certification #',
                description: 'Mandatory for refrigerant orders (R-410A, R-22, R-454B)',
                type: 'text',
                required: false,
                defaultValue: ''
            }
        ]
    },
    {
        id: 'united_refrigeration_pro',
        supplierName: 'United Refrigeration Inc.',
        programName: 'United Refrigeration Trade Account',
        tagline: 'Commercial Refrigeration & HVAC Wholesale Supply',
        tradeCategory: 'hvac_refrigeration',
        categoryLabel: 'HVAC & Refrigeration',
        country: 'US',
        countryLabel: 'United States',
        stateScope: 'national',
        stateScopeLabel: 'National (400+ Branches)',
        typicalDiscountPercent: 18,
        discountDescription: 'Commercial contractor discounts on Copeland, Sporlan, Carrier, and Chemours refrigerants.',
        perks: [
            'Direct wholesale manufacturer distributor pricing',
            'Full commercial & supermarket refrigeration line in stock',
            'Comprehensive credit lines with Net 30 terms',
            'Local branch stock reservations via technician app'
        ],
        enrollmentUrl: 'https://www.uri.com/account-request',
        portalLoginUrl: 'https://www.uri.com/login',
        defaultPaymentTerms: 'Net 30',
        discountCodeTemplate: 'URIPRO',
        sourcingStrength: 'specialty_quality',
        integrationType: 'email_pdf',
        requiredOrderFields: [
            {
                id: 'uri_acct_num',
                key: 'uriAccountNumber',
                label: 'URI Trade Account #',
                description: 'Contractor account number',
                type: 'text',
                required: true,
                defaultValue: ''
            }
        ]
    },

    // ─── Plumbing & Piping ────────────────────────────────────────────────────
    {
        id: 'ferguson_proplus',
        supplierName: 'Ferguson Plumbing Supply',
        programName: 'Ferguson ProPlus Contractor Advantage',
        tagline: 'Wholesale Plumbing, Water Heaters, Pipe/Valves & Dedicated Quoting Desk',
        tradeCategory: 'plumbing_piping',
        categoryLabel: 'Plumbing & Piping',
        country: 'US',
        countryLabel: 'United States',
        stateScope: 'national',
        stateScopeLabel: 'National (1,700+ Branches)',
        typicalDiscountPercent: 22,
        discountDescription: 'Tiered wholesale pricing on commercial water heaters, PEX, copper, fixtures, pumps, and valves.',
        perks: [
            'Wholesale trade account pricing across 1,700+ Ferguson counters',
            'Direct job-site boom truck delivery with scheduled arrival windows',
            'Ferguson Pro Online quoting, inventory visibility & line of credit',
            'ProPlus loyalty points convertible into invoice bill credits',
            'Emergency after-hours parts sourcing'
        ],
        enrollmentUrl: 'https://www.ferguson.com/content/trade-customer',
        portalLoginUrl: 'https://www.ferguson.com/login',
        defaultPaymentTerms: 'Net 30',
        discountCodeTemplate: 'FERGPRO',
        sourcingStrength: 'specialty_quality',
        integrationType: 'email_pdf',
        requiredOrderFields: [
            {
                id: 'ferg_acct_num',
                key: 'fergusonAccountNumber',
                label: 'Ferguson Account #',
                description: 'Contractor trade account identifier',
                type: 'text',
                required: true,
                defaultValue: ''
            },
            {
                id: 'ferg_branch',
                key: 'fulfillmentBranch',
                label: 'Fulfillment Branch / Counter',
                description: 'Local supply house location code',
                type: 'text',
                required: false,
                defaultValue: ''
            }
        ]
    },
    {
        id: 'winsupply_pro',
        supplierName: 'Winsupply',
        programName: 'Winsupply Local Contractor Partnership',
        tagline: 'Locally Owned Wholesale Plumbing & Industrial Piping',
        tradeCategory: 'plumbing_piping',
        categoryLabel: 'Plumbing & Piping',
        country: 'US',
        countryLabel: 'United States',
        stateScope: 'national',
        stateScopeLabel: 'National (600+ Local Win Companies)',
        typicalDiscountPercent: 18,
        discountDescription: 'Local Win company partner discounts on rough plumbing, fixtures, tools, and pipe fittings.',
        perks: [
            'Direct local relationship with branch owner/operators',
            'Flexible commercial credit terms & customizable delivery schedules',
            'High volume commercial pipe, valve, and fitting discounts'
        ],
        enrollmentUrl: 'https://www.winsupplyinc.com/open-account',
        portalLoginUrl: 'https://www.winsupplyinc.com/login',
        defaultPaymentTerms: 'Net 30',
        discountCodeTemplate: 'WINPRO',
        sourcingStrength: 'local_pickup',
        integrationType: 'email_pdf',
        requiredOrderFields: [
            {
                id: 'win_acct_num',
                key: 'winAccountNumber',
                label: 'Winsupply Account #',
                description: 'Your local Win company account number',
                type: 'text',
                required: true,
                defaultValue: ''
            }
        ]
    },

    // ─── Electrical & Lighting ────────────────────────────────────────────────
    {
        id: 'graybar_pro',
        supplierName: 'Graybar',
        programName: 'Graybar Contractor Services & Trade Discount',
        tagline: 'Commercial Electrical, Datacom, Switchgear & Wire Wholesale',
        tradeCategory: 'electrical_lighting',
        categoryLabel: 'Electrical & Lighting',
        country: 'US',
        countryLabel: 'United States',
        stateScope: 'national',
        stateScopeLabel: 'National (300+ Distribution Centers)',
        typicalDiscountPercent: 20,
        discountDescription: 'Enterprise trade pricing on copper wire, conduit, panels, circuit breakers, EV chargers, and lighting.',
        perks: [
            'Wire cutting & paralleling services directly to reel',
            'Staged job-site delivery trailers & material kitting',
            'Graybar.com customized contractor catalog & Net 30/60 billing',
            'Major project switchgear submittals & quotes team'
        ],
        enrollmentUrl: 'https://www.graybar.com/register',
        portalLoginUrl: 'https://www.graybar.com/login',
        defaultPaymentTerms: 'Net 30',
        discountCodeTemplate: 'GRAYPRO',
        sourcingStrength: 'specialty_quality',
        integrationType: 'email_pdf',
        requiredOrderFields: [
            {
                id: 'gray_acct_num',
                key: 'graybarAccountNumber',
                label: 'Graybar Account #',
                description: 'Registered Graybar customer account ID',
                type: 'text',
                required: true,
                defaultValue: ''
            },
            {
                id: 'gray_job_ref',
                key: 'jobReference',
                label: 'Project / Job Tag',
                description: 'Tag printed on wire reels and kitted pallets',
                type: 'text',
                required: true,
                defaultValue: ''
            }
        ]
    },
    {
        id: 'rexel_electrical',
        supplierName: 'Rexel USA (Platt / Gexpro / Capitol)',
        programName: 'Rexel Pro Contractor Program',
        tagline: 'Nationwide Electrical Distribution & Energy Solutions',
        tradeCategory: 'electrical_lighting',
        categoryLabel: 'Electrical & Lighting',
        country: 'US',
        countryLabel: 'United States',
        stateScope: 'national',
        stateScopeLabel: 'National (450+ Branches)',
        typicalDiscountPercent: 20,
        discountDescription: 'Wholesale pricing on Eaton, Square D, Milwaukee, Southwire, and Lutron systems.',
        perks: [
            '24/7 emergency electrical material dispatch',
            'Consignment job boxes & on-site job trailers',
            'Rexel Rewards program on recurring commercial purchases'
        ],
        enrollmentUrl: 'https://www.rexelusa.com/open-an-account',
        portalLoginUrl: 'https://www.rexelusa.com/login',
        defaultPaymentTerms: 'Net 30',
        discountCodeTemplate: 'REXELPRO',
        sourcingStrength: 'specialty_quality',
        integrationType: 'email_pdf',
        requiredOrderFields: [
            {
                id: 'rexel_acct_num',
                key: 'rexelAccountNumber',
                label: 'Rexel Customer Account #',
                description: 'Contractor account number',
                type: 'text',
                required: true,
                defaultValue: ''
            }
        ]
    },

    // ─── Facility Maintenance & Industrial MRO ────────────────────────────────
    {
        id: 'grainger_edge',
        supplierName: 'W.W. Grainger',
        programName: 'Grainger Edge & Corporate Contractor Account',
        tagline: '1.5M+ MRO Supplies, Same-Day Sourcing & B2B EDI Ordering',
        tradeCategory: 'facility_maintenance',
        categoryLabel: 'Facility Maintenance & MRO',
        country: 'US',
        countryLabel: 'United States',
        stateScope: 'national',
        stateScopeLabel: 'National & Canada',
        typicalDiscountPercent: 15,
        discountDescription: 'Standardized contract pricing on motors, safety PPE, electrical, test instruments, and plumbing.',
        perks: [
            'Pre-negotiated contractor discount schedules across 30+ product categories',
            'Grainger KeepStock vendor-managed inventory & barcode scanning',
            'Guaranteed same-day shipping on in-stock orders placed by 5 PM',
            'Full Dynamic API & PunchOut ordering capability'
        ],
        enrollmentUrl: 'https://www.grainger.com/content/business-solutions',
        portalLoginUrl: 'https://www.grainger.com/login',
        defaultPaymentTerms: 'Net 30',
        discountCodeTemplate: 'GRAINGEREDGE',
        sourcingStrength: 'general',
        integrationType: 'dynamic_api',
        requiredOrderFields: [
            {
                id: 'grainger_acct_num',
                key: 'graingerAccountNumber',
                label: 'Grainger Account #',
                description: 'Contractor account number for contract pricing',
                type: 'text',
                required: true,
                defaultValue: ''
            },
            {
                id: 'grainger_attn',
                key: 'deliveryAttention',
                label: 'Attention / Recipient',
                description: 'Name of technician or bay receiving shipment',
                type: 'text',
                required: true,
                defaultValue: ''
            }
        ]
    },
    {
        id: 'fastenal_fmi',
        supplierName: 'Fastenal',
        programName: 'Fastenal Managed Inventory & Contractor Accounts',
        tagline: 'Fasteners, Hardware, Consumables & On-Site Lockers',
        tradeCategory: 'facility_maintenance',
        categoryLabel: 'Facility Maintenance & Fasteners',
        country: 'US',
        countryLabel: 'United States',
        stateScope: 'national',
        stateScopeLabel: 'National & Global',
        typicalDiscountPercent: 20,
        discountDescription: 'Deep volume discounts on industrial fasteners, anchors, strut, safety gear, and tooling.',
        perks: [
            'FMI Smart Vending & FASTLockers for your shop or service vans',
            'Custom bin-stocking and automatic reorder replenishment',
            'Local branch delivery runs on custom schedule'
        ],
        enrollmentUrl: 'https://www.fastenal.com/account/register',
        portalLoginUrl: 'https://www.fastenal.com/login',
        defaultPaymentTerms: 'Net 30',
        discountCodeTemplate: 'FASTPRO',
        sourcingStrength: 'commodity_lowest',
        integrationType: 'email_pdf',
        requiredOrderFields: [
            {
                id: 'fastenal_acct_num',
                key: 'fastenalAccountNumber',
                label: 'Fastenal Account #',
                description: 'Fastenal commercial account code',
                type: 'text',
                required: true,
                defaultValue: ''
            }
        ]
    },

    // ─── Paint & Coatings ─────────────────────────────────────────────────────
    {
        id: 'sherwin_williams_pro',
        supplierName: 'Sherwin-Williams',
        programName: 'Sherwin-Williams PRO+ Account',
        tagline: 'Up to 30% Wholesale Paint Pricing & Free Jobsite Delivery',
        tradeCategory: 'paint_coatings',
        categoryLabel: 'Paint & Surface Coatings',
        country: 'US',
        countryLabel: 'United States',
        stateScope: 'national',
        stateScopeLabel: 'National (4,800+ Stores)',
        typicalDiscountPercent: 25,
        discountDescription: 'Up to 30% off retail list on interior/exterior paints, industrial coatings, sprayers, and sundries.',
        perks: [
            'Personalized wholesale contractor pricing on all paints & stains',
            'Free job-site delivery from local Sherwin-Williams store',
            'PRO+ App for custom color formula saving & online ordering',
            'Special contractor financing with 0% interest terms'
        ],
        enrollmentUrl: 'https://www.sherwin-williams.com/homeowners/pro-registration',
        portalLoginUrl: 'https://www.sherwin-williams.com/pro/login',
        defaultPaymentTerms: 'Net 30',
        discountCodeTemplate: 'SWPROPLUS',
        sourcingStrength: 'local_pickup',
        integrationType: 'email_pdf',
        requiredOrderFields: [
            {
                id: 'sw_acct_num',
                key: 'sherwinAccountNumber',
                label: 'PRO+ Account #',
                description: 'Your 9-digit Sherwin-Williams contractor account number',
                type: 'text',
                required: true,
                defaultValue: ''
            },
            {
                id: 'sw_job_name',
                key: 'jobReference',
                label: 'Job Name & Color Formula Code',
                description: 'Job name for formula lookup and custom tint batching',
                type: 'text',
                required: true,
                defaultValue: ''
            }
        ]
    },

    // ─── Roofing & Siding ─────────────────────────────────────────────────────
    {
        id: 'abc_supply_pro',
        supplierName: 'ABC Supply Co. Inc.',
        programName: 'ABC Supply Pro Contractor Program',
        tagline: 'Roofing, Siding, Gutters & Rooftop Crane Delivery',
        tradeCategory: 'roofing_siding',
        categoryLabel: 'Roofing & Building Envelope',
        country: 'US',
        countryLabel: 'United States',
        stateScope: 'national',
        stateScopeLabel: 'National (900+ Locations)',
        typicalDiscountPercent: 18,
        discountDescription: 'Wholesale pricing on GAF, Owens Corning, CertainTeed shingles, membranes, underlayments, and trim.',
        perks: [
            'Rooftop crane placement & ground drop delivery on demand',
            'ABC Connect digital ordering, material staging & order tracking',
            'Full manufacturer warranty certification support'
        ],
        enrollmentUrl: 'https://www.abcsupply.com/customer-registration',
        portalLoginUrl: 'https://www.abcsupply.com/login',
        defaultPaymentTerms: 'Net 30',
        discountCodeTemplate: 'ABCPRO',
        sourcingStrength: 'specialty_quality',
        integrationType: 'email_pdf',
        requiredOrderFields: [
            {
                id: 'abc_acct_num',
                key: 'abcAccountNumber',
                label: 'ABC Supply Account #',
                description: 'Commercial customer account number',
                type: 'text',
                required: true,
                defaultValue: ''
            },
            {
                id: 'abc_delivery_type',
                key: 'deliveryType',
                label: 'Delivery Type (Rooftop vs Ground)',
                description: 'Specify if rooftop crane drop or ground drop is needed',
                type: 'select',
                options: ['Rooftop Crane Placement', 'Ground Dump / Drop', 'Local Branch Counter Pickup'],
                required: true,
                defaultValue: 'Rooftop Crane Placement'
            }
        ]
    },

    // ─── Tools & Equipment Rental ─────────────────────────────────────────────
    {
        id: 'sunbelt_rentals_pro',
        supplierName: 'Sunbelt Rentals',
        programName: 'Sunbelt Rentals Trade & Fleet Account',
        tagline: 'Heavy Equipment, Scissor Lifts, Trenchers & Generator Fleet Discounts',
        tradeCategory: 'tools_equipment',
        categoryLabel: 'Tools & Equipment Rental',
        country: 'US',
        countryLabel: 'United States',
        stateScope: 'national',
        stateScopeLabel: 'National (1,200+ Locations)',
        typicalDiscountPercent: 20,
        discountDescription: 'Discounted daily, weekly, and monthly contractor rental rates on aerial work platforms, pumps, and power gear.',
        perks: [
            'Guaranteed fleet reservation & emergency job-site dispatch',
            'Custom commercial credit line with Net 30/60 billing',
            'Direct on-site equipment maintenance and repair swap out'
        ],
        enrollmentUrl: 'https://www.sunbeltrentals.com/commercial-accounts/',
        portalLoginUrl: 'https://www.sunbeltrentals.com/login',
        defaultPaymentTerms: 'Net 30',
        discountCodeTemplate: 'SUNBELTPRO',
        sourcingStrength: 'urgent_callout',
        integrationType: 'email_pdf',
        requiredOrderFields: [
            {
                id: 'sunbelt_acct_num',
                key: 'sunbeltAccountNumber',
                label: 'Sunbelt Customer Account #',
                description: 'Registered contractor account number',
                type: 'text',
                required: true,
                defaultValue: ''
            },
            {
                id: 'sunbelt_job_address',
                key: 'siteDeliveryAddress',
                label: 'Job Site Delivery Address & Contact',
                description: 'Exact address and site contact name for lowboy transport delivery',
                type: 'text',
                required: true,
                defaultValue: ''
            }
        ]
    },

    // ─── International: Canada ────────────────────────────────────────────────
    {
        id: 'wolseley_canada_pro',
        supplierName: 'Wolseley Canada',
        programName: 'Wolseley Express Contractor Rewards',
        tagline: 'Canada’s Leading Wholesale Plumbing & HVAC/R Distributor',
        tradeCategory: 'plumbing_piping',
        categoryLabel: 'Plumbing & HVAC/R',
        country: 'CA',
        countryLabel: 'Canada',
        stateScope: 'national',
        stateScopeLabel: 'Canada National (220+ Branches)',
        typicalDiscountPercent: 20,
        discountDescription: 'Wholesale trade discounts on plumbing, hydronics, HVAC, refrigeration, and waterworks across Canada.',
        perks: [
            'Wolseley Express 24/7 online ordering & 1-hour express pickup',
            'Provincial job-site delivery across all Canadian provinces',
            'Wolseley Rewards points for tools, gear, and travel'
        ],
        enrollmentUrl: 'https://www.wolseleyexpress.com/register',
        portalLoginUrl: 'https://www.wolseleyexpress.com/login',
        defaultPaymentTerms: 'Net 30',
        discountCodeTemplate: 'WOLSELEYCA',
        sourcingStrength: 'specialty_quality',
        integrationType: 'email_pdf',
        requiredOrderFields: [
            {
                id: 'wolseley_acct_num',
                key: 'wolseleyAccountNumber',
                label: 'Wolseley Canada Account #',
                description: 'Contractor account number',
                type: 'text',
                required: true,
                defaultValue: ''
            }
        ]
    },

    // ─── International: United Kingdom ────────────────────────────────────────
    {
        id: 'travis_perkins_trade',
        supplierName: 'Travis Perkins',
        programName: 'Travis Perkins Trade Account',
        tagline: 'UK’s Largest Builders Merchant & Trade Discount Scheme',
        tradeCategory: 'general_hardware',
        categoryLabel: 'Building Supplies & Hardware',
        country: 'GB',
        countryLabel: 'United Kingdom',
        stateScope: 'national',
        stateScopeLabel: 'UK Nationwide',
        typicalDiscountPercent: 15,
        discountDescription: 'Exclusive trade pricing on building materials, timber, plumbing, and landscaping with flexible credit.',
        perks: [
            'Personalized trade pricing on over 25,000 building products',
            'Flexible credit account with up to 60 days interest-free',
            'Free next-day delivery on qualifying site orders'
        ],
        enrollmentUrl: 'https://www.travisperkins.co.uk/trade-account',
        portalLoginUrl: 'https://www.travisperkins.co.uk/login',
        defaultPaymentTerms: 'Net 30',
        discountCodeTemplate: 'TPTRADE',
        sourcingStrength: 'local_pickup',
        integrationType: 'email_pdf',
        requiredOrderFields: [
            {
                id: 'tp_acct_num',
                key: 'tpAccountNumber',
                label: 'Trade Account Number',
                description: 'Travis Perkins trade account ID',
                type: 'text',
                required: true,
                defaultValue: ''
            }
        ]
    },

    // ─── International: Australia ─────────────────────────────────────────────
    {
        id: 'reece_plumbing_pro',
        supplierName: 'Reece Group',
        programName: 'Reece maX Trade Account',
        tagline: 'Australia & NZ Leading Plumbing, HVAC & Waterworks Supplier',
        tradeCategory: 'plumbing_piping',
        categoryLabel: 'Plumbing & HVAC',
        country: 'AU',
        countryLabel: 'Australia',
        stateScope: 'national',
        stateScopeLabel: 'Australia & New Zealand',
        typicalDiscountPercent: 20,
        discountDescription: 'Trade account wholesale pricing across 600+ branches in Australia and New Zealand.',
        perks: [
            'Reece maX app for 24/7 ordering and live branch stock lookup',
            'maX Track real-time driver delivery GPS tracking to site',
            'Reece Rewards points and business management tool integration'
        ],
        enrollmentUrl: 'https://www.reece.com.au/open-account',
        portalLoginUrl: 'https://max.reece.com.au/',
        defaultPaymentTerms: 'Net 30',
        discountCodeTemplate: 'REECEMAX',
        sourcingStrength: 'specialty_quality',
        integrationType: 'email_pdf',
        requiredOrderFields: [
            {
                id: 'reece_acct_num',
                key: 'reeceAccountNumber',
                label: 'Reece maX Account #',
                description: 'Reece trade account identifier',
                type: 'text',
                required: true,
                defaultValue: ''
            }
        ]
    }
];
