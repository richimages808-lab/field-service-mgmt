/**
 * Seed Dispatch Jobs - Clear old jobs & create 20 diverse ones for next week
 * Run: node seed-dispatch-jobs.js
 */
const admin = require('firebase-admin');
const serviceAccount = require('./firebase/serviceAccountKey.json');

if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();
const ORG_ID = 'demo-org';
const TS = admin.firestore.Timestamp;

// Next week dates (Apr 27 - May 1, 2026)
const MON = new Date('2026-04-27T08:00:00-10:00');
const TUE = new Date('2026-04-28T08:00:00-10:00');
const WED = new Date('2026-04-29T08:00:00-10:00');
const THU = new Date('2026-04-30T08:00:00-10:00');
const FRI = new Date('2026-05-01T08:00:00-10:00');

const JOBS = [
  // === HVAC Jobs (should favor Phase 4 Tester & Rich Fixerguy) ===
  { name: 'Maria Santos', addr: '1521 Kapiolani Blvd, Honolulu, HI 96814', phone: '808-555-1001', email: 'maria@email.com',
    desc: 'Central AC not blowing cold air. Thermostat reads 82°F when set to 72°F. Unit is 5 years old.', type: 'HVAC',
    priority: 'critical', category: 'repair', duration: 90, complexity: 'complex',
    skills: ['HVAC Systems', 'Refrigeration', 'Electrical Diagnostics'], tools: ['Refrigerant Gauges','Multimeter','Vacuum Pump','Thermometer'], lat: 21.2926, lng: -157.8411 },

  { name: 'James Kealoha', addr: '94-229 Waipahu Depot St, Waipahu, HI 96797', phone: '808-555-1002', email: 'james.k@email.com',
    desc: 'Mini-split system leaking water inside. Condensate drain may be clogged.', type: 'HVAC',
    priority: 'high', category: 'repair', duration: 60, complexity: 'medium',
    skills: ['HVAC Systems', 'Condensate Management'], tools: ['Wet/Dry Vacuum','Drain Snake','Multimeter'], lat: 21.3836, lng: -158.0092 },

  { name: 'Sunrise Senior Living', addr: '1000 Ala Moana Blvd, Honolulu, HI 96814', phone: '808-555-1003', email: 'facilities@sunrise.com',
    desc: 'Commercial HVAC annual preventive maintenance for 3 rooftop units. Building has 40 residents.', type: 'HVAC',
    priority: 'medium', category: 'maintenance', duration: 240, complexity: 'complex',
    skills: ['HVAC Systems', 'Commercial HVAC', 'Refrigeration'], tools: ['Refrigerant Gauges','Multimeter','Filter Stock','Coil Cleaner'], lat: 21.2939, lng: -157.8555 },

  // === Plumbing Jobs (should favor Phase 4 Tester) ===
  { name: 'David Chen', addr: '555 Haiku Rd, Kaneohe, HI 96744', phone: '808-555-1004', email: 'dchen@email.com',
    desc: 'Bathroom toilet constantly running. Flapper replaced last month but still leaking. Water bill doubled.', type: 'Plumbing',
    priority: 'high', category: 'repair', duration: 45, complexity: 'simple',
    skills: ['Plumbing', 'Toilet Repair'], tools: ['Pipe Wrench','Plunger','Teflon Tape'], lat: 21.4180, lng: -157.8185 },

  { name: 'Pacific Heights Condos', addr: '2211 Ala Wai Blvd, Honolulu, HI 96815', phone: '808-555-1005', email: 'mgmt@paccondos.com',
    desc: 'Main water shut-off valve is seized and leaking slowly. Needs replacement. Building has 12 units affected.', type: 'Plumbing',
    priority: 'critical', category: 'emergency', duration: 120, complexity: 'complex',
    skills: ['Plumbing', 'Pipe Fitting', 'Valve Replacement'], tools: ['Pipe Wrench','Tubing Cutter','Torch/Solder','Basin Wrench'], lat: 21.2813, lng: -157.8267 },

  { name: 'Lisa Wong', addr: '45-401 Kamehameha Hwy, Kaneohe, HI 96744', phone: '808-555-1006', email: 'lwong@email.com',
    desc: 'Garbage disposal jammed and making grinding noise. Kitchen sink backing up when dishwasher runs.', type: 'Plumbing',
    priority: 'medium', category: 'repair', duration: 60, complexity: 'medium',
    skills: ['Plumbing', 'Appliance Repair'], tools: ['Pipe Wrench','Plunger','Allen Wrench Set'], lat: 21.4073, lng: -157.8007 },

  // === Electrical Jobs (should favor Phase 4 Tester) ===
  { name: 'Robert Tanaka', addr: '1288 Ala Moana Blvd, Honolulu, HI 96814', phone: '808-555-1007', email: 'rtanaka@email.com',
    desc: 'Multiple outlets in master bedroom stopped working. Breaker trips when plugging in anything. Possible short circuit.', type: 'Electrical',
    priority: 'critical', category: 'repair', duration: 90, complexity: 'complex',
    skills: ['Electrical', 'Circuit Diagnostics', 'Panel Work'], tools: ['Multimeter','Wire Strippers','Voltage Tester','Circuit Tracer'], lat: 21.2926, lng: -157.8456 },

  { name: 'Kailua Elementary School', addr: '315 Kuulei Rd, Kailua, HI 96734', phone: '808-555-1008', email: 'maintenance@kailua-elem.edu',
    desc: 'Install 4 new LED light fixtures in cafeteria. Existing fluorescent fixtures need removal. Must be done after school hours.', type: 'Electrical',
    priority: 'medium', category: 'installation', duration: 180, complexity: 'medium',
    skills: ['Electrical', 'Lighting Installation', 'Commercial Wiring'], tools: ['Wire Strippers','Drill','Ladder','Voltage Tester'], lat: 21.3972, lng: -157.7419 },

  { name: 'Amy Nakamura', addr: '2800 Woodlawn Dr, Honolulu, HI 96822', phone: '808-555-1009', email: 'amy.n@email.com',
    desc: 'Ceiling fan wobbles badly and makes clicking sound. Want to replace with new fan. Have new fan ready.', type: 'Electrical',
    priority: 'low', category: 'installation', duration: 60, complexity: 'simple',
    skills: ['Electrical', 'Fan Installation'], tools: ['Drill','Wire Strippers','Voltage Tester','Ladder'], lat: 21.3044, lng: -157.8131 },

  // === General Maintenance / Inspection ===
  { name: 'Aloha Towers Office', addr: '1 Aloha Tower Dr, Honolulu, HI 96813', phone: '808-555-1010', email: 'ops@alohatowers.com',
    desc: 'Annual building safety inspection required. Check fire suppression, emergency lighting, exit signs, and smoke detectors.', type: 'General',
    priority: 'medium', category: 'inspection', duration: 180, complexity: 'medium',
    skills: ['Safety Inspection', 'Fire Systems', 'Emergency Lighting'], tools: ['Multimeter','Flashlight','Smoke Detector Tester','Ladder'], lat: 21.3065, lng: -157.8647 },

  { name: 'Tom Kawai', addr: '1234 Nuuanu Ave, Honolulu, HI 96817', phone: '808-555-1011', email: 'tkawai@email.com',
    desc: 'Roof leak in bedroom corner. Water stain on ceiling getting larger. Need inspection and repair before rainy season.', type: 'Roofing',
    priority: 'high', category: 'repair', duration: 120, complexity: 'medium',
    skills: ['Roofing', 'Waterproofing', 'Structural Assessment'], tools: ['Ladder','Caulk Gun','Roofing Tar','Safety Harness'], lat: 21.3173, lng: -157.8590 },

  { name: 'Paradise Bakery', addr: '2615 S King St, Honolulu, HI 96826', phone: '808-555-1012', email: 'owner@paradisebakery.com',
    desc: 'Commercial refrigerator not maintaining temperature. Food safety concern. Walk-in cooler reading 48°F instead of 38°F.', type: 'Refrigeration',
    priority: 'critical', category: 'emergency', duration: 90, complexity: 'complex',
    skills: ['Refrigeration', 'HVAC Systems', 'Commercial Equipment'], tools: ['Refrigerant Gauges','Multimeter','Thermometer','Vacuum Pump'], lat: 21.2942, lng: -157.8251 },

  // === Network/Cabling Jobs (should favor Rich Fixerguy) ===
  { name: 'Waikiki Beach Hotel', addr: '2500 Kalakaua Ave, Honolulu, HI 96815', phone: '808-555-1013', email: 'it@waikikibeach.com',
    desc: 'Run Cat6 ethernet cables to 6 new rooms on 3rd floor. Patch panel in IT closet needs additional ports.', type: 'Network Cabling',
    priority: 'medium', category: 'installation', duration: 240, complexity: 'medium',
    skills: ['Network Cabling', 'Structured Wiring', 'Patch Panel'], tools: ['Cable Tester','Crimping Tool','Punch Down Tool','Drill'], lat: 21.2756, lng: -157.8241 },

  { name: 'Dr. Patel Medical Office', addr: '1380 Lusitana St, Honolulu, HI 96813', phone: '808-555-1014', email: 'admin@drpatel.com',
    desc: 'Network drops intermittently in exam rooms 3 and 4. Suspect bad cable run or damaged jack. HIPAA compliance critical.', type: 'Network Cabling',
    priority: 'high', category: 'repair', duration: 90, complexity: 'medium',
    skills: ['Network Cabling', 'Network Diagnostics', 'Structured Wiring'], tools: ['Cable Tester','Tone Generator','Laptop','Crimping Tool'], lat: 21.3130, lng: -157.8530 },

  // === Appliance Jobs (general) ===
  { name: 'Sandra Kim', addr: '1450 Young St, Honolulu, HI 96814', phone: '808-555-1015', email: 'skim@email.com',
    desc: 'Washer machine vibrates excessively during spin cycle and walks across laundry room. Loud banging noise.', type: 'Appliance',
    priority: 'low', category: 'repair', duration: 60, complexity: 'simple',
    skills: ['Appliance Repair', 'Mechanical Systems'], tools: ['Level','Wrench Set','Screwdriver Set'], lat: 21.2960, lng: -157.8410 },

  { name: 'Mike OBrien', addr: '99-080 Kauhale St, Aiea, HI 96701', phone: '808-555-1016', email: 'mobrien@email.com',
    desc: 'Electric water heater no hot water. Breaker not tripped. Unit is 10 years old, may need element replacement.', type: 'Plumbing',
    priority: 'high', category: 'repair', duration: 90, complexity: 'medium',
    skills: ['Plumbing', 'Electrical', 'Water Heater Repair'], tools: ['Multimeter','Element Wrench','Pipe Wrench','Teflon Tape'], lat: 21.3860, lng: -157.9430 },

  // === Warranty / Consultation ===
  { name: 'Green Energy Homes', addr: '3538 Waialae Ave, Honolulu, HI 96816', phone: '808-555-1017', email: 'service@greenhomes.com',
    desc: 'Solar inverter warranty claim. System showing error code E481. Production dropped 40% this month.', type: 'Solar',
    priority: 'medium', category: 'warranty', duration: 120, complexity: 'complex',
    skills: ['Solar Systems', 'Electrical', 'Inverter Diagnostics'], tools: ['Multimeter','Clamp Meter','Laptop','Insulation Tester'], lat: 21.2843, lng: -157.7920 },

  { name: 'Kona Brewing Taproom', addr: '7192 Kalanianaole Hwy, Hawaii Kai, HI 96825', phone: '808-555-1018', email: 'ops@konabrewing.com',
    desc: 'Consultation for new draft beer line refrigeration system. Need assessment of existing setup and quote for upgrade.', type: 'Refrigeration',
    priority: 'low', category: 'consultation', duration: 60, complexity: 'simple',
    skills: ['Refrigeration', 'Commercial Equipment', 'System Design'], tools: ['Thermometer','Measuring Tape','Notepad'], lat: 21.2893, lng: -157.7113 },

  // === Mixed skill jobs ===
  { name: 'Pearl Harbor Naval Housing', addr: '1 Arizona Memorial Dr, Honolulu, HI 96818', phone: '808-555-1019', email: 'housing@navy.mil',
    desc: 'Unit 4B: AC not cooling + bathroom faucet dripping + bedroom outlet sparking. Multiple issues in single unit.', type: 'General',
    priority: 'critical', category: 'repair', duration: 180, complexity: 'complex',
    skills: ['HVAC Systems', 'Plumbing', 'Electrical', 'Multi-Trade'], tools: ['Multimeter','Pipe Wrench','Refrigerant Gauges','Voltage Tester'], lat: 21.3645, lng: -157.9500 },

  { name: 'Queen Emma Gardens', addr: '1519 Nuuanu Ave, Honolulu, HI 96817', phone: '808-555-1020', email: 'mgmt@qegardens.com',
    desc: 'Quarterly preventive maintenance for pool equipment. Check pumps, filters, chemical balancers, and heater.', type: 'General',
    priority: 'low', category: 'maintenance', duration: 120, complexity: 'medium',
    skills: ['Pool Equipment', 'Plumbing', 'Electrical'], tools: ['Multimeter','Wrench Set','Chemical Test Kit','Pressure Gauge'], lat: 21.3190, lng: -157.8570 },
];

async function clearOldJobs() {
    console.log('🧹 Clearing old unscheduled/pending jobs...');
    const snap = await db.collection('jobs').where('org_id', '==', ORG_ID).get();
    let deleted = 0;
    const batch_size = 400;
    let batch = db.batch();
    let count = 0;

    for (const doc of snap.docs) {
        const data = doc.data();
        // Delete jobs that are unscheduled, pending, or old scheduled test data
        if (['pending', 'unscheduled', 'quote_pending'].includes(data.status) ||
            (data.status === 'scheduled' && data.assigned_tech_id)) {
            batch.delete(doc.ref);
            deleted++;
            count++;
            if (count >= batch_size) {
                await batch.commit();
                batch = db.batch();
                count = 0;
            }
        }
    }
    if (count > 0) await batch.commit();
    console.log(`✓ Deleted ${deleted} old jobs (kept ${snap.size - deleted} in-progress/completed)`);
}

async function seedJobs() {
    console.log('\n📋 Creating 20 new diverse jobs for next week...\n');
    const batch = db.batch();

    for (let i = 0; i < JOBS.length; i++) {
        const j = JOBS[i];
        const ref = db.collection('jobs').doc();

        // Distribute creation dates across last few days for realistic "age"
        const ageHours = Math.floor(Math.random() * 72) + 1;
        const created = new Date(Date.now() - ageHours * 3600000);

        const doc = {
            org_id: ORG_ID,
            status: 'unscheduled',
            priority: j.priority,
            category: j.category,
            estimated_duration: j.duration,
            complexity: j.complexity,
            customer: { name: j.name, address: j.addr, phone: j.phone, email: j.email },
            request: {
                description: j.desc,
                photos: [],
                videos: [],
                availability: [],
                type: j.type,
                source: ['web', 'email', 'phone', 'portal'][Math.floor(Math.random() * 4)],
                communicationPreference: ['phone', 'text', 'email'][Math.floor(Math.random() * 3)]
            },
            location: { lat: j.lat, lng: j.lng },
            createdAt: TS.fromDate(created),
            intakeReview: {
                status: 'approved',
                questionsForCustomer: [],
                aiRecommendation: {
                    priority: j.priority,
                    priorityReason: j.priority === 'critical' ? 'Urgent issue affecting safety or habitability' :
                                    j.priority === 'high' ? 'Significant issue needing prompt attention' :
                                    j.priority === 'medium' ? 'Standard service request' : 'Routine or non-urgent task',
                    estimatedDuration: j.duration,
                    complexity: j.complexity,
                    skillsRequired: j.skills,
                    requiredTools: j.tools.map((t, idx) => ({ name: t, owned: false, essential: idx < 3 })),
                    recommendedMaterials: [{ name: `Standard ${j.type} parts`, quantity: 'As needed', estimatedCost: 50 + Math.floor(Math.random() * 150) }],
                    safetyConsiderations: ['Wear appropriate PPE', 'Follow standard safety procedures'],
                    generatedAt: TS.fromDate(created),
                }
            }
        };
        batch.set(ref, doc);
        const icon = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' }[j.priority];
        console.log(`  ${icon} ${j.name} — ${j.type} (${j.category}) — ${j.duration}m — ${j.priority}`);
    }

    await batch.commit();
    console.log(`\n✅ Created ${JOBS.length} jobs successfully!`);
}

async function main() {
    console.log('╔═══════════════════════════════════════════════╗');
    console.log('║  Dispatch Test Data Seeder                    ║');
    console.log('╚═══════════════════════════════════════════════╝\n');
    await clearOldJobs();
    await seedJobs();

    console.log('\n📊 Job breakdown:');
    console.log('   Critical: 4  (AC repair, water valve, outlet sparking, fridge)');
    console.log('   High:     4  (mini-split, toilet, roof, network, water heater)');
    console.log('   Medium:   7  (HVAC PM, garbage disposal, school lights, inspection, cabling, solar, pool)');
    console.log('   Low:      5  (ceiling fan, washer, consultation, pool PM)');
    console.log('\n🎯 Skill diversity: HVAC, Plumbing, Electrical, Network Cabling,');
    console.log('   Roofing, Refrigeration, Solar, Appliance, General');
    console.log('\nLogin at: https://maintenancemanager-c5533.web.app/login');
    console.log('Go to Dispatch Console to start scheduling!\n');
    process.exit(0);
}

main().catch(e => { console.error('❌ Error:', e); process.exit(1); });
