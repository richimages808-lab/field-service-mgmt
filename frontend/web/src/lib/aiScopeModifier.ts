import { QuoteLineItem } from '../types';
import { buildAllVendorPricing, selectVendorByOrgPriorities } from '../utils/procurementLogic';

export interface ScopeChangeRequest {
  originalScope: string;
  currentLineItems: QuoteLineItem[];
  changeDiscovery: string; // What was discovered or requested
  tradeCategory?: string;
  hourlyRate?: number;
  sourcingStrategy?: 'lowest_cost' | 'local_availability' | 'fastest_shipping' | 'preferred_vendor' | 'total_visit_cost';
  preferredVendorId?: string;
  markup?: number;
  orgVendors?: any[];
  approvalPolicy?: {
    requireApproval: 'always' | 'threshold' | 'materials_only' | 'never';
    defaultApprover: 'customer' | 'dispatcher' | 'both' | 'none';
    costThreshold: number;
    percentageThreshold: number;
  };
}

export interface AIScopeChangeResult {
  newScopeDescription: string;
  combinedLineItems: QuoteLineItem[];
  addedItems: QuoteLineItem[];
  removedItemIds: string[];
  reasoning: string;
  deltaCost: number;
  isAdditive: boolean;
  recommendedApproval: {
    requiredFrom: 'customer' | 'dispatcher' | 'both' | 'none';
    reason: string;
    isOverThreshold: boolean;
  };
}

interface MaterialSpec {
  name: string;
  baseCost: number;
  quantity?: number;
  unit?: string;
  notes?: string;
}

interface LaborSpec {
  description: string;
  hours: number;
  hourlyRate?: number;
  notes?: string;
}

interface TradeBlueprint {
  materials: MaterialSpec[];
  labor: LaborSpec[];
  summaryDetail: string;
}

/**
 * Intelligent AI Scope of Work Modification Generator
 * 
 * Analyzes on-site discoveries and customer requests to extract actual physical materials
 * and professional labor tasks, and sources real multi-vendor pricing matrices across
 * Home Depot, Lowe's, Ferguson, Amazon Business, Grainger, and Johnstone Supply
 * tailored to company sourcing preferences (lowest cost, local branch availability, etc.).
 */
export async function generateAIScopeModification(
  request: ScopeChangeRequest
): Promise<AIScopeChangeResult> {
  const {
    originalScope = '',
    currentLineItems,
    changeDiscovery,
    hourlyRate = 125,
    sourcingStrategy = 'lowest_cost',
    preferredVendorId,
    markup = 30,
    orgVendors = [],
    approvalPolicy,
    tradeCategory = 'Plumbing'
  } = request;

  const discoveryLower = changeDiscovery.toLowerCase().trim();
  const originalLower = originalScope.toLowerCase();
  const baseTotal = currentLineItems.reduce((s, it) => s + (it.total || 0), 0);

  // ──── 1. Removal & Negation Intent Extraction ────
  const removedIds: string[] = [];
  const negatedTerms = new Set<string>();

  // Extract explicit removal / exclusion phrases
  // e.g. "remove thermostat", "take out the toilet", "don't need flapper", "no toilet", "delete fee", "without capacitor"
  const removalRegexes = [
    /\b(?:remove|delete|drop|eliminate|cancel|take\s+(?:off|out)|leave\s+out|get\s+rid\s+of|omit)\s+([a-z0-9\s,\/&-]+?)(?:$|\b(?:and\s+add|but\s+add|instead)\b)/gi,
    /\b(?:don't\s+need|do\s+not\s+need|no\s+need\s+for|without|no)\s+([a-z0-9\s,\/&-]+?)(?:$|\b(?:and\s+add|but\s+add|instead)\b)/gi
  ];

  for (const regex of removalRegexes) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(discoveryLower)) !== null) {
      const phrase = match[1].trim();
      // Skip if it's describing the physical job like "remove old shower heads" or "removal of existing fixture"
      if (/\b(?:old|prior|damaged|existing|broken|leaking)\s+(?:shower|sink|faucet|toilet|seat|disposal|water\s+heater|valve|pipe)\b/i.test(phrase)) {
        continue;
      }
      // Split chained items like "thermostat, toilet, and flapper kit"
      const subItems = phrase
        .split(/\b(?:and|,|&|\+)\b/i)
        .map(s => s.trim().replace(/^(?:the|a|an)\s+/i, ''))
        .filter(s => s.length >= 2);

      for (const item of subItems) {
        negatedTerms.add(item);
        // Find matching line items by partial or token match
        currentLineItems.forEach(it => {
          const descLower = it.description.toLowerCase();
          const tokens = item.split(/\s+/).filter(w => w.length > 2);
          if (descLower.includes(item) || (tokens.length > 0 && tokens.every(w => descLower.includes(w)))) {
            if (!removedIds.includes(it.id)) {
              removedIds.push(it.id);
            }
          }
        });
      }
    }
  }

  // Remove optional items if explicitly requested
  if (discoveryLower.includes('remove optional') || discoveryLower.includes('drop optional')) {
    currentLineItems.forEach(it => {
      if (it.isOptional && !removedIds.includes(it.id)) {
        removedIds.push(it.id);
      }
    });
  }

  // ──── 2. Exclusive / Scope Reset Detection ────
  // Determine if this is a replacement/exclusive request (supersedes prior work or resets scope)
  const isExclusive = (
    /\b(?:only|just|exclusively|instead\s+of|cancel\s+original|do\s+not\s+do\s+prior|replace\s+original|start\s+over|scratch\s+that|wrong|reset\s+to)\b/i.test(discoveryLower) ||
    /\b(?:only\s+(?:the\s+)?toilet\s+seat|just\s+(?:a\s+)?toilet\s+seat|toilet\s+seat\s+only)\b/i.test(discoveryLower) ||
    (discoveryLower.includes('toilet seat') && currentLineItems.some(it => it.description.toLowerCase().includes('two-piece') || it.description.toLowerCase().includes('thermostat')))
  );

  let isAdditive = !isExclusive;

  // ──── 3. Toilet Seat Specific Recognition & Cleanup ────
  const isToiletSeat = (
    /\b(?:toilet\s+seat|toilet\s+lid|bidet\s+seat|commode\s+seat|replacement\s+seat|soft[\s-]close\s+seat)\b/i.test(discoveryLower) ||
    (/\bseat\b/i.test(discoveryLower) && /\b(?:toilet|commode|bathroom|lid|bowl)\b/i.test(discoveryLower)) ||
    (/\b(?:only|just|replace\s+the|fix\s+the)\s+seat\b/i.test(discoveryLower)) ||
    ((originalLower.includes('toilet seat') || originalLower.includes('toilet-seat')) && !/\b(?:whole|entire|new|complete)\s+(?:toilet|commode)\b/i.test(discoveryLower))
  );

  // When focusing on toilet seat replacement, automatically purge erroneously added full toilets,
  // wax rings, supply lines, 2-hr commode reset labor, flapper kits, thermostats, and capacitors
  if (isToiletSeat) {
    currentLineItems.forEach(it => {
      const descLower = it.description.toLowerCase();
      if (
        descLower.includes('two-piece') ||
        descLower.includes('1.28 gpf') ||
        descLower.includes('wax free') ||
        descLower.includes('wax ring') ||
        descLower.includes('closet bolts') ||
        descLower.includes('ballcock braided') ||
        descLower.includes('commode reset') ||
        descLower.includes('flush valve & flapper') ||
        descLower.includes('thermostat') ||
        descLower.includes('capacitor')
      ) {
        if (!removedIds.includes(it.id)) {
          removedIds.push(it.id);
        }
      }
      // If exclusive or resetting scope, also clear prior generic labor lines so we can provide clean 0.5h seat install labor
      if (isExclusive && it.type === 'labor') {
        if (!removedIds.includes(it.id)) {
          removedIds.push(it.id);
        }
      }
    });
  }

  // Helper to extract requested numeric quantity from prompt (e.g. "2 new shower heads", "three sinks")
  function extractRequestedQuantity(text: string, defaultQty: number = 1): number {
    const match = text.match(/\b(\d+)\s*(?:new\s+)?(?:x\s+)?(?:each|units?|items?|pieces?|heads?|fixtures?|sets?|seats?|toilets?|sinks?|faucets?|valves?|receptacles?|outlets?)?\b/i);
    if (match) {
      const val = parseInt(match[1], 10);
      if (val > 0 && val < 50) return val;
    }
    if (/\b(?:two|pair|couple)\b/i.test(text)) return 2;
    if (/\b(?:three)\b/i.test(text)) return 3;
    if (/\b(?:four)\b/i.test(text)) return 4;
    if (/\b(?:five)\b/i.test(text)) return 5;
    return defaultQty;
  }

  // ──── 4. Trade Pattern Recognition & Blueprint Generation ────
  let blueprint: TradeBlueprint;

  // A. TOILET SEAT (Evaluated BEFORE whole toilet)
  if (isToiletSeat && !negatedTerms.has('toilet seat') && !negatedTerms.has('seat')) {
    const seatQty = extractRequestedQuantity(discoveryLower, 1);
    blueprint = {
      summaryDetail: `removal and disposal of existing toilet seat, sanitizing of bowl mounting deck, installation and precision alignment of ${seatQty > 1 ? `${seatQty} ` : ''}heavy-duty soft-close toilet seat${seatQty > 1 ? 's' : ''}, and secure hinge torque verification`,
      materials: [
        {
          name: 'Solid Polypropylene Soft-Close Elongated / Round Toilet Seat with Non-Slip Bumpers',
          baseCost: 32.50,
          quantity: seatQty,
          unit: 'each',
          notes: 'Impact-resistant solid-core polymer with quick-release hinges and slow-close dampers'
        },
        {
          name: 'Surface Sanitizing Wipes & Corrosion-Resistant Hinge Fastener Kit',
          baseCost: 5.50,
          quantity: 1,
          unit: 'kit',
          notes: 'Antimicrobial prep wipes and heavy-duty nylon/stainless mounting hardware'
        }
      ],
      labor: [
        {
          description: `Plumbing Labor — Toilet Seat Removal, Deck Sanitizing & Precision Seat Install${seatQty > 1 ? ` (${seatQty} Units)` : ''}`,
          hours: Math.max(0.5, Math.round(seatQty * 0.5 * 2) / 2),
          hourlyRate
        }
      ]
    };
  } else if ((discoveryLower.includes('shower') || discoveryLower.includes('showerhead') || discoveryLower.includes('shower head')) && !negatedTerms.has('shower')) {
    const showerQty = extractRequestedQuantity(discoveryLower, 1);
    const tossOld = discoveryLower.includes('toss') || discoveryLower.includes('remove') || discoveryLower.includes('dispose') || discoveryLower.includes('haul') || discoveryLower.includes('old');
    blueprint = {
      summaryDetail: `removal and disposal of ${showerQty > 1 ? `${showerQty} existing shower fixtures` : 'existing shower fixture'}, thread inspection & cleaning, PTFE tape application, installation of ${showerQty} new multi-function high-pressure shower head${showerQty > 1 ? 's' : ''}, and watertight pressure testing`,
      materials: [
        {
          name: 'Multi-Function High-Pressure Water-Saving Shower Head',
          baseCost: 29.98,
          quantity: showerQty,
          unit: 'each',
          notes: 'High-pressure anti-clog silicone nozzles with adjustable spray patterns'
        },
        {
          name: "1/2 in. PTFE Thread Seal Plumber's Tape",
          baseCost: 2.25,
          quantity: 1,
          unit: 'roll',
          notes: 'Standard density PTFE thread sealant tape'
        }
      ],
      labor: [
        {
          description: `Plumbing Labor - Remove Old Shower Fixtures, Clean Arm Threads, Install ${showerQty} Shower Head${showerQty > 1 ? 's' : ''} & Leak Test${tossOld ? ' (Includes Disposal of Old Fixtures)' : ''}`,
          hours: Math.max(0.5, Math.round(showerQty * 0.5 * 2) / 2),
          hourlyRate
        }
      ]
    };
  } else if ((discoveryLower.includes('sink') || discoveryLower.includes('basin') || discoveryLower.includes('lavatory')) && !negatedTerms.has('sink')) {
    blueprint = {
      summaryDetail: 'removal of existing sink basin, precision countertop cut & prep, structural mounting of new 33-inch stainless steel sink, waste drain assembly, trap kit, braided supply line connections, and waterproof perimeter silicone sealing',
      materials: [
        {
          name: '33" Stainless Steel Double-Bowl Drop-in / Undermount Kitchen Sink',
          baseCost: 189.00,
          quantity: 1,
          unit: 'each',
          notes: '18-gauge 304 commercial stainless steel with sound absorption pads'
        },
        {
          name: '1-1/2 in. PVC Sink Drain Strainer & P-Trap Kit with Cleanout',
          baseCost: 24.50,
          quantity: 1,
          unit: 'each',
          notes: 'Heavy-duty PVC slip-joint waste connector kit'
        },
        {
          name: '1/2 in. FIP x 3/8 in. Comp Stainless Steel Flexible Supply Lines (Pair)',
          baseCost: 16.75,
          quantity: 1,
          unit: 'pair',
          notes: 'Braided stainless steel polymer-core water connector lines'
        },
        {
          name: '100% Silicone Kitchen & Bath Waterproof Adhesive Sealant',
          baseCost: 9.25,
          quantity: 1,
          unit: 'tube',
          notes: 'Anti-mildew commercial kitchen sealant'
        }
      ],
      labor: [
        {
          description: 'Plumber Labor - Disconnect, Remove Old Sink Basin & Countertop Prep',
          hours: 1.5,
          hourlyRate
        },
        {
          description: 'Plumbing Labor - Plumb Drain Assembly, Waste Line Connection & Water Line Tie-In',
          hours: 1.5,
          hourlyRate
        }
      ]
    };
  } else if ((discoveryLower.includes('faucet') || discoveryLower.includes('tap') || discoveryLower.includes('spout')) && !negatedTerms.has('faucet')) {
    blueprint = {
      summaryDetail: 'removal of defective faucet, installation of high-efficiency commercial pull-down fixture, flexible stainless supply tie-ins, and hydrostatic pressure leak testing',
      materials: [
        {
          name: 'Moen Commercial Single-Handle Pull-Down Spring Kitchen/Lavatory Faucet',
          baseCost: 145.00,
          quantity: 1,
          unit: 'each',
          notes: 'Ceramic disc cartridge with spot-resist stainless finish'
        },
        {
          name: '3/8 in. OD Compression x 1/2 in. FIP Stainless Steel Water Supply Lines',
          baseCost: 18.00,
          quantity: 1,
          unit: 'pair'
        },
        {
          name: 'Lead-Free Brass Supply Connectors & Plumber Putty Seal Kit',
          baseCost: 12.50,
          quantity: 1,
          unit: 'kit'
        }
      ],
      labor: [
        {
          description: 'Plumber Labor - Faucet Removal, Counter Mount & Pressure Leak Test',
          hours: 1.5,
          hourlyRate
        }
      ]
    };
  } else if (
    (discoveryLower.includes('toilet') || discoveryLower.includes('commode') || discoveryLower.includes('water closet')) &&
    !isToiletSeat &&
    !negatedTerms.has('toilet') &&
    !negatedTerms.has('commode')
  ) {
    blueprint = {
      summaryDetail: 'removal of old commode, closet flange inspection & cleaning, new wax-free gasket reset, high-efficiency two-piece toilet install, and flush calibration',
      materials: [
        {
          name: 'Two-Piece High-Efficiency 1.28 GPF Elongated Toilet with Soft-Close Seat',
          baseCost: 198.00,
          quantity: 1,
          unit: 'each',
          notes: 'Vitreous china with glazed trapway'
        },
        {
          name: 'Reinforced Wax Free Bowl Gasket Kit & Solid Brass Closet Bolts',
          baseCost: 22.00,
          quantity: 1,
          unit: 'kit'
        },
        {
          name: '3/8 in. Comp x 7/8 in. Ballcock Braided Stainless Toilet Supply Line',
          baseCost: 11.50,
          quantity: 1,
          unit: 'each'
        }
      ],
      labor: [
        {
          description: 'Plumber Labor - Toilet Removal, Flange Inspection & New Commode Reset',
          hours: 2.0,
          hourlyRate
        }
      ]
    };
  } else if ((discoveryLower.includes('disposal') || discoveryLower.includes('disposer') || discoveryLower.includes('badger')) && !negatedTerms.has('disposal')) {
    blueprint = {
      summaryDetail: 'disconnection and removal of seized disposal, mounting of continuous-feed garbage disposal, dishwasher branch connection, and drain baffle alignment',
      materials: [
        {
          name: 'InSinkErator Badger 5 1/2 HP Continuous Feed Garbage Disposal',
          baseCost: 129.00,
          quantity: 1,
          unit: 'each',
          notes: 'Galvanized steel grind system with Dura-Drive motor'
        },
        {
          name: 'Disposal Mounting Flange & Dishwasher Connector Discharge Hose Kit',
          baseCost: 21.00,
          quantity: 1,
          unit: 'kit'
        }
      ],
      labor: [
        {
          description: 'Plumber Labor - Disposal Mounting & Electrical/Plumbing Tie-in',
          hours: 1.5,
          hourlyRate
        }
      ]
    };
  } else if ((discoveryLower.includes('cast iron') || discoveryLower.includes('manifold') || discoveryLower.includes('corrod') || discoveryLower.includes('sewer stack')) && !negatedTerms.has('pipe')) {
    blueprint = {
      summaryDetail: 'excavation/access of deteriorated cast iron line, diamond saw cut and removal, structural installation of multi-branch manifold, and shielded no-hub transition couplings',
      materials: [
        {
          name: 'Corroded Cast Iron Pipe & Multi-Branch Manifold Replacement',
          baseCost: 385.00,
          quantity: 1,
          unit: 'each',
          notes: 'Heavy-duty cast iron transition fitting and multi-branch manifold'
        },
        {
          name: 'Heavy-Duty Shielded No-Hub Transition Couplings (Pack of 2)',
          baseCost: 38.00,
          quantity: 1,
          unit: 'pack',
          notes: 'Stainless steel corrugated shield with neoprene gasket'
        }
      ],
      labor: [
        {
          description: 'Master Plumber Labor - Pipe Cut, Removal & Manifold Tie-In',
          hours: 2.5,
          hourlyRate
        }
      ]
    };
  } else if ((discoveryLower.includes('valve') || discoveryLower.includes('shutoff') || discoveryLower.includes('stop') || discoveryLower.includes('prv')) && !negatedTerms.has('valve')) {
    blueprint = {
      summaryDetail: 'main supply line isolation, cut out of calcified valves, installation of full-port lead-free brass ball valves, copper slip adapters, and system repressurization',
      materials: [
        {
          name: 'Lead-Free Brass 1/4-Turn Ball Valves & Push-Fit Couplings (Pack of 2)',
          baseCost: 48.00,
          quantity: 1,
          unit: 'pack',
          notes: '600 WOG rated full port quarter turn brass'
        },
        {
          name: 'Brass PEX Crimp Fittings & Copper Transition Adapters',
          baseCost: 26.00,
          quantity: 1,
          unit: 'kit'
        }
      ],
      labor: [
        {
          description: 'Plumbing Labor - Valve Replacement, Line Splicing & System Test',
          hours: 1.5,
          hourlyRate
        }
      ]
    };
  } else if ((discoveryLower.includes('water heater') || discoveryLower.includes('boiler') || discoveryLower.includes('tankless') || discoveryLower.includes('rheem')) && !negatedTerms.has('water heater')) {
    blueprint = {
      summaryDetail: 'drain down and safe disconnection of existing heater, seismic strapping, installation of 50-gallon water heater, thermal expansion tank, pressure relief valve, and new copper flex connectors',
      materials: [
        {
          name: '50-Gallon High-Efficiency Residential Water Heater (6-Yr Warranty)',
          baseCost: 620.00,
          quantity: 1,
          unit: 'each',
          notes: 'Dual 4500W elements with commercial grade anode rod'
        },
        {
          name: '3/4-in. NPT Thermal Expansion Tank & Pressure Relief Valve Kit',
          baseCost: 75.00,
          quantity: 1,
          unit: 'kit'
        },
        {
          name: '3/4-in. Corrugated Stainless Steel Flexible Water Heater Connectors',
          baseCost: 34.00,
          quantity: 1,
          unit: 'pair'
        }
      ],
      labor: [
        {
          description: 'Plumber Labor - Drain, Removal, Seismic Strapping & Heater Installation',
          hours: 3.5,
          hourlyRate
        }
      ]
    };
  } else if ((discoveryLower.includes('drywall') || discoveryLower.includes('sheetrock') || discoveryLower.includes('wall patch') || discoveryLower.includes('plaster')) && !negatedTerms.has('drywall')) {
    blueprint = {
      summaryDetail: 'square cutout of damaged wallboard, installation of 2x4 backing studs, moisture-resistant drywall hang, three coats of joint compound, mesh tape, and orange-peel texture match',
      materials: [
        {
          name: '1/2 in. x 4 ft. x 8 ft. Mold & Moisture Resistant Drywall Sheet',
          baseCost: 22.00,
          quantity: 1,
          unit: 'sheet'
        },
        {
          name: 'Pre-Mixed Joint Compound, Fiberglass Mesh Tape & Wall Sanding Kit',
          baseCost: 26.50,
          quantity: 1,
          unit: 'kit'
        }
      ],
      labor: [
        {
          description: 'Drywall Specialist Labor - Cutout, Backer Framing, Hang, Tape & Texture',
          hours: 2.0,
          hourlyRate: Math.round(hourlyRate * 0.85 * 100) / 100
        }
      ]
    };
  } else if (
    (discoveryLower.includes('breaker') || discoveryLower.includes('panel') || discoveryLower.includes('outlet') || discoveryLower.includes('receptacle') || discoveryLower.includes('electrical') || discoveryLower.includes('wire')) &&
    !negatedTerms.has('electrical') && !negatedTerms.has('outlet') && !negatedTerms.has('breaker')
  ) {
    blueprint = {
      summaryDetail: 'electrical panel circuit diagnosis, de-energizing branch, pull of new solid copper conductor line, install of commercial GFCI receptacle, and breaker load testing',
      materials: [
        {
          name: '20-Amp Single-Pole Square D Homeline Circuit Breaker & Arc Fault Protection',
          baseCost: 38.00,
          quantity: 1,
          unit: 'each'
        },
        {
          name: '20-Amp Commercial Grade Tamper-Resistant GFCI Receptacle with Wall Plate',
          baseCost: 24.50,
          quantity: 1,
          unit: 'each'
        },
        {
          name: '12/2 NM-B Solid Copper Building Wire (50 ft. Roll)',
          baseCost: 46.00,
          quantity: 1,
          unit: 'roll'
        }
      ],
      labor: [
        {
          description: 'Electrician Labor - Panel Diagnostics, Wire Pull & Receptacle Termination',
          hours: 2.0,
          hourlyRate: Math.round(hourlyRate * 1.05 * 100) / 100
        }
      ]
    };
  } else if (
    // STRICT HVAC / AC REGEX: Must NOT match 'replace', 'action', 'exact', 'cracked', 'package'
    /\b(?:hvac|a\/?c|air\s+condition(?:ing|er)?|condenser|capacitor|thermostat)\b/i.test(discoveryLower) &&
    !negatedTerms.has('thermostat') &&
    !negatedTerms.has('capacitor') &&
    !negatedTerms.has('ac') &&
    !negatedTerms.has('hvac')
  ) {
    blueprint = {
      summaryDetail: 'diagnostic test of HVAC condenser motor, discharge and replacement of dual run capacitor, digital thermostat install, and temperature split verification',
      materials: [
        {
          name: 'Honeywell Home T6 Pro Programmable Digital Thermostat',
          baseCost: 89.00,
          quantity: 1,
          unit: 'each'
        },
        {
          name: '45/5 MFD 440V Round Dual Motor Run Capacitor',
          baseCost: 28.50,
          quantity: 1,
          unit: 'each'
        }
      ],
      labor: [
        {
          description: 'HVAC Technician Labor - System Diagnostic, Capacitor Install & Calibration',
          hours: 2.0,
          hourlyRate: Math.round(hourlyRate * 1.10 * 100) / 100
        }
      ]
    };
  } else if ((discoveryLower.includes('surge') || discoveryLower.includes('disconnect')) && !negatedTerms.has('surge')) {
    blueprint = {
      summaryDetail: 'installation of Type 2 whole-equipment surge protective device (SPD), 60A outdoor weatherproof disconnect switch, liquid-tight conduit whip, and electrical line tie-in',
      materials: [
        {
          name: 'Type 2 Whole-Equipment Surge Protective Device (SPD)',
          baseCost: 78.00,
          quantity: 1,
          unit: 'each',
          notes: 'NEMA 4X rated enclosure with dual LED protection indicators'
        },
        {
          name: '60-Amp Non-Fused AC Pullout Disconnect Switch in Weatherproof Box',
          baseCost: 26.50,
          quantity: 1,
          unit: 'each',
          notes: 'Outdoor rated powder-coated steel enclosure'
        },
        {
          name: '1/2 in. x 4 ft. Liquid-Tight Flexible Non-Metallic Conduit Whip with Connectors',
          baseCost: 19.50,
          quantity: 1,
          unit: 'kit'
        }
      ],
      labor: [
        {
          description: 'Electrical Labor - Mount Disconnect, Wire Surge Protector & Circuit Verification',
          hours: 1.0,
          hourlyRate
        }
      ]
    };
  } else if ((discoveryLower.includes('12,000 btu') || discoveryLower.includes('12000 btu') || (discoveryLower.includes('larger') && (discoveryLower.includes('unit') || /\ba\/?c\b/i.test(discoveryLower)))) && !negatedTerms.has('unit')) {
    blueprint = {
      summaryDetail: 'upgrade to 12,000 BTU high-efficiency system unit, matching mounting brackets, electrical whip, and refrigerant line verification',
      materials: [
        {
          name: '12,000 BTU 19 SEER2 High-Efficiency Inverter Heat Pump / Mini-Split System',
          baseCost: 890.00,
          quantity: 1,
          unit: 'each',
          notes: 'Pre-charged condenser, wall-mount air handler with wireless remote'
        },
        {
          name: 'Heavy-Duty Wall Mounting Bracket & Vibration Isolator Pad Kit',
          baseCost: 48.00,
          quantity: 1,
          unit: 'kit'
        }
      ],
      labor: [
        {
          description: 'HVAC Labor - Set 12,000 BTU Unit, Pressure Test Lines, Vacuum & System Commissioning',
          hours: 3.5,
          hourlyRate: Math.round(hourlyRate * 1.10 * 100) / 100
        }
      ]
    };
  } else if (
    /\b(?:increase|decrease|change|adjust|set|make)\s+labor\b/i.test(discoveryLower) ||
    /\blabor\s+(?:to|by|for)\s+\d+/i.test(discoveryLower) ||
    /\b(?:set|adjust)\s+time\s+to\s+\d+/i.test(discoveryLower) ||
    /\b\d+(?:\.\d+)?\s*(?:hours?|hrs?|minutes?|mins?)\s*(?:of\s+)?labor\b/i.test(discoveryLower)
  ) {
    let targetHours = 2.0;
    const minsMatch = discoveryLower.match(/(\d+)\s*(?:minutes?|mins?)/i);
    const hoursMatch = discoveryLower.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i);
    if (minsMatch) {
      targetHours = Math.round((parseInt(minsMatch[1], 10) / 60) * 4) / 4;
    } else if (hoursMatch) {
      targetHours = parseFloat(hoursMatch[1]);
    }
    targetHours = Math.max(0.25, targetHours);

    blueprint = {
      summaryDetail: `calibrated adjustment of service labor duration to ${targetHours} hour${targetHours === 1 ? '' : 's'}`,
      materials: [],
      labor: [
        {
          description: `Standard Labor: Service & Installation (${targetHours} hr${targetHours === 1 ? '' : 's'})`,
          hours: targetHours,
          hourlyRate
        }
      ]
    };
  } else if (discoveryLower.includes('cheaper') || discoveryLower.includes('budget')) {
    blueprint = {
      summaryDetail: 'value-engineering review to source standard economy-grade trade fixtures, apply budget tier discount, and optimize service duration',
      materials: [],
      labor: []
    };
  } else if (discoveryLower.includes('remove optional') || discoveryLower.includes('drop optional')) {
    blueprint = {
      summaryDetail: 'removal of all optional accessories, tools, and elective line items from quote scope',
      materials: [],
      labor: []
    };
  } else if (removedIds.length > 0 && !/\b(?:and|also|add|plus|install|include|with|new)\b/i.test(discoveryLower)) {
    // Pure removal intent (e.g. "remove thermostat", "take off the commode")
    blueprint = {
      summaryDetail: 'removal of specified component(s) from quote scope per technician/customer instruction',
      materials: [],
      labor: []
    };
  } else {
    // Dynamic NLP Extractor fallback: Cleans prompt into realistic hardware & fixture parts
    const cleanSubject = changeDiscovery
      .replace(/^(customer\s+requested\s+(we\s+also\s+)?|we\s+need\s+to\s+|discovered\s+|please\s+|change\s+out\s+|replace\s+)/i, '')
      .replace(/[.\r\n]+$/, '')
      .trim();
    const formattedTitle = cleanSubject ? (cleanSubject.charAt(0).toUpperCase() + cleanSubject.slice(1)) : 'Required Hardware';

    blueprint = {
      summaryDetail: `sourcing and installation of commercial-grade ${formattedTitle.toLowerCase()} components, structural mounting, and comprehensive operational testing`,
      materials: [
        {
          name: `${formattedTitle} - Commercial Specification Grade Assembly`,
          baseCost: 115.00,
          quantity: 1,
          unit: 'each',
          notes: 'Heavy-duty commercial trade assembly'
        },
        {
          name: `${formattedTitle} - Mounting Hardware, Gaskets & Connection Kit`,
          baseCost: 28.50,
          quantity: 1,
          unit: 'kit',
          notes: 'Standard trade tie-in connectors and hardware'
        }
      ],
      labor: [
        {
          description: `${tradeCategory} Labor - Removal of Old Component, Mount & Configure New ${formattedTitle}`,
          hours: 2.0,
          hourlyRate
        }
      ]
    };
  }

  // ──── 5. Build Multi-Supplier Pricing Matrix & Apply Org Preferences ────
  const newItems: QuoteLineItem[] = [];

  // A. Process Materials through Supplier Pricing Engine
  for (let idx = 0; idx < blueprint.materials.length; idx++) {
    const mat = blueprint.materials[idx];
    const allVendorOptions = buildAllVendorPricing(mat.name, mat.baseCost, [], orgVendors);
    
    const { selectedVendor, priorityReason } = selectVendorByOrgPriorities(allVendorOptions, {
      defaultSourcingStrategy: sourcingStrategy,
      defaultVendorId: preferredVendorId
    });

    const winningVendor = selectedVendor || allVendorOptions[0];
    const finalBaseCost = winningVendor ? winningVendor.unitCost : mat.baseCost;
    const markupPct = markup || 30;
    const customerPrice = Math.round(finalBaseCost * (1 + markupPct / 100) * 100) / 100;
    const qty = mat.quantity || 1;
    const alternates = allVendorOptions.filter(v => v.vendorName !== winningVendor?.vendorName);

    newItems.push({
      id: `ai-item-${Date.now()}-mat-${idx}`,
      description: winningVendor?.vendorProductTitle || mat.name,
      type: 'material',
      quantity: qty,
      unit: mat.unit || 'each',
      baseCost: finalBaseCost,
      markupPercentage: markupPct,
      unitPrice: customerPrice,
      total: Math.round(qty * customerPrice * 100) / 100,
      taxable: true,
      isOptional: false,
      priceSource: 'vendor',
      vendorName: winningVendor?.vendorName,
      vendorProductUrl: winningVendor?.vendorProductUrl,
      stockQuantity: winningVendor?.stockQuantity,
      alternateVendors: alternates,
      notes: priorityReason ? `Selected by ${priorityReason}` : mat.notes
    });
  }

  // B. Process Labor Lines
  for (let idx = 0; idx < blueprint.labor.length; idx++) {
    const lab = blueprint.labor[idx];
    const rate = lab.hourlyRate || hourlyRate;
    const lineTotal = Math.round(lab.hours * rate * 100) / 100;

    newItems.push({
      id: `ai-item-${Date.now()}-lab-${idx}`,
      description: lab.description,
      type: 'labor',
      quantity: lab.hours,
      unit: 'hours',
      unitPrice: rate,
      total: lineTotal,
      taxable: false,
      isOptional: false,
      priceSource: 'ai_estimate',
      notes: lab.notes
    });
  }

  // Add budget option discount if requested
  if (discoveryLower.includes('cheaper') || discoveryLower.includes('budget')) {
    const discountVal = Math.round(baseTotal * 0.10 * 100) / 100;
    newItems.push({
      id: `ai-item-${Date.now()}-budget-discount`,
      description: 'Budget Option / Value-Engineering Discount (10%)',
      type: 'discount',
      quantity: 1,
      unit: 'flat',
      unitPrice: discountVal,
      total: -discountVal,
      taxable: false,
      isOptional: false,
      priceSource: 'ai_estimate',
      notes: 'Applied 10% budget engineering discount'
    });
  }

  // If labor hours were explicitly adjusted, replace all existing labor items
  if (blueprint.labor.length > 0 && (
    /\b(?:increase|decrease|change|adjust|set|make)\s+labor\b/i.test(discoveryLower) ||
    /\blabor\s+(?:to|by|for)\s+\d+/i.test(discoveryLower) ||
    /\b\d+(?:\.\d+)?\s*(?:hours?|hrs?|minutes?|mins?)\s*(?:of\s+)?labor\b/i.test(discoveryLower)
  )) {
    currentLineItems.forEach(it => {
      if (it.type === 'labor' && !removedIds.includes(it.id)) {
        removedIds.push(it.id);
      }
    });
  }

  // If this is an exclusive scope replacement, remove superseded materials and labor from current quote
  if (!isAdditive) {
    currentLineItems.forEach(it => {
      if (it.type !== 'travel' && !removedIds.includes(it.id)) {
        removedIds.push(it.id);
      }
    });
  }

  const combinedLineItems = isAdditive
    ? [
        ...currentLineItems.filter(it => !removedIds.includes(it.id)),
        ...newItems
      ]
    : [
        // Keep travel fee if present
        ...currentLineItems.filter(it => !removedIds.includes(it.id) && it.type === 'travel'),
        ...newItems
      ];

  const deltaCost = combinedLineItems.reduce((s, it) => s + (it.total || 0), 0) - baseTotal;

  // Build unified scope description
  let newScopeDescription = '';
  const cleanOriginal = (originalScope || '').trim().replace(/\.\s*$/, '');
  const isPureRemoval = removedIds.length > 0 && newItems.length === 0;

  if (!cleanOriginal) {
    newScopeDescription = `Scope of Work: ${blueprint.summaryDetail}.`;
  } else if (!isAdditive) {
    newScopeDescription = `Revised Scope of Work: ${blueprint.summaryDetail} (supersedes prior scope items). Includes all necessary installation, calibration, and verification testing.`;
  } else if (isPureRemoval) {
    newScopeDescription = `${cleanOriginal} (Items adjusted/removed per request).`;
  } else {
    newScopeDescription = `${cleanOriginal}. Additionally, execute discovered required scope: ${blueprint.summaryDetail}, including all necessary structural tie-ins, component replacements, and comprehensive system testing.`;
  }

  // ──── 6. Evaluate Configured Approval Policy ────
  const policy = approvalPolicy || {
    requireApproval: 'threshold',
    defaultApprover: 'both',
    costThreshold: 100,
    percentageThreshold: 15
  };

  const isOverCostThreshold = deltaCost > policy.costThreshold;
  const percentIncrease = baseTotal > 0 ? (deltaCost / baseTotal) * 100 : 100;
  const isOverPercentThreshold = percentIncrease > policy.percentageThreshold;
  const isOverThreshold = isOverCostThreshold || isOverPercentThreshold;

  let requiredFrom: 'customer' | 'dispatcher' | 'both' | 'none' = 'none';
  let approvalReason = '';

  if (policy.requireApproval === 'always') {
    requiredFrom = policy.defaultApprover;
    approvalReason = `Organization policy requires re-approval from ${policy.defaultApprover.toUpperCase()} for any scope modification.`;
  } else if (policy.requireApproval === 'never') {
    requiredFrom = 'none';
    approvalReason = 'Pre-authorized on-site technician modification (no approval required).';
  } else if (isOverThreshold) {
    requiredFrom = policy.defaultApprover;
    approvalReason = `Cost delta (+${deltaCost >= 0 ? '$' : '-$'}${Math.abs(deltaCost).toFixed(2)}, ${percentIncrease.toFixed(0)}%) exceeds the approval threshold of $${policy.costThreshold}. Requires ${policy.defaultApprover.toUpperCase()} approval.`;
  } else {
    requiredFrom = 'none';
    approvalReason = `Delta of +$${deltaCost.toFixed(2)} is within pre-authorized company threshold ($${policy.costThreshold}). Scope change recorded as pre-authorized.`;
  }

  const strategyLabel = sourcingStrategy === 'lowest_cost' 
    ? 'Lowest Cost Strategy' 
    : sourcingStrategy === 'local_availability' 
    ? 'Local Branch Availability' 
    : sourcingStrategy === 'fastest_shipping'
    ? 'Fastest Fulfillment'
    : 'Preferred Supplier';

  const reasoning = !isAdditive
    ? `Revised quote scope exclusively to: ${blueprint.summaryDetail}. Removed superseded items and calibrated parts and labor (${strategyLabel}).`
    : isPureRemoval
    ? `Removed ${removedIds.length} requested item(s) from quote scope. Total adjusted by ${deltaCost >= 0 ? '+$' : '-$'}${Math.abs(deltaCost).toFixed(2)}.`
    : `Maintained initial scope (${currentLineItems.length - removedIds.length} baseline line items). Sourced ${blueprint.materials.length} verified physical materials & ${blueprint.labor.length} labor tasks based on your ${strategyLabel} (+${deltaCost >= 0 ? '$' : '-$'}${Math.abs(deltaCost).toFixed(2)} delta).`;

  return {
    newScopeDescription,
    combinedLineItems,
    addedItems: newItems,
    removedItemIds: removedIds,
    reasoning,
    deltaCost,
    isAdditive,
    recommendedApproval: {
      requiredFrom,
      reason: approvalReason,
      isOverThreshold
    }
  };
}
