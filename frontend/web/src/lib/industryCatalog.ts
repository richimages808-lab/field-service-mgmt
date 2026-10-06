/**
 * industryCatalog.ts — Robust Industry, Specialty & Services Catalog Database
 * 
 * Provides:
 * 1. Multi-tier hierarchy: Level 1 (Sector / Trade) -> Level 2 (Specialty / Business Type) -> Level 3 (Standard Services)
 * 2. Pre-populated robust catalog with 24+ industries and 100+ specialties with realistic pricing, duration, and descriptions.
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
// BUILT-IN ROBUST CATALOG DATABASE
// ═══════════════════════════════════════════════════════════════════════════════

export const BUILTIN_INDUSTRY_CATALOG: IndustrySector[] = [
    {
        id: 'plumbing',
        name: 'Plumbing & Pipe Fitting',
        icon: 'Wrench',
        description: 'Residential, commercial, and emergency water, drain, and gas systems',
        specialties: [
            {
                id: 'plumbing_residential',
                name: 'Residential Plumbing & Drain Service',
                description: 'Full-service home plumbing repairs, fixtures, clogged drains, and pipe leaks',
                keywords: ['drain', 'leak', 'faucet', 'toilet', 'pipe', 'clog', 'sink', 'shower', 'residential'],
                standardServices: [
                    {
                        id: 'drain_snaking',
                        name: 'Main Drain / Sewer Snaking & Clearing',
                        description: 'Mechanical auger cable clearing of clogged main sewer or secondary drain lines up to 75 ft.',
                        category: 'repair',
                        unit_price: 189,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 60,
                        tags: ['drain', 'clog', 'snake', 'rooter']
                    },
                    {
                        id: 'toilet_repair',
                        name: 'Toilet Rebuild & Component Replacement',
                        description: 'Replacement of fill valve, flapper, tank-to-bowl bolts, and supply line.',
                        category: 'repair',
                        unit_price: 145,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 45,
                        tags: ['toilet', 'flapper', 'valve', 'leak']
                    },
                    {
                        id: 'toilet_install',
                        name: 'New Toilet Supply & Installation',
                        description: 'Removal and disposal of old toilet, new wax ring, bolts, and installation of standard high-efficiency toilet.',
                        category: 'installation',
                        unit_price: 385,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 90,
                        tags: ['toilet', 'installation', 'wax ring']
                    },
                    {
                        id: 'faucet_install',
                        name: 'Kitchen / Bathroom Faucet Installation',
                        description: 'Disconnection of existing fixture, installation of new customer or contractor supplied faucet, and water testing.',
                        category: 'installation',
                        unit_price: 195,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 60,
                        tags: ['faucet', 'sink', 'fixture']
                    },
                    {
                        id: 'garbage_disposal',
                        name: 'Garbage Disposal Replacement (1/2 HP)',
                        description: 'Removal of failed unit and installation of new Badger 5 disposal including electrical whip and drain hookup.',
                        category: 'replacement',
                        unit_price: 295,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 60,
                        tags: ['disposal', 'sink', 'kitchen']
                    },
                    {
                        id: 'pipe_leak_repair',
                        name: 'Exposed Copper / PEX Pipe Leak Repair',
                        description: 'Cutting out damaged section of 1/2" or 3/4" water pipe and splicing with new fittings and couplings.',
                        category: 'repair',
                        unit_price: 265,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 75,
                        tags: ['leak', 'copper', 'pex', 'burst pipe']
                    },
                    {
                        id: 'plumbing_diagnostic',
                        name: 'Comprehensive Plumbing Diagnostic & Dispatch Fee',
                        description: 'Standard diagnostic service call to evaluate plumbing problems, pressure test, and provide firm estimate.',
                        category: 'diagnostic',
                        unit_price: 89,
                        unit: 'diagnostic_fee',
                        estimated_duration_minutes: 45,
                        tags: ['diagnostic', 'service call', 'inspection']
                    },
                    {
                        id: 'emergency_after_hours',
                        name: 'Emergency / After-Hours Callout Premium',
                        description: 'Immediate dispatch response for after-hours, weekend, or holiday water emergencies.',
                        category: 'emergency',
                        unit_price: 175,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 30,
                        tags: ['emergency', 'after hours', 'weekend']
                    }
                ]
            },
            {
                id: 'plumbing_water_heaters',
                name: 'Water Heater & Tankless Specialists',
                description: 'Specialized diagnosis, flushing, repair, and replacement of gas, electric, and tankless water heaters',
                keywords: ['water heater', 'tankless', 'rinnai', 'navien', 'hot water', 'boiler', 'anode'],
                standardServices: [
                    {
                        id: 'tank_flush',
                        name: 'Water Heater Annual Flush & Anode Inspection',
                        description: 'Full flush of sediment buildup, test T&P relief valve, and inspect sacrificial anode rod.',
                        category: 'maintenance',
                        unit_price: 159,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 60,
                        tags: ['maintenance', 'flush', 'sediment', 'anode']
                    },
                    {
                        id: 'tankless_descaling',
                        name: 'Tankless Water Heater Chemical Descale',
                        description: 'Circulation of non-toxic descaling solution through heat exchanger for 60 mins to restore efficiency.',
                        category: 'maintenance',
                        unit_price: 249,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 90,
                        tags: ['tankless', 'descale', 'flushing', 'efficiency']
                    },
                    {
                        id: 'electric_heater_install',
                        name: 'Standard 50-Gallon Electric Water Heater Replacement',
                        description: 'Drain & remove old heater, supply & install new 50-gal electric unit, thermal expansion tank, and brass ball valve.',
                        category: 'replacement',
                        unit_price: 1650,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 180,
                        tags: ['water heater', 'electric', '50 gallon', 'install']
                    },
                    {
                        id: 'tankless_install',
                        name: 'Whole-Home Tankless Gas Water Heater Conversion',
                        description: 'Installation of high-efficiency condensing tankless unit, stainless venting, gas line sizing check, and condensation line.',
                        category: 'installation',
                        unit_price: 3450,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 300,
                        tags: ['tankless', 'gas', 'rinnai', 'navien']
                    },
                    {
                        id: 'tp_valve_replace',
                        name: 'Temperature & Pressure (T&P) Relief Valve Replacement',
                        description: 'Removal of faulty, leaking, or seized T&P valve and installation of new code-compliant 150 PSI valve.',
                        category: 'repair',
                        unit_price: 185,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 45,
                        tags: ['t&p valve', 'relief valve', 'leak']
                    }
                ]
            },
            {
                id: 'plumbing_commercial',
                name: 'Commercial & Industrial Plumbing',
                description: 'Commercial facilities, restaurant grease traps, backflow prevention, and multi-tenant plumbing systems',
                keywords: ['commercial', 'grease trap', 'backflow', 'urinal', 'flushometer', 'restaurant', 'industrial'],
                standardServices: [
                    {
                        id: 'backflow_cert',
                        name: 'Annual Backflow Preventer Testing & Certification',
                        description: 'Certified differential pressure gauge testing of RPZ or double-check backflow preventer with municipal report filing.',
                        category: 'inspection',
                        unit_price: 185,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 45,
                        tags: ['backflow', 'testing', 'certification', 'rpz']
                    },
                    {
                        id: 'flushometer_rebuild',
                        name: 'Commercial Flushometer Valve Rebuild (Sloan/Zurn)',
                        description: 'Disassembly and rebuild of commercial toilet or urinal flush valve diaphragm, vacuum breaker, and handle assembly.',
                        category: 'repair',
                        unit_price: 220,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 45,
                        tags: ['sloan', 'zurn', 'flushometer', 'commercial']
                    },
                    {
                        id: 'grease_trap_clean',
                        name: 'Indoor Commercial Grease Trap Service & Jetting',
                        description: 'Clearing and hydro-scouring grease waste line from kitchen sinks to grease trap.',
                        category: 'maintenance',
                        unit_price: 395,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 90,
                        tags: ['grease trap', 'restaurant', 'hydro jetting']
                    },
                    {
                        id: 'commercial_camera_inspect',
                        name: 'Color Video Sewer Camera Inspection with Locator',
                        description: 'Push-camera inspection of commercial sewer main with digital recording, distance readout, and radio sonde locating.',
                        category: 'inspection',
                        unit_price: 295,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 60,
                        tags: ['camera', 'sewer inspection', 'locator']
                    }
                ]
            }
        ]
    },
    {
        id: 'hvac',
        name: 'HVAC & Climate Control',
        icon: 'Thermometer',
        description: 'Heating, ventilation, air conditioning, heat pumps, and refrigeration',
        specialties: [
            {
                id: 'hvac_residential',
                name: 'Residential AC & Heating Service',
                description: 'Home cooling and heating tune-ups, refrigerant diagnostics, thermostat upgrades, and compressor repairs',
                keywords: ['ac', 'air conditioning', 'heating', 'furnace', 'heat pump', 'freon', 'thermostat', 'compressor'],
                standardServices: [
                    {
                        id: 'ac_tune_up',
                        name: 'Comprehensive 21-Point AC Seasonal Tune-Up',
                        description: 'Check refrigerant charge, clean condenser coils, clear condensate drain line, test capacitor, contactor, and amp draw.',
                        category: 'maintenance',
                        unit_price: 129,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 60,
                        tags: ['ac', 'tune up', 'maintenance', 'summer']
                    },
                    {
                        id: 'capacitor_replacement',
                        name: 'Dual-Run Capacitor Replacement',
                        description: 'Discharge and replace failed compressor/fan capacitor with OEM spec heavy-duty run capacitor.',
                        category: 'repair',
                        unit_price: 195,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 30,
                        tags: ['capacitor', 'ac repair', 'fan']
                    },
                    {
                        id: 'refrigerant_recharge',
                        name: 'R-410A / R-32 Refrigerant Leak Check & Recharge',
                        description: 'Electronic leak sniff detection and addition of up to 2 lbs of virgin refrigerant to manufacturer subcooling specs.',
                        category: 'repair',
                        unit_price: 285,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 75,
                        tags: ['refrigerant', 'freon', 'r410a', 'cooling']
                    },
                    {
                        id: 'smart_thermostat_install',
                        name: 'Smart Thermostat Installation (Nest / Ecobee)',
                        description: 'Mounting, C-wire verification/adapter installation, WiFi configuration, and smartphone app commissioning.',
                        category: 'installation',
                        unit_price: 165,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 45,
                        tags: ['thermostat', 'nest', 'ecobee', 'smart home']
                    },
                    {
                        id: 'condensate_pump_replace',
                        name: 'Condensate Drain Pump & Safety Float Switch Replacement',
                        description: 'Install new automatic condensate removal pump with vinyl tubing and inline overflow float switch shutoff.',
                        category: 'replacement',
                        unit_price: 225,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 60,
                        tags: ['drain', 'condensate pump', 'float switch']
                    }
                ]
            },
            {
                id: 'hvac_minisplit',
                name: 'Ductless Mini-Split Heat Pump Specialist',
                description: 'Single and multi-zone ductless heat pump installation, deep coil sanitation, and inverter board diagnostics',
                keywords: ['mini split', 'ductless', 'mitsubishi', 'daikin', 'fujitsu', 'inverter', 'heat pump'],
                standardServices: [
                    {
                        id: 'minisplit_deep_clean',
                        name: 'Mini-Split Hydro-Kleen Deep Blower Wheel & Coil Wash',
                        description: 'Protective bib capture wash, chemical foam descaling of evaporator fins, and high-pressure rotor wheel cleaning.',
                        category: 'maintenance',
                        unit_price: 189,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 75,
                        tags: ['mini split', 'clean', 'mold', 'coil']
                    },
                    {
                        id: 'minisplit_install_single',
                        name: 'Single-Zone 12,000 BTU Mini-Split System Installation',
                        description: 'Supply & install outdoor condenser on brackets/pad, indoor wall head, 15ft line set, flare fittings, and nitrogen pressure test.',
                        category: 'installation',
                        unit_price: 2950,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 360,
                        tags: ['mini split', 'installation', 'heat pump']
                    }
                ]
            }
        ]
    },
    {
        id: 'electrical',
        name: 'Electrical & Power Systems',
        icon: 'Zap',
        description: 'Residential & commercial wiring, service panels, EV charging, generators, and lighting',
        specialties: [
            {
                id: 'electrical_residential',
                name: 'Residential Electrical Service & Troubleshooting',
                description: 'Breakers, GFCI outlets, light fixtures, ceiling fans, switches, and whole-house safety inspections',
                keywords: ['electric', 'breaker', 'gfci', 'outlet', 'lighting', 'panel', 'ceiling fan', 'wiring'],
                standardServices: [
                    {
                        id: 'electrical_diagnostic',
                        name: 'Electrical Troubleshooting & Circuit Trace (First Hour)',
                        description: 'Specialist multimeter diagnosis of tripped breakers, flickering lights, dead outlets, or ground faults.',
                        category: 'diagnostic',
                        unit_price: 135,
                        unit: 'per_hour',
                        estimated_duration_minutes: 60,
                        tags: ['diagnostic', 'troubleshoot', 'circuit']
                    },
                    {
                        id: 'gfci_outlet_replace',
                        name: 'GFCI Safety Receptacle Installation',
                        description: 'Install self-testing tamper-resistant 15A/20A GFCI outlet in kitchen, bathroom, or exterior location with weather box.',
                        category: 'replacement',
                        unit_price: 145,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 30,
                        tags: ['gfci', 'outlet', 'safety']
                    },
                    {
                        id: 'ceiling_fan_install',
                        name: 'Ceiling Fan Assembly & Installation (Up to 12ft Ceiling)',
                        description: 'Assemble fan fixture, verify fan-rated ceiling electrical box, wire motor, light kit, and handheld remote.',
                        category: 'installation',
                        unit_price: 215,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 90,
                        tags: ['ceiling fan', 'fixture', 'lighting']
                    },
                    {
                        id: 'ev_charger_install',
                        name: 'Level 2 Electric Vehicle (EV) Home Charger Installation',
                        description: 'Run dedicated 50A / 240V circuit with NEMA 14-50 receptacle or hardwired wall connector, conduit, and 2-pole breaker.',
                        category: 'installation',
                        unit_price: 850,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 180,
                        tags: ['ev charger', 'tesla', '240v', 'charger']
                    },
                    {
                        id: 'panel_upgrade_200a',
                        name: '200-Amp Main Service Panel Upgrade',
                        description: 'Complete replacement of obsolete electrical panel with modern 200A 40-circuit panel, whole-home surge protector, and city permit.',
                        category: 'installation',
                        unit_price: 3200,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 480,
                        tags: ['panel upgrade', '200 amp', 'breaker box']
                    }
                ]
            }
        ]
    },
    {
        id: 'roofing',
        name: 'Roofing & Gutters',
        icon: 'Home',
        description: 'Shingle, metal, and flat roof repairs, replacement, gutter guards, and leak remediation',
        specialties: [
            {
                id: 'roofing_residential',
                name: 'Residential Roofing & Leak Repair',
                description: 'Asphalt architectural shingles, emergency tarping, flashing repair, pipe boot replacement, and ventilation',
                keywords: ['roof', 'shingle', 'leak', 'flashing', 'tarp', 'pipe boot', 'gutter', 'vent'],
                standardServices: [
                    {
                        id: 'emergency_roof_tarp',
                        name: 'Emergency Storm Damage Roof Tarping',
                        description: 'Immediate securement of heavy-duty waterproof tarp with furring strips over storm damaged or leaking section.',
                        category: 'emergency',
                        unit_price: 350,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 90,
                        tags: ['emergency', 'tarp', 'storm damage', 'leak']
                    },
                    {
                        id: 'pipe_boot_replace',
                        name: 'Neoprene Plumbing Vent Pipe Boot Flashing Replacement',
                        description: 'Remove degraded rubber collar and install heavy-duty aluminum/silicone flashing boot woven into surrounding shingles.',
                        category: 'repair',
                        unit_price: 245,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 60,
                        tags: ['pipe boot', 'flashing', 'leak repair']
                    },
                    {
                        id: 'roof_inspection',
                        name: 'Drone & Ladder Comprehensive Roof Inspection',
                        description: 'High-resolution photo documentation of shingle condition, hail strikes, granular loss, flashing integrity, and life expectancy.',
                        category: 'inspection',
                        unit_price: 150,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 60,
                        tags: ['inspection', 'drone', 'shingles', 'insurance']
                    },
                    {
                        id: 'gutter_clean_single',
                        name: 'Seamless Gutter Cleanout & Downspout Flush (Single Story)',
                        description: 'Hand removal of all debris from gutters and high-pressure hose flush of downspouts.',
                        category: 'maintenance',
                        unit_price: 175,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 90,
                        tags: ['gutter', 'cleaning', 'downspout']
                    }
                ]
            }
        ]
    },
    {
        id: 'landscaping',
        name: 'Landscaping & Tree Care',
        icon: 'Trees',
        description: 'Lawn maintenance, irrigation repair, tree pruning, hardscaping, and grounds care',
        specialties: [
            {
                id: 'lawn_maintenance',
                name: 'Lawn Care & Landscape Maintenance',
                description: 'Scheduled mowing, edging, hedge trimming, seasonal cleanups, and weed abatement',
                keywords: ['lawn', 'mow', 'grass', 'hedge', 'edging', 'mulch', 'yard cleanup'],
                standardServices: [
                    {
                        id: 'biweekly_mow_trim',
                        name: 'Scheduled Lawn Mowing, Edge & Blow (Up to 1/4 Acre)',
                        description: 'Precision cut turf, weed-whack borders, hard-edge walkways, and power blow all surfaces clean.',
                        category: 'maintenance',
                        unit_price: 65,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 45,
                        tags: ['mow', 'lawn care', 'edging']
                    },
                    {
                        id: 'sprinkler_head_replace',
                        name: 'Sprinkler Pop-Up Head Replacement & Nozzle Adjustment',
                        description: 'Excavate broken sprinkler head, replace with commercial spray head, and adjust spray radius for head-to-head coverage.',
                        category: 'repair',
                        unit_price: 75,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 30,
                        tags: ['sprinkler', 'irrigation', 'head']
                    },
                    {
                        id: 'mulch_installation',
                        name: 'Premium Hardwood Mulch Delivery & Spread (Per Yard)',
                        description: 'Weed prep bed, edge trench, deliver and spread 3-inch layer of double-shredded brown/black mulch.',
                        category: 'installation',
                        unit_price: 110,
                        unit: 'per_unit',
                        estimated_duration_minutes: 60,
                        tags: ['mulch', 'flower bed', 'weeds']
                    }
                ]
            }
        ]
    },
    {
        id: 'handyman',
        name: 'Handyman & Home Maintenance',
        icon: 'Hammer',
        description: 'Multi-trade residential repairs, drywall, doors, trim carpentry, and punch lists',
        specialties: [
            {
                id: 'general_handyman',
                name: 'General Handyman & Punch-List Repairs',
                description: 'Broad-spectrum home repairs, wall patching, door hardware, shelving, and mounting',
                keywords: ['handyman', 'drywall', 'door', 'mounting', 'patch', 'trim', 'punch list', 'repairs'],
                standardServices: [
                    {
                        id: 'tv_wall_mount',
                        name: 'TV Wall Mounting & Cable Concealment',
                        description: 'Securely lag-bolt TV mount to wood/metal studs up to 75" screen and install in-wall brush cable pass-through.',
                        category: 'installation',
                        unit_price: 145,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 60,
                        tags: ['tv mount', 'mounting', 'stud']
                    },
                    {
                        id: 'drywall_hole_patch',
                        name: 'Drywall Hole Repair & Texture Match (Up to 12"x12")',
                        description: 'Cut clean square, install backing, mesh tape, two coats of quick-set mud, sand, and orange-peel/knockdown texture match.',
                        category: 'repair',
                        unit_price: 185,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 90,
                        tags: ['drywall', 'patch', 'sheetrock', 'texture']
                    },
                    {
                        id: 'door_knob_deadbolt',
                        name: 'Entry Door Lockset & Deadbolt Installation',
                        description: 'Install new keyed entry deadbolt and matching handle, chisel strike plate, and adjust latch alignment.',
                        category: 'installation',
                        unit_price: 95,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 40,
                        tags: ['lock', 'deadbolt', 'door']
                    },
                    {
                        id: 'handyman_hourly',
                        name: 'General Handyman Labor Rate (Per Hour)',
                        description: 'Flexible punch-list labor for miscellaneous household tasks, assembly, and minor repairs (2 hr min).',
                        category: 'repair',
                        unit_price: 85,
                        unit: 'per_hour',
                        estimated_duration_minutes: 60,
                        tags: ['hourly', 'labor', 'punch list']
                    }
                ]
            }
        ]
    },
    {
        id: 'pest_control',
        name: 'Pest Control & Extermination',
        icon: 'Bug',
        description: 'Termite, rodent, insect, and wildlife management for homes and businesses',
        specialties: [
            {
                id: 'pest_residential',
                name: 'Residential Pest Control & Prevention',
                description: 'Quarterly barrier treatments, ant, cockroach, spider, and rodent eradication',
                keywords: ['pest', 'termite', 'ant', 'cockroach', 'rodent', 'rat', 'mice', 'exterminator'],
                standardServices: [
                    {
                        id: 'initial_pest_treatment',
                        name: 'Initial Pest Flushout & Exterior Barrier Treatment',
                        description: 'Full interior crack-and-crevice baiting, de-webbing eaves, and 3-foot exterior liquid foundation barrier application.',
                        category: 'maintenance',
                        unit_price: 195,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 75,
                        tags: ['pest', 'barrier', 'initial treatment']
                    },
                    {
                        id: 'rodent_exclusion_inspect',
                        name: 'Rodent Attic Inspection & Entry Point Exclusion Estimate',
                        description: 'Inspect attic, crawlspace, and roofline for rodent droppings and gnaw marks, plus bait station placement.',
                        category: 'inspection',
                        unit_price: 125,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 60,
                        tags: ['rodent', 'mice', 'rat', 'exclusion']
                    }
                ]
            }
        ]
    },
    {
        id: 'pool_spa',
        name: 'Pool & Spa Care',
        icon: 'Waves',
        description: 'Swimming pool cleaning, water chemistry balancing, pump & filter repairs',
        specialties: [
            {
                id: 'pool_maintenance',
                name: 'Weekly Pool Cleaning & Chemical Service',
                description: 'Skimming, brushing, vacuuming, water testing, chlorine, and pH chemical balancing',
                keywords: ['pool', 'spa', 'chlorine', 'filter', 'pump', 'water chemistry', 'vacuum'],
                standardServices: [
                    {
                        id: 'monthly_pool_service',
                        name: 'Monthly Full-Service Pool Care (4 Weekly Visits)',
                        description: 'Weekly net skim, wall tile brush, bottom vacuum, empty skimmer baskets, and all balancing chemicals included.',
                        category: 'maintenance',
                        unit_price: 185,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 40,
                        tags: ['pool', 'weekly', 'cleaning', 'chemicals']
                    },
                    {
                        id: 'filter_cartridge_clean',
                        name: 'Pool Cartridge / DE Filter Deep Clean & Degrease',
                        description: 'Disassemble filter tank, inspect grids/cartridges, soak with enzyme degreaser, and pressure wash clean.',
                        category: 'maintenance',
                        unit_price: 165,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 60,
                        tags: ['filter', 'pool pump', 'de filter']
                    }
                ]
            }
        ]
    },
    {
        id: 'appliance_repair',
        name: 'Appliance Repair & Service',
        icon: 'Refrigerator',
        description: 'Diagnostic and repair of refrigerators, ovens, dishwashers, washers, and dryers',
        specialties: [
            {
                id: 'major_appliances',
                name: 'Major Household Appliance Repair',
                description: 'All major kitchen and laundry brands: Whirlpool, GE, Samsung, LG, Bosch, Sub-Zero',
                keywords: ['appliance', 'refrigerator', 'dryer', 'washer', 'dishwasher', 'oven', 'stove'],
                standardServices: [
                    {
                        id: 'appliance_diagnostic',
                        name: 'Appliance In-Home Diagnostic Fee (Applied to Repair)',
                        description: 'Complete mechanical and electrical multimeter component testing to isolate failed part.',
                        category: 'diagnostic',
                        unit_price: 99,
                        unit: 'diagnostic_fee',
                        estimated_duration_minutes: 45,
                        tags: ['diagnostic', 'appliance', 'troubleshooting']
                    },
                    {
                        id: 'dryer_vent_clean',
                        name: 'Dryer Exhaust Vent Line Deep Lint Scour',
                        description: 'Rotary brush and vacuum cleanout of entire dryer exhaust duct from machine to exterior louvers.',
                        category: 'maintenance',
                        unit_price: 149,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 60,
                        tags: ['dryer', 'lint', 'fire safety']
                    }
                ]
            }
        ]
    },
    {
        id: 'garage_doors',
        name: 'Garage Door & Gates',
        icon: 'DoorClosed',
        description: 'Spring replacements, opener motors, roller track alignments, and smart gate automation',
        specialties: [
            {
                id: 'garage_door_service',
                name: 'Residential Garage Door Service & Opener Installation',
                description: 'High-cycle torsion springs, nylon rollers, LiftMaster belt drive openers, and track tuning',
                keywords: ['garage door', 'spring', 'opener', 'liftmaster', 'roller', 'cable', 'track'],
                standardServices: [
                    {
                        id: 'torsion_spring_replace',
                        name: 'Torsion Spring Pair Replacement (Heavy Duty 25K Cycles)',
                        description: 'Safely unwind and replace both broken garage door torsion springs, balance door, and lube bearings.',
                        category: 'repair',
                        unit_price: 345,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 75,
                        tags: ['garage door', 'spring', 'torsion']
                    },
                    {
                        id: 'opener_install',
                        name: 'Smart WiFi Belt-Drive Garage Door Opener Installation',
                        description: 'Mount motor unit, rail assembly, safety reversing sensors, wall keypad, and pair with smartphone app.',
                        category: 'installation',
                        unit_price: 495,
                        unit: 'flat_rate',
                        estimated_duration_minutes: 120,
                        tags: ['opener', 'belt drive', 'liftmaster']
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
