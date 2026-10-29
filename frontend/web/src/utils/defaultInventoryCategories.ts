import { InventoryCategory } from '../types';
export type { InventoryCategory };

/**
 * Detects all matching trade keys from any business name, specialty description, or industry query.
 * If a company performs multiple trades (e.g. "Plumbing & HVAC" or "Electrical and Low Voltage / Security"),
 * ALL matching trade keys are returned so categories, subcategories, tools, and materials are merged.
 */
export function detectAllTradeKeys(input?: string): string[] {
    if (!input) return ['general'];
    const s = input.toLowerCase();
    const matched = new Set<string>();

    if (s.includes('plumb') || s.includes('drain') || s.includes('pipe') || s.includes('sewer') || s.includes('water heater') || s.includes('rooter') || s.includes('backflow') || s.includes('hydro-jet')) {
        matched.add('plumbing');
    }
    if (s.includes('hvac') || s.includes('air cond') || s.includes('cooling') || s.includes('heating') || s.includes('furnace') || s.includes('heat pump') || s.includes('duct') || s.includes('ventilat')) {
        matched.add('hvac');
    }
    if (s.includes('refrigerat') || s.includes('walk-in') || s.includes('chiller') || s.includes('ice machine') || s.includes('cold storage') || s.includes('freezer room')) {
        matched.add('refrigeration');
    }
    if (s.includes('electr') || s.includes('wiring') || s.includes('lighting') || s.includes('circuit') || s.includes('breaker') || s.includes('panel upgrade') || s.includes('solar') || s.includes('generator') || s.includes('ev charger')) {
        matched.add('electrical');
    }
    if (s.includes('low volt') || s.includes('cabling') || s.includes('network') || s.includes('cat6') || s.includes('fiber') || s.includes('cctv') || s.includes('camera') || s.includes('surveillance') || s.includes('access control') || s.includes('intercom') || s.includes('audio') || s.includes('video') || s.includes('structured cable') || s.includes('security system') || s.includes('burglar') || s.includes('alarm')) {
        matched.add('low_voltage');
    }
    if (s.includes('roof') || s.includes('gutter') || s.includes('shingle') || s.includes('siding') || s.includes('downspout') || s.includes('soffit') || s.includes('fascia')) {
        matched.add('roofing');
    }
    if (s.includes('lawn') || s.includes('landscap') || s.includes('mow') || s.includes('turf') || s.includes('sod') || s.includes('grounds') || s.includes('mulch')) {
        matched.add('lawn');
    }
    if (s.includes('tree') || s.includes('arborist') || s.includes('stump') || s.includes('prun') || s.includes('logging') || s.includes('tree removal')) {
        matched.add('tree_service');
    }
    if (s.includes('irrigat') || s.includes('sprinkler') || s.includes('drip system') || s.includes('smart watering') || s.includes('sprinkler head')) {
        matched.add('irrigation');
    }
    if (s.includes('pest') || s.includes('termite') || s.includes('rodent') || s.includes('exterminat') || s.includes('bug') || s.includes('wildlife') || s.includes('mosquito') || s.includes('bed bug')) {
        matched.add('pest');
    }
    if (s.includes('pool') || s.includes('spa') || s.includes('aquatic') || s.includes('hot tub') || s.includes('pool heater')) {
        matched.add('pool');
    }
    if (s.includes('appliance') || s.includes('dryer') || s.includes('washer') || s.includes('oven') || s.includes('dishwasher') || s.includes('range') || s.includes('stove') || s.includes('cooktop')) {
        matched.add('appliance');
    }
    if (s.includes('garage door') || s.includes('overhead door') || s.includes('torsion') || s.includes('roll-up') || s.includes('automatic gate') || s.includes('dock leveler')) {
        matched.add('garage_door');
    }
    if (s.includes('handy') || s.includes('home repair') || s.includes('property maintenance') || s.includes('punch list') || s.includes('carpentry')) {
        matched.add('handyman');
    }
    if (s.includes('paint') || s.includes('stain') || s.includes('cabinet refinish') || s.includes('lacquer') || s.includes('drywall finish')) {
        matched.add('painting');
    }
    if (s.includes('floor') || s.includes('carpet') || s.includes('tile') || s.includes('hardwood') || s.includes('lvp') || s.includes('laminate') || s.includes('grout')) {
        matched.add('flooring');
    }
    if (s.includes('clean') || s.includes('janitor') || s.includes('maid') || s.includes('housekeep') || s.includes('custodial') || s.includes('carpet steam clean')) {
        matched.add('cleaning');
    }
    if (s.includes('pressure wash') || s.includes('power wash') || s.includes('soft wash') || s.includes('surface clean') || s.includes('exterior clean')) {
        matched.add('pressure_washing');
    }
    if (s.includes('window clean') || s.includes('solar clean') || s.includes('glass wash') || s.includes('screen clean')) {
        matched.add('window_cleaning');
    }
    if (s.includes('locksmith') || s.includes('rekey') || s.includes('deadbolt') || s.includes('lockout') || s.includes('key fob') || s.includes('panic bar') || s.includes('master key')) {
        matched.add('locksmith');
    }
    if (s.includes('glass') || s.includes('glazing') || s.includes('shower door') || s.includes('storefront glass') || s.includes('mirror') || s.includes('window glass')) {
        matched.add('glass_glazing');
    }
    if (s.includes('restor') || s.includes('water damage') || s.includes('mold') || s.includes('fire damage') || s.includes('smoke damage') || s.includes('remediat') || s.includes('drying')) {
        matched.add('restoration');
    }
    if (s.includes('fence') || s.includes('fencing') || s.includes('gate') || s.includes('railing') || s.includes('wood fence') || s.includes('chain link')) {
        matched.add('fencing');
    }
    if (s.includes('septic') || s.includes('cesspool') || s.includes('grease trap') || s.includes('drainfield') || s.includes('leachfield')) {
        matched.add('septic');
    }
    if (s.includes('chimney') || s.includes('fireplace') || s.includes('flue') || s.includes('hearth') || s.includes('wood stove')) {
        matched.add('chimney');
    }
    if (s.includes('insulat') || s.includes('weatheriz') || s.includes('spray foam') || s.includes('air seal') || s.includes('vapor barrier') || s.includes('blown-in')) {
        matched.add('insulation');
    }
    if (s.includes('concrete') || s.includes('masonry') || s.includes('asphalt') || s.includes('paving') || s.includes('brick') || s.includes('stone work') || s.includes('tuckpoint')) {
        matched.add('concrete_masonry');
    }
    if (s.includes('general contract') || s.includes('remodel') || s.includes('renovat') || s.includes('addition') || s.includes('framing') || s.includes('builder')) {
        matched.add('general_contractor');
    }

    if (matched.size === 0) {
        return ['general'];
    }
    return Array.from(matched);
}

/**
 * Backward compatible single-trade key normalizer.
 */
export function normalizeTradeKey(input?: string): string {
    const keys = detectAllTradeKeys(input);
    return keys[0] || 'general';
}

/**
 * Merges category arrays from multiple trades.
 * If multiple trades share a category (e.g. "Diagnostics & Testing"),
 * their subcategories are merged and deduplicated.
 */
function mergeCategoryLists(categoryLists: InventoryCategory[][]): InventoryCategory[] {
    const merged: InventoryCategory[] = [];
    const nameMap = new Map<string, InventoryCategory>();

    for (const list of categoryLists) {
        for (const cat of list) {
            const normKey = cat.name.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
            
            let existing = nameMap.get(normKey);
            if (!existing) {
                for (const [k, v] of nameMap.entries()) {
                    if (
                        (k.includes('diagnostic') && normKey.includes('diagnostic')) ||
                        (k.includes('safety') && normKey.includes('safety')) ||
                        (k.includes('inspection') && normKey.includes('inspection')) ||
                        (k.includes('hand tool') && normKey.includes('hand tool')) ||
                        (k.includes('power tool') && normKey.includes('power tool')) ||
                        (k.includes('fastener') && normKey.includes('fastener')) ||
                        (k.includes('hardware') && normKey.includes('hardware')) ||
                        (k.includes('adhesive') && normKey.includes('adhesive')) ||
                        (k.includes('safety gear') && normKey.includes('safety gear'))
                    ) {
                        existing = v;
                        break;
                    }
                }
            }

            if (existing) {
                const subSet = new Set(existing.subcategories.map(s => s.toLowerCase()));
                for (const sub of cat.subcategories) {
                    if (!subSet.has(sub.toLowerCase())) {
                        existing.subcategories.push(sub);
                        subSet.add(sub.toLowerCase());
                    }
                }
            } else {
                const newCat: InventoryCategory = {
                    id: cat.id,
                    name: cat.name,
                    subcategories: [...cat.subcategories]
                };
                merged.push(newCat);
                nameMap.set(normKey, newCat);
            }
        }
    }

    return merged;
}

export const DEFAULT_WORK_CATEGORIES: Record<string, InventoryCategory[]> = {
    "plumbing": [
        {
            "id": "work_plumb_diag",
            "name": "Diagnostics & System Evaluation",
            "subcategories": [
                "Electronic Leak Detection",
                "Video Camera Sewer Inspection",
                "Static Water Pressure Testing",
                "Slab Leak Acoustic Isolation",
                "Backflow Assembly Testing"
            ]
        },
        {
            "id": "work_plumb_drain",
            "name": "Drain & Sewer Services",
            "subcategories": [
                "Single-Fixture Snaking",
                "Main Sewer Hydro-Jetting",
                "Cleanout Installation & Riser Extension",
                "Tree Root Intrusion Clearing",
                "Trenchless Pipe Relining / CIPP",
                "Grease & Sludge Emulsification"
            ]
        },
        {
            "id": "work_plumb_heaters",
            "name": "Water Heating Equipment",
            "subcategories": [
                "Tank Water Heater Annual Flush",
                "Tankless Heat Exchanger Descaling",
                "Gas Control Valve & Thermocouple",
                "Electric Heating Elements & Thermostats",
                "Tankless Water Heater Installation",
                "Hybrid Heat Pump Water Heater Service"
            ]
        },
        {
            "id": "work_plumb_fixtures",
            "name": "Fixtures & Valves",
            "subcategories": [
                "Kitchen & Bathroom Faucet Rebuild",
                "Toilet Mechanism & Wax Ring Replacement",
                "Shower Pressure-Balancing Cartridges",
                "Garbage Disposal Replacement",
                "Pressure Reducing Valve (PRV) Install",
                "Emergency Main Shutoff Valve Replacement"
            ]
        },
        {
            "id": "work_plumb_piping",
            "name": "Water Supply Piping & Distribution",
            "subcategories": [
                "Whole-Home Copper to PEX Repiping",
                "Burst Pipe Emergency Clamp & Solder",
                "Underground Main Water Service Line",
                "Hose Bibb & Anti-Siphon Frost-Free Valves",
                "Sump Pump & Battery Backup Systems"
            ]
        },
        {
            "id": "work_plumb_gas",
            "name": "Gas Piping & Safety",
            "subcategories": [
                "Gas Leak Bubble & Sniffer Isolation",
                "Appliance Gas Flex Line Hookup",
                "Earthquake Automatic Gas Shutoff Valve",
                "Gas Pressure Manometer Testing"
            ]
        }
    ],
    "hvac": [
        {
            "id": "work_hvac_diag",
            "name": "Diagnostics & Airflow Testing",
            "subcategories": [
                "Multi-Point System Performance Audit",
                "Electronic Refrigerant Leak Detection",
                "External Static Pressure & CFM Airflow Test",
                "Combustion Analysis & Heat Exchanger Safety",
                "Compressor Electrical Megohmmeter Test"
            ]
        },
        {
            "id": "work_hvac_cooling",
            "name": "Cooling & Air Conditioning",
            "subcategories": [
                "Seasonal AC Precision Tune-Up",
                "Condensate Drain Line Clearing & Nitrogen Purge",
                "Dual-Run Capacitor & Contactor Replacement",
                "Condenser Fan & Blower Motor Replacement",
                "TXV Thermostatic Expansion Valve Replacement",
                "Complete Condenser & Evaporator Coil Clean"
            ]
        },
        {
            "id": "work_hvac_heating",
            "name": "Heating & Furnace Systems",
            "subcategories": [
                "Furnace Precision Tune-Up & Safety Audit",
                "Hot Surface Ignitor & Flame Sensor Service",
                "Gas Valve & Manifold Pressure Adjustment",
                "Inducer Draft Assembly Replacement",
                "Heat Pump Reversing Valve Diagnostics",
                "Electric Auxiliary Heat Strip Service"
            ]
        },
        {
            "id": "work_hvac_ducts",
            "name": "Air Distribution & Ductwork",
            "subcategories": [
                "Duct Leak Detection & Mastic Sealing",
                "Supply & Return Air Balancing",
                "Motorized Zone Damper & Controller Install",
                "Flex Duct Replacement & R-8 Insulated Runs",
                "Dryer Vent & Exhaust Air Duct Cleaning"
            ]
        },
        {
            "id": "work_hvac_iaq",
            "name": "Indoor Air Quality & Controls",
            "subcategories": [
                "Smart Thermostat Installation (Nest, Ecobee, Honeywell)",
                "UV-C Germicidal Air Purifier Installation",
                "Whole-Home Dehumidifier & Humidifier Service",
                "MERV 11/13 Media Air Cleaner Cabinet Install"
            ]
        }
    ],
    "refrigeration": [
        {
            "id": "work_refrig_diag",
            "name": "Diagnostics & System Performance",
            "subcategories": [
                "Temperature Log & Superheat/Subcooling Audit",
                "Electronic Leak Detection on Low-Temp Circuits",
                "Defrost Timer & Cycle Sequence Verification",
                "Compressor Acid & Oil Contamination Test"
            ]
        },
        {
            "id": "work_refrig_walkin",
            "name": "Walk-In Coolers & Freezers",
            "subcategories": [
                "Walk-in Evaporator Fan Motor Replacement",
                "Defrost Heater Element Replacement",
                "Thermostatic Expansion Valve (TXV) Calibration",
                "Walk-in Door Gaskets & Heated Sweeps",
                "Condensing Unit Compressor Replacement"
            ]
        },
        {
            "id": "work_refrig_ice",
            "name": "Commercial Ice Machines",
            "subcategories": [
                "Chemical Cleaning, Descaling & Sanitizing",
                "Water Inlet Valve & Float Sensor Replacement",
                "Harvest Assist Solenoid & Curtain Switch",
                "Water Filtration Cartridge Rotation"
            ]
        },
        {
            "id": "work_refrig_display",
            "name": "Reach-In & Merchandiser Cases",
            "subcategories": [
                "Self-Contained Compressor & Condenser Cleaning",
                "Digital Temperature Controller Replacement (Dixell/Eliwell)",
                "Drain Pan & Evaporative Loop Heating Wire",
                "LED Case Lighting & Ballast Retrofit"
            ]
        }
    ],
    "electrical": [
        {
            "id": "work_elec_diag",
            "name": "Diagnostics & Safety Audits",
            "subcategories": [
                "Whole-Home Electrical Safety Inspection",
                "Circuit Fault & Ground Fault Tracing",
                "Infrared Thermal Panel Scan",
                "Grounding Electrode Resistance Test",
                "Power Quality & Voltage Drop Analysis"
            ]
        },
        {
            "id": "work_elec_panels",
            "name": "Distribution Panels & Breakers",
            "subcategories": [
                "Main Breaker Service Panel Upgrade (200A / 400A)",
                "Subpanel Installation & Load Balancing",
                "AFCI / GFCI Dual Function Breakers",
                "Whole-Home Surge Protection Device (SPD)",
                "Meter Base & Service Mast Replacement"
            ]
        },
        {
            "id": "work_elec_circuits",
            "name": "Branch Circuits & Outlets",
            "subcategories": [
                "GFCI & Tamper-Resistant Receptacles",
                "Dedicated 20A Small Appliance Circuits",
                "240V Heavy Appliance Circuits (Dryer, Range, Welder)",
                "Commercial Conduit Bending & Pulling (EMT / Rigid)",
                "Smart Switches, Dimmers & Occupancy Sensors"
            ]
        },
        {
            "id": "work_elec_lighting",
            "name": "Lighting & Fixture Installations",
            "subcategories": [
                "Recessed LED Wafer Can Light Retrofit",
                "Commercial High Bay & Troffer LED Lighting",
                "Ceiling Fan Installation & Structural Box",
                "Under-Cabinet LED Ribbon & Puck Lighting",
                "Landscape Low-Voltage Lighting Transformer",
                "Exterior Dusk-to-Dawn & Security Floodlights"
            ]
        },
        {
            "id": "work_elec_clean_energy",
            "name": "EV Chargers & Backup Power",
            "subcategories": [
                "Level 2 Electric Vehicle (EV) Charger Install",
                "Whole-House Standby Generator Transfer Switch",
                "Manual Generator Interlock Kit",
                "Solar Inverter & Battery Storage Disconnects"
            ]
        }
    ],
    "low_voltage": [
        {
            "id": "work_lv_data",
            "name": "Structured Network & Data Cabling",
            "subcategories": [
                "Cat6 / Cat6A Horizontal Cable Drops (Plenum / Riser)",
                "Single-Mode & Multi-Mode Fiber Optic Termination",
                "Patch Panel Termination, Wire Dressing & Port Labeling",
                "Server Rack & Wall-Mount Cabinet Assembly",
                "Fluke Cable Certification & Channel Testing",
                "Conduit, J-Hooks & Overhead Tray Pathways"
            ]
        },
        {
            "id": "work_lv_cctv",
            "name": "CCTV & IP Video Surveillance",
            "subcategories": [
                "PoE IP Security Camera Installation (Dome, Bullet, Turret, PTZ)",
                "NVR / DVR Storage Setup & RAID Hard Drive Config",
                "Remote Access Mobile App & Client Software Setup",
                "Wireless Point-to-Point (PtP) Bridge Installation",
                "Camera Lens Tuning, Night Vision IR & Motion Zones"
            ]
        },
        {
            "id": "work_lv_access",
            "name": "Access Control & Intrusion Detection",
            "subcategories": [
                "Electronic Maglocks & Door Strikes Installation",
                "RFID Card Readers, Keypads & Biometric Scanners",
                "Request-to-Exit (REX) Motion & Push Buttons",
                "Access Control Controller Wiring & Battery Backup",
                "Video Intercom & Commercial Door Station (DoorBird, 2N, Aiphone)",
                "Intrusion Alarm Motion Sensors, Glass Breaks & Door Contacts"
            ]
        },
        {
            "id": "work_lv_av",
            "name": "Commercial & Residential Audio/Visual",
            "subcategories": [
                "70V Commercial Distributed Background Audio & Ceiling Speakers",
                "Conference Room TV Displays, Video Bars & Presentation Systems",
                "Smart Home Automation Hubs & Lighting Scene Integration",
                "PA System Microphones, Amplifiers & Zone Paging"
            ]
        },
        {
            "id": "work_lv_diag",
            "name": "Diagnostics, Cable Tracing & Audits",
            "subcategories": [
                "Tone & Probe Cable Tracing & Wire Identification",
                "Network Packet Loss, Bandwidth & PoE Load Testing",
                "Abandoned Cable Abatement & Pathway Remediation",
                "Structured Cabling As-Built Documentation & Label Audits"
            ]
        }
    ],
    "roofing": [
        {
            "id": "work_roof_insp",
            "name": "Inspections & Leak Detection",
            "subcategories": [
                "Comprehensive Roof & Attic Inspection",
                "Thermal Moisture Scan",
                "Storm & Hail Damage Insurance Documentation",
                "Drone Roof Imaging & Measurements"
            ]
        },
        {
            "id": "work_roof_shingle",
            "name": "Shingle & Surface Repairs",
            "subcategories": [
                "Architectural Asphalt Shingle Patching & Blow-Off Repair",
                "Valley Metal W-Valley Replacement",
                "Clay & Concrete Tile Re-bedding & Replacement",
                "Flat Roof Modified Bitumen / TPO Seam Welding"
            ]
        },
        {
            "id": "work_roof_flashing",
            "name": "Flashing & Penetration Sealing",
            "subcategories": [
                "Neoprene Pipe Boot Flashing Replacement",
                "Chimney Step & Counter Flashing",
                "Skylight Flashing Kit & Curb Resealing",
                "Drip Edge & Gutter Apron Installation"
            ]
        },
        {
            "id": "work_roof_gutters",
            "name": "Gutters & Drainage",
            "subcategories": [
                "Seamless Aluminum Gutter Fabrication & Hanging",
                "Gutter Leaf Guard & Micro-Mesh Screen Installation",
                "Downspout Extension & Rain Barrel Diverter",
                "Fascia Board Wood Rot Repair"
            ]
        }
    ],
    "lawn": [
        {
            "id": "work_lawn_maint",
            "name": "Turf Care & Routine Maintenance",
            "subcategories": [
                "Commercial Lawn Mowing, Trimming & Edging",
                "Core Aeration & Overseeding",
                "Power Dethatching & Power Raking",
                "Spring & Fall Leaf Cleanups",
                "Lawn Fertilization & Pre-Emergent Weed Control"
            ]
        },
        {
            "id": "work_lawn_beds",
            "name": "Landscape Beds & Planting",
            "subcategories": [
                "Natural Spade Bed Edging & Weed Barrier Fabric",
                "Double-Shredded Hardwood Mulch Installation",
                "Perennial Shrub & Hedge Trimming / Shearing",
                "Annual Flower Color Rotation & Bed Soil Enrichment"
            ]
        },
        {
            "id": "work_lawn_hardscape",
            "name": "Hardscaping & Pavers",
            "subcategories": [
                "Interlocking Concrete Paver Patios & Walkways",
                "Segmental Retaining Wall Construction",
                "Polymeric Sand Joint Stabilization",
                "Paver Cleaning & Wet-Look Sealing"
            ]
        }
    ],
    "tree_service": [
        {
            "id": "work_tree_pruning",
            "name": "Arborist Pruning & Trimming",
            "subcategories": [
                "Crown Thinning & Deadwood Removal",
                "Crown Reduction & Clearance Pruning",
                "Hazardous Limb Removal near Power Lines / Roofs",
                "Young Tree Structural Pruning"
            ]
        },
        {
            "id": "work_tree_removal",
            "name": "Tree Removal & Dismantling",
            "subcategories": [
                "Precision Directional Tree Felling",
                "Sectional Dismantling & Rigging near Structures",
                "Crane-Assisted Heavy Tree Removal",
                "Emergency Storm Damage & Fallen Tree Clearing"
            ]
        },
        {
            "id": "work_tree_stump",
            "name": "Stump Grinding & Root Care",
            "subcategories": [
                "Stump Grinding below Grade (6\" to 12\")",
                "Surface Root Flare Grinding",
                "Deep Root Tree Fertilization & Soil Injection",
                "Tree Cabling & Bracing Installation"
            ]
        }
    ],
    "irrigation": [
        {
            "id": "work_irrig_audit",
            "name": "Audits & Diagnostics",
            "subcategories": [
                "Spring Startup & Full System Inspection",
                "Backflow Assembly Testing & Certification",
                "Zone Pressure & Coverage Uniformity Audit",
                "Underground Wire & Solenoid Valve Tracing",
                "Winterization & High-Volume Blowout"
            ]
        },
        {
            "id": "work_irrig_repairs",
            "name": "Repairs & Head Replacement",
            "subcategories": [
                "Sprinkler Rotor & Spray Head Replacement",
                "Leaking Zone Valve Diaphragm Rebuild",
                "Cracked Lateral & Main Irrigation Pipe Repair",
                "Rain Sensor & Soil Moisture Probe Replacement"
            ]
        },
        {
            "id": "work_irrig_install",
            "name": "Smart Controllers & Drip Systems",
            "subcategories": [
                "Wi-Fi Smart Controller Installation (Hydrawise, Rachio)",
                "Low-Volume Drip Irrigation for Plant Beds",
                "Pressure Regulated Micro-Drip Conversion",
                "Additional Zone Valve & Sump Expansion"
            ]
        }
    ],
    "pest": [
        {
            "id": "work_pest_insp",
            "name": "Inspections & Audits",
            "subcategories": [
                "Comprehensive Structural Pest Inspection",
                "Termite Activity & Damage Inspection",
                "Rodent Entry Point & Harborage Audit",
                "Commercial Health Code Pest Compliance Audit"
            ]
        },
        {
            "id": "work_pest_perim",
            "name": "Perimeter & General Pest",
            "subcategories": [
                "Quarterly Exterior Perimeter Barrier Spray",
                "Interior Baseboard & Crack/Crevice Treatment",
                "Eaves Cobweb, Wasp & Hornet Nest Dusting",
                "Ant Baiting & Colony Eradication",
                "Cockroach Clean-Out & Gel Baiting"
            ]
        },
        {
            "id": "work_pest_rodent",
            "name": "Rodent Exclusion & Trapping",
            "subcategories": [
                "Exterior Rodent Bait Station Deployment",
                "Exclusion Sealant, Copper Mesh & Hardware Cloth",
                "Attic Snap Trap Trapping & Sanitation",
                "Disinfection & Odor Neutralization"
            ]
        },
        {
            "id": "work_pest_termite",
            "name": "Termite & Wood-Destroying Organisms",
            "subcategories": [
                "Subterranean Termite Soil Barrier Trenching",
                "Termite In-Ground Bait Station Installation",
                "Borate Wood Treatment for Framing",
                "Drywood Termite Localized Foam Injection"
            ]
        }
    ],
    "pool": [
        {
            "id": "work_pool_clean",
            "name": "Water Chemistry & Sanitation",
            "subcategories": [
                "Weekly Water Testing (pH, Free Chlorine, Alkalinity, Calcium, CYA)",
                "Chemical Dosing & Salt Level Balancing",
                "Surface Leaf Skimming & Wall/Tile Brushing",
                "Pool Floor Vacuuming (Manual & Robotic)",
                "Phosphate Removal & Algae Treatment"
            ]
        },
        {
            "id": "work_pool_filter",
            "name": "Filtration & Circulation",
            "subcategories": [
                "Cartridge Filter Element Wash & Degrease",
                "D.E. Filter Grid Teardown, Acid Wash & Re-pack",
                "Sand Filter Multiport Valve Backwash & Media Change",
                "Pump Strainer & Skimmer Basket Clearing"
            ]
        },
        {
            "id": "work_pool_equip",
            "name": "Equipment Repair & Automation",
            "subcategories": [
                "Variable-Speed Pump Installation & Programming",
                "Salt Chlorine Generator Cell Inspection & Acid Cleaning",
                "Gas Pool Heater Diagnostics & Ignitor Replacement",
                "Automation Control Board & Mobile App Setup",
                "LED Color Pool Light Engine Replacement"
            ]
        },
        {
            "id": "work_pool_leak",
            "name": "Leak Detection & Structural Repairs",
            "subcategories": [
                "Dye Testing Skimmers, Lights & Main Drains",
                "Suction & Return Pressure Line Pressure Testing",
                "Pool Skimmer Crack Epoxy Injection",
                "Mastic Joint Replacement (Deck-O-Seal)"
            ]
        }
    ],
    "appliance": [
        {
            "id": "work_appl_diag",
            "name": "Diagnostics & Troubleshooting",
            "subcategories": [
                "Diagnostic Fault Code Retrieval & Board Self-Test",
                "Electrical Continuity & Resistance Meter Testing",
                "Sealed Refrigeration System Tap & Pressure Test",
                "Motor Current Draw & Capacitor Test"
            ]
        },
        {
            "id": "work_appl_refrig",
            "name": "Refrigerators & Freezers",
            "subcategories": [
                "Ice Maker Modular Assembly Replacement",
                "Evaporator Fan Motor & Condenser Fan Motor",
                "Defrost Heater, Bimetal Thermostat & Sensor",
                "Compressor Inverter Control Board Replacement",
                "Magnetic Door Gasket Replacement"
            ]
        },
        {
            "id": "work_appl_cooking",
            "name": "Ovens, Ranges & Cooktops",
            "subcategories": [
                "Gas Spark Ignitor & Safety Valve Replacement",
                "Electric Bake & Broil Heating Element Replacement",
                "Infinite Surface Burner Switch & Radiant Element",
                "Main Electronic Clock / Relay Control Board",
                "Door Hinge & Oven Door Gasket Replacement"
            ]
        },
        {
            "id": "work_appl_laundry",
            "name": "Washers & Dryers",
            "subcategories": [
                "Washer Drain Pump & Recirculation Pump",
                "Front-Load Washer Bellows / Door Boot Gasket",
                "Washer Suspension Rods & Damper Struts",
                "Dryer Heating Element Assembly & Thermal Fuses",
                "Dryer Drum Support Rollers, Idler Pulley & Belt",
                "Dryer Internal Lint Duct Deep Vacuum Cleanout"
            ]
        },
        {
            "id": "work_appl_dish",
            "name": "Dishwashers & Disposals",
            "subcategories": [
                "Dishwasher Circulation Pump & Motor Assembly",
                "Water Inlet Solenoid Valve Replacement",
                "Drain Impeller & Check Valve Replacement",
                "Under-Sink Garbage Disposal Replacement"
            ]
        }
    ],
    "garage_door": [
        {
            "id": "work_gd_safety",
            "name": "Diagnostics & Safety Audits",
            "subcategories": [
                "25-Point Comprehensive Door & Opener Safety Audit",
                "Door Balance & Cable Tension Test",
                "Photo-Eye Infrared Sensor Alignment & Safety Reversal",
                "Track Plumb, Level & Spacing Alignment"
            ]
        },
        {
            "id": "work_gd_springs",
            "name": "Torsion & Extension Springs",
            "subcategories": [
                "High-Cycle Oil-Tempered Dual Torsion Spring Replacement",
                "Extension Spring & Safety Containment Cable Install",
                "Torsion Tube & Center Bearing Bracket Replacement",
                "Cable Drum & High-Strength Aircraft Cable Replacement"
            ]
        },
        {
            "id": "work_gd_hardware",
            "name": "Track, Rollers & Hinges",
            "subcategories": [
                "13-Ball Bearing Nylon Roller Replacement",
                "Heavy-Duty 14-Gauge Hinge Replacement (#1, #2, #3)",
                "Bent Vertical & Horizontal Track Realignment",
                "Strut Wind-Load Reinforcement Truss Addition"
            ]
        },
        {
            "id": "work_gd_openers",
            "name": "Automatic Openers & Accessories",
            "subcategories": [
                "Belt-Drive & Chain-Drive Opener Installation",
                "Wall-Mount Direct-Drive Jackshaft Opener Install",
                "Gear & Sprocket Assembly Rebuild Kit",
                "Keyless Entry Keypad & Smart Wi-Fi Controller (myQ)"
            ]
        },
        {
            "id": "work_gd_weather",
            "name": "Weatherseals & Insulation",
            "subcategories": [
                "Heavy-Duty Bottom Rubber Astragal Weatherseal",
                "Perimeter Vinyl Jamb Weatherstripping",
                "Reflective Polystyrene Door Panel Insulation Kit"
            ]
        }
    ],
    "handyman": [
        {
            "id": "work_handy_drywall",
            "name": "Drywall, Plaster & Painting",
            "subcategories": [
                "Drywall Hole Patching & Texture Matching (Orange Peel, Knockdown)",
                "Water Stain Treatment & Primer Sealing",
                "Interior Room Painting & Accent Walls",
                "Caulking, Grouting & Tile Repair"
            ]
        },
        {
            "id": "work_handy_doors",
            "name": "Doors, Windows & Trim",
            "subcategories": [
                "Interior & Exterior Pre-Hung Door Hanging",
                "Door Locksets, Deadbolts & Smart Locks Installation",
                "Baseboard, Crown Molding & Casing Carpentry",
                "Window Screen Repair & Weatherstripping"
            ]
        },
        {
            "id": "work_handy_mounting",
            "name": "Mounting & Assembly",
            "subcategories": [
                "TV Wall Mount Installation (up to 85\")",
                "Custom Closet Organizer & Wire Shelving",
                "Curtain Rods, Blinds & Window Shades",
                "Ready-to-Assemble Furniture Assembly",
                "ADA Grab Bar & Safety Rail Mounting"
            ]
        },
        {
            "id": "work_handy_fixtures",
            "name": "Minor Fixture Replacements",
            "subcategories": [
                "Bathroom Vanity & Faucet Replacement",
                "Kitchen Garbage Disposal Replacement",
                "Ceiling Fan & Light Fixture Swaps",
                "Toilet Fill Valve & Flush Mechanism Overhaul"
            ]
        }
    ],
    "painting": [
        {
            "id": "work_paint_interior",
            "name": "Interior Painting & Prep",
            "subcategories": [
                "Walls, Ceilings & Trim Masking & Prep",
                "Drywall Joint Filling, Sanding & Priming",
                "Interior Latex Painting (Eggshell, Satin, Semi-Gloss)",
                "Accent Wall Painting & Color Blocking",
                "Stained Trim to Enamel Paint Conversion"
            ]
        },
        {
            "id": "work_paint_exterior",
            "name": "Exterior Painting & Staining",
            "subcategories": [
                "Power Wash Surface Prep & Scraping",
                "Elastomeric Masonry & Stucco Painting",
                "Wood Siding & Trim Primer & 2-Coat Painting",
                "Deck, Fence & Pergola Transparent/Semi-Solid Staining"
            ]
        },
        {
            "id": "work_paint_cabinet",
            "name": "Cabinet Refinishing",
            "subcategories": [
                "Cabinet Door Degreasing & Chemical De-glossing",
                "High-Build Primer Surfacer Spraying",
                "Fine-Finish Urethane Enamel / Lacquer Spraying"
            ]
        }
    ],
    "flooring": [
        {
            "id": "work_floor_hardwood",
            "name": "Hardwood & Sanding",
            "subcategories": [
                "Solid & Engineered Hardwood Installation (Nail / Glue)",
                "Dustless Hardwood Sanding & Buffing",
                "Custom Staining & Water-Based Polyurethane Coating",
                "Subfloor Leveling & Squeak Repair"
            ]
        },
        {
            "id": "work_floor_tile",
            "name": "Tile & Stone Setting",
            "subcategories": [
                "Porcelain & Ceramic Floor Tile Installation",
                "Shower Pan Waterproofing (Schluter Kerdi / RedGard)",
                "Kitchen Tile Backsplash Installation",
                "Epoxy & Cementitious Grouting / Sealing"
            ]
        },
        {
            "id": "work_floor_lvp",
            "name": "LVP & Laminate",
            "subcategories": [
                "Luxury Vinyl Plank (LVP) Click-Lock Installation",
                "Laminate Floating Floor Installation",
                "Quarter Round & Shoe Molding Installation",
                "Stair Tread & Riser Cap Installation"
            ]
        },
        {
            "id": "work_floor_carpet",
            "name": "Carpet Installation & Repair",
            "subcategories": [
                "Wall-to-Wall Carpet Installation with Tack Strip",
                "Power Stretching & Wrinkle Elimination",
                "Carpet Seam Iron Welding & Burn Patching"
            ]
        }
    ],
    "cleaning": [
        {
            "id": "work_clean_res",
            "name": "Residential Cleaning",
            "subcategories": [
                "Recurring House Cleaning (Weekly / Bi-Weekly)",
                "Deep House Cleaning & Detail Sanitation",
                "Move-In / Move-Out Turnover Cleaning",
                "Post-Construction Fine Dust Cleanout"
            ]
        },
        {
            "id": "work_clean_comm",
            "name": "Commercial Janitorial",
            "subcategories": [
                "Office Building Evening Custodial Maintenance",
                "Restroom Sanitization & Supply Restocking",
                "Commercial Hard Floor Stripping & Waxing",
                "Trash Removal & Recycling Collection"
            ]
        },
        {
            "id": "work_clean_carpet",
            "name": "Carpet & Upholstery Cleaning",
            "subcategories": [
                "Hot Water Extraction (Steam Cleaning)",
                "Pet Urine & Odor Enzymatic Treatment",
                "Fabric Upholstery & Sofa Shampooing",
                "Tile & Grout Pressure Extraction Cleaning"
            ]
        }
    ],
    "pressure_washing": [
        {
            "id": "work_pw_soft",
            "name": "Soft Washing & House Wash",
            "subcategories": [
                "Low-Pressure Chemical Soft Washing (Vinyl, Stucco, Hardie)",
                "Roof Soft Washing (Algae, Moss & Lichen Eradication)",
                "Fascia, Soffit & Gutter Exterior Brightening"
            ]
        },
        {
            "id": "work_pw_flat",
            "name": "Flatwork & Surface Cleaning",
            "subcategories": [
                "Concrete Driveway & Sidewalk Surface Cleaning",
                "Oil & Grease Stain Degreasing & Hot Water Scour",
                "Paver Joint Power Wash & Re-Sanding",
                "Commercial Dumpster Pad & Drive-Thru Cleaning"
            ]
        },
        {
            "id": "work_pw_wood",
            "name": "Wood & Deck Restoration",
            "subcategories": [
                "Wood Deck & Fence Mildew Stripping",
                "Sodium Percarbonate Oxygen Bleach Cleaning",
                "Wood Brightening & Neutralizing Rinse"
            ]
        }
    ],
    "window_cleaning": [
        {
            "id": "work_win_res",
            "name": "Residential Window Cleaning",
            "subcategories": [
                "Interior & Exterior Window Glass Cleaning",
                "Window Screen Removal, Washing & Conditioning",
                "Window Track & Sill Vacuuming / Detailing",
                "Hard Water Mineral Stain Removal"
            ]
        },
        {
            "id": "work_win_comm",
            "name": "Commercial & Multi-Story Glass",
            "subcategories": [
                "Commercial Storefront Route Cleaning",
                "Pure Water Water-Fed Pole Multi-Story Washing (up to 4 floors)",
                "High-Rise Rope Access / Lift Glass Cleaning"
            ]
        },
        {
            "id": "work_win_solar",
            "name": "Solar Panel Efficiency Cleaning",
            "subcategories": [
                "Deionized Pure Water Solar Array Washing",
                "Solar Panel Hotspot & Bird Dropping Removal",
                "Pre & Post Solar Output Efficiency Verification"
            ]
        }
    ],
    "locksmith": [
        {
            "id": "work_lock_res",
            "name": "Residential Locksmithing",
            "subcategories": [
                "Deadbolt & Handle Lock Rekeying",
                "Fresh Deadbolt Installation & Door Prep",
                "High-Security Cylinder Upgrades",
                "Smart Keypad & Wi-Fi Lock Installation",
                "Emergency Residential Lockout Service"
            ]
        },
        {
            "id": "work_lock_comm",
            "name": "Commercial Locksmithing",
            "subcategories": [
                "Master Key System Design & Implementation",
                "Panic Exit Crash Bar Installation",
                "Commercial Mortise Lockset Repair",
                "Storefront Aluminum Door Pivot & Lock Cylinder",
                "Heavy-Duty Door Closer Adjustment & Replacement"
            ]
        },
        {
            "id": "work_lock_auto",
            "name": "Automotive & Safe Services",
            "subcategories": [
                "Automotive Lockout & Safe Vehicle Opening",
                "Transponder Key & Key Fob Programming",
                "Safe Opening, Combination Changes & Dial Service"
            ]
        }
    ],
    "glass_glazing": [
        {
            "id": "work_glass_win",
            "name": "Window Glass Replacement",
            "subcategories": [
                "Insulated Glass Unit (IGU Dual-Pane) Replacement",
                "Broken Single-Pane Glass Reglazing & Putty",
                "Low-E & Argon Gas Energy Efficient Upgrades",
                "Window Sash Balance & Hardware Repair"
            ]
        },
        {
            "id": "work_glass_shower",
            "name": "Shower Glass Enclosures",
            "subcategories": [
                "Frameless 3/8\" & 1/2\" Tempered Glass Shower Doors",
                "Sliding Semi-Frameless Bypass Shower Doors",
                "Shower Door Hinges, Handles & Sweep Replacement"
            ]
        },
        {
            "id": "work_glass_comm",
            "name": "Commercial & Architectural Glass",
            "subcategories": [
                "Commercial Storefront Safety Laminated Glass",
                "Interior Glass Partition Wall Installation",
                "Custom Cut Mirrors & Beveled Glass Tabletops"
            ]
        }
    ],
    "restoration": [
        {
            "id": "work_restor_water",
            "name": "Water Damage Mitigation",
            "subcategories": [
                "Emergency Standing Water Extraction",
                "Structural Drying & Industrial Dehumidification",
                "Moisture Mapping with Thermal Imaging",
                "Containment Barrier Setup (Negative Air)"
            ]
        },
        {
            "id": "work_restor_mold",
            "name": "Mold Remediation",
            "subcategories": [
                "Airborne Spore HEPA Air Scrubbing",
                "Antimicrobial Surface Treatment & Biocide Wash",
                "Contaminated Drywall & Insulation Removal",
                "Post-Remediation Verification (Clearance Testing)"
            ]
        },
        {
            "id": "work_restor_fire",
            "name": "Fire & Smoke Restoration",
            "subcategories": [
                "Soot & Smoke Residue Chemical Sponge Cleanup",
                "Hydroxyl & Thermal Fogging Deodorization",
                "Structural Wood Soda Blasting / Encapsulation"
            ]
        }
    ],
    "fencing": [
        {
            "id": "work_fence_wood",
            "name": "Wood Fencing",
            "subcategories": [
                "Dog-Ear & Flat-Top Cedar Privacy Fence",
                "Post Hole Digging & Concrete Setting",
                "Horizontal Modern Slat Wood Fence",
                "Gate Construction & Anti-Sag Hardware Installation"
            ]
        },
        {
            "id": "work_fence_vinyl",
            "name": "Vinyl & Composite Fencing",
            "subcategories": [
                "PVC Vinyl Privacy & Picket Fence",
                "Composite Modern Modular Fence Panels",
                "Aluminum Railings & Stair Handrails"
            ]
        },
        {
            "id": "work_fence_chain",
            "name": "Chain Link & Security",
            "subcategories": [
                "Galvanized & Black Vinyl-Coated Chain Link",
                "Barbed Wire & Security Top Rail",
                "Commercial Cantilever & Rolling Slide Gates"
            ]
        }
    ],
    "septic": [
        {
            "id": "work_septic_pump",
            "name": "Septic Pumping & Inspection",
            "subcategories": [
                "Septic Tank Vacuum Pumping & Sludge Scour",
                "Visual Inspection of Baffles & Effluent Filter",
                "Drainfield / Leachfield High-Pressure Jetting",
                "Riser & Lid Retrofit Installation",
                "Commercial Grease Trap Pumping & Disposal"
            ]
        }
    ],
    "chimney": [
        {
            "id": "work_chim_sweep",
            "name": "Sweeping & Inspections",
            "subcategories": [
                "Level 1 & Level 2 Chimney Video Flue Inspection",
                "Creosote Removal & Chimney Flue Sweeping",
                "Fireplace Smoke Chamber Parging",
                "Chimney Cap & Spark Arrestor Installation",
                "Chimney Crown Repair & Waterproofing"
            ]
        }
    ],
    "insulation": [
        {
            "id": "work_insul_attic",
            "name": "Attic & Wall Insulation",
            "subcategories": [
                "Attic Blown-In Fiberglass & Cellulose Insulation",
                "Air Sealing Top Plates, Penetrations & Chases",
                "Old Contaminated Insulation Vacuum Extraction",
                "Baffle / Rafter Vent Installation for Airflow"
            ]
        },
        {
            "id": "work_insul_foam",
            "name": "Spray Foam & Crawlspace",
            "subcategories": [
                "Closed-Cell Spray Foam for Rim Joists",
                "Open-Cell Spray Foam for Roof Decks",
                "Crawlspace Cleanout & 20-Mil Vapor Barrier Encapsulation"
            ]
        }
    ],
    "concrete_masonry": [
        {
            "id": "work_conc_flat",
            "name": "Flatwork & Paving",
            "subcategories": [
                "Concrete Patio, Walkway & Driveway Pouring",
                "Decorative Stamped & Colored Concrete",
                "Control Joint Sawing, Grooving & Edging",
                "Concrete Crack Repair & Resurfacing Polymer"
            ]
        },
        {
            "id": "work_conc_masonry",
            "name": "Brick, Block & Stone Masonry",
            "subcategories": [
                "Brick Chimney & Wall Tuckpointing / Mortar Joint Raking",
                "Cinder Block Foundation Wall Repair",
                "Natural Stone & Manufactured Stone Veneer Installation"
            ]
        }
    ],
    "general_contractor": [
        {
            "id": "work_gc_remodel",
            "name": "Kitchen & Bath Remodeling",
            "subcategories": [
                "Full Kitchen Demolition & Cabinet Installation",
                "Master Bathroom Shower & Vanity Renovation",
                "Subfloor & Wall Framing Modifications",
                "Drywall, Taping, Texture & Finish Carpentry"
            ]
        },
        {
            "id": "work_gc_structural",
            "name": "Structural Additions & Decks",
            "subcategories": [
                "Room Additions & Sunrooms Construction",
                "Load-Bearing Wall Removal & LVL Beam Installation",
                "Treated Wood & Composite Deck Construction",
                "Basement Finishing & Moisture Sealing"
            ]
        }
    ],
    "general": [
        {
            "id": "work_gen_diag",
            "name": "Diagnostics & Evaluation",
            "subcategories": [
                "On-Site Technical Evaluation",
                "Safety & Code Compliance Inspection",
                "System Performance & Efficiency Testing",
                "Preventive Maintenance Multi-Point Audit"
            ]
        },
        {
            "id": "work_gen_repair",
            "name": "Repairs & Troubleshooting",
            "subcategories": [
                "Mechanical Component Repair & Rebuild",
                "Emergency Troubleshooting & Rapid Response",
                "Electrical & Wiring Diagnostics",
                "Hardware & Fastener Overhaul"
            ]
        },
        {
            "id": "work_gen_install",
            "name": "Installations & Replacements",
            "subcategories": [
                "Full System Equipment Installation",
                "Direct Replacement & Retrofit",
                "Accessory Upgrade & Modernization",
                "Custom Commissioning & Handover"
            ]
        },
        {
            "id": "work_gen_maint",
            "name": "Routine & Preventative Maintenance",
            "subcategories": [
                "Seasonal Tune-Up & Lubrication",
                "System Cleaning & Filter Replacement",
                "Calibration & Operational Parameter Verification",
                "Wear Component Proactive Replacement"
            ]
        }
    ]
};

export const DEFAULT_TOOL_CATEGORIES: Record<string, InventoryCategory[]> = {
    "plumbing": [
        {
            "id": "tool_plumb_diag",
            "name": "Diagnostic & Inspection Tools",
            "subcategories": [
                "Color Sewer Camera with 512Hz Sonde",
                "Digital Pipe Locator Receiver",
                "Acoustic Listening Disc & Ground Mic",
                "Water Pressure Test Gauge Kit",
                "Gas Manometer Pressure Gauge",
                "Moisture Meter & Thermal Imaging Camera"
            ]
        },
        {
            "id": "tool_plumb_drain",
            "name": "Drain Cleaning & Hydro-Jetting Equipment",
            "subcategories": [
                "5/8\" & 3/4\" Sectional Sewer Machine",
                "Drum Cable Machine with Autofeed",
                "High-Pressure Trailer / Cart Hydro-Jetters",
                "Jetting Nozzles (Penetrating, Rotating, Root Cutter)",
                "Hand Held Drop Head Closet Auger"
            ]
        },
        {
            "id": "tool_plumb_pipe",
            "name": "Pipe Joining & Press Tools",
            "subcategories": [
                "ProPress Battery Press Tool (1/2\" to 2\")",
                "PEX-A Expansion Tool & Heads",
                "PEX-B Crimp / Clamp Pliers",
                "Oxy-Acetylene / MAPP Gas Torch Kit",
                "Cast Iron Pipe Soil Cutter",
                "Inside Pipe Cutter & Tubing Cutters"
            ]
        },
        {
            "id": "tool_plumb_hand",
            "name": "Wrenches & Hand Tools",
            "subcategories": [
                "Aluminum Pipe Wrenches (10\", 14\", 18\", 24\")",
                "Basin Wrench & Telescopic Valve Tools",
                "Smooth Jaw Plumber Spud Wrenches",
                "Torpedo Level & Pitch Level",
                "Internal Spud Wrench & Flange Pullers"
            ]
        },
        {
            "id": "tool_plumb_safety",
            "name": "Safety Equipment & PPE",
            "subcategories": [
                "Nitrile & Heavy-Duty Leather Gloves",
                "Safety Glasses & Full Face Shield",
                "Rubber Knee Pads",
                "Biohazard Boot Covers & Tyvek Suits",
                "Confined Space Gas Detector"
            ]
        }
    ],
    "hvac": [
        {
            "id": "tool_hvac_diag",
            "name": "Diagnostic Meters & Gauges",
            "subcategories": [
                "Digital 4-Port Refrigerant Manifold Gauges",
                "Wireless Clamp Temperature Thermistors",
                "Micron Gauge for Deep Vacuum Verification",
                "Combustion Analyzer (CO & O2 Sensors)",
                "Digital Anemometer & Airflow Hood",
                "Fieldpiece Multimeter with Microfarad & Amp Clamp"
            ]
        },
        {
            "id": "tool_hvac_recovery",
            "name": "Refrigeration & Recovery Gear",
            "subcategories": [
                "Refrigerant Recovery Machine (Twin Cylinder)",
                "Dual-Stage Rotary Vane Vacuum Pump (8 CFM)",
                "DOT Refrigerant Recovery Cylinders",
                "Digital Refrigerant Charging Scale",
                "Electronic Heated Diode Refrigerant Sniffer"
            ]
        },
        {
            "id": "tool_hvac_brazing",
            "name": "Brazing, Purging & Flaring Tools",
            "subcategories": [
                "TurboTorch Nitrogen Regulator & Flow Meter",
                "Acetylene & Oxygen Brazing Rig",
                "Eccentric Cone Flaring Tool & Deburring Tool",
                "Refrigerant Line Ratchet Wrenches",
                "Fin Comb Straightening Set"
            ]
        },
        {
            "id": "tool_hvac_safety",
            "name": "Safety & Sheet Metal Tools",
            "subcategories": [
                "Sheet Metal Hand Notchers & Crimpers",
                "Folding Bar & Offset Aviation Snips",
                "Refrigerant Safety Glasses & Insulated Gloves",
                "Attic Safety Crawl Boards & Work Lights"
            ]
        }
    ],
    "refrigeration": [
        {
            "id": "tool_refrig_diag",
            "name": "Refrigeration Diagnostic Tools",
            "subcategories": [
                "Low-Temp Digital Manifold Set",
                "High-Accuracy Thermocouple Surface Probes",
                "Ultrasonic Refrigerant Leak Detector",
                "Oil Acid Test Kits & Refractometer",
                "Core Removal Valve Tools (1/4\" & 5/16\")"
            ]
        },
        {
            "id": "tool_refrig_recovery",
            "name": "Heavy-Duty Recovery Equipment",
            "subcategories": [
                "Commercial Refrigerant Recovery Machine",
                "Deep Vacuum Micron Gauge & Pump",
                "Nitrogen High-Pressure Regulator (600 PSI)",
                "Electronic Refrigerant Scale"
            ]
        }
    ],
    "electrical": [
        {
            "id": "tool_elec_meters",
            "name": "Meters & Testers",
            "subcategories": [
                "True RMS Clamp Multimeter (CAT IV)",
                "Circuit Breaker Finder & Wire Tracer",
                "Digital Megohmmeter (Insulation Tester)",
                "Thermal Imaging Camera (FLIR)",
                "Non-Contact Voltage Detector & GFCI Receptacle Tester"
            ]
        },
        {
            "id": "tool_elec_bending",
            "name": "Conduit & Bending Tools",
            "subcategories": [
                "1/2\", 3/4\", 1\" EMT Conduit Benders",
                "Hydraulic Knockout Punch Set (1/2\" to 4\")",
                "Fish Tape (Steel & Fiberglass 100ft/200ft)",
                "Wire Pulling Grips & Lubricant"
            ]
        },
        {
            "id": "tool_elec_hand",
            "name": "Lineman & Hand Tools",
            "subcategories": [
                "Insulated Lineman Pliers & Side Cutters (1000V)",
                "Automatic Wire Strippers & Crimpers",
                "Insulated Screwdriver Set",
                "Cable Cutters & Cable Strippers",
                "Locknut Wrenches & Torque Screwdriver"
            ]
        },
        {
            "id": "tool_elec_safety",
            "name": "PPE & Arc Flash Safety",
            "subcategories": [
                "Arc Flash Face Shield & Balaclava",
                "Dielectric Rubber Insulated Gloves & Leather Protectors",
                "Lockout / Tagout (LOTO) Kit",
                "Fiberglass Step Ladders (Non-Conductive)"
            ]
        }
    ],
    "low_voltage": [
        {
            "id": "tool_lv_test",
            "name": "Network & Fiber Test Equipment",
            "subcategories": [
                "Fluke DSX Cable Certifier & Channel Adapters",
                "Optical Time Domain Reflectometer (OTDR)",
                "Fiber Optic Fusion Splicer & Precision Cleaver",
                "Tone Generator & Inductive Probe Tracer",
                "PoE & Network Link Speed Tester",
                "Visual Fault Locator (VFL Red Laser)"
            ]
        },
        {
            "id": "tool_lv_crimp",
            "name": "Termination & Punch-Down Tools",
            "subcategories": [
                "RJ45 Modular Crimper (Pass-Through & Standard)",
                "110 & 66 Block Punch-Down Tool with Blades",
                "Coaxial Compression Tool (BNC, F-Connector, RCA)",
                "Fiber Precision Buffer Tube Stripper & Kevlar Shears",
                "Fish Tape, Glow Rods & Wire Pulling Grips"
            ]
        },
        {
            "id": "tool_lv_power",
            "name": "Power & Pathway Installation Tools",
            "subcategories": [
                "Cordless Hammer Drill & Driver Kit",
                "Rotary Hammer & Masonry Core Bits",
                "Flex Drill Bits & Wire Pulling Guide",
                "Drywall Jab Saw & Hole Saws",
                "Step Drill Bits & Knockout Punches"
            ]
        },
        {
            "id": "tool_lv_safety",
            "name": "Access & Safety Equipment",
            "subcategories": [
                "Fiberglass Step Ladders (6ft, 8ft, 10ft)",
                "Extension Ladder (24ft) with Pole Grips",
                "Fall Protection Harness & Lanyard",
                "Hard Hats, High-Vis Vests & Safety Glasses",
                "Headlamps & Portable LED Work Lights"
            ]
        }
    ],
    "roofing": [
        {
            "id": "tool_roof_pneumatic",
            "name": "Roofing Guns & Air Tools",
            "subcategories": [
                "Pneumatic Coil Roofing Nailer",
                "Air Compressor (2-Gallon Hotdog)",
                "Heavy-Duty Air Hose & Swivel Couplers"
            ]
        },
        {
            "id": "tool_roof_hand",
            "name": "Tear-Off & Hand Tools",
            "subcategories": [
                "Roofing Tear-Off Shingle Shovel",
                "Hatchet / Roofing Hammer with Depth Gauge",
                "Hook Blades & Utility Knives",
                "Seam Roller for Flat Membranes",
                "Tin Snips & Sheet Metal Hand Seamers"
            ]
        },
        {
            "id": "tool_roof_safety",
            "name": "Fall Protection & Ladder Safety",
            "subcategories": [
                "Roof Anchor Brackets & Lifelines",
                "Rope Grabs & Shock Absorbing Lanyards",
                "Ladder Jacks & Scaffolding Planks",
                "Ladder Standoff / Stabilizer Arms"
            ]
        }
    ],
    "lawn": [
        {
            "id": "tool_lawn_power",
            "name": "Commercial Mowers & Power Equipment",
            "subcategories": [
                "Commercial Zero-Turn Riding Mower (52\" / 60\")",
                "Commercial Walk-Behind Hydro Mower (36\" / 48\")",
                "Gas Backpack Blowers (800+ CFM)",
                "Straight Shaft String Trimmers & Edgers",
                "Articulating Hedge Trimmers (Pole & Handheld)"
            ]
        },
        {
            "id": "tool_lawn_aerate",
            "name": "Specialty Turf Equipment",
            "subcategories": [
                "Walk-Behind Core Aerator",
                "Mechanical Power Dethatcher",
                "Walk-Behind Broadcast Spreader (100 lb)",
                "Tow-Behind Lawn Roller"
            ]
        },
        {
            "id": "tool_lawn_safety",
            "name": "PPE & Hand Tools",
            "subcategories": [
                "Safety Glasses & Ear Protection Muffs",
                "Steel Toe Work Boots & Shin Guards",
                "Heavy-Duty Landscape Rakes & Flat Shovels",
                "Bypass Hand Pruners & Loppers"
            ]
        }
    ],
    "tree_service": [
        {
            "id": "tool_tree_saws",
            "name": "Chainsaws & Pole Saws",
            "subcategories": [
                "Top-Handle Arborist Climbing Saws (Stihl MS201T)",
                "Commercial Ground Chainsaws (50cc, 70cc, 90cc)",
                "Telescoping Pole Saws (Gas & Manual)",
                "Chainsaw Chaps, Helmet System & Mesh Face Shield"
            ]
        },
        {
            "id": "tool_tree_rigging",
            "name": "Climbing & Rigging Gear",
            "subcategories": [
                "Arborist Tree Climbing Harness & Lanyard",
                "Static & Dynamic Rigging Ropes (1/2\", 5/8\")",
                "Heavy-Duty Rigging Blocks, Pulleys & Port-a-Wrap",
                "Spikes / Climbers with Tree Straps",
                "Throw Lines, Weights & Big Shot Launcher"
            ]
        },
        {
            "id": "tool_tree_heavy",
            "name": "Chippers & Grinders",
            "subcategories": [
                "Drum / Disc Wood Chipper (12\" to 18\" Capacity)",
                "Self-Propelled Stump Grinder",
                "Log Splitters & Cant Hooks / Peaveys"
            ]
        }
    ],
    "irrigation": [
        {
            "id": "tool_irrig_diag",
            "name": "Testing & Location Tools",
            "subcategories": [
                "Underground Solenoid Valve Locator & Wire Tracer",
                "Digital Backflow Test Gauge Kit",
                "Water Pressure & Flow Pitot Gauge",
                "Sprinkler Adjustment Wrenches & Rotor Keys"
            ]
        },
        {
            "id": "tool_irrig_pipe",
            "name": "Trenching & Pipe Tools",
            "subcategories": [
                "Pipe Puller / Mini Trencher",
                "Poly Pipe Crimpers & Clamps",
                "PVC Pipe Cutters & Deburring Tools",
                "High-CFM Air Compressor Adapter for Blowouts"
            ]
        }
    ],
    "pest": [
        {
            "id": "tool_pest_spray",
            "name": "Application Equipment",
            "subcategories": [
                "Commercial B&G 1-Gallon Stainless Steel Sprayer",
                "Backpack Power Mist Blower (Stihl SR450)",
                "Bulb Duster & Handheld Precision Bellows",
                "Telescoping Cobweb Extension Pole (30ft)",
                "Termite Soil Sub-Slab Injector Rod & Pump"
            ]
        },
        {
            "id": "tool_pest_safety",
            "name": "Inspection & PPE",
            "subcategories": [
                "High-Lumen Inspection Flashlight & UV Blacklight",
                "Respirator with Organic Vapor & Particulate Cartridges",
                "Nitrile Chemical-Resistant Gauntlet Gloves",
                "Knee Pads & Disposable Tyvek Suit"
            ]
        }
    ],
    "pool": [
        {
            "id": "tool_pool_test",
            "name": "Water Testing & Inspection Tools",
            "subcategories": [
                "Digital Photometer Water Testing Kit (Taylor / LaMotte)",
                "Salt / TDS Electronic Pocket Tester",
                "Hydrostatic Pressure Test Plugs",
                "Underwater Dye Testing Syringes",
                "Pool Stethoscope / Acoustic Leak Microphone"
            ]
        },
        {
            "id": "tool_pool_cleaning",
            "name": "Service Pole & Cleaning Attachments",
            "subcategories": [
                "Commercial Telescopic Fiberglass Pole (8ft to 16ft)",
                "Commercial Deep Leaf Rakes & Skimmer Nets",
                "Stainless Steel & Nylon Wall Brushes",
                "Flexible Concrete Vacuum Head with Swivel",
                "1.5\" Heavy-Duty Vacuum Hose (50ft)"
            ]
        }
    ],
    "appliance": [
        {
            "id": "tool_appl_meters",
            "name": "Meters & Electronic Tools",
            "subcategories": [
                "True RMS Multimeter with Temperature Probe",
                "Capacitance & Microfarad Meter",
                "Non-Contact Infrared Thermometer",
                "Diagnostic Computer / USB Service Interface Tool"
            ]
        },
        {
            "id": "tool_appl_hand",
            "name": "Specialty Appliance Hand Tools",
            "subcategories": [
                "1/4\" & 5/16\" Magnetic Nut Drivers",
                "Spanner Wrench for Washing Machine Tub Nuts",
                "Spring Expansion Tool for Washer Door Bellows",
                "Refrigeration R-134a/R-600a Piercing Valve & Gauges",
                "Drum Belt Installation Hooks"
            ]
        }
    ],
    "garage_door": [
        {
            "id": "tool_gd_springs",
            "name": "Torsion Winding Equipment",
            "subcategories": [
                "Steel Torsion Winding Bars (Pair 1/2\" Round x 18\")",
                "Vise Grips & Heavy-Duty C-Clamps (10\", 11R)",
                "Cable Tension Clamps",
                "Magnetic Torpedo Level & 4ft Box Level"
            ]
        },
        {
            "id": "tool_gd_hand",
            "name": "Hand & Power Tools",
            "subcategories": [
                "Impact Driver with Deep Magnetic Sockets (7/16\", 1/2\", 9/16\")",
                "Step Ladder (8ft & 10ft Heavy-Duty Fiberglass)",
                "Cordless Angle Grinder & Metal Cut-Off Wheels"
            ]
        }
    ],
    "handyman": [
        {
            "id": "tool_handy_general",
            "name": "Hand & Power Tools",
            "subcategories": [
                "Cordless Drill & Impact Driver Combo",
                "Compound Miter Saw & Portable Stand",
                "Orbital Sander & Multi-Tool Oscillating Saw",
                "Drywall Taping Knives (4\", 6\", 10\", 12\")",
                "Electronic Stud Finder with Deep Scan & AC Live Wire Warning"
            ]
        },
        {
            "id": "tool_handy_ladders",
            "name": "Ladders & Transport",
            "subcategories": [
                "Multi-Position Articulating Ladder (17ft / 22ft)",
                "Tool Backpack & Heavy-Duty Rolling Cart"
            ]
        }
    ],
    "painting": [
        {
            "id": "tool_paint_spray",
            "name": "Sprayers & Application Gear",
            "subcategories": [
                "Airless Paint Sprayer (Graco Ultra Max)",
                "HVLP Fine-Finish Sprayer for Cabinets",
                "Heavy-Duty Paint Roller Frames (9\" & 18\")",
                "Telescoping Extension Poles (4ft to 12ft)",
                "Cut-In Angled Sash Brushes (2\", 2.5\", 3\")"
            ]
        },
        {
            "id": "tool_paint_prep",
            "name": "Prep & Masking Tools",
            "subcategories": [
                "Hand Masker Dispenser with Paper & Film",
                "Random Orbital Sander with Dust Extraction",
                "Carbide Scrapers & Putty Knives",
                "Caulk Guns (High Thrust Ratio)"
            ]
        }
    ],
    "flooring": [
        {
            "id": "tool_floor_saws",
            "name": "Cutting & Installation Tools",
            "subcategories": [
                "Wet Tile Saw with Diamond Blade",
                "Manual Tile Snap Cutter",
                "Pneumatic Flooring Cleat Nailer / Stapler",
                "Jamb Saw for Undercutting Door Casings",
                "Carpet Knee Kicker & Power Stretcher"
            ]
        },
        {
            "id": "tool_floor_prep",
            "name": "Subfloor Prep Tools",
            "subcategories": [
                "Concrete Floor Grinder & Dust Shroud",
                "Self-Leveling Underlayment Spiked Roller & Rake",
                "Notched Trowels (Square, U-Notch, V-Notch)"
            ]
        }
    ],
    "cleaning": [
        {
            "id": "tool_clean_equip",
            "name": "Commercial Cleaning Machines",
            "subcategories": [
                "Commercial Upright & Backpack HEPA Vacuums",
                "Truckmount / Portable Hot Water Carpet Extractor",
                "Commercial Floor Buffer / Rotary Polisher (175 RPM)",
                "Microfiber Flat Mop Systems & Dual-Bucket Carts"
            ]
        }
    ],
    "pressure_washing": [
        {
            "id": "tool_pw_rig",
            "name": "Pressure Washers & Attachments",
            "subcategories": [
                "Commercial Gas Pressure Washer (4000 PSI / 4 to 8 GPM)",
                "Dual-Handle Rotary Surface Cleaner (20\" / 24\")",
                "Soft Wash 12V Diaphragm Chemical Pump System",
                "Downstream Chemical Injector (X-Jet / General Pump)",
                "High-Pressure Non-Marking Hose (100ft/200ft)"
            ]
        }
    ],
    "window_cleaning": [
        {
            "id": "tool_win_gear",
            "name": "Pure Water & Traditional Gear",
            "subcategories": [
                "Multi-Stage RO/DI Pure Water Cart System",
                "Carbon Fiber Water-Fed Pole (30ft to 50ft)",
                "Commercial Squeegees (12\", 14\", 18\" Brass/Stainless)",
                "Microfiber Washer Mops (T-Bar & Sleeves)",
                "Glass Scraping Blades (6\" Stainless Steel)"
            ]
        }
    ],
    "locksmith": [
        {
            "id": "tool_lock_key",
            "name": "Key Cutting & Pinning Tools",
            "subcategories": [
                "Semi-Automatic Key Duplicator Machine",
                "Universal Pinning Kit (LAB 0.003 / 0.005)",
                "Lock Pick Sets, Tension Tools & Electric Picks",
                "Plug Followers & Shims",
                "Automotive Diagnostic OBD2 Key Programmer"
            ]
        }
    ],
    "glass_glazing": [
        {
            "id": "tool_glass_equip",
            "name": "Glazing & Handling Tools",
            "subcategories": [
                "Heavy-Duty Vacuum Suction Cups (Pump-Action)",
                "Glass Cutting Wheel with Carbide Blade",
                "Glazing Bars & Setting Block Chocks",
                "Putty Knives & Glazing Bead Removal Tools"
            ]
        }
    ],
    "restoration": [
        {
            "id": "tool_restor_drying",
            "name": "Drying & Scrubbing Equipment",
            "subcategories": [
                "LGR Industrial Dehumidifiers (Low Grain Refrigerant)",
                "High-Velocity Axial & Centrifugal Air Movers",
                "HEPA Air Scrubbers (500 to 2000 CFM)",
                "Ride-On / Stand-On Deep Carpet Water Extractor",
                "Thermal Imaging Camera & Pinless Moisture Meters"
            ]
        }
    ],
    "fencing": [
        {
            "id": "tool_fence_dig",
            "name": "Digging & Setting Equipment",
            "subcategories": [
                "Gas / Hydraulic Post Hole Digger (Auger)",
                "Manual Post Hole Digger & Tamping Bar",
                "String Lines, Line Levels & Post Levels",
                "Pneumatic Fencing Coil Nailer / Stapler"
            ]
        }
    ],
    "septic": [
        {
            "id": "tool_septic_rig",
            "name": "Pumping & Excavation Tools",
            "subcategories": [
                "Vacuum Tank Truck & 3\" / 4\" Heavy Suction Hoses",
                "Effluent Filter Wash Wand & Hook",
                "Septic Tank Crust Buster / Agitator Tool",
                "Shovels, Probing Rods & Metal Detectors"
            ]
        }
    ],
    "chimney": [
        {
            "id": "tool_chim_sweep",
            "name": "Sweeping Gear",
            "subcategories": [
                "Rotary Power Sweeping Rods & Whip Heads",
                "Poly & Wire Chimney Flue Brushes",
                "Dual-Motor HEPA Chimney Dust Vacuum",
                "Chimney Camera Inspection System with Display"
            ]
        }
    ],
    "insulation": [
        {
            "id": "tool_insul_blow",
            "name": "Blowing & Spray Equipment",
            "subcategories": [
                "Commercial Insulation Blowing Machine with 150ft Hose",
                "High-Powered Insulation Removal Vacuum",
                "Two-Component Foam Spray Rig & Guns",
                "Blower Door Test Frame & Digital Manometer"
            ]
        }
    ],
    "concrete_masonry": [
        {
            "id": "tool_conc_finishing",
            "name": "Finishing & Mixing Tools",
            "subcategories": [
                "Bull Float & Magnesium Hand Floats",
                "Walk-Behind Concrete Power Trowel (36\")",
                "Portable Gas Concrete Mixer",
                "Gas Cut-Off Saw (14\" Diamond Blade)",
                "Mortar Trowels, Margin Trowels & Jointer Irons"
            ]
        }
    ],
    "general_contractor": [
        {
            "id": "tool_gc_heavy",
            "name": "Framing & Carpentry Tools",
            "subcategories": [
                "Pneumatic Framing Nailer & Coil Siding Nailer",
                "10\" & 12\" Sliding Compound Miter Saw",
                "Table Saw with Rolling Stand",
                "Rotary Laser Level with Tripod & Grade Rod",
                "Demolition Sledgehammers & Reciprocating Saws"
            ]
        }
    ],
    "general": [
        {
            "id": "tool_gen_hand",
            "name": "Hand Tools",
            "subcategories": [
                "Screwdrivers, Pliers, Wrenches & Sockets",
                "Hammers, Mallets & Pry Bars",
                "Tape Measures & Torpedo Levels",
                "Utility Knives & Wire Cutters"
            ]
        },
        {
            "id": "tool_gen_power",
            "name": "Power Tools",
            "subcategories": [
                "Cordless Drill & Impact Driver Kit",
                "Circular Saw & Reciprocating Saw",
                "Angle Grinder & Multi-Tool Oscillating Saw",
                "Rotary Hammer Drill"
            ]
        },
        {
            "id": "tool_gen_diag",
            "name": "Diagnostic & Inspection Equipment",
            "subcategories": [
                "Digital Multimeter & Voltage Tester",
                "Thermal Infrared Thermometer",
                "Borescope / Inspection Camera",
                "Moisture & Pressure Gauges"
            ]
        },
        {
            "id": "tool_gen_safety",
            "name": "Safety Gear & Access Equipment",
            "subcategories": [
                "Hard Hats & ANSI Safety Glasses",
                "Knee Pads & Work Gloves",
                "Fiberglass Step Ladders (6ft & 8ft)",
                "Work Lights & Headlamps"
            ]
        }
    ]
};

export const DEFAULT_MATERIAL_CATEGORIES: Record<string, InventoryCategory[]> = {
    "plumbing": [
        {
            "id": "mat_plumb_pipe",
            "name": "Pipes & Tubing",
            "subcategories": [
                "Type L Copper Tubing (1/2\", 3/4\", 1\")",
                "PEX-A Barrier Tubing (Blue, Red, White)",
                "Schedule 40 PVC & DWV Foam Core Pipe",
                "ABS Drain Waste Vent Pipe",
                "Black Steel Gas Pipe (Schedule 40)",
                "Corrugated Stainless Steel Tubing (CSST)"
            ]
        },
        {
            "id": "mat_plumb_fittings",
            "name": "Fittings & Couplings",
            "subcategories": [
                "ProPress Copper Fittings (Tees, 90s, Couplings)",
                "PEX-A Expansion Rings & Brass Fittings",
                "PVC DWV Sanitary Tees, Wyes & Sweeps",
                "Fernco Flexible Shielded Couplings (No-Hub)",
                "Brass Ball Valves & Check Valves",
                "SharkBite Push-to-Connect Emergency Fittings"
            ]
        },
        {
            "id": "mat_plumb_fixtures",
            "name": "Fixture Parts & Trim",
            "subcategories": [
                "Toilet Fill Valves & Flappers",
                "Wax Rings with Polyethylene Horn",
                "Closet Bolts & Plated Caps",
                "Shower Cartridges (Moen 1222, Delta RP19804, Kohler)",
                "Supply Lines (Braided Stainless Steel 3/8\" x 1/2\")",
                "P-Traps & Slip Joint Extension Tubes"
            ]
        },
        {
            "id": "mat_plumb_heaters",
            "name": "Water Heater Components",
            "subcategories": [
                "Temperature & Pressure (T&P) Relief Valves",
                "Magnesium & Aluminum Anode Rods",
                "4500W Screw-In Heating Elements",
                "Upper & Lower Water Heater Thermostats",
                "Gas Thermocouples & Pilot Assemblies",
                "Thermal Expansion Tanks (2-Gallon, 4.5-Gallon)"
            ]
        },
        {
            "id": "mat_plumb_chems",
            "name": "Chemicals, Cements & Sealants",
            "subcategories": [
                "PVC Purple Primer & Medium Clear Cement",
                "ABS Black Transition Cement",
                "PTFE Thread Sealant Tape (Standard & Gas Yellow)",
                "Pipe Joint Compound (Teflon Paste)",
                "Plumber’s Putty & 100% Silicone Sealant",
                "RootX & Enzyme Drain Maintenance Treatments"
            ]
        }
    ],
    "hvac": [
        {
            "id": "mat_hvac_refrig",
            "name": "Refrigerants & Lubricants",
            "subcategories": [
                "R-410A Refrigerant Cylinder (25 lb)",
                "R-454B / R-32 Low GWP Cylinders",
                "R-22 Replacement Blends",
                "POE Synthetic Polyolester Oil",
                "PVE & Mineral Compressor Oil",
                "Nylog Blue Gasket & Thread Thread Sealant"
            ]
        },
        {
            "id": "mat_hvac_electrical",
            "name": "Electrical Components & Capacitors",
            "subcategories": [
                "Dual Run Capacitors (35/5, 40/5, 45/5, 50/5, 70/5 uF)",
                "Single Pole & 2-Pole 30A/40A Contactors",
                "Hot Surface Ignitors (Silicon Nitride & Carbide)",
                "Universal Furnace Control Boards",
                "Hard Start Kits (CSR500 / 2-Wire)",
                "Transformers (120V/208V/240V to 24V 40VA)"
            ]
        },
        {
            "id": "mat_hvac_air",
            "name": "Filters, Pads & Line Sets",
            "subcategories": [
                "1\" Pleated Air Filters (MERV 8, 11)",
                "4\" / 5\" Media Air Cleaner Filter Cartridges",
                "Line Sets (3/8\" x 3/4\", 3/8\" x 7/8\" Copper R410A Insulated)",
                "Vibration Isolator Pads & Equipment Risers",
                "Float Switches (Condensate Overflow Sensor)"
            ]
        },
        {
            "id": "mat_hvac_braze",
            "name": "Brazing & Line Accessories",
            "subcategories": [
                "15% Silver Brazing Rods (Sil-Fos)",
                "Liquid Line Filter Driers (163S, 083S)",
                "Sight Glasses & Moisture Indicators",
                "Armaflex Foam Pipe Insulation",
                "Nitrogen Purge Gas (Cylinder)"
            ]
        }
    ],
    "refrigeration": [
        {
            "id": "mat_refrig_gas",
            "name": "Refrigerants & Oils",
            "subcategories": [
                "R-404A / R-448A / R-449A Refrigerant",
                "POE Oil (Ester) & Alkylbenzene Oil",
                "Nitrogen Purge Cylinders",
                "Capillary Tubing Spools"
            ]
        },
        {
            "id": "mat_refrig_parts",
            "name": "Controls & Motors",
            "subcategories": [
                "Defrost Timers (Paragon 8145-20)",
                "Defrost Termination / Fan Delay Thermostats (Klixon)",
                "Shaded Pole & ECM Evaporator Fan Motors (9W, 16W)",
                "Castel / Sporlan Solenoid Valves & Coils",
                "Dixell / Carel Digital Thermostats"
            ]
        }
    ],
    "electrical": [
        {
            "id": "mat_elec_wire",
            "name": "Wire & Cable",
            "subcategories": [
                "Romex NM-B Cable (14/2, 14/3, 12/2, 12/3, 10/2, 10/3)",
                "THHN / THWN Stranded Building Wire (12, 10, 8, 6, 4, 2, 1/0, 2/0, 4/0 AWG)",
                "MC Metal Clad Armor Cable (12/2, 12/3)",
                "SER / SEU Aluminum Service Entrance Cable",
                "Bare Copper Solid Ground Wire (#6, #4)"
            ]
        },
        {
            "id": "mat_elec_panels",
            "name": "Panels & Circuit Breakers",
            "subcategories": [
                "Square D QO / Homeline Breakers (15A, 20A, 30A, 50A)",
                "Siemens & Eaton BR / CH Breakers",
                "AFCI / GFCI Circuit Breakers",
                "Type 2 Whole-Home Surge Protectors",
                "Main Lug & Main Breaker Load Centers"
            ]
        },
        {
            "id": "mat_elec_devices",
            "name": "Devices & Wallplates",
            "subcategories": [
                "15A / 20A Tamper-Resistant Duplex Receptacles",
                "Self-Test GFCI Receptacles (15A & 20A)",
                "Decora Rocker Switches & 3-Way Switches",
                "Lutron LED+ Dimmers & Smart Switches",
                "Single & Multi-Gang Plastic & Metal Boxes"
            ]
        },
        {
            "id": "mat_elec_conduit",
            "name": "Conduit & Fittings",
            "subcategories": [
                "EMT Thinwall Steel Conduit (1/2\", 3/4\", 1\")",
                "EMT Set Screw & Compression Couplings/Connectors",
                "Schedule 40 & 80 PVC Conduit & Solvent",
                "Liquidtight Flexible Conduit & Connectors",
                "Steel Strut Channel & Pipe Straps"
            ]
        }
    ],
    "low_voltage": [
        {
            "id": "mat_lv_cable",
            "name": "Bulk Cabling & Spools",
            "subcategories": [
                "Cat6 UTP / STP Solid Copper Bulk Cable (1000ft Box)",
                "Cat6A Shielded Bulk Cable",
                "OS2 Single-Mode & OM4 Multi-Mode Fiber Cable",
                "RG6 Quad-Shield Coaxial Cable",
                "18/2, 18/4, 22/4 Station & Alarm Wire",
                "16/2 & 14/2 In-Wall Speaker Wire"
            ]
        },
        {
            "id": "mat_lv_connect",
            "name": "Jacks, Connectors & Patch Panels",
            "subcategories": [
                "RJ45 Cat6/6A Keystone Jacks & Modular Plugs",
                "Cat6 24-Port & 48-Port 1U/2U Patch Panels",
                "BNC, RCA & F-Type Compression Connectors",
                "LC / SC Fast Fiber Optic Connectors",
                "Single & Multi-Gang Wall Plates & Keystone Inserts"
            ]
        },
        {
            "id": "mat_lv_racks",
            "name": "Racks & Wire Management",
            "subcategories": [
                "Wall-Mount Network Cabinets (6U, 9U, 12U)",
                "Horizontal & Vertical Cable Management Ducts",
                "Velcro Cable Wraps & Heavy-Duty Zip Ties",
                "J-Hooks, Cable Trays & Bridle Rings",
                "Low Voltage Mounting Brackets (Mud Rings)"
            ]
        },
        {
            "id": "mat_lv_hardware",
            "name": "Fasteners & Firestop Materials",
            "subcategories": [
                "Drywall Anchors, Toggle Bolts & Wall Dogs",
                "Self-Tapping & Sheet Metal Screws",
                "EMT Conduit, Fittings & Bushings",
                "Firestop Sealant & Caulk (UL Classified)",
                "Thermal Transfer Wire Marking Labels"
            ]
        }
    ],
    "roofing": [
        {
            "id": "mat_roof_shingle",
            "name": "Shingles & Membranes",
            "subcategories": [
                "Architectural Asphalt Shingles (Bundles)",
                "Synthetic Underlayment (Titanium / ProArmor)",
                "Self-Adhering Ice & Water Shield Membrane",
                "Starter Strip Shingles & Ridge Cap Shingles",
                "TPO 60-mil White Roofing Membrane"
            ]
        },
        {
            "id": "mat_roof_metal",
            "name": "Flashing & Metalwork",
            "subcategories": [
                "Aluminum Drip Edge (White / Brown / Bronze)",
                "Step Flashing Aluminum Pieces (4\" x 4\" x 8\")",
                "Continuous Roll Flashing & Valley Metal",
                "Lead & Rubber Plumbing Vent Pipe Boots"
            ]
        },
        {
            "id": "mat_roof_fasteners",
            "name": "Nails, Screws & Adhesives",
            "subcategories": [
                "Coil Roofing Nails (1-1/4\" Electro-Galvanized)",
                "Plastic Cap Nails for Underlayment",
                "Asphalt Roof Cement / Flashing Sealant Tube",
                "Polyurethane UV-Resistant Sealant"
            ]
        }
    ],
    "lawn": [
        {
            "id": "mat_lawn_bulk",
            "name": "Mulch, Soil & Stone",
            "subcategories": [
                "Triple-Shredded Dark Hardwood Mulch",
                "Screened Topsoil & Compost Blend",
                "River Rock & Crushed Decorative Stone",
                "Paver Base Crushed Stone & Bedding Sand"
            ]
        },
        {
            "id": "mat_lawn_seed",
            "name": "Seed, Fertilizer & Chemicals",
            "subcategories": [
                "Certified Turf-Type Tall Fescue / Kentucky Bluegrass Seed",
                "Slow-Release Nitrogen Turf Fertilizer (24-0-11)",
                "Pre-Emergent Crabgrass Preventer with Fertilizer",
                "Selective Broadleaf Herbicide Concentrate",
                "Pelletized Calcitic Limestone"
            ]
        }
    ],
    "tree_service": [
        {
            "id": "mat_tree_cabling",
            "name": "Cabling, Bracing & Care",
            "subcategories": [
                "Extra High Strength (EHS) Galvanized Cable (3/16\", 1/4\")",
                "Dead-End Grips, Thimbles & Eyebolts",
                "Tree Wound Dressing & Bio-Stimulants",
                "Bar & Chain Oil (Bio-degradable & Standard)",
                "2-Cycle Mixed Fuel & Ethanol Shield"
            ]
        }
    ],
    "irrigation": [
        {
            "id": "mat_irrig_heads",
            "name": "Heads, Nozzles & Valves",
            "subcategories": [
                "Pop-Up Spray Heads (4\", 6\", 12\" Rain Bird / Hunter)",
                "Gear-Driven Rotors (Rain Bird 5000, Hunter PGP)",
                "Rotary High-Efficiency Nozzles (MP Rotators)",
                "1\" Electric Globe Solenoid Valves (24VAC)",
                "Valve Boxes & Extension Rings (Round & Rectangular)"
            ]
        },
        {
            "id": "mat_irrig_pipe",
            "name": "Pipes, Fittings & Wire",
            "subcategories": [
                "Polyethylene Flexible Irrigation Pipe (3/4\", 1\")",
                "Schedule 40 PVC Pipe & Deep Socket Fittings",
                "Funny Pipe / Swing Pipe & Spiral Barb Fittings",
                "Direct Burial Irrigation Wire (18-Gauge Multi-Conductor)",
                "Waterproof Silicone Wire Connectors (King Nuts)"
            ]
        }
    ],
    "pest": [
        {
            "id": "mat_pest_chems",
            "name": "Insecticides & Termiticides",
            "subcategories": [
                "Non-Repellent Termiticide (Taurus SC / Termidor SC)",
                "Microencapsulated Perimeter Concentrate (Demand CS / Suspend PolyZone)",
                "Cockroach & Ant Gel Baits (Advion, Maxforce)",
                "Insecticidal Dust (DeltaDust, Alpine Dust)",
                "Insect Growth Regulators (IGR NyGuard)"
            ]
        },
        {
            "id": "mat_pest_rodent",
            "name": "Rodent Stations & Hardware",
            "subcategories": [
                "Tamper-Resistant Rodent Bait Stations",
                "First & Second-Generation Anticoagulant Bait Blocks",
                "Heavy-Duty Wooden & Snap Traps",
                "Stainless Steel Mesh & Copper Stuf-fit Mesh",
                "Expanding Polyurethane Pest Foam"
            ]
        }
    ],
    "pool": [
        {
            "id": "mat_pool_chems",
            "name": "Water Treatment Chemicals",
            "subcategories": [
                "Liquid Chlorine (Sodium Hypochlorite 12.5%)",
                "Calcium Hypochlorite Shock (65% / 73%)",
                "Muriatic Acid (31.45% Hydrochloric Acid)",
                "Sodium Bicarbonate (Alkalinity Increaser)",
                "Cyanuric Acid (CYA Stabilizer)",
                "Pool Salt (High-Purity 99.8%)"
            ]
        },
        {
            "id": "mat_pool_parts",
            "name": "Filter Media & Equipment Parts",
            "subcategories": [
                "D.E. Diatomaceous Earth Powder / Cellulose Fiber",
                "Specialty Filter Silica Sand & Glass Media",
                "Replacement Filter Cartridge Elements (Hayward, Pentair, Jandy)",
                "Pump Lid O-Rings, Diffusers & Mechanical Shaft Seals",
                "Universal 2\" & 2.5\" CPVC Jandy Valves"
            ]
        }
    ],
    "appliance": [
        {
            "id": "mat_appl_fuses",
            "name": "Fuses, Thermostats & Ignitors",
            "subcategories": [
                "Dryer Thermal Fuses (Thermal Cutoffs)",
                "Bimetal Defrost Thermostats",
                "Universal Silicon Nitride Flat Ignitors",
                "Gas Range Spark Modules (4-Point & 6-Point)"
            ]
        },
        {
            "id": "mat_appl_pumps",
            "name": "Pumps, Valves & Motors",
            "subcategories": [
                "Universal Dishwasher / Washer Drain Pumps",
                "Dual & Single Solenoid Water Inlet Valves",
                "Washing Machine Drive Belts & Dryer Drum Belts",
                "Capacitors (Motor Run & Start)"
            ]
        }
    ],
    "garage_door": [
        {
            "id": "mat_gd_springs",
            "name": "Torsion & Extension Springs",
            "subcategories": [
                "Torsion Springs (.207, .218, .225, .234, .243, .250 wire size)",
                "Spring Winding Cones & Stationary Cones",
                "1/8\" & 5/32\" 7x19 Galvanized Aircraft Cables",
                "Cast Aluminum Cable Drums (Standard 400-8)"
            ]
        },
        {
            "id": "mat_gd_hardware",
            "name": "Hardware & Rollers",
            "subcategories": [
                "2\" Heavy-Duty Sealed Nylon Rollers",
                "Galvanized Steel Hinges (14-Gauge)",
                "Top Roller Brackets & End Bearing Plates",
                "Bottom Corner Brackets with Safety Studs"
            ]
        },
        {
            "id": "mat_gd_weather",
            "name": "Seals & Lubricants",
            "subcategories": [
                "Universal T-End Rubber Bottom Seals",
                "Silicone & PTFE Garage Door Lubricant Spray",
                "Exterior PVC Jamb Trim with Co-Extruded Flap"
            ]
        }
    ],
    "handyman": [
        {
            "id": "mat_handy_fasteners",
            "name": "Fasteners & Hardware",
            "subcategories": [
                "Drywall Screws (1-1/4\", 1-5/8\", 2\")",
                "Heavy-Duty Toggle Bolts & Zip-It Wall Anchors",
                "Trim Head Screws & Finish Nails",
                "Wood Glue (Titebond II) & Construction Adhesive"
            ]
        },
        {
            "id": "mat_handy_patch",
            "name": "Drywall & Paint Supplies",
            "subcategories": [
                "Lightweight Spackle & Setting-Type Joint Compound (Easy Sand 20)",
                "Self-Adhesive Fiberglass Mesh Tape",
                "Aerosol Spray Texture Cans (Orange Peel / Knockdown)",
                "Painter’s Tape (Blue / Green) & Drop Cloths"
            ]
        }
    ],
    "painting": [
        {
            "id": "mat_paint_paints",
            "name": "Paints, Primers & Stains",
            "subcategories": [
                "Premium Interior Latex Paint (Flat, Matte, Eggshell, Satin)",
                "Interior Waterborne Alkyd Semi-Gloss Trim Enamel",
                "Exterior 100% Acrylic Latex House Paint",
                "Stain-Blocking Bonding Primer (PVA & Shellac-Based)",
                "Exterior Semi-Transparent & Solid Wood Stain"
            ]
        },
        {
            "id": "mat_paint_sundries",
            "name": "Sundries & Protection",
            "subcategories": [
                "Masking Tape (1.5\" Blue Painter's & Delicate Surface Yellow)",
                "Pre-Taped Masking Film & Kraft Paper",
                "Canvas Drop Cloths (9x12, 4x15 runner)",
                "Paint Roller Covers (Microfiber 3/8\", 1/2\", 3/4\" Nap)",
                "Siliconized Acrylic Caulk & Spackling Paste"
            ]
        }
    ],
    "flooring": [
        {
            "id": "mat_floor_adhesives",
            "name": "Mortars & Adhesives",
            "subcategories": [
                "Polymer-Modified Thinset Mortar",
                "Liquid Waterproofing Membrane (RedGard)",
                "Self-Leveling Underlayment Compound",
                "LVP Pressure-Sensitive Flooring Adhesive",
                "Urethane Wood Flooring Adhesive"
            ]
        },
        {
            "id": "mat_floor_trim",
            "name": "Transitions & Underlayment",
            "subcategories": [
                "Acoustic Foam / Cork Underlayment Roll",
                "T-Molding, Reducer & Threshold Transitions",
                "Tile Spacers (1/16\", 1/8\") & Leveling Clips/Wedges",
                "Schluter Jolly Edge Trim Metal Profiles"
            ]
        }
    ],
    "cleaning": [
        {
            "id": "mat_clean_chems",
            "name": "Cleaning Solutions & Supplies",
            "subcategories": [
                "Neutral Floor Cleaner & Hard Surface Disinfectant",
                "Non-Acid Restroom Cleaner & Lime Remover",
                "Carpet Pre-Spray Concentrate & Acid Rinse",
                "Color-Coded Microfiber Cloths (Blue, Yellow, Red, Green)",
                "Commercial Trash Liners (10 Gal, 33 Gal, 55 Gal)"
            ]
        }
    ],
    "pressure_washing": [
        {
            "id": "mat_pw_chems",
            "name": "Chemicals & Surfactants",
            "subcategories": [
                "Sodium Hypochlorite (Commercial Bleach 12.5%)",
                "High-Foaming Soft Wash Surfactant",
                "Heavy-Duty Concrete Degreaser (Caustic Base)",
                "Oxalic Acid Wood & Rust Stain Brightener",
                "Polymeric Paver Joint Locking Sand"
            ]
        }
    ],
    "window_cleaning": [
        {
            "id": "mat_win_supplies",
            "name": "Soaps & Replacement Rubbers",
            "subcategories": [
                "Professional Window Cleaning Soap (Glass Gleam / Dawn Professional)",
                "Soft & Hard Replacement Squeegee Rubber Channels",
                "DI Resin Beads for Pure Water Cartridges",
                "Ceramic Stovetop / Glass Hard Water Compound",
                "Lint-Free Huck Towels & Scrim Cloths"
            ]
        }
    ],
    "locksmith": [
        {
            "id": "mat_lock_blanks",
            "name": "Keys, Cylinders & Locks",
            "subcategories": [
                "Key Blanks (SC1, KW1, WR5, Y1, M1, etc.)",
                "Rim Cylinders & Mortise Cylinders",
                "Grade 1 & Grade 2 Commercial Deadbolts",
                "ANSI Strike Plates & Door Reinforcement Plates",
                "Graphite & PTFE Lock Cylinder Lubricant"
            ]
        }
    ],
    "glass_glazing": [
        {
            "id": "mat_glass_supplies",
            "name": "Glass & Glazing Supplies",
            "subcategories": [
                "Insulated Glass Units (Custom Dimensions)",
                "Neoprene Setting Blocks (Various Thicknesses)",
                "Glazing Tape (Double-Sided Foam)",
                "Structural Silicone Glazing Sealant",
                "Shower Door Polycarbonate Wipes & Magnetic Seals"
            ]
        }
    ],
    "restoration": [
        {
            "id": "mat_restor_chems",
            "name": "Remediation Chemicals & Film",
            "subcategories": [
                "EPA-Registered Hospital Grade Disinfectant (Benefect / Microban)",
                "Mold-Resistant Encapsulant Coating (Foster)",
                "6-Mil Polyethylene Plastic Sheeting",
                "Zipper Entry Doors for Containment (ZipWall)",
                "HEPA Vacuum Replacement Pre-Filters & Carbon Filters"
            ]
        }
    ],
    "fencing": [
        {
            "id": "mat_fence_lumber",
            "name": "Lumber & Posts",
            "subcategories": [
                "Pressure-Treated 4x4 & 4x6 Fence Posts",
                "Western Red Cedar / Pine Fence Pickets",
                "2x4 Pressure-Treated Backer Rails",
                "Quick-Setting Concrete Mix (50 lb / 60 lb bags)",
                "Galvanized Gate Hinges, Latches & Drop Rods"
            ]
        }
    ],
    "septic": [
        {
            "id": "mat_septic_parts",
            "name": "Risers, Filters & Enzymes",
            "subcategories": [
                "HDPE Septic Tank Risers & Tamper-Proof Lids",
                "Effluent Baffle Filter Cartridges (Polylok / Tuf-Tite)",
                "Rubber Fernco Boots & PVC Sanitary Tees",
                "Bacterial Enzymes & Septic Inoculant Treatments"
            ]
        }
    ],
    "chimney": [
        {
            "id": "mat_chim_supplies",
            "name": "Caps, Sealers & Mortar",
            "subcategories": [
                "Stainless Steel Universal Chimney Caps",
                "Silicone Flue Sealant & Refractory Mortar",
                "Elastomeric Chimney Crown Repair Sealant",
                "Siloxane Breathable Chimney Water Repellent"
            ]
        }
    ],
    "insulation": [
        {
            "id": "mat_insul_media",
            "name": "Insulation & Barriers",
            "subcategories": [
                "Blown-In Cellulose Bags (Boric Acid Treated)",
                "Blown-In Fiberglass Blowing Wool",
                "Fiberglass Batt Insulation (R-13, R-19, R-30, R-38)",
                "Cardboard / Foam Attic Rafter Baffles",
                "20-Mil Reinforced Crawlspace Vapor Barrier"
            ]
        }
    ],
    "concrete_masonry": [
        {
            "id": "mat_conc_supplies",
            "name": "Concrete, Mortar & Additives",
            "subcategories": [
                "Ready-Mix High-Strength Concrete (4000 PSI)",
                "Type S & Type N Masonry Mortar Bags",
                "Welded Wire Mesh & Steel Rebar (#3, #4, #5)",
                "Concrete Curing Compound & Penetrating Silane Sealer",
                "Expansion Joint Fiber Strips"
            ]
        }
    ],
    "general_contractor": [
        {
            "id": "mat_gc_lumber",
            "name": "Framing Lumber & Sheathing",
            "subcategories": [
                "Dimensional Kiln-Dried Lumber (2x4, 2x6, 2x8, 2x10, 2x12)",
                "Engineered LVL Beams & Glulam Beams",
                "OSB & Plywood Sheathing (7/16\", 1/2\", 3/4\" T&G)",
                "Structural Framing Screws & TimberLOK",
                "Joist Hangers & Hurricane Ties (Simpson Strong-Tie)"
            ]
        }
    ],
    "general": [
        {
            "id": "mat_gen_fasteners",
            "name": "Hardware & Fasteners",
            "subcategories": [
                "Wood Screws, Sheet Metal Screws & Drywall Screws",
                "Bolts, Nuts, Washers & Anchors",
                "Thread Lock & Anti-Seize Compound",
                "Mounting Brackets & Straps"
            ]
        },
        {
            "id": "mat_gen_sealants",
            "name": "Consumables, Adhesives & Sealants",
            "subcategories": [
                "100% Silicone Sealant & Acrylic Caulk",
                "Heavy-Duty Construction Adhesive",
                "Electrical Tape & PTFE Thread Tape",
                "Lubricants & Penetrating Oils"
            ]
        },
        {
            "id": "mat_gen_parts",
            "name": "Replacement Parts & Components",
            "subcategories": [
                "Fuses, Switches & Terminal Connectors",
                "Gaskets, O-Rings & Washers",
                "Flexible Supply Lines & Hoses",
                "Filters & Strainers"
            ]
        }
    ]
};

/**
 * Returns comprehensive default inventory & work categories tailored to a business specialty.
 * Automatically handles multi-trade businesses (e.g. "Plumbing & HVAC" or "Electrical and Security")
 * by detecting all matching trades and merging their categories and subcategories.
 */
export function getDefaultInventorySettings(tradeInput?: string): {
    workCategories: InventoryCategory[];
    toolCategories: InventoryCategory[];
    materialCategories: InventoryCategory[];
} {
    const tradeKeys = detectAllTradeKeys(tradeInput);

    const workLists: InventoryCategory[][] = [];
    const toolLists: InventoryCategory[][] = [];
    const materialLists: InventoryCategory[][] = [];

    for (const key of tradeKeys) {
        if (DEFAULT_WORK_CATEGORIES[key]) {
            workLists.push(DEFAULT_WORK_CATEGORIES[key]);
        }
        if (DEFAULT_TOOL_CATEGORIES[key]) {
            toolLists.push(DEFAULT_TOOL_CATEGORIES[key]);
        }
        if (DEFAULT_MATERIAL_CATEGORIES[key]) {
            materialLists.push(DEFAULT_MATERIAL_CATEGORIES[key]);
        }
    }

    // If nothing matched, use general
    if (workLists.length === 0) workLists.push(DEFAULT_WORK_CATEGORIES.general);
    if (toolLists.length === 0) toolLists.push(DEFAULT_TOOL_CATEGORIES.general);
    if (materialLists.length === 0) materialLists.push(DEFAULT_MATERIAL_CATEGORIES.general);

    return {
        workCategories: mergeCategoryLists(workLists),
        toolCategories: mergeCategoryLists(toolLists),
        materialCategories: mergeCategoryLists(materialLists)
    };
}
