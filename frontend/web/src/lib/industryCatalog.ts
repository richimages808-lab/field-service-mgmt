/**
 * industryCatalog.ts — Robust Industry, Specialty & Services Catalog Database
 * 
 * Provides:
 * 1. Multi-tier hierarchy: Level 1 (Sector / Trade) -> Level 2 (Specialty / Business Type) -> Level 3 (Trade Discipline / Category) -> Level 4 (Subsystem / Equipment Area) -> Level 5 (Service Scope of Work)
 * 2. Pre-populated robust catalog with 24+ industries and 100+ specialties with comprehensive hierarchical scopes.
 * 3. Dynamic expansion: When a customer enters a new custom business type, it automatically writes to Firestore
 *    so the catalog learns and expands across all users.
 * 4. Fast, fuzzy search matching across sectors, specialties, and custom types.
 */

import { collection, getDocs, addDoc, serverTimestamp, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';

export interface CatalogServiceItem {
    id: string;
    name: string;
    description: string;
    category: 'repair' | 'installation' | 'maintenance' | 'diagnostic' | 'emergency' | 'inspection' | 'replacement';
    unit_price: number;
    unit: 'flat_rate' | 'per_hour' | 'per_unit' | 'per_foot' | 'per_sqft' | 'diagnostic_fee';
    estimated_duration_minutes: number;
    tags: string[];
    is_standard?: boolean;
    active?: boolean;
    isFlatFee?: boolean;
    group?: string; // Subsystem or equipment group (e.g. 'Drain & Sewer', 'Water Heaters', 'Fixtures & Valves')
}

export interface IndustrySpecialty {
    id: string;
    name: string;
    description: string;
    keywords: string[];
    standardServices: CatalogServiceItem[];
    isCustom?: boolean;
    createdByOrgId?: string;
}

export interface IndustrySector {
    id: string;
    name: string;
    icon: string; // Lucide icon identifier
    description: string;
    specialties: IndustrySpecialty[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUILT-IN ROBUST CATALOG DATABASE WITH MULTI-TIER HIERARCHIES
// ═══════════════════════════════════════════════════════════════════════════════

export const BUILTIN_INDUSTRY_CATALOG: IndustrySector[] = [
    {
        "id": "plumbing",
        "name": "Plumbing & Pipe Fitting",
        "icon": "Wrench",
        "description": "Residential, commercial, and emergency water, drain, gas, and fixture systems",
        "specialties": [
            {
                "id": "plumbing_residential",
                "name": "Residential Plumbing & Drain Service",
                "description": "Full-service home plumbing repairs, fixtures, clogged drains, water heaters, and pipe leaks",
                "keywords": [
                    "drain",
                    "leak",
                    "faucet",
                    "toilet",
                    "pipe",
                    "clog",
                    "sink",
                    "shower",
                    "residential",
                    "plumbing",
                    "water heater",
                    "rooter"
                ],
                "standardServices": [
                    {
                        "id": "plumb_res_diag_std",
                        "name": "Comprehensive Plumbing Diagnostic & System Evaluation",
                        "description": "Multi-point inspection of water pressure, shutoff valves, exposed supply lines, fixture traps, and diagnostic quote preparation.",
                        "category": "diagnostic",
                        "group": "Diagnostics & Evaluation",
                        "unit_price": 89,
                        "unit": "diagnostic_fee",
                        "estimated_duration_minutes": 45,
                        "tags": [
                            "diagnostic",
                            "service call",
                            "pressure test",
                            "evaluation"
                        ]
                    },
                    {
                        "id": "plumb_res_diag_leak",
                        "name": "Electronic Leak Detection & Static Pressure Isolation",
                        "description": "Acoustic listening disc and pressure isolation to identify concealed hot/cold water supply pipe leaks in walls or concrete slabs.",
                        "category": "diagnostic",
                        "group": "Diagnostics & Evaluation",
                        "unit_price": 185,
                        "unit": "diagnostic_fee",
                        "estimated_duration_minutes": 60,
                        "tags": [
                            "leak detection",
                            "slab leak",
                            "acoustic",
                            "pressure test"
                        ]
                    },
                    {
                        "id": "plumb_res_diag_camera",
                        "name": "High-Definition Video Sewer Camera Inspection with Locator",
                        "description": "Color video camera push through sewer cleanout up to 100ft with digital recording, distance metering, and 512Hz sonde locating.",
                        "category": "diagnostic",
                        "group": "Diagnostics & Evaluation",
                        "unit_price": 245,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 60,
                        "tags": [
                            "camera inspection",
                            "sewer scope",
                            "sonde",
                            "cleanout"
                        ]
                    },
                    {
                        "id": "plumb_res_rep_drain_main",
                        "name": "Main Sewer Line Mechanical Auger Rooter Clearing (Up to 75ft)",
                        "description": "Heavy-duty cable auger with cutting head through exterior cleanout to clear tree roots, grease clogs, and restore main line flow.",
                        "category": "repair",
                        "group": "Drain & Sewer",
                        "unit_price": 189,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 60,
                        "tags": [
                            "drain snaking",
                            "rooter",
                            "main line",
                            "clog"
                        ]
                    },
                    {
                        "id": "plumb_res_rep_drain_secondary",
                        "name": "Single-Fixture Secondary Drain Snaking (Kitchen / Tub / Lavatory)",
                        "description": "Clear localized organic stoppage in sink trap, shower drain, or laundry standpipe using handheld power snake.",
                        "category": "repair",
                        "group": "Drain & Sewer",
                        "unit_price": 145,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 45,
                        "tags": [
                            "sink drain",
                            "tub clog",
                            "snake",
                            "trap"
                        ]
                    },
                    {
                        "id": "plumb_res_rep_hydro_jetting",
                        "name": "High-Pressure Hydro-Jetting Sewer Line Scouring & Degreasing",
                        "description": "3,000 PSI pulsating water jetting to clear heavy grease deposits, scale buildup, and severe root intrusions to like-new diameter.",
                        "category": "repair",
                        "group": "Drain & Sewer",
                        "unit_price": 495,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 90,
                        "tags": [
                            "hydro jetting",
                            "grease scouring",
                            "sewer jet",
                            "high pressure"
                        ]
                    },
                    {
                        "id": "plumb_res_rep_toilet_rebuild",
                        "name": "Toilet Tank Component Rebuild (Fill Valve, Flapper & Seal)",
                        "description": "Replace faulty fill valve, universal flapper, tank-to-bowl gasket, brass bolts, and stainless braided supply line.",
                        "category": "repair",
                        "group": "Fixtures & Valves",
                        "unit_price": 145,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 45,
                        "tags": [
                            "toilet rebuild",
                            "fill valve",
                            "flapper",
                            "running toilet"
                        ]
                    },
                    {
                        "id": "plumb_res_rep_faucet_cartridge",
                        "name": "Kitchen / Bathroom Faucet Cartridge Rebuild & Stem Seal Service",
                        "description": "Disassemble leaking single-handle or two-handle faucet, replace ceramic disc cartridge, springs, and O-ring seats.",
                        "category": "repair",
                        "group": "Fixtures & Valves",
                        "unit_price": 135,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 45,
                        "tags": [
                            "faucet repair",
                            "cartridge",
                            "dripping faucet",
                            "o-ring"
                        ]
                    },
                    {
                        "id": "plumb_res_rep_tub_shower_valve",
                        "name": "Tub & Shower Pressure-Balancing Mixing Valve Repair",
                        "description": "Isolate water supply, remove trim plate, extract mineral-seized mixing cartridge (Moen/Delta/Kohler), and test scald guard.",
                        "category": "repair",
                        "group": "Fixtures & Valves",
                        "unit_price": 175,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 60,
                        "tags": [
                            "shower valve",
                            "mixing valve",
                            "cartridge",
                            "scald guard"
                        ]
                    },
                    {
                        "id": "plumb_res_rep_pipe_pinhole",
                        "name": "Exposed Copper / PEX Pipe Pin-Hole Leak Splice & Repair",
                        "description": "Cut out damaged 1/2\" or 3/4\" water pipe section and solder or crimp new Type L copper or PEX tubing with dual couplings.",
                        "category": "repair",
                        "group": "Piping & Water Lines",
                        "unit_price": 245,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 60,
                        "tags": [
                            "pipe leak",
                            "copper splice",
                            "pex",
                            "pinhole leak"
                        ]
                    },
                    {
                        "id": "plumb_res_rep_prv_valve",
                        "name": "Main Pressure Reducing Valve (PRV) Rebuild & Calibration",
                        "description": "Service or replace failed brass PRV regulator, calibrate household dynamic pressure to 55-65 PSI, and test gauge.",
                        "category": "repair",
                        "group": "Piping & Water Lines",
                        "unit_price": 285,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 60,
                        "tags": [
                            "prv",
                            "water pressure",
                            "regulator",
                            "high pressure"
                        ]
                    },
                    {
                        "id": "plumb_res_rep_hose_bibb",
                        "name": "Frost-Free Exterior Hose Bibb / Spigot Replacement",
                        "description": "Remove frozen or leaking anti-siphon outdoor sillcock valve, install new brass frost-proof valve with vacuum breaker.",
                        "category": "repair",
                        "group": "Piping & Water Lines",
                        "unit_price": 165,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 45,
                        "tags": [
                            "hose bibb",
                            "spigot",
                            "outdoor faucet",
                            "frost free"
                        ]
                    },
                    {
                        "id": "plumb_res_rep_wh_element",
                        "name": "Water Heater Heating Element & Thermostat Replacement",
                        "description": "Drain partial tank, test continuity with multimeter, replace burned upper/lower 4500W element and high-limit thermostat.",
                        "category": "repair",
                        "group": "Water Heaters",
                        "unit_price": 225,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 60,
                        "tags": [
                            "water heater element",
                            "thermostat",
                            "no hot water",
                            "electric heater"
                        ]
                    },
                    {
                        "id": "plumb_res_rep_wh_tp_valve",
                        "name": "Water Heater Temperature & Pressure (T&P) Relief Valve Replacement",
                        "description": "Safely replace leaking or corroded 150 PSI / 210°F ASME safety relief valve and connect copper discharge tube.",
                        "category": "repair",
                        "group": "Water Heaters",
                        "unit_price": 185,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 45,
                        "tags": [
                            "t&p valve",
                            "relief valve",
                            "water heater leak"
                        ]
                    },
                    {
                        "id": "plumb_res_inst_toilet_std",
                        "name": "New High-Efficiency Toilet Supply & Complete Installation",
                        "description": "Disposal of old commode, install reinforced wax ring with horn, closet bolts, connect supply line, and caulk base.",
                        "category": "installation",
                        "group": "Fixtures & Valves",
                        "unit_price": 385,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 90,
                        "tags": [
                            "toilet install",
                            "high efficiency",
                            "wax ring",
                            "commode"
                        ]
                    },
                    {
                        "id": "plumb_res_inst_faucet",
                        "name": "Kitchen / Lavatory Designer Faucet Supply & Installation",
                        "description": "Mount customer or contractor-supplied single-handle pull-down faucet, connect flexible stainless risers, and test spray head.",
                        "category": "installation",
                        "group": "Fixtures & Valves",
                        "unit_price": 195,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 60,
                        "tags": [
                            "faucet installation",
                            "kitchen faucet",
                            "sink faucet"
                        ]
                    },
                    {
                        "id": "plumb_res_inst_tankless",
                        "name": "Whole-Home Tankless Gas Water Heater Conversion & Venting",
                        "description": "Supply & install 199K BTU condensing tankless unit, stainless concentric venting, gas line upgrade verification, and relief kit.",
                        "category": "installation",
                        "group": "Water Heaters",
                        "unit_price": 3450,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 300,
                        "tags": [
                            "tankless",
                            "water heater installation",
                            "gas",
                            "rinnai",
                            "navien"
                        ]
                    },
                    {
                        "id": "plumb_res_inst_softener",
                        "name": "Whole-Home Water Softener & Conditioning System Loop Installation",
                        "description": "Connect high-capacity ion-exchange resin softener to main water entry, bypass valve loop, drain line, and brine tank setup.",
                        "category": "installation",
                        "group": "Water Treatment",
                        "unit_price": 1250,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 180,
                        "tags": [
                            "water softener",
                            "hard water",
                            "filtration",
                            "conditioner"
                        ]
                    },
                    {
                        "id": "plumb_res_inst_ro",
                        "name": "Under-Sink Multi-Stage Reverse Osmosis (RO) Drinking Water System",
                        "description": "Install 4-stage RO filter module, 3.2-gal pressurized storage tank, dedicated designer air-gap faucet, and drain saddle.",
                        "category": "installation",
                        "group": "Water Treatment",
                        "unit_price": 345,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 90,
                        "tags": [
                            "reverse osmosis",
                            "ro system",
                            "drinking water",
                            "filter"
                        ]
                    },
                    {
                        "id": "plumb_res_repl_disposal",
                        "name": "Continuous Feed Garbage Disposal Replacement (1/2 HP Badger 5)",
                        "description": "Unmount degraded disposal, install Quick-Lock mounting assembly, anti-vibration drain elbow, dishwasher knockout, and wiring.",
                        "category": "replacement",
                        "group": "Fixtures & Valves",
                        "unit_price": 295,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 60,
                        "tags": [
                            "garbage disposal",
                            "badger 5",
                            "insinkerator",
                            "sink disposal"
                        ]
                    },
                    {
                        "id": "plumb_res_repl_water_heater_50",
                        "name": "Standard 50-Gallon Electric Water Heater Replacement & Expansion Tank",
                        "description": "Drain & decommission old unit, install code-compliant 50-gallon tank, thermal expansion vessel, vacuum relief, and brass drain.",
                        "category": "replacement",
                        "group": "Water Heaters",
                        "unit_price": 1650,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 180,
                        "tags": [
                            "water heater replacement",
                            "50 gallon",
                            "expansion tank"
                        ]
                    },
                    {
                        "id": "plumb_res_repl_sump_pump",
                        "name": "Submersible Sump Pump & Silent Inline Check Valve Replacement",
                        "description": "Extract failed basin pump, install 1/2 HP cast iron submersible pump with vertical float switch and silent spring check valve.",
                        "category": "replacement",
                        "group": "Drain & Sewer",
                        "unit_price": 495,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 90,
                        "tags": [
                            "sump pump",
                            "check valve",
                            "basement flooding",
                            "pit"
                        ]
                    },
                    {
                        "id": "plumb_res_maint_wh_flush",
                        "name": "Annual Water Heater Tank Flush, Sediment Purge & Anode Audit",
                        "description": "Full high-velocity tank flush to remove calcium scale deposits, test safety relief valve, and inspect sacrificial magnesium anode.",
                        "category": "maintenance",
                        "group": "Water Heaters",
                        "unit_price": 139,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 45,
                        "tags": [
                            "water heater flush",
                            "sediment purge",
                            "anode rod",
                            "maintenance"
                        ]
                    },
                    {
                        "id": "plumb_res_maint_tankless_descale",
                        "name": "Tankless Water Heater Chemical Circulation Descale & Flush",
                        "description": "Circulate virgin food-grade citric descaling solution through heat exchanger for 60 minutes with submersible pump to restore efficiency.",
                        "category": "maintenance",
                        "group": "Water Heaters",
                        "unit_price": 229,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 75,
                        "tags": [
                            "tankless flush",
                            "descale",
                            "heat exchanger",
                            "maintenance"
                        ]
                    },
                    {
                        "id": "plumb_res_maint_drain_bio",
                        "name": "Preventive Biological Drain Maintenance & Flow Optimization",
                        "description": "Enzymatic grease-digesting bio-treatment application across all kitchen and lavatory branches to inhibit future buildup.",
                        "category": "maintenance",
                        "group": "Drain & Sewer",
                        "unit_price": 119,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 45,
                        "tags": [
                            "bio clean",
                            "preventive drain",
                            "enzyme treatment"
                        ]
                    },
                    {
                        "id": "plumb_res_insp_safety_audit",
                        "name": "Whole-Home Plumbing Health, Pressure & Fixture Safety Audit",
                        "description": "Complete audit of static water pressure, water heater safety valves, visible piping integrity, emergency shutoffs, and crawlspace.",
                        "category": "inspection",
                        "group": "Diagnostics & Evaluation",
                        "unit_price": 125,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 45,
                        "tags": [
                            "plumbing inspection",
                            "safety audit",
                            "pressure check"
                        ]
                    },
                    {
                        "id": "plumb_res_insp_backflow",
                        "name": "Certified Backflow Prevention Assembly Testing & Municipal Filing",
                        "description": "Calibrated 5-valve differential pressure test of RPZ or double-check assembly with official local utility compliance filing.",
                        "category": "inspection",
                        "group": "Piping & Water Lines",
                        "unit_price": 175,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 45,
                        "tags": [
                            "backflow test",
                            "rpz",
                            "certification",
                            "inspection"
                        ]
                    },
                    {
                        "id": "plumb_res_emg_burst_shutoff",
                        "name": "24/7 Urgent Water Main Burst Shutoff & Site Stabilization Dispatch",
                        "description": "Immediate emergency dispatch to locate curb stop, shut off catastrophic flooding, isolate ruptured pipe, and stabilize home.",
                        "category": "emergency",
                        "group": "Emergency & Urgent",
                        "unit_price": 225,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 45,
                        "tags": [
                            "emergency shutoff",
                            "burst pipe",
                            "flooding",
                            "after hours"
                        ]
                    },
                    {
                        "id": "plumb_res_emg_sewer_backup",
                        "name": "Emergency After-Hours Main Sewer Backup Clearing",
                        "description": "Priority evening/weekend response to cable clear blocked building sewer line discharging waste into home fixtures.",
                        "category": "emergency",
                        "group": "Emergency & Urgent",
                        "unit_price": 285,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 75,
                        "tags": [
                            "emergency sewer",
                            "backup",
                            "after hours",
                            "urgent rooter"
                        ]
                    }
                ]
            },
            {
                "id": "plumbing_commercial",
                "name": "Commercial & Industrial Plumbing",
                "description": "Commercial facilities, restaurant grease traps, backflow prevention, and multi-tenant plumbing systems",
                "keywords": [
                    "commercial",
                    "grease trap",
                    "backflow",
                    "urinal",
                    "flushometer",
                    "restaurant",
                    "industrial"
                ],
                "standardServices": [
                    {
                        "id": "comm_backflow_cert",
                        "name": "Annual Commercial Backflow Preventer Testing & Municipal Certification",
                        "description": "Certified differential pressure gauge testing of RPZ or double-check backflow preventer with municipal report filing.",
                        "category": "inspection",
                        "group": "Code & Compliance",
                        "unit_price": 195,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 45,
                        "tags": [
                            "backflow",
                            "testing",
                            "certification",
                            "rpz"
                        ]
                    },
                    {
                        "id": "comm_flushometer_rebuild",
                        "name": "Commercial Flushometer Valve Rebuild (Sloan / Zurn)",
                        "description": "Disassembly and rebuild of commercial toilet or urinal flush valve diaphragm, vacuum breaker, and handle assembly.",
                        "category": "repair",
                        "group": "Commercial Fixtures",
                        "unit_price": 220,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 45,
                        "tags": [
                            "sloan",
                            "zurn",
                            "flushometer",
                            "commercial urinal"
                        ]
                    },
                    {
                        "id": "comm_grease_trap_jet",
                        "name": "Commercial Kitchen Grease Waste Line Hydro-Jetting",
                        "description": "High-pressure hot water scouring of grease trap inlet/outlet lines to liquefy congealed FOG blockages.",
                        "category": "maintenance",
                        "group": "Commercial Grease & Waste",
                        "unit_price": 450,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 90,
                        "tags": [
                            "grease trap",
                            "restaurant",
                            "hydro jetting",
                            "fog"
                        ]
                    },
                    {
                        "id": "comm_sewer_camera",
                        "name": "Color Video Commercial Sewer Main Scoping with Digital Report",
                        "description": "Push-camera inspection of commercial sewer main with digital recording, distance readout, and radio sonde locating.",
                        "category": "diagnostic",
                        "group": "Diagnostics & Evaluation",
                        "unit_price": 295,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 60,
                        "tags": [
                            "camera",
                            "sewer inspection",
                            "locator",
                            "commercial"
                        ]
                    }
                ]
            }
        ]
    },
    {
        "id": "hvac",
        "name": "HVAC & Climate Control",
        "icon": "Thermometer",
        "description": "Heating, ventilation, air conditioning, heat pumps, ductwork, and refrigeration systems",
        "specialties": [
            {
                "id": "hvac_residential",
                "name": "Residential AC & Heating Service",
                "description": "Home cooling and heating tune-ups, refrigerant diagnostics, thermostat upgrades, compressor repairs, and furnace service",
                "keywords": [
                    "ac",
                    "air conditioning",
                    "heating",
                    "furnace",
                    "heat pump",
                    "freon",
                    "thermostat",
                    "compressor",
                    "cooling",
                    "hvac"
                ],
                "standardServices": [
                    {
                        "id": "hvac_res_diag_system",
                        "name": "Comprehensive 21-Point HVAC System & Diagnostic Evaluation",
                        "description": "Diagnostic assessment of cooling/heating cycles, electrical amp draws, subcooling, superheat, and thermostat control board.",
                        "category": "diagnostic",
                        "group": "Diagnostics & Evaluation",
                        "unit_price": 99,
                        "unit": "diagnostic_fee",
                        "estimated_duration_minutes": 60,
                        "tags": [
                            "diagnostic",
                            "service call",
                            "hvac evaluation",
                            "amp draw"
                        ]
                    },
                    {
                        "id": "hvac_res_diag_refrigerant",
                        "name": "Refrigerant Electronic Leak Sniffer & Subcooling Diagnostic",
                        "description": "Heated diode electronic leak sniffing across evaporator coil, service valves, and line set joints to pinpoint micro-leaks.",
                        "category": "diagnostic",
                        "group": "Diagnostics & Evaluation",
                        "unit_price": 149,
                        "unit": "diagnostic_fee",
                        "estimated_duration_minutes": 60,
                        "tags": [
                            "freon leak",
                            "refrigerant diagnostic",
                            "sniffer",
                            "subcooling"
                        ]
                    },
                    {
                        "id": "hvac_res_diag_heat_exchanger",
                        "name": "Furnace Heat Exchanger Infrared Inspection & Carbon Monoxide Test",
                        "description": "Borescope camera visual check of heat exchanger cells for hairline stress fractures and ambient flue CO sensor audit.",
                        "category": "diagnostic",
                        "group": "Diagnostics & Evaluation",
                        "unit_price": 125,
                        "unit": "diagnostic_fee",
                        "estimated_duration_minutes": 45,
                        "tags": [
                            "heat exchanger",
                            "carbon monoxide",
                            "furnace inspection"
                        ]
                    },
                    {
                        "id": "hvac_res_rep_capacitor",
                        "name": "Dual-Run Compressor & Condenser Fan Capacitor Replacement",
                        "description": "Discharge and replace out-of-tolerance dual run capacitor with OEM spec heavy-duty 440V run capacitor.",
                        "category": "repair",
                        "group": "Air Conditioning & Cooling",
                        "unit_price": 195,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 30,
                        "tags": [
                            "capacitor",
                            "ac repair",
                            "fan motor",
                            "compressor"
                        ]
                    },
                    {
                        "id": "hvac_res_rep_contactor",
                        "name": "Outdoor AC Condenser Contactor Relay Switch Replacement",
                        "description": "Replace pitted or insect-fouled single/double pole contactor to restore clean electrical power delivery to compressor.",
                        "category": "repair",
                        "group": "Air Conditioning & Cooling",
                        "unit_price": 175,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 45,
                        "tags": [
                            "contactor",
                            "relay",
                            "electrical",
                            "condenser"
                        ]
                    },
                    {
                        "id": "hvac_res_rep_recharge",
                        "name": "R-410A / R-32 Refrigerant Leak Repair & Custom Top-Off (Up to 2 lbs)",
                        "description": "Vacuum test, repair Schrader core, and recharge up to 2 lbs of virgin refrigerant strictly to target subcooling specs.",
                        "category": "repair",
                        "group": "Air Conditioning & Cooling",
                        "unit_price": 285,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 75,
                        "tags": [
                            "refrigerant recharge",
                            "r410a",
                            "freon top off",
                            "cooling"
                        ]
                    },
                    {
                        "id": "hvac_res_rep_fan_motor",
                        "name": "Condenser Fan Motor Assembly Replacement",
                        "description": "Extract seized or overheated outdoor fan motor, install OEM multi-horsepower replacement motor, and balance fan blade.",
                        "category": "repair",
                        "group": "Air Conditioning & Cooling",
                        "unit_price": 425,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 90,
                        "tags": [
                            "fan motor",
                            "condenser fan",
                            "blade",
                            "overheating"
                        ]
                    },
                    {
                        "id": "hvac_res_rep_condensate_clear",
                        "name": "AC Condensate Drain Line Clearing & Overflow Float Switch Install",
                        "description": "Nitrogen blowout of clogged condensate P-trap, algae flush, and install magnetic safety float switch to stop ceiling floods.",
                        "category": "repair",
                        "group": "Air Conditioning & Cooling",
                        "unit_price": 165,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 45,
                        "tags": [
                            "condensate drain",
                            "clogged ac drain",
                            "float switch",
                            "p-trap"
                        ]
                    },
                    {
                        "id": "hvac_res_rep_ignitor",
                        "name": "Gas Furnace Hot Surface Ignitor & Flame Sensor Replacement",
                        "description": "Replace cracked silicon nitride ignitor, clean/polish flame rectifier rod, and verify microamp flame signal current.",
                        "category": "repair",
                        "group": "Heating & Furnaces",
                        "unit_price": 195,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 45,
                        "tags": [
                            "furnace ignitor",
                            "flame sensor",
                            "no heat",
                            "furnace repair"
                        ]
                    },
                    {
                        "id": "hvac_res_rep_blower_motor",
                        "name": "Indoor Air Handler / Furnace Blower Motor Replacement",
                        "description": "Extract blower cage, replace ECM or PSC multi-speed blower motor, run capacitor, and balance blower squirrel cage.",
                        "category": "repair",
                        "group": "Heating & Furnaces",
                        "unit_price": 450,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 90,
                        "tags": [
                            "blower motor",
                            "air handler",
                            "indoor fan",
                            "airflow"
                        ]
                    },
                    {
                        "id": "hvac_res_rep_control_board",
                        "name": "Furnace / Heat Pump Integrated Circuit Board (PCB) Replacement",
                        "description": "Diagnose burned control board relays, replace with OEM programmed logic board, and recalibrate low-voltage transformer.",
                        "category": "repair",
                        "group": "Heating & Furnaces",
                        "unit_price": 485,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 90,
                        "tags": [
                            "control board",
                            "pcb",
                            "hvac electrical",
                            "transformer"
                        ]
                    },
                    {
                        "id": "hvac_res_inst_thermostat",
                        "name": "Smart Wi-Fi Thermostat Installation (Ecobee / Nest / Honeywell)",
                        "description": "Mount thermostat sub-base, verify or adapt 24V common (C-wire) terminal, connect home Wi-Fi, and configure scheduling.",
                        "category": "installation",
                        "group": "Thermostats & Controls",
                        "unit_price": 165,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 45,
                        "tags": [
                            "thermostat",
                            "nest",
                            "ecobee",
                            "smart home",
                            "c-wire"
                        ]
                    },
                    {
                        "id": "hvac_res_inst_minisplit_single",
                        "name": "Ductless Single-Zone Mini-Split Heat Pump Installation (12K BTU)",
                        "description": "Mount outdoor inverter condenser, indoor wall head, flare refrigerant lines, pull 500-micron vacuum, and test.",
                        "category": "installation",
                        "group": "Air Conditioning & Cooling",
                        "unit_price": 2950,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 300,
                        "tags": [
                            "mini split",
                            "ductless",
                            "heat pump",
                            "inverter"
                        ]
                    },
                    {
                        "id": "hvac_res_inst_uv_purifier",
                        "name": "Whole-Home Germicidal UV-C In-Duct Air Purifier Installation",
                        "description": "Mount high-intensity UV lamp inside supply air plenum to sterilize airborne viruses, mold spores, and bacteria.",
                        "category": "installation",
                        "group": "Indoor Air Quality",
                        "unit_price": 550,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 90,
                        "tags": [
                            "uv air purifier",
                            "air quality",
                            "in-duct",
                            "mold sterilization"
                        ]
                    },
                    {
                        "id": "hvac_res_repl_evap_coil",
                        "name": "Cased Evaporator Coil Replacement & Thermal Expansion Valve (TXV)",
                        "description": "Recover refrigerant, extract rusted indoor coil, braze new aluminum coil, install TXV metering device, and nitrogen test.",
                        "category": "replacement",
                        "group": "Air Conditioning & Cooling",
                        "unit_price": 1850,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 240,
                        "tags": [
                            "evaporator coil",
                            "txv",
                            "cased coil",
                            "leak replacement"
                        ]
                    },
                    {
                        "id": "hvac_res_repl_condensate_pump",
                        "name": "Automatic Condensate Removal Pump Replacement",
                        "description": "Install heavy-duty 1/30 HP automatic reservoir pump with internal check valve, safety cutoff switch, and vinyl tubing.",
                        "category": "replacement",
                        "group": "Air Conditioning & Cooling",
                        "unit_price": 225,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 45,
                        "tags": [
                            "condensate pump",
                            "drain pump",
                            "overflow protection"
                        ]
                    },
                    {
                        "id": "hvac_res_maint_spring_tuneup",
                        "name": "Spring AC Seasonal Precision Tune-Up & Chemical Coil Wash",
                        "description": "Clean outdoor condenser fins with biodegradable coil wash, clear drain line, verify refrigerant pressures, and check amps.",
                        "category": "maintenance",
                        "group": "Air Conditioning & Cooling",
                        "unit_price": 129,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 60,
                        "tags": [
                            "ac tune up",
                            "coil cleaning",
                            "summer maintenance",
                            "hvac tuneup"
                        ]
                    },
                    {
                        "id": "hvac_res_maint_fall_tuneup",
                        "name": "Fall Heating Safety Inspection, Burner Clean & Filter Replacement",
                        "description": "Clean gas burner ports, adjust primary air shutter, lubricate motor bearings, inspect draft hood, and replace media filter.",
                        "category": "maintenance",
                        "group": "Heating & Furnaces",
                        "unit_price": 129,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 60,
                        "tags": [
                            "furnace tune up",
                            "heating maintenance",
                            "filter replacement"
                        ]
                    },
                    {
                        "id": "hvac_res_insp_ductwork",
                        "name": "Ductwork Static Airflow Pressure Audit & Leakage Inspection",
                        "description": "Measure total external static pressure (TESP) with digital manometer and identify collapsed flex duct runs or torn joints.",
                        "category": "inspection",
                        "group": "Diagnostics & Evaluation",
                        "unit_price": 165,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 60,
                        "tags": [
                            "ductwork audit",
                            "airflow",
                            "static pressure",
                            "manometer"
                        ]
                    },
                    {
                        "id": "hvac_res_emg_priority",
                        "name": "Emergency After-Hours No-Cool / No-Heat Priority Dispatch",
                        "description": "Urgent emergency response during extreme weather temperature alerts to diagnose and restore residential climate control.",
                        "category": "emergency",
                        "group": "Emergency & Urgent",
                        "unit_price": 195,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 60,
                        "tags": [
                            "emergency hvac",
                            "no heat",
                            "no ac",
                            "after hours priority"
                        ]
                    }
                ]
            }
        ]
    },
    {
        "id": "electrical",
        "name": "Electrical & Power Systems",
        "icon": "Zap",
        "description": "Residential & commercial wiring, service panels, EV charging, generators, and lighting",
        "specialties": [
            {
                "id": "electrical_residential",
                "name": "Residential Electrical Service & Troubleshooting",
                "description": "Breakers, GFCI outlets, light fixtures, ceiling fans, switches, EV charging, and whole-house safety inspections",
                "keywords": [
                    "electric",
                    "breaker",
                    "gfci",
                    "outlet",
                    "lighting",
                    "panel",
                    "ceiling fan",
                    "wiring",
                    "surge",
                    "ev charger"
                ],
                "standardServices": [
                    {
                        "id": "elec_res_diag_trace",
                        "name": "Electrical Troubleshooting & Circuit Fault Tracing (First Hour)",
                        "description": "Multimeter continuity and voltage drop diagnostics to locate open neutrals, tripping arc faults, and shorted conductors.",
                        "category": "diagnostic",
                        "group": "Diagnostics & Evaluation",
                        "unit_price": 135,
                        "unit": "per_hour",
                        "estimated_duration_minutes": 60,
                        "tags": [
                            "electrical diagnostic",
                            "circuit tracing",
                            "short circuit",
                            "tripped breaker"
                        ]
                    },
                    {
                        "id": "elec_res_diag_safety_audit",
                        "name": "Whole-Home Electrical Code & Safety Compliance Audit",
                        "description": "Detailed audit of main breaker lugs, grounding rod bond, panel ampacity, AFCI/GFCI protection, and ungrounded outlets.",
                        "category": "diagnostic",
                        "group": "Diagnostics & Evaluation",
                        "unit_price": 175,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 60,
                        "tags": [
                            "electrical inspection",
                            "code audit",
                            "grounding",
                            "safety"
                        ]
                    },
                    {
                        "id": "elec_res_rep_gfci",
                        "name": "GFCI Safety Receptacle Replacement & Kitchen/Bath Grounding",
                        "description": "Install self-testing tamper-resistant 15A/20A GFCI receptacle with downstream load protection and test trip thresholds.",
                        "category": "repair",
                        "group": "Outlets, Switches & Receptacles",
                        "unit_price": 145,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 30,
                        "tags": [
                            "gfci outlet",
                            "safety outlet",
                            "ground fault",
                            "kitchen outlet"
                        ]
                    },
                    {
                        "id": "elec_res_rep_switch_outlet",
                        "name": "Standard 15A/20A Duplex Outlet or Decora Switch Replacement",
                        "description": "Replace worn, loose, or heat-discolored receptacle or single-pole switch with commercial-grade tamper-resistant device.",
                        "category": "repair",
                        "group": "Outlets, Switches & Receptacles",
                        "unit_price": 95,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 30,
                        "tags": [
                            "outlet repair",
                            "light switch",
                            "decora",
                            "receptacle"
                        ]
                    },
                    {
                        "id": "elec_res_rep_breaker",
                        "name": "Single-Pole or Double-Pole Circuit Breaker Replacement",
                        "description": "Isolate panel, extract weak or scorched circuit breaker, inspect busbar finger, and install new UL-listed breaker.",
                        "category": "repair",
                        "group": "Service Panels & Breakers",
                        "unit_price": 165,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 45,
                        "tags": [
                            "circuit breaker",
                            "breaker replacement",
                            "tripping breaker",
                            "panel"
                        ]
                    },
                    {
                        "id": "elec_res_inst_ceiling_fan",
                        "name": "Ceiling Fan Assembly, Fan-Rated Box & Installation (Up to 12ft)",
                        "description": "Install UL fan-rated ceiling support bracket, balance blades, wire fan/light dual switches, and sync remote receiver.",
                        "category": "installation",
                        "group": "Lighting & Fans",
                        "unit_price": 215,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 90,
                        "tags": [
                            "ceiling fan",
                            "fan installation",
                            "fan bracket",
                            "lighting"
                        ]
                    },
                    {
                        "id": "elec_res_inst_ev_charger",
                        "name": "Level 2 Electric Vehicle (EV) Home Charger 50A Dedicated Circuit",
                        "description": "Run 50A / 240V copper Romex/conduit, install 2-pole breaker, NEMA 14-50 receptacle or hardwire EVSE wall charger.",
                        "category": "installation",
                        "group": "EV Charging & High Power",
                        "unit_price": 850,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 180,
                        "tags": [
                            "ev charger",
                            "tesla charger",
                            "level 2",
                            "240v circuit"
                        ]
                    },
                    {
                        "id": "elec_res_inst_surge",
                        "name": "Whole-Home Type 2 Surge Protection Device (SPD) Installation",
                        "description": "Mount panel-connected 50kA-100kA dual-pole SPD to safeguard HVAC, smart electronics, and appliances against lightning spikes.",
                        "category": "installation",
                        "group": "Service Panels & Breakers",
                        "unit_price": 345,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 60,
                        "tags": [
                            "surge protector",
                            "whole home surge",
                            "spd",
                            "panel protection"
                        ]
                    },
                    {
                        "id": "elec_res_inst_canless_led",
                        "name": "Recessed Ultra-Thin Canless LED Downlight Installation (Per Fixture)",
                        "description": "Cut ceiling aperture, wire junction driver box, and snap spring-loaded wafer light with 5-CCT selectable color warmth.",
                        "category": "installation",
                        "group": "Lighting & Fans",
                        "unit_price": 95,
                        "unit": "per_unit",
                        "estimated_duration_minutes": 45,
                        "tags": [
                            "recessed lighting",
                            "canless led",
                            "pot lights",
                            "downlight"
                        ]
                    },
                    {
                        "id": "elec_res_repl_panel_200a",
                        "name": "200-Amp Main Electrical Service Panel Upgrade",
                        "description": "Replace outdated or hazardous fuse box with modern 200A 40-circuit panel, main disconnect, ground rods, and permit.",
                        "category": "replacement",
                        "group": "Service Panels & Breakers",
                        "unit_price": 3200,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 480,
                        "tags": [
                            "panel upgrade",
                            "200 amp panel",
                            "service upgrade",
                            "breaker box"
                        ]
                    },
                    {
                        "id": "elec_res_repl_smoke_co",
                        "name": "Hardwired Interconnected Smoke & CO Alarm Replacement (Per Unit)",
                        "description": "Install 10-year sealed lithium backup dual-sensor smoke and carbon monoxide detector wired to interconnect loop.",
                        "category": "replacement",
                        "group": "Safety & Detectors",
                        "unit_price": 75,
                        "unit": "per_unit",
                        "estimated_duration_minutes": 30,
                        "tags": [
                            "smoke detector",
                            "carbon monoxide",
                            "hardwired alarm",
                            "safety"
                        ]
                    },
                    {
                        "id": "elec_res_maint_thermal",
                        "name": "Main Panel Infrared Thermal Scan & Terminal Torque Audit",
                        "description": "Thermal imaging camera scan of all main breaker connections to identify resistance hot spots and torque to NEC spec.",
                        "category": "maintenance",
                        "group": "Service Panels & Breakers",
                        "unit_price": 145,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 45,
                        "tags": [
                            "thermal scan",
                            "panel maintenance",
                            "torque audit",
                            "infrared"
                        ]
                    },
                    {
                        "id": "elec_res_emg_sparking",
                        "name": "Emergency After-Hours Power Outage & Sparking Wire Dispatch",
                        "description": "Immediate technician dispatch to isolate hazardous sparking conductors, shorted main breakers, or burning odor.",
                        "category": "emergency",
                        "group": "Emergency & Urgent",
                        "unit_price": 225,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 60,
                        "tags": [
                            "emergency electrical",
                            "sparking wire",
                            "power outage",
                            "after hours"
                        ]
                    }
                ]
            }
        ]
    },
    {
        "id": "roofing",
        "name": "Roofing & Gutters",
        "icon": "Home",
        "description": "Shingle, tile, metal, and flat roof repairs, replacement, gutter guards, and leak remediation",
        "specialties": [
            {
                "id": "roofing_residential",
                "name": "Residential Roofing & Leak Repair",
                "description": "Asphalt architectural shingles, emergency tarping, flashing repair, pipe boot replacement, and gutter systems",
                "keywords": [
                    "roof",
                    "shingle",
                    "leak",
                    "flashing",
                    "tarp",
                    "pipe boot",
                    "gutter",
                    "vent",
                    "roofing"
                ],
                "standardServices": [
                    {
                        "id": "roof_diag_inspection",
                        "name": "Drone & Ladder Comprehensive Roof Inspection & Storm Damage Report",
                        "description": "High-resolution photo documentation of shingle condition, hail strikes, granular loss, flashing integrity, and life expectancy.",
                        "category": "diagnostic",
                        "group": "Diagnostics & Evaluation",
                        "unit_price": 149,
                        "unit": "diagnostic_fee",
                        "estimated_duration_minutes": 60,
                        "tags": [
                            "roof inspection",
                            "drone inspection",
                            "storm damage",
                            "insurance report"
                        ]
                    },
                    {
                        "id": "roof_rep_pipe_boot",
                        "name": "Neoprene Plumbing Vent Pipe Boot Flashing Replacement",
                        "description": "Remove degraded rubber collar and install heavy-duty aluminum/silicone flashing boot woven into surrounding shingles.",
                        "category": "repair",
                        "group": "Flashing & Penetrations",
                        "unit_price": 245,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 60,
                        "tags": [
                            "pipe boot",
                            "flashing",
                            "leak repair",
                            "roof penetration"
                        ]
                    },
                    {
                        "id": "roof_rep_shingle_patch",
                        "name": "Wind-Damaged Architectural Shingle Repair & Reseal (Up to 1 Bundle)",
                        "description": "Remove torn shingles, install ice-and-water barrier underlayment, nail matching architectural shingles, and seal with asphalt mastic.",
                        "category": "repair",
                        "group": "Shingle & Surface Repairs",
                        "unit_price": 325,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 90,
                        "tags": [
                            "shingle repair",
                            "wind damage",
                            "missing shingles",
                            "roof patch"
                        ]
                    },
                    {
                        "id": "roof_maint_gutter_clean",
                        "name": "Seamless Gutter Cleanout & Downspout Flush (Single Story)",
                        "description": "Hand removal of all debris from gutters and high-pressure hose flush of downspouts to guarantee free drainage.",
                        "category": "maintenance",
                        "group": "Gutters & Downspouts",
                        "unit_price": 175,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 90,
                        "tags": [
                            "gutter cleaning",
                            "downspout flush",
                            "roof drainage"
                        ]
                    },
                    {
                        "id": "roof_emg_tarp",
                        "name": "Emergency Storm Damage Waterproof Roof Tarping",
                        "description": "Immediate securement of heavy-duty waterproof tarp with furring strips over storm damaged or leaking section.",
                        "category": "emergency",
                        "group": "Emergency & Urgent",
                        "unit_price": 350,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 90,
                        "tags": [
                            "emergency tarp",
                            "roof leak",
                            "storm damage",
                            "waterproofing"
                        ]
                    }
                ]
            }
        ]
    },
    {
        "id": "landscaping",
        "name": "Landscaping & Grounds Care",
        "icon": "Trees",
        "description": "Lawn maintenance, irrigation repair, tree pruning, mulch, hardscaping, and grounds care",
        "specialties": [
            {
                "id": "lawn_maintenance",
                "name": "Lawn Care & Landscape Maintenance",
                "description": "Scheduled mowing, edging, hedge trimming, seasonal cleanups, irrigation repairs, and mulch application",
                "keywords": [
                    "lawn",
                    "mow",
                    "grass",
                    "hedge",
                    "edging",
                    "mulch",
                    "yard cleanup",
                    "landscaping",
                    "irrigation",
                    "sprinkler"
                ],
                "standardServices": [
                    {
                        "id": "land_maint_biweekly_mow",
                        "name": "Scheduled Lawn Mowing, Edge & Blow (Up to 1/4 Acre)",
                        "description": "Precision cut turf, weed-whack borders, hard-edge walkways, and power blow all hard surfaces clean.",
                        "category": "maintenance",
                        "group": "Turf & Lawn Care",
                        "unit_price": 65,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 45,
                        "tags": [
                            "lawn mowing",
                            "edging",
                            "grass cut",
                            "maintenance"
                        ]
                    },
                    {
                        "id": "land_rep_sprinkler_head",
                        "name": "Sprinkler Pop-Up Head Replacement & Nozzle Adjustment",
                        "description": "Excavate broken sprinkler head, replace with commercial spray head, and adjust spray radius for head-to-head coverage.",
                        "category": "repair",
                        "group": "Irrigation & Sprinklers",
                        "unit_price": 75,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 30,
                        "tags": [
                            "sprinkler repair",
                            "irrigation head",
                            "popup nozzle"
                        ]
                    },
                    {
                        "id": "land_diag_irrigation_audit",
                        "name": "Irrigation System Zone Audit & Controller Programming",
                        "description": "Test all sprinkler zones, inspect for buried heads or lateral pipe leaks, and program smart seasonal timer schedule.",
                        "category": "diagnostic",
                        "group": "Irrigation & Sprinklers",
                        "unit_price": 95,
                        "unit": "diagnostic_fee",
                        "estimated_duration_minutes": 60,
                        "tags": [
                            "irrigation audit",
                            "sprinkler check",
                            "timer programming"
                        ]
                    },
                    {
                        "id": "land_inst_mulch",
                        "name": "Premium Double-Shredded Hardwood Mulch Delivery & Spread (Per Yard)",
                        "description": "Weed prep planting bed, trench border edge, deliver and spread 3-inch layer of rich brown/black mulch.",
                        "category": "installation",
                        "group": "Beds & Plantings",
                        "unit_price": 110,
                        "unit": "per_unit",
                        "estimated_duration_minutes": 60,
                        "tags": [
                            "mulch installation",
                            "flower beds",
                            "weed suppression"
                        ]
                    },
                    {
                        "id": "land_maint_hedge_trim",
                        "name": "Decorative Shrub & Ornamental Hedge Shearing (Up to 10 Plants)",
                        "description": "Hand or gas shear shaping of ornamental boxwoods, privets, and shrubs, with debris bagged and removed.",
                        "category": "maintenance",
                        "group": "Beds & Plantings",
                        "unit_price": 165,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 75,
                        "tags": [
                            "hedge trimming",
                            "bush shearing",
                            "shrub shaping"
                        ]
                    }
                ]
            }
        ]
    },
    {
        "id": "handyman",
        "name": "Handyman & Home Maintenance",
        "icon": "Hammer",
        "description": "Multi-trade residential repairs, drywall, doors, trim carpentry, and punch lists",
        "specialties": [
            {
                "id": "general_handyman",
                "name": "General Handyman & Punch-List Repairs",
                "description": "Broad-spectrum home repairs, wall patching, door hardware, shelving, mounting, and fixture assembly",
                "keywords": [
                    "handyman",
                    "drywall",
                    "door",
                    "mounting",
                    "patch",
                    "trim",
                    "punch list",
                    "repairs"
                ],
                "standardServices": [
                    {
                        "id": "handy_inst_tv_mount",
                        "name": "TV Wall Mounting & Concealed Cable Pass-Through",
                        "description": "Securely lag-bolt TV mount to studs up to 75\" screen, level bracket, and install in-wall brush cable pass-through.",
                        "category": "installation",
                        "group": "Mounting & Assembly",
                        "unit_price": 145,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 60,
                        "tags": [
                            "tv mount",
                            "wall mounting",
                            "studs",
                            "cables"
                        ]
                    },
                    {
                        "id": "handy_rep_drywall_patch",
                        "name": "Drywall Hole Repair & Texture Match (Up to 12\"x12\")",
                        "description": "Cut clean square, install backing, mesh tape, two coats of quick-set mud, sand, and orange-peel/knockdown texture match.",
                        "category": "repair",
                        "group": "Walls & Drywall",
                        "unit_price": 185,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 90,
                        "tags": [
                            "drywall patch",
                            "sheetrock",
                            "hole repair",
                            "texture"
                        ]
                    },
                    {
                        "id": "handy_inst_deadbolt",
                        "name": "Entry Door Lockset & Smart Deadbolt Installation",
                        "description": "Install new keyed entry deadbolt and matching handle, chisel strike plate, and adjust latch alignment for smooth locking.",
                        "category": "installation",
                        "group": "Doors & Windows",
                        "unit_price": 95,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 40,
                        "tags": [
                            "door lock",
                            "deadbolt",
                            "hardware",
                            "smart lock"
                        ]
                    },
                    {
                        "id": "handy_rep_hourly_punch",
                        "name": "General Handyman Multi-Task Punch List Labor (Per Hour)",
                        "description": "Flexible punch-list labor for miscellaneous household tasks, furniture assembly, and small carpentry fixes (2 hr min).",
                        "category": "repair",
                        "group": "General Punch List",
                        "unit_price": 85,
                        "unit": "per_hour",
                        "estimated_duration_minutes": 60,
                        "tags": [
                            "handyman hourly",
                            "punch list",
                            "general repair",
                            "labor"
                        ]
                    }
                ]
            }
        ]
    },
    {
        "id": "pest_control",
        "name": "Pest Control & Extermination",
        "icon": "Bug",
        "description": "Termite, rodent, insect, and wildlife management for homes and businesses",
        "specialties": [
            {
                "id": "pest_residential",
                "name": "Residential Pest Control & Prevention",
                "description": "Quarterly barrier treatments, ant, cockroach, spider, and rodent eradication",
                "keywords": [
                    "pest",
                    "termite",
                    "ant",
                    "cockroach",
                    "rodent",
                    "rat",
                    "mice",
                    "exterminator"
                ],
                "standardServices": [
                    {
                        "id": "pest_diag_audit",
                        "name": "Comprehensive Pest & Rodent Point-of-Entry Inspection",
                        "description": "Detailed inspection of attic, crawlspace, weep holes, and rooflines to map pest pathways and nesting sites.",
                        "category": "diagnostic",
                        "group": "Diagnostics & Evaluation",
                        "unit_price": 99,
                        "unit": "diagnostic_fee",
                        "estimated_duration_minutes": 45,
                        "tags": [
                            "pest inspection",
                            "rodent audit",
                            "entry points"
                        ]
                    },
                    {
                        "id": "pest_maint_barrier",
                        "name": "Initial Pest Flushout & Foundation Exterior Barrier Treatment",
                        "description": "Full interior baseboard application, de-webbing eaves, and 3-foot exterior liquid foundation barrier application.",
                        "category": "maintenance",
                        "group": "Barrier & Perimeter",
                        "unit_price": 195,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 75,
                        "tags": [
                            "pest barrier",
                            "perimeter treatment",
                            "initial pest"
                        ]
                    },
                    {
                        "id": "pest_rep_rodent_exclusion",
                        "name": "Rodent Entry Exclusion Sealing & Steel Mesh Flashing",
                        "description": "Seal pipe wall penetrations, roof returns, and AC chases with galvanized steel mesh, copper wool, and polyurethane sealant.",
                        "category": "repair",
                        "group": "Rodent Exclusion",
                        "unit_price": 385,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 120,
                        "tags": [
                            "rodent exclusion",
                            "mesh sealing",
                            "mice proofing"
                        ]
                    }
                ]
            }
        ]
    },
    {
        "id": "pool_spa",
        "name": "Pool & Spa Care",
        "icon": "Waves",
        "description": "Swimming pool cleaning, water chemistry balancing, pump & filter repairs",
        "specialties": [
            {
                "id": "pool_maintenance",
                "name": "Weekly Pool Cleaning & Chemical Service",
                "description": "Skimming, brushing, vacuuming, water testing, chlorine, and pH chemical balancing",
                "keywords": [
                    "pool",
                    "spa",
                    "chlorine",
                    "filter",
                    "pump",
                    "water chemistry",
                    "vacuum"
                ],
                "standardServices": [
                    {
                        "id": "pool_maint_monthly_service",
                        "name": "Monthly Full-Service Pool Care (4 Weekly Visits)",
                        "description": "Weekly net skim, wall tile brush, bottom vacuum, empty skimmer baskets, and all balancing chemicals included.",
                        "category": "maintenance",
                        "group": "Cleaning & Water Care",
                        "unit_price": 185,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 40,
                        "tags": [
                            "pool service",
                            "weekly pool",
                            "chemicals",
                            "cleaning"
                        ]
                    },
                    {
                        "id": "pool_maint_filter_clean",
                        "name": "Pool Cartridge / DE Filter Deep Clean & Degrease",
                        "description": "Disassemble filter tank, inspect grids/cartridges, soak with enzyme degreaser, and pressure wash clean.",
                        "category": "maintenance",
                        "group": "Equipment Maintenance",
                        "unit_price": 165,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 60,
                        "tags": [
                            "filter clean",
                            "de filter",
                            "cartridge wash"
                        ]
                    },
                    {
                        "id": "pool_rep_pump_motor",
                        "name": "Variable Speed Pool Pump Motor & Shaft Seal Replacement",
                        "description": "Replace burned single-speed pump with energy-efficient variable speed pump, new mechanical seal, and programmable timer.",
                        "category": "repair",
                        "group": "Pumps & Circulation",
                        "unit_price": 895,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 120,
                        "tags": [
                            "pool pump",
                            "variable speed",
                            "shaft seal"
                        ]
                    }
                ]
            }
        ]
    },
    {
        "id": "appliance_repair",
        "name": "Appliance Repair & Service",
        "icon": "Refrigerator",
        "description": "Diagnostic and repair of refrigerators, ovens, dishwashers, washers, and dryers",
        "specialties": [
            {
                "id": "major_appliances",
                "name": "Major Household Appliance Repair",
                "description": "All major kitchen and laundry brands: Whirlpool, GE, Samsung, LG, Bosch, Sub-Zero",
                "keywords": [
                    "appliance",
                    "refrigerator",
                    "dryer",
                    "washer",
                    "dishwasher",
                    "oven",
                    "stove"
                ],
                "standardServices": [
                    {
                        "id": "appliance_diag_eval",
                        "name": "Appliance In-Home Diagnostic Fee (Applied to Approved Repair)",
                        "description": "Complete mechanical and electrical multimeter component testing to isolate failed part and quote repairs.",
                        "category": "diagnostic",
                        "group": "Diagnostics & Evaluation",
                        "unit_price": 99,
                        "unit": "diagnostic_fee",
                        "estimated_duration_minutes": 45,
                        "tags": [
                            "appliance diagnostic",
                            "service call",
                            "multimeter"
                        ]
                    },
                    {
                        "id": "appliance_maint_dryer_vent",
                        "name": "Dryer Exhaust Vent Line Deep Lint Scour & Airflow Test",
                        "description": "Rotary brush and vacuum cleanout of entire dryer exhaust duct from machine to exterior louvers.",
                        "category": "maintenance",
                        "group": "Dryer & Venting",
                        "unit_price": 149,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 60,
                        "tags": [
                            "dryer vent",
                            "lint cleaning",
                            "fire safety"
                        ]
                    },
                    {
                        "id": "appliance_rep_pump_belt",
                        "name": "Washing Machine Drain Pump or Drive Belt Replacement",
                        "description": "Disassemble cabinet, replace clogged or seized drain pump or worn belt, and run diagnostic spin cycle.",
                        "category": "repair",
                        "group": "Laundry Appliances",
                        "unit_price": 245,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 60,
                        "tags": [
                            "washer repair",
                            "drain pump",
                            "belt replacement"
                        ]
                    }
                ]
            }
        ]
    },
    {
        "id": "garage_doors",
        "name": "Garage Door & Gates",
        "icon": "DoorClosed",
        "description": "Spring replacements, opener motors, roller track alignments, and smart gate automation",
        "specialties": [
            {
                "id": "garage_door_service",
                "name": "Residential Garage Door Service & Opener Installation",
                "description": "High-cycle torsion springs, nylon rollers, LiftMaster belt drive openers, and track tuning",
                "keywords": [
                    "garage door",
                    "spring",
                    "opener",
                    "liftmaster",
                    "roller",
                    "cable",
                    "track"
                ],
                "standardServices": [
                    {
                        "id": "garage_rep_torsion_springs",
                        "name": "Torsion Spring Pair Replacement (Heavy Duty 25K Cycles)",
                        "description": "Safely unwind and replace both broken garage door torsion springs, balance door, and lube bearings.",
                        "category": "repair",
                        "group": "Springs & Hardware",
                        "unit_price": 345,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 75,
                        "tags": [
                            "garage door spring",
                            "torsion spring",
                            "broken spring"
                        ]
                    },
                    {
                        "id": "garage_inst_belt_opener",
                        "name": "Smart WiFi Belt-Drive Garage Door Opener Installation",
                        "description": "Mount motor unit, rail assembly, safety reversing sensors, wall keypad, and pair with smartphone app.",
                        "category": "installation",
                        "group": "Openers & Motors",
                        "unit_price": 495,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 120,
                        "tags": [
                            "garage opener",
                            "belt drive",
                            "liftmaster"
                        ]
                    },
                    {
                        "id": "garage_maint_tuneup",
                        "name": "Garage Door Precision Tune-Up & Roller Lubrication",
                        "description": "Tighten all hardware hinges, adjust track alignment, test auto-reverse safety sensors, and lube high-stress bearings.",
                        "category": "maintenance",
                        "group": "Springs & Hardware",
                        "unit_price": 119,
                        "unit": "flat_rate",
                        "estimated_duration_minutes": 45,
                        "tags": [
                            "garage tuneup",
                            "roller lube",
                            "safety test"
                        ]
                    }
                ]
            }
        ]
    }
,
    {
    "id": "low_voltage",
    "name": "Low Voltage, Security & Audio/Visual",
    "icon": "Zap",
    "description": "Structured cabling, CCTV surveillance, access control, and commercial A/V integration",
    "specialties": [
        {
            "id": "low_voltage_cabling",
            "name": "Low Voltage Cabling & Infrastructure Install",
            "description": "Structured Cat6/6A horizontal cabling, fiber optic splicing, server racks, and network patch panel dressing",
            "keywords": [
                "low voltage",
                "structured cabling",
                "cat6",
                "cat6a",
                "fiber optic",
                "patch panel",
                "server rack",
                "network cable",
                "data drop"
            ],
            "standardServices": [
                {
                    "id": "lv_diag_tone",
                    "name": "Structured Cable Tone, Probe & Continuity Audit",
                    "description": "Trace existing unidentified cable runs, tone out wall jacks to patch panels, and verify pinout continuity.",
                    "category": "diagnostic",
                    "group": "Diagnostics & Evaluation",
                    "unit_price": 110,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 60,
                    "tags": [
                        "tone and probe",
                        "cable audit",
                        "continuity"
                    ]
                },
                {
                    "id": "lv_diag_cert",
                    "name": "Fluke DSX Channel & Permanent Link Certification",
                    "description": "Comprehensive copper or fiber link certification with printed test reports for enterprise spec compliance.",
                    "category": "diagnostic",
                    "group": "Diagnostics & Evaluation",
                    "unit_price": 165,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 60,
                    "tags": [
                        "fluke",
                        "certification",
                        "loss test"
                    ]
                },
                {
                    "id": "lv_cable_drop",
                    "name": "Cat6 / Cat6A Horizontal Cable Drop Installation",
                    "description": "Pull plenum/riser rated UTP/STP cable from telecom room through pathways to wall plate location with termination and testing.",
                    "category": "installation",
                    "group": "Structured Network & Data Cabling",
                    "unit_price": 175,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 90,
                    "tags": [
                        "cat6",
                        "cable drop",
                        "network"
                    ]
                },
                {
                    "id": "lv_fiber_splice",
                    "name": "Fiber Optic Fusion Splicing & LC/SC Termination",
                    "description": "Precision fusion splicing of single-mode or OM3/OM4 multi-mode fiber strands with optical power verification.",
                    "category": "installation",
                    "group": "Structured Network & Data Cabling",
                    "unit_price": 245,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 90,
                    "tags": [
                        "fiber optic",
                        "fusion splice",
                        "fiber termination"
                    ]
                },
                {
                    "id": "lv_rack_mount",
                    "name": "Server Rack / Wall-Mount Cabinet Dressing & Assembly",
                    "description": "Mount equipment rack, install horizontal cable managers, dress incoming bundles, and mount patch panels.",
                    "category": "installation",
                    "group": "Structured Network & Data Cabling",
                    "unit_price": 380,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 180,
                    "tags": [
                        "server rack",
                        "wire management",
                        "network cabinet"
                    ]
                },
                {
                    "id": "lv_cable_repair",
                    "name": "Severed / Damaged Network Cable Re-Termination",
                    "description": "Repair cut or degraded low voltage cabling, re-punch keystones, or replace damaged modular RJ45 plugs.",
                    "category": "repair",
                    "group": "Structured Network & Data Cabling",
                    "unit_price": 135,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 60,
                    "tags": [
                        "cable repair",
                        "rj45",
                        "keystone"
                    ]
                }
            ]
        },
        {
            "id": "security_cctv",
            "name": "Commercial & Residential CCTV & Surveillance Systems",
            "description": "IP PoE surveillance cameras, NVR recording servers, cloud video bridges, and motion detection tuning",
            "keywords": [
                "cctv",
                "security camera",
                "poe camera",
                "nvr",
                "video surveillance",
                "surveillance system",
                "dome camera",
                "ptz"
            ],
            "standardServices": [
                {
                    "id": "cctv_diag_audit",
                    "name": "CCTV Camera System Diagnostic & Signal Tracing",
                    "description": "Troubleshoot offline PoE IP cameras, test voltage drops, diagnose NVR hard drive errors, and check lens focus.",
                    "category": "diagnostic",
                    "group": "CCTV & Video Surveillance",
                    "unit_price": 125,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 60,
                    "tags": [
                        "cctv diagnostic",
                        "camera offline",
                        "signal trace"
                    ]
                },
                {
                    "id": "cctv_cam_mount",
                    "name": "Single IP PoE Security Camera Mount & Weatherproof Integration",
                    "description": "Exterior or interior surface mounting, conduit seal, precision angle alignment, and PoE network switch pairing.",
                    "category": "installation",
                    "group": "CCTV & Video Surveillance",
                    "unit_price": 225,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 90,
                    "tags": [
                        "camera mount",
                        "poe camera",
                        "cctv install"
                    ]
                },
                {
                    "id": "cctv_nvr_setup",
                    "name": "NVR Storage Setup, RAID Config & Remote Mobile Access",
                    "description": "Initialize surveillance hard drives, configure recording schedules, setup secure remote app viewing, and motion zones.",
                    "category": "installation",
                    "group": "CCTV & Video Surveillance",
                    "unit_price": 320,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 120,
                    "tags": [
                        "nvr setup",
                        "remote viewing",
                        "surveillance app"
                    ]
                },
                {
                    "id": "cctv_ptp_bridge",
                    "name": "Wireless Point-to-Point (PtP) Bridge Link Installation",
                    "description": "Deploy high-throughput outdoor wireless bridge antennas to extend camera feeds across outbuildings or parking lots.",
                    "category": "installation",
                    "group": "CCTV & Video Surveillance",
                    "unit_price": 450,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 150,
                    "tags": [
                        "ptp bridge",
                        "wireless link",
                        "ubiquiti"
                    ]
                },
                {
                    "id": "cctv_maint_clean",
                    "name": "Annual CCTV Camera Lens Cleaning, Alignment & Firmware Update",
                    "description": "Clean dome bubbles, re-aim drift, clean spider webs/insects from IR lamps, and apply security firmware patches.",
                    "category": "maintenance",
                    "group": "CCTV & Video Surveillance",
                    "unit_price": 165,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 75,
                    "tags": [
                        "lens cleaning",
                        "camera maintenance",
                        "firmware update"
                    ]
                }
            ]
        },
        {
            "id": "access_control",
            "name": "Commercial Access Control & Electronic Intrusion",
            "description": "Electronic maglocks, RFID card readers, door strikes, REX request-to-exit sensors, and intercom door stations",
            "keywords": [
                "access control",
                "maglock",
                "card reader",
                "keycard",
                "intercom",
                "door strike",
                "rfid",
                "door access"
            ],
            "standardServices": [
                {
                    "id": "ac_diag_fault",
                    "name": "Access Control Door Circuit & Power Diagnostic",
                    "description": "Test power transfer hinges, controller loop voltage, maglock bond sensor, and request-to-exit switches.",
                    "category": "diagnostic",
                    "group": "Access Control & Intrusion",
                    "unit_price": 140,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 60,
                    "tags": [
                        "access control diagnostic",
                        "maglock fault",
                        "reader test"
                    ]
                },
                {
                    "id": "ac_strike_install",
                    "name": "Electronic Door Strike / Maglock Assembly Installation",
                    "description": "Mortise frame prep, mounting of electric strike or magnetic lock, wiring to control panel with fire alarm drop release.",
                    "category": "installation",
                    "group": "Access Control & Intrusion",
                    "unit_price": 550,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 210,
                    "tags": [
                        "door strike",
                        "maglock",
                        "fire release"
                    ]
                },
                {
                    "id": "ac_reader_install",
                    "name": "RFID Card Reader / Keypad & Request-to-Exit Installation",
                    "description": "Mount proximity reader, pull shielded multi-conductor station wire, install overhead REX motion, and test badge access.",
                    "category": "installation",
                    "group": "Access Control & Intrusion",
                    "unit_price": 285,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 90,
                    "tags": [
                        "card reader",
                        "keypad",
                        "rex sensor"
                    ]
                },
                {
                    "id": "ac_intercom_station",
                    "name": "Video Intercom & Commercial Door Station Deployment",
                    "description": "Install IP door entry station (Aiphone, DoorBird, 2N), connect electronic release, and configure mobile app answering.",
                    "category": "installation",
                    "group": "Access Control & Intrusion",
                    "unit_price": 420,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 120,
                    "tags": [
                        "intercom",
                        "door station",
                        "video buzzer"
                    ]
                }
            ]
        }
    ]
},
    {
    "id": "painting",
    "name": "Painting & Surface Finishing",
    "icon": "Palette",
    "description": "Residential and commercial interior painting, exterior staining, drywall finishing, and cabinet refinishing",
    "specialties": [
        {
            "id": "painting_residential",
            "name": "Residential & Commercial Painting",
            "description": "Full interior room painting, exterior siding and trim painting, drywall patching, and surface preparation",
            "keywords": [
                "painter",
                "painting",
                "interior painting",
                "exterior painting",
                "stain",
                "drywall",
                "caulk",
                "trim painting"
            ],
            "standardServices": [
                {
                    "id": "paint_color_eval",
                    "name": "On-Site Substrate Evaluation & Color Consultation",
                    "description": "Inspect moisture levels, lead test existing coats, examine plaster/drywall integrity, and formulate sheen/primer recommendations.",
                    "category": "inspection",
                    "group": "Diagnostics & Prep",
                    "unit_price": 95,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 45,
                    "tags": [
                        "color consult",
                        "moisture check",
                        "paint inspection"
                    ]
                },
                {
                    "id": "paint_interior_room",
                    "name": "Standard Room Interior Walls & Ceiling 2-Coat Painting",
                    "description": "Mask floors and trim, patch drywall imperfections, spot prime, and apply 2 coats of premium washable latex paint.",
                    "category": "installation",
                    "group": "Interior Painting",
                    "unit_price": 450,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 240,
                    "tags": [
                        "room painting",
                        "two coat",
                        "interior paint"
                    ]
                },
                {
                    "id": "paint_trim_doors",
                    "name": "Baseboard, Casing & Interior Door Enamel Painting",
                    "description": "Sand trim, caulk gaps, fill nail holes, and hand-brush or spray high-durability waterborne alkyd semi-gloss enamel.",
                    "category": "installation",
                    "group": "Interior Painting",
                    "unit_price": 280,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 150,
                    "tags": [
                        "trim painting",
                        "door painting",
                        "enamel"
                    ]
                },
                {
                    "id": "paint_drywall_patch",
                    "name": "Drywall Water Damage & Hole Repair with Texture Match",
                    "description": "Cut out damaged drywall, install backing and patch, apply setting compound, sand flush, and match orange peel/knockdown texture.",
                    "category": "repair",
                    "group": "Interior Painting",
                    "unit_price": 195,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 90,
                    "tags": [
                        "drywall repair",
                        "texture match",
                        "patching"
                    ]
                },
                {
                    "id": "paint_ext_siding",
                    "name": "Exterior Siding & Fascia 2-Coat Acrylic Painting",
                    "description": "Scrape loose paint, spot prime bare wood, caulk joint seams, and apply 2 heavy coats of 100% acrylic exterior house paint.",
                    "category": "installation",
                    "group": "Exterior Painting",
                    "unit_price": 850,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 360,
                    "tags": [
                        "exterior painting",
                        "siding paint",
                        "weather seal"
                    ]
                }
            ]
        }
    ]
},
    {
    "id": "flooring",
    "name": "Flooring, Tile & Hardwood",
    "icon": "Hammer",
    "description": "Hardwood floor installation and refinishing, tile setting, luxury vinyl plank (LVP), and carpet installation",
    "specialties": [
        {
            "id": "flooring_tile_wood",
            "name": "Flooring & Tile Installation Services",
            "description": "Porcelain tile, shower waterproofing, hardwood floor installation, dustless sanding, and luxury vinyl plank",
            "keywords": [
                "flooring",
                "tile",
                "hardwood",
                "lvp",
                "vinyl plank",
                "shower tile",
                "grout",
                "carpet",
                "subfloor"
            ],
            "standardServices": [
                {
                    "id": "floor_subfloor_eval",
                    "name": "Subfloor Flatness, Deflection & Moisture Audit",
                    "description": "Measure concrete RH moisture or wood subfloor moisture content, verify flatness tolerance, and check joist deflection.",
                    "category": "inspection",
                    "group": "Diagnostics & Evaluation",
                    "unit_price": 110,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 45,
                    "tags": [
                        "moisture test",
                        "subfloor audit",
                        "floor prep"
                    ]
                },
                {
                    "id": "floor_lvp_install",
                    "name": "Luxury Vinyl Plank (LVP) Floating Floor Installation",
                    "description": "Install acoustic underlayment, stagger click-lock LVP planks, undercut door casings, and install transition moldings.",
                    "category": "installation",
                    "group": "LVP & Laminate",
                    "unit_price": 650,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 300,
                    "tags": [
                        "lvp installation",
                        "click lock",
                        "vinyl plank"
                    ]
                },
                {
                    "id": "floor_tile_setting",
                    "name": "Porcelain / Ceramic Floor Tile Setting & Grouting",
                    "description": "Apply polymer-modified thinset mortar, set tiles with leveling clips, tool joints, and apply stain-resistant grout.",
                    "category": "installation",
                    "group": "Tile & Stone",
                    "unit_price": 750,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 360,
                    "tags": [
                        "tile setting",
                        "grouting",
                        "porcelain tile"
                    ]
                },
                {
                    "id": "floor_grout_repair",
                    "name": "Cracked Tile Replacement & Grout Re-Sealing",
                    "description": "Remove damaged tile without compromising neighboring pieces, rebuild mortar bed, set replacement tile, and re-grout.",
                    "category": "repair",
                    "group": "Tile & Stone",
                    "unit_price": 220,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 90,
                    "tags": [
                        "tile repair",
                        "grout replacement",
                        "crack repair"
                    ]
                }
            ]
        }
    ]
},
    {
    "id": "cleaning",
    "name": "Cleaning, Janitorial & Maid Services",
    "icon": "Sparkles",
    "description": "Residential deep cleaning, recurring maid service, commercial janitorial, and carpet steam extraction",
    "specialties": [
        {
            "id": "cleaning_residential_comm",
            "name": "Residential & Commercial Cleaning Services",
            "description": "Deep house cleaning, move-in/move-out turnover, recurring office janitorial, and hot water extraction carpet care",
            "keywords": [
                "cleaning",
                "janitorial",
                "maid service",
                "house cleaning",
                "carpet cleaning",
                "steam clean",
                "deep clean"
            ],
            "standardServices": [
                {
                    "id": "clean_deep_home",
                    "name": "Whole-Home Deep Clean & Detail Sanitation",
                    "description": "Top-to-bottom scrub of kitchen appliances, degreasing cabinet faces, descaling shower tiles, dusting baseboards and blinds.",
                    "category": "maintenance",
                    "group": "Residential Cleaning",
                    "unit_price": 295,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 240,
                    "tags": [
                        "deep clean",
                        "house cleaning",
                        "sanitation"
                    ]
                },
                {
                    "id": "clean_carpet_steam",
                    "name": "Multi-Room Hot Water Extraction Carpet Cleaning",
                    "description": "Pre-spray high-traffic enzyme solution, agitate fibers, and extract soil and pet dander with high-heat truckmount rinse.",
                    "category": "maintenance",
                    "group": "Carpet & Upholstery",
                    "unit_price": 195,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 120,
                    "tags": [
                        "carpet cleaning",
                        "steam extraction",
                        "stain removal"
                    ]
                },
                {
                    "id": "clean_move_turnover",
                    "name": "Move-In / Move-Out Rental Turnover Cleaning",
                    "description": "Comprehensive empty-home clean including interior ovens, refrigerator defrost/wipe, closet shelves, and window tracks.",
                    "category": "maintenance",
                    "group": "Residential Cleaning",
                    "unit_price": 350,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 300,
                    "tags": [
                        "move out clean",
                        "rental turnover",
                        "apartment clean"
                    ]
                }
            ]
        }
    ]
},
    {
    "id": "pressure_washing",
    "name": "Pressure Washing & Exterior Cleaning",
    "icon": "Waves",
    "description": "Soft wash roof cleaning, high-pressure concrete cleaning, house washing, and paver re-sanding",
    "specialties": [
        {
            "id": "pressure_wash_full",
            "name": "Pressure Washing & Exterior Soft Wash",
            "description": "Low-pressure soft washing for siding and roofs, surface cleaning for driveways, and deck stain prep",
            "keywords": [
                "pressure washing",
                "power washing",
                "soft wash",
                "roof cleaning",
                "driveway cleaning",
                "exterior cleaning",
                "concrete wash"
            ],
            "standardServices": [
                {
                    "id": "pw_house_softwash",
                    "name": "Whole-Home Low-Pressure Soft Wash Exterior Cleaning",
                    "description": "Apply specialized mildewcide surfactant to vinyl/stucco siding, neutralize algae and organic growth, and rinse with pure water.",
                    "category": "maintenance",
                    "group": "Soft Washing & House Wash",
                    "unit_price": 325,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 150,
                    "tags": [
                        "house wash",
                        "soft wash",
                        "siding clean"
                    ]
                },
                {
                    "id": "pw_concrete_drive",
                    "name": "Concrete Driveway & Sidewalk Rotary Surface Cleaning",
                    "description": "Pre-treat with oil degreaser, deep scour concrete with rotary surface cleaner (4000 PSI), and post-treat for bright finish.",
                    "category": "maintenance",
                    "group": "Flatwork & Surface Cleaning",
                    "unit_price": 245,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 120,
                    "tags": [
                        "driveway cleaning",
                        "concrete wash",
                        "surface cleaner"
                    ]
                },
                {
                    "id": "pw_roof_softwash",
                    "name": "Roof Algae & Black Streak Eradication Soft Wash",
                    "description": "Zero-pressure chemical application to treat Gloeocapsa magma black streaks and moss without dislodging shingle granules.",
                    "category": "maintenance",
                    "group": "Soft Washing & House Wash",
                    "unit_price": 495,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 180,
                    "tags": [
                        "roof wash",
                        "shingle clean",
                        "algae treatment"
                    ]
                }
            ]
        }
    ]
},
    {
    "id": "window_cleaning",
    "name": "Window & Solar Panel Cleaning",
    "icon": "Sun",
    "description": "Residential interior and exterior window cleaning, pure water solar panel washing, and glass restoration",
    "specialties": [
        {
            "id": "window_clean_pro",
            "name": "Window & Solar Cleaning Services",
            "description": "Streak-free interior and exterior window cleaning, screen washing, track detailing, and solar efficiency washing",
            "keywords": [
                "window cleaning",
                "window washer",
                "solar panel cleaning",
                "screen repair",
                "glass cleaning",
                "pure water"
            ],
            "standardServices": [
                {
                    "id": "win_res_interior_ext",
                    "name": "Residential Interior & Exterior Window Glass Detailing",
                    "description": "Hand wash panes with professional glide solution, precision squeegee wipe, wipe sills and frames dry with lint-free huck towels.",
                    "category": "maintenance",
                    "group": "Residential Window Cleaning",
                    "unit_price": 240,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 150,
                    "tags": [
                        "window cleaning",
                        "streak free",
                        "glass wash"
                    ]
                },
                {
                    "id": "win_solar_purewater",
                    "name": "Solar Array Photovoltaic Efficiency Pure Water Wash",
                    "description": "Deionized pure water pole brush cleaning to remove baked-on dust, pollen, and bird droppings without chemical residue.",
                    "category": "maintenance",
                    "group": "Solar Panel Efficiency",
                    "unit_price": 185,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 90,
                    "tags": [
                        "solar cleaning",
                        "pure water",
                        "solar efficiency"
                    ]
                },
                {
                    "id": "win_screen_wash",
                    "name": "Window Screen Wash, Detail & Sun Protectant Dressing",
                    "description": "Remove screens, soap scrub with dual-side bristle washer, rinse, and treat with UV vinyl protectant.",
                    "category": "maintenance",
                    "group": "Residential Window Cleaning",
                    "unit_price": 95,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 60,
                    "tags": [
                        "screen cleaning",
                        "screen wash",
                        "window screen"
                    ]
                }
            ]
        }
    ]
},
    {
    "id": "locksmith",
    "name": "Locksmith & Security Hardware",
    "icon": "Key",
    "description": "Residential rekeying, high-security deadbolts, commercial panic hardware, and automotive lockouts",
    "specialties": [
        {
            "id": "locksmith_full",
            "name": "Residential & Commercial Locksmith Services",
            "description": "Rekeying existing locks, fresh deadbolt installation, smart locks, master key systems, and lockouts",
            "keywords": [
                "locksmith",
                "rekey",
                "deadbolt",
                "lockout",
                "smart lock",
                "key copy",
                "master key",
                "panic bar"
            ],
            "standardServices": [
                {
                    "id": "lock_rekey_cylinders",
                    "name": "Whole-Home Deadbolt & Knob Rekeying Service",
                    "description": "Disassemble lock cylinders, replace bottom pins to new biting key code, lubricate pins with PTFE, and supply 4 duplicate keys.",
                    "category": "maintenance",
                    "group": "Residential Locksmithing",
                    "unit_price": 145,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 60,
                    "tags": [
                        "rekey",
                        "lock rekey",
                        "cylinder repin"
                    ]
                },
                {
                    "id": "lock_smart_deadbolt",
                    "name": "Smart Wi-Fi Touchscreen Deadbolt Installation",
                    "description": "Fresh door bore alignment, strike plate reinforcement, smart lock motor setup, and smartphone bridge pairing.",
                    "category": "installation",
                    "group": "Residential Locksmithing",
                    "unit_price": 195,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 75,
                    "tags": [
                        "smart lock",
                        "keypad deadbolt",
                        "lock install"
                    ]
                },
                {
                    "id": "lock_emergency_open",
                    "name": "Emergency Non-Destructive Lockout Opening",
                    "description": "Rapid on-site lockout response, single-pin picking, bump keying, or automotive bypass opening.",
                    "category": "emergency",
                    "group": "Residential Locksmithing",
                    "unit_price": 125,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 30,
                    "tags": [
                        "lockout",
                        "emergency unlock",
                        "lock opening"
                    ]
                }
            ]
        }
    ]
},
    {
    "id": "restoration",
    "name": "Restoration & Remediation",
    "icon": "ShieldAlert",
    "description": "Emergency water damage mitigation, structural drying, certified mold remediation, and smoke deodorization",
    "specialties": [
        {
            "id": "restoration_water_mold",
            "name": "Water Damage & Mold Remediation Services",
            "description": "Thermal moisture mapping, commercial dehumidifier and air mover deployment, and antimicrobial containment",
            "keywords": [
                "restoration",
                "water damage",
                "mold remediation",
                "flood cleanup",
                "drying",
                "mitigation",
                "air scrubber"
            ],
            "standardServices": [
                {
                    "id": "restor_water_extract",
                    "name": "Emergency Standing Water Extraction & Moisture Mapping",
                    "description": "Deploy truckmount extraction, map moisture boundary with FLIR infrared cameras, and establish drying log baseline.",
                    "category": "emergency",
                    "group": "Water Damage Mitigation",
                    "unit_price": 450,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 180,
                    "tags": [
                        "water extraction",
                        "moisture mapping",
                        "flood response"
                    ]
                },
                {
                    "id": "restor_dry_chamber",
                    "name": "Structural Drying Chamber Setup & Equipment Placement",
                    "description": "Set up industrial LGR dehumidifiers and high-velocity axial air movers to achieve psychrometric drying targets.",
                    "category": "installation",
                    "group": "Water Damage Mitigation",
                    "unit_price": 380,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 120,
                    "tags": [
                        "dehumidifier",
                        "air mover",
                        "structural drying"
                    ]
                },
                {
                    "id": "restor_mold_contain",
                    "name": "Containment Barrier & Negative Air HEPA Scrubber Setup",
                    "description": "Construct zipwall poly barrier, seal air registers, establish negative pressure, and operate HEPA filtration.",
                    "category": "installation",
                    "group": "Mold Remediation",
                    "unit_price": 550,
                    "unit": "flat_rate",
                    "estimated_duration_minutes": 180,
                    "tags": [
                        "mold containment",
                        "hepa scrubber",
                        "negative air"
                    ]
                }
            ]
        }
    ]
}
];

// ═══════════════════════════════════════════════════════════════════════════════
// GLOBAL FIRESTORE COMMUNITY SYNC
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetches dynamic community-entered industries from Firestore and merges them with the built-in catalog
 */
export async function getMergedIndustryCatalog(): Promise<IndustrySector[]> {
    try {
        const customCol = collection(db, 'system_catalogs_industries');
        const q = query(customCol, orderBy('createdAt', 'desc'), limit(100));
        const snap = await getDocs(q);

        const customItems: Array<{
            sectorId: string;
            sectorName: string;
            specialtyName: string;
            description?: string;
            standardServices?: CatalogServiceItem[];
            createdByOrgId?: string;
        }> = [];

        snap.forEach(docSnap => {
            const data = docSnap.data() as any;
            if (data?.specialtyName) {
                customItems.push({
                    sectorId: data.sectorId || 'other',
                    sectorName: data.sectorName || 'Custom & Specialized Services',
                    specialtyName: data.specialtyName,
                    description: data.description || '',
                    standardServices: data.standardServices || [],
                    createdByOrgId: data.createdByOrgId
                });
            }
        });

        // Clone built-in catalog
        const merged: IndustrySector[] = JSON.parse(JSON.stringify(BUILTIN_INDUSTRY_CATALOG));

        // Merge custom items
        for (const custom of customItems) {
            let sector = merged.find(s => s.id.toLowerCase() === custom.sectorId.toLowerCase() || s.name.toLowerCase() === custom.sectorName.toLowerCase());
            if (!sector) {
                sector = {
                    id: custom.sectorId.toLowerCase().replace(/[^a-z0-9]/g, '_'),
                    name: custom.sectorName,
                    icon: 'Briefcase',
                    description: 'Custom community service trade',
                    specialties: []
                };
                merged.push(sector);
            }

            const existingSpec = sector.specialties.find(sp => sp.name.toLowerCase() === custom.specialtyName.toLowerCase());
            if (!existingSpec) {
                sector.specialties.push({
                    id: `custom_${custom.specialtyName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
                    name: custom.specialtyName,
                    description: custom.description || `Specialized ${custom.specialtyName} service`,
                    keywords: custom.specialtyName.toLowerCase().split(/\s+/),
                    standardServices: custom.standardServices || [],
                    isCustom: true,
                    createdByOrgId: custom.createdByOrgId
                });
            }
        }

        return merged;
    } catch (err) {
        console.warn('[IndustryCatalog] Error fetching custom industries from Firestore, falling back to built-in:', err);
        return BUILTIN_INDUSTRY_CATALOG;
    }
}

/**
 * Saves a new custom business type/specialty entered by a customer into Firestore
 * so future customers and searches benefit from it.
 */
export async function saveCustomSpecialtyToGlobalCatalog(
    sectorName: string,
    specialtyName: string,
    standardServices: CatalogServiceItem[],
    orgId?: string
): Promise<void> {
    if (!specialtyName || !specialtyName.trim()) return;

    try {
        const customCol = collection(db, 'system_catalogs_industries');
        await addDoc(customCol, {
            sectorName: sectorName || 'General Field Services',
            sectorId: (sectorName || 'general').toLowerCase().replace(/[^a-z0-9]/g, '_'),
            specialtyName: specialtyName.trim(),
            standardServices: standardServices || [],
            createdByOrgId: orgId || null,
            createdAt: serverTimestamp()
        });
        console.log(`[IndustryCatalog] Saved new custom specialty to global catalog: ${specialtyName}`);
    } catch (err) {
        console.warn('[IndustryCatalog] Failed to persist custom specialty to Firestore:', err);
    }
}
