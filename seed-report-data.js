// Seed script: creates sample data for reporting dashboard
// Run with: node seed-report-data.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

// Initialize with default credentials (uses GOOGLE_APPLICATION_CREDENTIALS or gcloud auth)
initializeApp({ projectId: 'maintenancemanager-c5533' });
const db = getFirestore();

const ORG_ID = 'demo-org';
const USER_UID = '1k21kpBrsSV0ZLM1r6jPh6JAvCg2';
const USER_NAME = 'Solo Tech';

function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return Timestamp.fromDate(d);
}

function randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function seed() {
    console.log('🌱 Seeding report data for org:', ORG_ID);

    // ─── 1. CUSTOMERS ───────────────────────────────────────────────────────────
    const customers = [
        { id: 'cust-001', name: 'Bob Williams', email: 'bob@example.com', phone: '808-555-0101', address: '321 Mountain View Dr' },
        { id: 'cust-002', name: 'Sarah Johnson', email: 'sarah@example.com', phone: '808-555-0102', address: '456 Ocean Blvd' },
        { id: 'cust-003', name: 'Mike Chen', email: 'mike@example.com', phone: '808-555-0103', address: '789 Palm Ave' },
        { id: 'cust-004', name: 'Jennifer Lee', email: 'jennifer@example.com', phone: '808-555-0104', address: '123 Sunset Way' },
        { id: 'cust-005', name: 'Bishop Museum', email: 'ops@bishopmuseum.org', phone: '808-555-0105', address: '1000 Kamehameha Hwy' },
        { id: 'cust-006', name: 'Dole Plantation', email: 'maint@doleplantation.com', phone: '808-555-0106', address: '1450 Ala Moana Blvd' },
        { id: 'cust-007', name: 'Sea Life Park', email: 'facilities@sealife.com', phone: '808-555-0107', address: '41-202 Kalaniana\'ole Hwy' },
        { id: 'cust-008', name: 'Aloha Tower', email: 'mgmt@alohatower.com', phone: '808-555-0108', address: '1 Aloha Tower Dr' },
    ];

    console.log('  📇 Creating customers...');
    for (const c of customers) {
        await db.collection('customers').doc(c.id).set({
            ...c,
            org_id: ORG_ID,
            createdAt: daysAgo(randomBetween(60, 180)),
            updatedAt: Timestamp.now(),
            status: 'active',
            billing: { paymentTerms: 'net30' },
        });
    }

    // ─── 2. JOBS (various statuses, categories, sources, dates) ─────────────────
    const jobStatuses = ['pending', 'scheduled', 'in_progress', 'completed', 'cancelled'];
    const categories = ['Repair', 'Maintenance', 'Installation', 'Inspection', 'Emergency'];
    const sources = ['web', 'phone', 'email', 'sms', 'manual'];
    const jobs = [];

    console.log('  🔧 Creating jobs...');
    for (let i = 1; i <= 45; i++) {
        const status = jobStatuses[i % jobStatuses.length];
        const category = categories[i % categories.length];
        const source = sources[i % sources.length];
        const customer = customers[(i - 1) % customers.length];
        const daysBack = randomBetween(1, 85);
        const laborHours = randomBetween(1, 6);
        const laborRate = 85;
        const partsCost = randomBetween(20, 350);
        const totalCost = laborHours * laborRate + partsCost;

        const job = {
            id: `job-${String(i).padStart(3, '0')}`,
            org_id: ORG_ID,
            status,
            category,
            source,
            priority: ['low', 'medium', 'high', 'critical'][i % 4],
            customer: {
                name: customer.name,
                address: customer.address,
                phone: customer.phone,
                email: customer.email,
            },
            customer_id: customer.id,
            title: `${category} - ${customer.name}`,
            description: `${category} service at ${customer.address}`,
            assignedTo: USER_UID,
            assignedTechName: USER_NAME,
            createdAt: daysAgo(daysBack),
            updatedAt: daysAgo(Math.max(0, daysBack - randomBetween(0, 5))),
            scheduledDate: status !== 'pending' ? daysAgo(daysBack - 1) : null,
            costs: {
                labor: { hours: laborHours, rate: laborRate, total: laborHours * laborRate },
                parts: { items: [], total: partsCost },
                mileage: { distance: randomBetween(5, 40), rate: 0.655, total: randomBetween(5, 40) * 0.655 },
                other: [],
                total: totalCost,
            },
        };

        if (status === 'completed') {
            job.completedAt = daysAgo(Math.max(0, daysBack - 2));
            job.duration = laborHours * 60; // minutes
        }

        jobs.push(job);
        await db.collection('jobs').doc(job.id).set(job);
    }

    // ─── 3. INVOICES (various statuses and amounts) ─────────────────────────────
    const invoiceStatuses = ['draft', 'sent', 'paid', 'overdue', 'partial'];
    console.log('  💰 Creating invoices...');
    for (let i = 1; i <= 30; i++) {
        const status = invoiceStatuses[i % invoiceStatuses.length];
        const customer = customers[(i - 1) % customers.length];
        const daysBack = randomBetween(1, 90);
        const amount = randomBetween(150, 2500);

        const invoice = {
            id: `inv-${String(i).padStart(3, '0')}`,
            org_id: ORG_ID,
            customer_id: customer.id,
            customer_name: customer.name,
            customer_email: customer.email,
            status,
            total: amount,
            subtotal: amount * 0.9,
            tax: amount * 0.1,
            amountPaid: status === 'paid' ? amount : status === 'partial' ? amount * 0.5 : 0,
            balance: status === 'paid' ? 0 : status === 'partial' ? amount * 0.5 : amount,
            items: [
                { description: 'Service Labor', quantity: randomBetween(1, 5), unitPrice: 85, total: randomBetween(85, 425) },
                { description: 'Parts & Materials', quantity: 1, unitPrice: randomBetween(50, 500), total: randomBetween(50, 500) },
            ],
            createdAt: daysAgo(daysBack),
            updatedAt: daysAgo(Math.max(0, daysBack - 3)),
            dueDate: daysAgo(daysBack - 30), // due 30 days after creation
            job_id: jobs[i % jobs.length]?.id || null,
        };

        if (status === 'paid') {
            invoice.paidAt = daysAgo(Math.max(0, daysBack - randomBetween(5, 25)));
        }

        await db.collection('invoices').doc(invoice.id).set(invoice);
    }

    // ─── 4. QUOTES (various statuses) ───────────────────────────────────────────
    const quoteStatuses = ['draft', 'sent', 'approved', 'declined', 'expired'];
    console.log('  📋 Creating quotes...');
    for (let i = 1; i <= 20; i++) {
        const status = quoteStatuses[i % quoteStatuses.length];
        const customer = customers[(i - 1) % customers.length];
        const daysBack = randomBetween(5, 70);
        const amount = randomBetween(200, 3500);

        const quote = {
            id: `quote-${String(i).padStart(3, '0')}`,
            org_id: ORG_ID,
            customer_id: customer.id,
            customerName: customer.name,
            customerEmail: customer.email,
            status,
            total: amount,
            lineItems: [
                { description: 'Labor', quantity: randomBetween(2, 8), unitPrice: 85, total: randomBetween(170, 680) },
                { description: 'Materials', quantity: 1, unitPrice: randomBetween(100, 1000), total: randomBetween(100, 1000) },
            ],
            createdAt: daysAgo(daysBack),
            updatedAt: daysAgo(Math.max(0, daysBack - 5)),
            validUntil: daysAgo(daysBack - 30),
            notes: `Quote for ${categories[i % categories.length].toLowerCase()} work`,
        };

        if (status === 'approved') {
            quote.approvedAt = daysAgo(Math.max(0, daysBack - randomBetween(2, 10)));
            quote.approvedBy = customer.name;
        }
        if (status === 'declined') {
            quote.declinedAt = daysAgo(Math.max(0, daysBack - randomBetween(3, 15)));
        }

        await db.collection('quotes').doc(quote.id).set(quote);
    }

    // ─── 5. MATERIALS / INVENTORY ───────────────────────────────────────────────
    const materials = [
        { id: 'mat-001', name: 'HVAC Filter 20x25', sku: 'HF-2025', currentQty: 3, minQty: 10, unitPrice: 12.50, category: 'Filters' },
        { id: 'mat-002', name: 'Copper Pipe 1/2" (10ft)', sku: 'CP-0510', currentQty: 8, minQty: 5, unitPrice: 28.00, category: 'Plumbing' },
        { id: 'mat-003', name: 'Electrical Wire 14AWG (100ft)', sku: 'EW-14100', currentQty: 2, minQty: 5, unitPrice: 45.00, category: 'Electrical' },
        { id: 'mat-004', name: 'PVC Pipe 2" (10ft)', sku: 'PVC-210', currentQty: 15, minQty: 8, unitPrice: 8.50, category: 'Plumbing' },
        { id: 'mat-005', name: 'Thermostat - Smart WiFi', sku: 'TS-WIFI', currentQty: 0, minQty: 3, unitPrice: 149.99, category: 'HVAC' },
        { id: 'mat-006', name: 'Refrigerant R-410A (25lb)', sku: 'REF-410A', currentQty: 1, minQty: 4, unitPrice: 185.00, category: 'HVAC' },
        { id: 'mat-007', name: 'Circuit Breaker 20A', sku: 'CB-20A', currentQty: 12, minQty: 6, unitPrice: 15.00, category: 'Electrical' },
        { id: 'mat-008', name: 'Water Heater Element', sku: 'WHE-STD', currentQty: 4, minQty: 5, unitPrice: 32.00, category: 'Plumbing' },
        { id: 'mat-009', name: 'Duct Tape Pro (60yd)', sku: 'DT-60PRO', currentQty: 20, minQty: 10, unitPrice: 9.99, category: 'General' },
        { id: 'mat-010', name: 'Capacitor 45/5 MFD', sku: 'CAP-455', currentQty: 1, minQty: 6, unitPrice: 22.00, category: 'HVAC' },
    ];

    console.log('  📦 Creating materials/inventory...');
    for (const m of materials) {
        await db.collection('materials').doc(m.id).set({
            ...m,
            org_id: ORG_ID,
            createdAt: daysAgo(120),
            updatedAt: Timestamp.now(),
        });
    }

    // ─── 6. INVENTORY USAGE (transactions for material consumption tracking) ────
    console.log('  📊 Creating inventory usage transactions...');
    for (let i = 1; i <= 25; i++) {
        const mat = materials[i % materials.length];
        const job = jobs[i % jobs.length];
        await db.collection('inventory_usage').doc(`usage-${String(i).padStart(3, '0')}`).set({
            org_id: ORG_ID,
            material_id: mat.id,
            material_name: mat.name,
            job_id: job.id,
            quantity: randomBetween(1, 3),
            type: 'used',
            techId: USER_UID,
            techName: USER_NAME,
            createdAt: daysAgo(randomBetween(1, 60)),
        });
    }

    console.log('');
    console.log('✅ Seeding complete!');
    console.log('   • 8 customers');
    console.log('   • 45 jobs (various statuses, categories, sources)');
    console.log('   • 30 invoices (draft, sent, paid, overdue, partial)');
    console.log('   • 20 quotes (draft, sent, approved, declined, expired)');
    console.log('   • 10 materials (some below min stock)');
    console.log('   • 25 inventory usage records');
    console.log('');
    console.log('🔗 View reports at: https://maintenancemanager-c5533.web.app/reports');
}

seed().catch(err => {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
});
