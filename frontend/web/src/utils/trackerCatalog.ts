/**
 * trackerCatalog.ts - Top 20+ Popular Bluetooth & GPS Asset Trackers Catalog
 * 
 * Features:
 * - Pre-configured top 20+ trackers (Apple AirTag, Milwaukee TICK, DeWalt Tool Connect, Samsung SmartTag2, Tile Pro, Samsara, LandAirSea, etc.)
 * - Vendor registration & device lookup URLs for 1-click external opening
 * - Battery specifications & live vs estimated battery percentage calculator
 * - Battery Health Calculator for Tag Management Portal
 */

export interface TrackerDeviceModel {
    id: string;
    name: string;
    brand: string;
    type: 'find_my' | 'tool_brand' | 'tile' | 'ble_beacon' | 'gps_cellular' | 'android_find';
    network: string;
    costEstimate: string;
    batteryLife: string;
    batteryType: string;
    estimatedLifespanMonths: number;
    instructions: string;
    recommendedUse: string;
    defaultUrlPrefix?: string;
    vendorRegistrationUrl: string;
    isCustom?: boolean;
}

export const TOP_TRACKER_CATALOG: TrackerDeviceModel[] = [
    // ── Apple & Find My Ecosystem ──
    {
        id: 'apple_airtag',
        name: 'Apple AirTag (Find My Network)',
        brand: 'Apple',
        type: 'find_my',
        network: 'Apple Find My (2B+ Devices)',
        costEstimate: '~$29 (No Monthly Fees)',
        batteryLife: '1 Year (CR2032)',
        batteryType: 'CR2032 3V Lithium Coin',
        estimatedLifespanMonths: 12,
        instructions: 'Press down stainless steel battery cover, rotate counter-clockwise. Insert fresh CR2032 positive (+) side up. Snap cover back until click.',
        recommendedUse: 'Power tools, diagnostic gear, and specialized meters',
        defaultUrlPrefix: 'https://icloud.com/findmy/',
        vendorRegistrationUrl: 'https://support.apple.com/en-us/HT211658'
    },
    {
        id: 'chipolo_one_spot',
        name: 'Chipolo ONE Spot / CARD Spot',
        brand: 'Chipolo',
        type: 'find_my',
        network: 'Apple Find My Network',
        costEstimate: '~$28 - $35',
        batteryLife: '2 Years (CR2032)',
        batteryType: 'CR2032 3V Lithium Coin',
        estimatedLifespanMonths: 24,
        instructions: 'Pry open plastic notch with coin. Replace CR2032 battery with (+) facing up. Press halves firmly together.',
        recommendedUse: 'Slim toolcases, document pouches, and specialized kits',
        defaultUrlPrefix: 'https://chipolo.net/find/',
        vendorRegistrationUrl: 'https://chipolo.net/en-us/setup'
    },
    {
        id: 'eufy_smarttrack',
        name: 'Eufy SmartTrack Link / Card',
        brand: 'Eufy / Anker',
        type: 'find_my',
        network: 'Apple Find My & Eufy App',
        costEstimate: '~$19 - $29',
        batteryLife: '1 Year (CR2032)',
        batteryType: 'CR2032 3V Lithium Coin',
        estimatedLifespanMonths: 12,
        instructions: 'Slide rear battery door open. Replace with fresh CR2032 coin battery. Re-engage latch.',
        recommendedUse: 'Hand tool cases, diagnostic equipment, and jobsite boxes',
        vendorRegistrationUrl: 'https://support.eufylife.com/'
    },
    {
        id: 'pebblebee_clip',
        name: 'Pebblebee Clip / Card / Tag',
        brand: 'Pebblebee',
        type: 'find_my',
        network: 'Apple Find My & Google Find My',
        costEstimate: '~$30',
        batteryLife: 'Rechargeable USB-C (8 Months per charge)',
        batteryType: 'Internal Rechargeable Lithium (USB-C)',
        estimatedLifespanMonths: 8,
        instructions: 'Plug USB-C cable into weather-sealed port. Charge for 2 hours until LED turns solid green.',
        recommendedUse: 'Ladders, heavy tool bags, and mobile equipment',
        vendorRegistrationUrl: 'https://pebblebee.com/pages/setup'
    },

    // ── Trade Tool Brand Integrated Trackers ──
    {
        id: 'milwaukee_tick',
        name: 'Milwaukee TICK Tool & Equipment Tracker (48-21-2000)',
        brand: 'Milwaukee',
        type: 'tool_brand',
        network: 'Milwaukee ONE-KEY Mesh Network',
        costEstimate: '~$25 (No Monthly Fees)',
        batteryLife: '1 Year (CR2032)',
        batteryType: 'CR2032 3V Heavy Duty Coin',
        estimatedLifespanMonths: 12,
        instructions: 'Unscrew 4 Phillips screws on rear housing. Swap CR2032 coin battery. Re-tighten screws to preserve IP67 water seal.',
        recommendedUse: 'Jobsite power tools, pipe cutters, press tools, and generators',
        defaultUrlPrefix: 'https://onekey.milwaukeetool.com/',
        vendorRegistrationUrl: 'https://onekey.milwaukeetool.com/'
    },
    {
        id: 'dewalt_tool_connect',
        name: 'DeWalt Tool Connect Tag (DCE041)',
        brand: 'DeWalt',
        type: 'tool_brand',
        network: 'DeWalt Site Manager Bluetooth',
        costEstimate: '~$30',
        batteryLife: '3 Years (Internal Sealed)',
        batteryType: 'Sealed Industrial Lithium (Replace Unit at End of Life)',
        estimatedLifespanMonths: 36,
        instructions: 'Internal 3-year sealed battery. When depleted, replace with new DCE041 Tag and assign new serial ID.',
        recommendedUse: 'DeWalt power tools, saws, hammer drills, and toughsystem boxes',
        vendorRegistrationUrl: 'https://www.dewalt.com/systems/tool-connect'
    },

    // ── Tile & Cross-Platform Bluetooth ──
    {
        id: 'tile_pro',
        name: 'Tile Pro (400 ft Range / High Volume)',
        brand: 'Tile',
        type: 'tile',
        network: 'Tile Network / Life360',
        costEstimate: '~$35 (Optional Tile Premium)',
        batteryLife: '1 Year (CR2032)',
        batteryType: 'CR2032 3V Lithium Coin',
        estimatedLifespanMonths: 12,
        instructions: 'Slide back battery door down. Pop out old CR2032 battery and insert new one.',
        recommendedUse: 'Truck drawer toolkits, pipe wrenches, and diagnostic meters',
        defaultUrlPrefix: 'https://tile.com/find/',
        vendorRegistrationUrl: 'https://www.tile.com/activate'
    },
    {
        id: 'tile_mate_sticker',
        name: 'Tile Mate / Tile Sticker (Adhesive Back)',
        brand: 'Tile',
        type: 'tile',
        network: 'Tile Network',
        costEstimate: '~$25',
        batteryLife: '3 Years (Sealed)',
        batteryType: 'Internal Sealed Non-Replaceable',
        estimatedLifespanMonths: 36,
        instructions: 'Sealed 3-year battery. Re-order Tile Sticker replacement when battery level drops.',
        recommendedUse: 'Smooth power tool casings, multimeters, and laser levels',
        vendorRegistrationUrl: 'https://www.tile.com/activate'
    },
    {
        id: 'samsung_smarttag2',
        name: 'Samsung Galaxy SmartTag2',
        brand: 'Samsung',
        type: 'android_find',
        network: 'Samsung SmartThings Find Network',
        costEstimate: '~$29',
        batteryLife: '1.5 Years (CR2032)',
        batteryType: 'CR2032 3V Lithium Coin',
        estimatedLifespanMonths: 18,
        instructions: 'Insert pin into small hole next to ring clip. Pop battery tray out, insert new CR2032 battery.',
        recommendedUse: 'Samsung Android technician toolkits and fleet equipment',
        defaultUrlPrefix: 'https://smartthingsfind.samsung.com/',
        vendorRegistrationUrl: 'https://smartthingsfind.samsung.com/'
    },
    {
        id: 'moto_tag',
        name: 'Moto Tag (Google Find My Device Network)',
        brand: 'Motorola',
        type: 'android_find',
        network: 'Google Find My Device Network (Android 1B+)',
        costEstimate: '~$29',
        batteryLife: '1 Year (CR2032)',
        batteryType: 'CR2032 3V Lithium Coin',
        estimatedLifespanMonths: 12,
        instructions: 'Twist back cover counter-clockwise. Insert new CR2032 battery.',
        recommendedUse: 'Android fleet technician equipment and toolcases',
        vendorRegistrationUrl: 'https://www.motorola.com/us/moto-tag/p'
    },

    // ── Industrial BLE Beacons (Automated Truck Check-In) ──
    {
        id: 'minew_ble_tag',
        name: 'Minew Industrial Waterproof BLE Tag (E8 / S1)',
        brand: 'Minew',
        type: 'ble_beacon',
        network: 'Industrial BLE 5.0 Broadcast (300 ft Range)',
        costEstimate: '~$8 - $15',
        batteryLife: '4 Years (CR2477)',
        batteryType: 'CR2477 3V High Capacity Coin',
        estimatedLifespanMonths: 48,
        instructions: 'Rotate waterproof casing 90 degrees. Replace with heavy-duty CR2477 coin cell.',
        recommendedUse: 'Automatic truck check-in for wrenches, hand tools, and ladders',
        vendorRegistrationUrl: 'https://www.minew.com/support/'
    },
    {
        id: 'feasycom_beacon',
        name: 'Feasycom Industrial Long-Range Beacon (FSC-BP108)',
        brand: 'Feasycom',
        type: 'ble_beacon',
        network: 'Industrial BLE Beacon (IP68 Waterproof)',
        costEstimate: '~$10 - $18',
        batteryLife: '5 Years (CR3032 / Dual CR2450)',
        batteryType: 'Dual CR2450 Lithium',
        estimatedLifespanMonths: 60,
        instructions: 'Unbolt 2 hex bolts on rugged casing. Replace dual CR2450 batteries. Ensure rubber gasket is seated properly.',
        recommendedUse: 'Heavy truck equipment, drain snakes, and van inventory',
        vendorRegistrationUrl: 'https://www.feasycom.com/'
    },
    {
        id: 'estimote_location_beacon',
        name: 'Estimote Location & Proximity Beacon',
        brand: 'Estimote',
        type: 'ble_beacon',
        network: 'BLE Telemetry & Mesh',
        costEstimate: '~$25',
        batteryLife: '2 Years (CR2450)',
        batteryType: 'CR2450 3V Lithium Coin',
        estimatedLifespanMonths: 24,
        instructions: 'Peel silicone cover back. Swap CR2450 coin cell.',
        recommendedUse: 'Warehouse shelf tracking and truck tool bay identification',
        vendorRegistrationUrl: 'https://estimote.com/'
    },

    // ── Cellular 4G / Satellite Real-Time GPS Trackers ──
    {
        id: 'samsara_ag52',
        name: 'Samsara AG52 / AG26 Solar Asset Tracker',
        brand: 'Samsara',
        type: 'gps_cellular',
        network: '4G LTE Cellular & Satellite GPS',
        costEstimate: '~$120 + Monthly Telemetry Plan',
        batteryLife: 'Solar Powered (4+ Years Internal Battery Backup)',
        batteryType: 'Solar Panel + Internal LiFePO4 Backup',
        estimatedLifespanMonths: 48,
        instructions: 'Solar-powered self-charging unit. Wipe glass solar panel face clean if charge falls below 20%.',
        recommendedUse: 'Trailers, towables, generators, and heavy equipment',
        defaultUrlPrefix: 'https://cloud.samsara.com/',
        vendorRegistrationUrl: 'https://cloud.samsara.com/'
    },
    {
        id: 'landairsea_54',
        name: 'LandAirSea 54 Waterproof Real-Time GPS',
        brand: 'LandAirSea',
        type: 'gps_cellular',
        network: 'Cellular 4G LTE Satellite GPS',
        costEstimate: '~$49 + $19/mo Plan',
        batteryLife: 'Rechargeable (1 Month active tracking)',
        batteryType: 'Rechargeable Lithium Polymer (USB Charge)',
        estimatedLifespanMonths: 1,
        instructions: 'Remove waterproof rubber port plug. Connect micro-USB or USB-C cable for 3 hours until charging light turns green.',
        recommendedUse: 'High-value equipment, trailers, and enclosed tool trailers',
        vendorRegistrationUrl: 'https://www.landairsea.com/activate/'
    },
    {
        id: 'tracki_4g_mini',
        name: 'Tracki 4G Mini Real-Time GPS Tracker',
        brand: 'Tracki',
        type: 'gps_cellular',
        network: 'Global 4G LTE / Wi-Fi / Bluetooth',
        costEstimate: '~$28 + $14/mo Plan',
        batteryLife: 'Rechargeable (1 Month battery saver / 3 days live tracking)',
        batteryType: 'Rechargeable Li-ion 3.7V',
        estimatedLifespanMonths: 1,
        instructions: 'Plug micro-USB charger into side port. Full charge takes approx 2.5 hours.',
        recommendedUse: 'High-value recovery units, jetters, and mobile equipment',
        vendorRegistrationUrl: 'https://tracki.com/pages/activate'
    },
    {
        id: 'linxup_solar_gps',
        name: 'Linxup Solar-Powered Asset GPS Tracker',
        brand: 'Linxup',
        type: 'gps_cellular',
        network: '4G LTE Solar Cellular Telemetry',
        costEstimate: '~$99 + $15/mo Plan',
        batteryLife: 'Solar Powered (Infinite outdoors)',
        batteryType: 'Solar Panel + Rechargeable Battery',
        estimatedLifespanMonths: 36,
        instructions: 'Solar powered. Park trailer in direct sunlight for 3-4 hours if low battery alert occurs.',
        recommendedUse: 'Outdoor jobsite trailers, dump trailers, and trenchers',
        vendorRegistrationUrl: 'https://www.linxup.com/activate'
    },
    {
        id: 'spytec_gl300',
        name: 'Spytec GPS GL300 Real-Time Asset Tracker',
        brand: 'Spytec',
        type: 'gps_cellular',
        network: 'Cellular 4G Satellite GPS',
        costEstimate: '~$39 + $25/mo Plan',
        batteryLife: 'Rechargeable (2 Weeks live tracking)',
        batteryType: 'Rechargeable 2600mAh Li-ion',
        estimatedLifespanMonths: 0.5,
        instructions: 'Connect mini-USB charging cable. Charge until power LED glows solid blue (approx 4 hours).',
        recommendedUse: 'Jobsite lockboxes and mobile machinery',
        vendorRegistrationUrl: 'https://spytec.com/activate'
    },
    {
        id: 'calamp_ttu2830',
        name: 'CalAmp TTU-2830 Weatherproof GPS',
        brand: 'CalAmp',
        type: 'gps_cellular',
        network: '4G LTE Telemetry (IP67 Sealed)',
        costEstimate: '~$110 + Fleet Plan',
        batteryLife: 'Hardwired 12V + 6 Month Internal Backup',
        batteryType: '12V Truck Hardwire / Internal Li-ion Backup',
        estimatedLifespanMonths: 24,
        instructions: 'Powered by 12V truck battery harness. Check 12V inline fuse if unit fails to charge.',
        recommendedUse: 'Commercial service trucks and utility machinery',
        vendorRegistrationUrl: 'https://www.calamp.com/'
    },
    {
        id: 'bakkpro_gps_tag',
        name: 'Bakkpro Heavy Equipment GPS Tag',
        brand: 'Bakkpro',
        type: 'gps_cellular',
        network: 'LTE-M / NB-IoT Satellite GPS',
        costEstimate: '~$75 + $8/mo Plan',
        batteryLife: '3 Years Sealed',
        batteryType: 'Non-Rechargeable Primary Lithium (3-Year Unit)',
        estimatedLifespanMonths: 36,
        instructions: 'Sealed 3-year primary lithium battery. Replace Bakkpro unit at end of cycle.',
        recommendedUse: 'Heavy excavators, jetters, and commercial tools',
        vendorRegistrationUrl: 'https://bakkpro.com/'
    },

    // ── Custom Option ──
    {
        id: 'other_custom',
        name: 'Other / Custom Tracker Model...',
        brand: 'Custom',
        type: 'ble_beacon',
        network: 'Custom Device Network',
        costEstimate: 'Varies',
        batteryLife: '1 Year (Generic)',
        batteryType: 'CR2032 / Generic Battery',
        estimatedLifespanMonths: 12,
        instructions: 'Consult manufacturer manual for battery replacement or USB charging instructions.',
        recommendedUse: 'User specified custom tag or proprietary tracker',
        vendorRegistrationUrl: 'https://google.com/search?q=asset+tracker+registration',
        isCustom: true
    }
];

// Catalog Version & Semi-Annual Auto-Refresh Manager
export const CATALOG_VERSION = '2026-08-11';
export const REFRESH_INTERVAL_DAYS = 180; // 6 months

export function shouldRefreshCatalog(lastRefreshedDateStr?: string): boolean {
    if (!lastRefreshedDateStr) return true;
    try {
        const last = new Date(lastRefreshedDateStr).getTime();
        const now = new Date().getTime();
        const diffDays = (now - last) / (1000 * 60 * 60 * 24);
        return diffDays >= REFRESH_INTERVAL_DAYS;
    } catch (e) {
        return true;
    }
}

/** Group Catalog by Category Brand for cleanly structured Select Dropdowns */
export function getGroupedTrackerCatalog(customTrackers: TrackerDeviceModel[] = []) {
    const combined = [...TOP_TRACKER_CATALOG, ...customTrackers];

    const groups: Array<{ groupName: string; items: TrackerDeviceModel[] }> = [
        {
            groupName: 'Apple & Find My Network Trackers',
            items: combined.filter(t => t.type === 'find_my')
        },
        {
            groupName: 'Trade Tool Brand Integrated (Milwaukee / DeWalt)',
            items: combined.filter(t => t.type === 'tool_brand')
        },
        {
            groupName: 'Tile & Android Find My Network Trackers',
            items: combined.filter(t => t.type === 'tile' || t.type === 'android_find')
        },
        {
            groupName: 'Industrial BLE Beacons (Auto-Truck Check-in)',
            items: combined.filter(t => t.type === 'ble_beacon')
        },
        {
            groupName: 'Cellular 4G / Satellite Real-Time GPS Trackers',
            items: combined.filter(t => t.type === 'gps_cellular')
        }
    ];

    return groups.filter(g => g.items.length > 0);
}

export interface BatteryHealthStatus {
    toolId: string;
    toolName: string;
    techId?: string | null;
    techName: string;
    location: string;
    trackerModelName: string;
    trackerBrand: string;
    trackerType: string;
    batteryType: string;
    instructions: string;
    installedDateStr: string;
    dueDateStr: string;
    daysRemaining: number;
    batteryPercentage: number;
    isReportedLive: boolean;
    vendorRegistrationUrl: string;
    status: 'good' | 'due_soon' | 'expired' | 'charge_needed';
}

/** Calculate Battery Replacement / Charge Health for a tool item */
export function calculateBatteryHealth(
    tool: any,
    catalog: TrackerDeviceModel[] = TOP_TRACKER_CATALOG
): BatteryHealthStatus | null {
    if (!tool.trackerModelId || tool.trackerModelId === 'none') {
        if (!tool.trackerType || tool.trackerType === 'none') return null;
    }

    const model = catalog.find(m => m.id === tool.trackerModelId) || catalog.find(m => m.type === tool.trackerType) || TOP_TRACKER_CATALOG[0];

    // Use installed date or fallback to tool creation date
    let installed: Date;
    if (tool.trackerBatteryInstalledDate) {
        installed = new Date(tool.trackerBatteryInstalledDate);
        if (isNaN(installed.getTime())) installed = new Date();
    } else if (tool.createdAt?.toDate) {
        installed = tool.createdAt.toDate();
    } else if (typeof tool.createdAt === 'string') {
        installed = new Date(tool.createdAt);
    } else {
        installed = new Date();
    }

    const lifespanMonths = model.estimatedLifespanMonths || 12;
    const totalDaysLifespan = lifespanMonths * 30.5;

    const dueDate = new Date(installed);
    dueDate.setMonth(dueDate.getMonth() + lifespanMonths);

    const now = new Date();
    const diffMs = dueDate.getTime() - now.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    // Calculate Battery Percentage: If tool has a live reported level from API query, use it! Otherwise calculate estimated battery level %
    let batteryPercentage: number;
    let isReportedLive = false;

    if (typeof tool.reportedBatteryLevel === 'number' && tool.reportedBatteryLevel >= 0) {
        batteryPercentage = tool.reportedBatteryLevel;
        isReportedLive = true;
    } else {
        const daysUsed = (now.getTime() - installed.getTime()) / (1000 * 60 * 60 * 24);
        const fractionRemaining = Math.max(0, (totalDaysLifespan - daysUsed) / totalDaysLifespan);
        batteryPercentage = Math.round(fractionRemaining * 100);
    }

    let status: 'good' | 'due_soon' | 'expired' | 'charge_needed' = 'good';
    const isRechargeable = model.batteryType.toLowerCase().includes('rechargeable') || model.batteryType.toLowerCase().includes('usb') || model.batteryType.toLowerCase().includes('solar');

    if (batteryPercentage <= 5 || daysRemaining <= 0) {
        status = isRechargeable ? 'charge_needed' : 'expired';
    } else if (batteryPercentage <= 20 || daysRemaining <= 30) {
        status = 'due_soon';
    }

    return {
        toolId: tool.id,
        toolName: tool.name,
        techId: tool.assignedTechId || null,
        techName: tool.assignedTechName || 'Unassigned (Warehouse)',
        location: tool.location || 'Warehouse',
        trackerModelName: model.name,
        trackerBrand: model.brand,
        trackerType: model.type,
        batteryType: model.batteryType,
        instructions: model.instructions,
        installedDateStr: installed.toLocaleDateString(),
        dueDateStr: dueDate.toLocaleDateString(),
        daysRemaining,
        batteryPercentage,
        isReportedLive,
        vendorRegistrationUrl: model.vendorRegistrationUrl,
        status
    };
}

export interface TrackerHelpLink {
    label: string;
    url: string;
    description?: string;
}

export interface TrackerInputFields {
    field1Label: string;
    field1Key: 'trackerUrl' | 'trackerSerial' | 'trackerMac' | 'trackerImei';
    field1Placeholder: string;
    field1Type: 'url' | 'text';
    field2Label?: string;
    field2Key?: 'trackerUrl' | 'trackerSerial' | 'trackerMac' | 'trackerImei' | 'trackerMajorMinor';
    field2Placeholder?: string;
    field2Type?: 'url' | 'text';
    badgeHelp: string;
    helpGuide: string;
    helpLinks: TrackerHelpLink[];
}

/** Returns exact form input fields, identifier guidance, and lookup links for a specific tracker model or brand */
export function getTrackerInputFields(modelId: string, trackerType?: string): TrackerInputFields {
    const model = TOP_TRACKER_CATALOG.find(m => m.id === modelId);
    const type = model ? model.type : trackerType;

    // 1. Samsung SmartTag / SmartTag2 (Specialized Handling)
    if (modelId === 'samsung_smarttag2' || (model && model.brand === 'Samsung')) {
        return {
            field1Label: 'Samsung SmartTag Serial Number (S/N) *',
            field1Key: 'trackerSerial',
            field1Placeholder: 'e.g. RF9X30ABCD (11-14 alphanumeric chars)',
            field1Type: 'text',
            field2Label: 'SmartThings Find Portal / Share Link (Optional)',
            field2Key: 'trackerUrl',
            field2Placeholder: 'e.g. https://smartthingsfind.samsung.com/',
            field2Type: 'url',
            badgeHelp: '🪐 Samsung Galaxy SmartTag / SmartThings Find Network',
            helpGuide: 'To find your Samsung SmartTag Serial Number (S/N):\n1. Open the Samsung SmartThings app on your Android phone or tablet.\n2. In the "Devices" tab, tap your Galaxy SmartTag2.\n3. Tap the More menu (⋮ 3 vertical dots) in the top-right corner ➔ tap "Information" or "Device Information".\n4. Copy the Serial Number (S/N) (starts with RF... or 11–14 alphanumeric chars).\n5. Hardware alternative: Slide out the battery tray to view the micro-printed serial number along the inner plastic frame.\n6. Web Map: Log in to Samsung SmartThings Find in a browser to locate and manage your SmartTags on a live map.',
            helpLinks: [
                {
                    label: 'SmartThings Find Web Portal',
                    url: 'https://smartthingsfind.samsung.com/',
                    description: 'Official Samsung desktop map to track Galaxy SmartTags live'
                },
                {
                    label: 'Samsung SmartTag Support & S/N Guide',
                    url: 'https://www.samsung.com/us/support/answer/ANS00088244/',
                    description: 'Official Samsung guide on locating SmartTag serial number and pairing'
                }
            ]
        };
    }

    // 2. Motorola Moto Tag & Google Find My Device Network
    if (modelId === 'moto_tag' || type === 'android_find') {
        return {
            field1Label: 'Google Find My Device Web Share Link *',
            field1Key: 'trackerUrl',
            field1Placeholder: 'e.g. https://www.google.com/android/find or share URL',
            field1Type: 'url',
            field2Label: 'Moto Tag Serial Number / Fast Pair ID (Optional)',
            field2Key: 'trackerSerial',
            field2Placeholder: 'e.g. MT-884920 (printed on box / app)',
            field2Type: 'text',
            badgeHelp: '🤖 Google Find My Device Network (Android 1B+ Ecosystem)',
            helpGuide: 'To find your Moto Tag location link or Serial Number:\n1. Open Google "Find My Device" app on your Android device or visit google.com/android/find.\n2. Tap your Moto Tag in the device list.\n3. Tap "Share Device" to create a shareable web location link for dispatchers.\n4. Tap the Settings (gear) icon in Find My Device ➔ "Device details" to find the hardware serial number.\n5. Physical unit: Check the barcode label on the Moto Tag packaging or regulatory insert.',
            helpLinks: [
                {
                    label: 'Google Find My Device Web Map',
                    url: 'https://www.google.com/android/find',
                    description: 'Log in with your Google Account to view Android tags live'
                },
                {
                    label: 'Motorola Moto Tag Official Setup',
                    url: 'https://www.motorola.com/us/moto-tag/p',
                    description: 'Hardware specs, battery replacement, and Fast Pair instructions'
                }
            ]
        };
    }

    // 3. Apple AirTag & Find My Ecosystem (AirTag, Chipolo Spot, Eufy, Pebblebee)
    if (type === 'find_my' || modelId === 'apple_airtag') {
        const isAirTag = modelId === 'apple_airtag';
        return {
            field1Label: 'Apple Find My Web Share Link *',
            field1Key: 'trackerUrl',
            field1Placeholder: 'e.g. https://share.findmy.apple.com/... or https://icloud.com/findmy/...',
            field1Type: 'url',
            field2Label: `${isAirTag ? 'AirTag' : model?.brand || 'Tag'} Serial Number (Optional)`,
            field2Key: 'trackerSerial',
            field2Placeholder: 'e.g. HG6T8942KL (10-12 alphanumeric characters)',
            field2Type: 'text',
            badgeHelp: `🍎 Apple Find My Network (${model?.name || 'AirTag'})`,
            helpGuide: 'To generate an Apple Find My Web Share Link or find the Serial Number:\n1. Open the Apple "Find My" app on iPhone or iPad (iOS 17.5+ required for web sharing).\n2. Tap the "Items" tab at the bottom and select your AirTag/tracker.\n3. Scroll down and tap "Share Item Location" ➔ "Continue" ➔ "Copy Link". Paste that URL into Field 1 so dispatchers can track it without Apple ID login!\n4. To find the Serial Number: In the Find My app, tap the tracker\'s name directly under the battery icon to cycle between Serial Number and Firmware Version.\n5. Physical unit: Press down and rotate the stainless steel battery cover counter-clockwise; the serial number is laser-etched along the inside edge.',
            helpLinks: [
                {
                    label: 'iCloud Find My Web Portal',
                    url: 'https://www.icloud.com/find',
                    description: 'Log in with your Apple ID to locate all Find My devices'
                },
                {
                    label: 'Apple Guide: How to Share Item Location',
                    url: 'https://support.apple.com/en-us/119864',
                    description: 'Step-by-step instructions for creating shareable Find My web links'
                },
                {
                    label: 'Apple Guide: Find AirTag Serial Number',
                    url: 'https://support.apple.com/en-us/102604',
                    description: 'Official instructions for reading engraved serial number or finding it in iOS'
                }
            ]
        };
    }

    // 4. Trade Tool Brand Integrated Trackers (Milwaukee ONE-KEY / DeWalt Tool Connect)
    if (type === 'tool_brand') {
        const isMilwaukee = modelId === 'milwaukee_tick' || (model && model.brand === 'Milwaukee');
        return {
            field1Label: isMilwaukee ? 'Milwaukee ONE-KEY Serial Tag ID / Barcode *' : 'DeWalt Tool Connect Serial Tag ID *',
            field1Key: 'trackerSerial',
            field1Placeholder: isMilwaukee ? 'e.g. MK-48-21-2000-88492 or scan 2D DataMatrix' : 'e.g. DCE041-88492 or scan QR code',
            field1Type: 'text',
            field2Label: `${isMilwaukee ? 'ONE-KEY' : 'Site Manager'} Asset Portal URL (Optional)`,
            field2Key: 'trackerUrl',
            field2Placeholder: isMilwaukee ? 'e.g. https://onekey.milwaukeetool.com/inventory/asset/88492' : 'e.g. https://sitemanager.dewalt.com/asset/...',
            field2Type: 'url',
            badgeHelp: `🛠️ ${isMilwaukee ? 'Milwaukee ONE-KEY Mesh Network Tag' : 'DeWalt Tool Connect / Site Manager Tag'}`,
            helpGuide: isMilwaukee
                ? 'To find your Milwaukee TICK Serial or Asset Tag ID:\n1. Scan the 2D DataMatrix code laser-engraved on the front face of the TICK using the ONE-KEY mobile app.\n2. Read the 10-12 digit serial number etched into the plastic backplate.\n3. In Milwaukee ONE-KEY Web Portal: Log in ➔ Inventory ➔ Select Item ➔ Click "TICK Tag Details" to copy the tag identifier and direct URL.'
                : 'To find your DeWalt DCE041 Tag ID:\n1. Read the 10-digit serial number printed directly underneath the QR code on top of the DCE041 tag.\n2. Or scan it directly using the DeWalt Tool Connect / Site Manager mobile app under "Add Tag".\n3. Web Portal: Log in to DeWalt Site Manager to copy the asset URL.',
            helpLinks: isMilwaukee
                ? [
                    {
                        label: 'Milwaukee ONE-KEY Cloud Portal',
                        url: 'https://onekey.milwaukeetool.com/',
                        description: 'Manage tool inventory, track TICK tags, and view mesh locations'
                    },
                    {
                        label: 'Milwaukee TICK Setup & Battery Manual',
                        url: 'https://www.milwaukeetool.com/Products/48-21-2000',
                        description: 'Official hardware specifications and installation documentation'
                    }
                ]
                : [
                    {
                        label: 'DeWalt Site Manager Web Portal',
                        url: 'https://sitemanager.dewalt.com/',
                        description: 'Log in to track DeWalt Tool Connect tags across jobsites'
                    },
                    {
                        label: 'DeWalt Tool Connect System Overview',
                        url: 'https://www.dewalt.com/systems/tool-connect',
                        description: 'Information on DCE041 tag pairing, geofencing, and specs'
                    }
                ]
        };
    }

    // 5. Tile & Cross-Platform Bluetooth (Tile Pro, Tile Mate, Tile Sticker)
    if (type === 'tile') {
        return {
            field1Label: 'Tile Web Share Link or Activation Code *',
            field1Key: 'trackerUrl',
            field1Placeholder: 'e.g. https://tile.com/find/tag9942 or 10-digit code',
            field1Type: 'url',
            field2Label: 'Tile Hardware Serial (Optional)',
            field2Key: 'trackerSerial',
            field2Placeholder: 'e.g. TILE-PR-8849',
            field2Type: 'text',
            badgeHelp: '🏷️ Tile Bluetooth & Life360 Global Network Tag',
            helpGuide: 'To find your Tile Share Link or Serial ID:\n1. Open the Tile mobile app on your smartphone.\n2. Tap the Tile attached to your tool.\n3. Tap "Share" ➔ "Share Link" to create a web link that anyone on your team can view in a browser.\n4. To find the hardware serial: Read the 10-character alphanumeric serial printed on the back casing of your Tile.',
            helpLinks: [
                {
                    label: 'Tile Web Activation & Login',
                    url: 'https://www.tile.com/activate',
                    description: 'Official Tile account portal to register and manage Tile tags'
                },
                {
                    label: 'Tile Share Feature Help Guide',
                    url: 'https://support.thetileapp.com/',
                    description: 'How to share Tile location links with team members'
                }
            ]
        };
    }

    // 6. Industrial BLE Beacons (Minew, Feasycom, Estimote)
    if (type === 'ble_beacon') {
        const brand = model?.brand || 'Industrial';
        return {
            field1Label: 'Beacon MAC Address / Proximity UUID *',
            field1Key: 'trackerMac',
            field1Placeholder: 'e.g. AC:23:3F:88:99:A1 or FDA50693-A4E2-4FB1...',
            field1Type: 'text',
            field2Label: 'Major / Minor ID (Optional)',
            field2Key: 'trackerMajorMinor',
            field2Placeholder: 'e.g. Major: 1001, Minor: 5002',
            field2Type: 'text',
            badgeHelp: `⚡ Industrial BLE Broadcast Tag (${brand}): Automated Truck Scanner`,
            helpGuide: 'To find your BLE Beacon MAC Address or Proximity UUID:\n1. Check the barcode label sticker on the side or bottom of the beacon for "MAC: XX:XX:XX:XX:XX:XX".\n2. Mobile app scanner: Download "BeaconSET+" (Minew) or "FeasyBeacon" (Feasycom) from the App Store / Google Play.\n3. Hold the beacon next to your phone to read its MAC address, UUID, Major, and Minor broadcast parameters.\n4. Truck gateways and technician mobile scanners will automatically detect this MAC address for automatic tool check-in.',
            helpLinks: [
                {
                    label: `${brand} Support & Firmware Portal`,
                    url: model?.vendorRegistrationUrl || 'https://www.minew.com/support/',
                    description: 'Official beacon configuration app downloads and technical manuals'
                }
            ]
        };
    }

    // 7. Cellular 4G / Satellite Real-Time GPS Trackers (Samsara, LandAirSea, Tracki, Linxup, Spytec, CalAmp, Bakkpro)
    if (type === 'gps_cellular') {
        const brand = model?.brand || 'Fleet';
        return {
            field1Label: `${brand} GPS Device IMEI / Serial Number *`,
            field1Key: 'trackerImei',
            field1Placeholder: 'e.g. 15-digit IMEI: 869204049201948 or SN-99420',
            field1Type: 'text',
            field2Label: `${brand} Fleet Map Telemetry Web Link (Optional)`,
            field2Key: 'trackerUrl',
            field2Placeholder: model?.defaultUrlPrefix ? `${model.defaultUrlPrefix}fleet/asset/...` : 'e.g. https://cloud.samsara.com/fleet/asset/9921',
            field2Type: 'url',
            badgeHelp: `📡 Cellular 4G LTE & Satellite GPS Tracker (${model?.name || brand})`,
            helpGuide: `To find the 15-Digit IMEI or Serial Number for your ${brand} GPS unit:\n1. Check the white barcode sticker on the back or bottom of the GPS device for a 15-digit "IMEI" (starts with 35... or 86...).\n2. The IMEI is also printed on the device retail packaging and invoice documentation.\n3. Provider Web Portal: Log in to your ${brand} telematics dashboard, click into your Asset or Fleet list, and locate this device.\n4. Copy the live asset telemetry map URL and paste it into Field 2 to open real-time satellite views directly from DispatchBox.`,
            helpLinks: [
                {
                    label: `${brand} Fleet Telematics Portal`,
                    url: model?.vendorRegistrationUrl || model?.defaultUrlPrefix || 'https://cloud.samsara.com/',
                    description: `Official ${brand} activation and real-time fleet map portal`
                }
            ]
        };
    }

    // 8. Custom / Generic Fallback
    return {
        field1Label: 'Asset Tracker Serial Number or Identifier *',
        field1Key: 'trackerSerial',
        field1Placeholder: 'e.g. SN-99482, MAC: AC:23:3F..., or Device ID',
        field1Type: 'text',
        field2Label: 'Tracking Web Link / Vendor Portal URL (Optional)',
        field2Key: 'trackerUrl',
        field2Placeholder: 'e.g. https://vendorportal.com/track/...',
        field2Type: 'url',
        badgeHelp: '🏷️ Asset Tracker Hardware Integration',
        helpGuide: 'Enter the hardware serial number, MAC address, IMEI, or web share link provided by your asset tracker manufacturer. Consult device documentation or packaging for the primary device identifier.',
        helpLinks: [
            {
                label: 'Search Device Registration & Activation',
                url: 'https://google.com/search?q=asset+tracker+registration+setup',
                description: 'Search Google for manufacturer device activation steps'
            }
        ]
    };
}

