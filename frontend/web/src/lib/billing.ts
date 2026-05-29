import { db } from '../firebase';
import { collection, serverTimestamp, query, where, getDocs, writeBatch, doc, Timestamp } from 'firebase/firestore';
import { Job } from '../types';

export const generateInvoicesForLastMonth = async (orgId: string) => {
    console.log("Generating invoices for", orgId);

    // 1. Fetch all completed jobs that haven't been invoiced yet
    // Note: In a real app, we'd flag jobs as 'invoiced' or check a date range.
    // For this demo, we'll just grab all 'completed' jobs.
    const jobsRef = collection(db, 'jobs');
    const q = query(jobsRef, where('org_id', '==', orgId), where('status', '==', 'completed'));
    const snapshot = await getDocs(q);

    const jobs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Job));
    
    // Pre-fetch all customers to get their billing terms
    const custSnapshot = await getDocs(query(collection(db, 'customers'), where('org_id', '==', orgId)));
    const customersMap = custSnapshot.docs.reduce((acc, doc) => {
        acc[doc.id] = doc.data();
        return acc;
    }, {} as Record<string, any>);

    // 2. Group by Customer ID or Name
    const customerJobs: Record<string, { jobs: Job[], customerId?: string }> = {};
    jobs.forEach(job => {
        const key = job.customer_id || job.customer.name;
        if (!customerJobs[key]) {
            customerJobs[key] = { jobs: [], customerId: job.customer_id };
        }
        customerJobs[key].jobs.push(job);
    });

    // 3. Create Invoices
    const batch = writeBatch(db);
    const invoicesRef = collection(db, 'invoices');

    let invoiceCount = 0;

    for (const [key, group] of Object.entries(customerJobs)) {
        const cJobs = group.jobs;
        if (cJobs.length === 0) continue;

        const firstJob = cJobs[0];
        const total = cJobs.length * 150; // Mock price: $150 per job
        
        // Determine terms
        let daysToAdd = 30; // default net30
        const custData = group.customerId ? customersMap[group.customerId] : null;
        if (custData && custData.billing && custData.billing.terms) {
            const terms = custData.billing.terms;
            if (terms === 'due_on_receipt') daysToAdd = 0;
            else if (terms === 'net15') daysToAdd = 15;
            else if (terms === 'net30') daysToAdd = 30;
            else if (terms === 'net60') daysToAdd = 60;
            else if (terms === 'net90') daysToAdd = 90;
        }

        const invoiceRef = doc(invoicesRef);
        
        // Determine base date for due date calculation (latest job finish or today)
        let baseDate = new Date();
        const latestJob = [...cJobs].sort((a, b) => {
            const timeA = a.finished_at?.seconds || 0;
            const timeB = b.finished_at?.seconds || 0;
            return timeB - timeA;
        })[0];
        if (latestJob && latestJob.finished_at) {
            baseDate = new Date(latestJob.finished_at.seconds * 1000);
        }
        
        const calculatedDueDate = new Date(baseDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);

        batch.set(invoiceRef, {
            org_id: orgId,
            customer_id: group.customerId || null,
            customer: {
                name: firstJob.customer.name,
                address: firstJob.customer.address,
                email: firstJob.customer.email
            },
            items: cJobs.map(job => ({
                description: `${job.request?.description || 'Service completed'} - ${job.finished_at ? new Date(job.finished_at.seconds * 1000).toLocaleDateString() : 'Completed'}`,
                amount: 150.00,
                quantity: 1
            })),
            total: total,
            status: 'pending',
            createdAt: serverTimestamp(),
            dueDate: Timestamp.fromDate(calculatedDueDate)
        });
        invoiceCount++;
    }

    await batch.commit();
    console.log(`Generated ${invoiceCount} invoices from ${jobs.length} completed jobs.`);
    alert(`Generated ${invoiceCount} invoices!`);
};
