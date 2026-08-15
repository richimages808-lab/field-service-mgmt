const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '..', '..', 'serviceAccountKey.json'));

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();

const OAHU_LOCATIONS = [
    {
        name: 'Aloha Tower Marketplace',
        address: '1 Aloha Tower Dr, Honolulu, HI 96813',
        lat: 21.3069,
        lng: -157.8658
    },
    {
        name: 'Waikiki Beachfront Residences',
        address: '2424 Kalakaua Ave, Honolulu, HI 96815',
        lat: 21.2770,
        lng: -157.8250
    },
    {
        name: 'Kaimuki Commercial Plaza',
        address: '3600 Waialae Ave, Honolulu, HI 96816',
        lat: 21.2855,
        lng: -157.8010
    },
    {
        name: 'Kahala Mall Center',
        address: '4211 Waialae Ave, Honolulu, HI 96816',
        lat: 21.2760,
        lng: -157.7860
    },
    {
        name: 'Hawaii Kai Town Center',
        address: '7192 Kalanianaole Hwy, Honolulu, HI 96825',
        lat: 21.2780,
        lng: -157.7050
    },
    {
        name: 'Kailua Shopping Center',
        address: '600 Kailua Rd, Kailua, HI 96734',
        lat: 21.3965,
        lng: -157.7410
    },
    {
        name: 'Kaneohe Bay Plaza',
        address: '46-056 Kamehameha Hwy, Kaneohe, HI 96744',
        lat: 21.4180,
        lng: -157.8020
    },
    {
        name: 'Pearlridge Center',
        address: '98-1005 Moanalua Rd, Aiea, HI 96701',
        lat: 21.3850,
        lng: -157.9400
    },
    {
        name: 'Mililani Town Center',
        address: '95-1249 Meheula Pkwy, Mililani, HI 96789',
        lat: 21.4510,
        lng: -158.0050
    },
    {
        name: 'Kapolei Shopping Center',
        address: '590 Farrington Hwy, Kapolei, HI 96707',
        lat: 21.3360,
        lng: -158.0820
    }
];

async function main() {
    console.log('Searching for HiTopPlumbers organization...');
    const orgsSnap = await db.collection('organizations').get();
    let targetOrg = null;

    orgsSnap.forEach(doc => {
        const data = doc.data();
        const name = (data.name || '').toLowerCase();
        const slug = (data.slug || '').toLowerCase();
        const prefix = (data.inboundEmail?.prefix || '').toLowerCase();
        if (name.includes('hitop') || slug.includes('hitop') || prefix.includes('hitop') || doc.id.toLowerCase().includes('hitop')) {
            targetOrg = { id: doc.id, ...data };
        }
    });

    if (!targetOrg) {
        console.log('Available orgs:');
        orgsSnap.forEach(d => console.log(` - ID: ${d.id}, Name: ${d.data().name}`));
        // Fallback to first non-demo or default org if needed
        targetOrg = { id: orgsSnap.docs[0].id, ...orgsSnap.docs[0].data() };
    }

    console.log(`Using Org: ${targetOrg.name} (${targetOrg.id})`);

    // Fetch technicians for this org
    const techsSnap = await db.collection('users')
        .where('role', '==', 'technician')
        .get();

    const orgTechs = [];
    techsSnap.forEach(doc => {
        const data = doc.data();
        if (data.org_id === targetOrg.id || !data.org_id || data.org_id === 'default' || data.organizationId === targetOrg.id) {
            if (!data.archived && data.status !== 'archived') {
                orgTechs.push({ id: doc.id, ...data });
            }
        }
    });

    console.log(`Found ${orgTechs.length} active technicians:`, orgTechs.map(t => `${t.name || t.email} (${t.id})`));

    if (orgTechs.length === 0) {
        console.log('No active technicians found for this org.');
        process.exit(1);
    }

    const createdJobs = [];
    let locIndex = 0;

    for (let t = 0; t < orgTechs.length; t++) {
        const tech = orgTechs[t];
        console.log(`\nCreating scheduled route jobs for Tech: ${tech.name || tech.email}`);

        // Schedule 2 jobs for Aug 17, 2026
        const aug17_morning = new Date('2026-08-17T09:00:00-10:00');
        const aug17_afternoon = new Date('2026-08-17T13:30:00-10:00');

        // Schedule 2 jobs for Aug 18, 2026
        const aug18_morning = new Date('2026-08-18T09:30:00-10:00');
        const aug18_afternoon = new Date('2026-08-18T14:00:00-10:00');

        const jobConfigs = [
            {
                date: aug17_morning,
                title: 'Water Heater Replacement & Inspection',
                customerName: `Customer at ${OAHU_LOCATIONS[locIndex % OAHU_LOCATIONS.length].name}`,
                loc: OAHU_LOCATIONS[locIndex++ % OAHU_LOCATIONS.length],
                status: 'scheduled'
            },
            {
                date: aug17_afternoon,
                title: 'Main Line Hydro-Jetting Service',
                customerName: `Customer at ${OAHU_LOCATIONS[locIndex % OAHU_LOCATIONS.length].name}`,
                loc: OAHU_LOCATIONS[locIndex++ % OAHU_LOCATIONS.length],
                status: 'scheduled'
            },
            {
                date: aug18_morning,
                title: 'Emergency Pipe Leak Repair & Pressure Check',
                customerName: `Customer at ${OAHU_LOCATIONS[locIndex % OAHU_LOCATIONS.length].name}`,
                loc: OAHU_LOCATIONS[locIndex++ % OAHU_LOCATIONS.length],
                status: 'scheduled'
            },
            {
                date: aug18_afternoon,
                title: 'Commercial Backflow Preventer Testing',
                customerName: `Customer at ${OAHU_LOCATIONS[locIndex % OAHU_LOCATIONS.length].name}`,
                loc: OAHU_LOCATIONS[locIndex++ % OAHU_LOCATIONS.length],
                status: 'scheduled'
            }
        ];

        for (const cfg of jobConfigs) {
            const jobData = {
                org_id: targetOrg.id,
                organizationId: targetOrg.id,
                assigned_tech_id: tech.id,
                assigned_tech_name: tech.name || tech.email,
                assigned_tech_email: tech.email || '',
                status: cfg.status,
                priority: 'normal',
                scheduled_at: admin.firestore.Timestamp.fromDate(cfg.date),
                title: cfg.title,
                request: {
                    description: cfg.title,
                    customerName: cfg.customerName,
                    address: cfg.loc.address
                },
                location: {
                    address: cfg.loc.address,
                    lat: cfg.loc.lat,
                    lng: cfg.loc.lng
                },
                customer: {
                    name: cfg.customerName,
                    address: cfg.loc.address,
                    phone: '808-555-0199',
                    email: 'client@example.com'
                },
                pricing: {
                    total: 350
                },
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            const docRef = await db.collection('jobs').add(jobData);
            console.log(`  ✓ Created Job ${docRef.id} on ${cfg.date.toISOString()} at ${cfg.loc.name}`);
            createdJobs.push({ id: docRef.id, tech: tech.name, date: cfg.date.toDateString(), loc: cfg.loc.name });
        }
    }

    console.log(`\n🎉 Done! Created ${createdJobs.length} scheduled route jobs for Aug 17 & Aug 18, 2026.`);
    process.exit(0);
}

main().catch(err => {
    console.error('Script error:', err);
    process.exit(1);
});
