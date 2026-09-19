/**
 * Unit Tests for DispatchBox Field Action Items, Prioritization, and State Transitions
 */

import { Job, FieldQuoteRequest, PartsRequisitionRequest, FieldActionItem } from '../types';

export function categorizeFieldActionItems(jobs: Job[]) {
    const scopeApprovals = jobs.filter(j => (j.pending_scope_approval || j.has_scope_amendment) && !j.archived);
    const quoteRequests = jobs.filter(j => j.field_quote_requested && !j.archived);
    const partsNeeded = jobs.filter(j => j.parts_needed && !j.archived);
    const reschedules = jobs.filter(j => (j as any).reschedule_requested && !j.archived);
    const criticalUnscheduled = jobs.filter(j => ['pending', 'unscheduled'].includes(j.status) && j.priority === 'critical' && !j.archived);

    return {
        scopeApprovals,
        quoteRequests,
        partsNeeded,
        reschedules,
        criticalUnscheduled,
        totalActionsCount: scopeApprovals.length + quoteRequests.length + partsNeeded.length + reschedules.length
    };
}

export function sortActionItemsByPriority(items: Array<{ id: string; type: string; urgency: string; title: string }>) {
    const urgencyWeight: Record<string, number> = { emergency: 100, high: 50, medium: 20, standard: 10, low: 5 };
    const typeWeight: Record<string, number> = { approval: 40, scope_approval: 40, quote: 30, field_quote: 30, parts: 20, parts_procurement: 20, reschedule: 10 };

    return [...items].sort((a, b) => {
        const weightA = (urgencyWeight[a.urgency] || 10) + (typeWeight[a.type] || 0);
        const weightB = (urgencyWeight[b.urgency] || 10) + (typeWeight[b.type] || 0);
        return weightB - weightA;
    });
}

// ---------------------------------------------------------------------------
// Test Assertions Runner
// ---------------------------------------------------------------------------
export function runFieldActionTests(): { passed: boolean; results: string[] } {
    const results: string[] = [];
    let allPassed = true;

    function assert(condition: boolean, testName: string) {
        if (condition) {
            results.push(`✅ PASS: ${testName}`);
        } else {
            results.push(`❌ FAIL: ${testName}`);
            allPassed = false;
        }
    }

    // Mock Jobs Data
    const mockJobs: Job[] = [
        {
            id: 'job-1',
            org_id: 'org-test',
            status: 'in_progress',
            priority: 'high',
            customer: { name: 'Alice Smith', phone: '808-111-2222', email: 'alice@example.com', address: '123 Main St' },
            request: { description: 'Main line check', photos: [], availability: [] },
            field_quote_requested: true,
            field_quote_details: {
                requestedAt: new Date(),
                requestedBy: 'tech-1',
                techName: 'Bob Tech',
                scopeDescription: 'Customer needs main water line replacement quote.',
                urgency: 'high',
                customerPreference: 'waiting_on_site',
                status: 'pending'
            }
        },
        {
            id: 'job-2',
            org_id: 'org-test',
            status: 'in_progress',
            priority: 'critical',
            customer: { name: 'Charlie Brown', phone: '808-333-4444', email: 'charlie@example.com', address: '456 Oak Ave' },
            request: { description: 'Pressure valve repair', photos: [], availability: [] },
            parts_needed: true,
            parts_procurement_status: 'pending_office_order',
            parts_request: {
                requestedAt: new Date(),
                requestedBy: 'tech-2',
                techName: 'Dan Tech',
                items: [
                    { name: 'OEM 3-inch Brass Pressure Relief Valve', sku: 'PRV-300', quantity: 1, cantPickupReason: 'Special order OEM part' }
                ],
                urgency: 'emergency',
                procurementStatus: 'pending_office_order'
            }
        },
        {
            id: 'job-3',
            org_id: 'org-test',
            status: 'in_progress',
            priority: 'medium',
            customer: { name: 'Eve Davis', phone: '808-555-6666', email: 'eve@example.com', address: '789 Pine Rd' },
            request: { description: 'Pipe inspection', photos: [], availability: [] },
            pending_scope_approval: true,
            has_scope_amendment: true,
            scope_amendments: [
                {
                    id: 'amend-1',
                    items: [{ id: 'i-1', description: 'Additional pipe leak soldering', type: 'labor', quantity: 1, unitPrice: 185 }],
                    totalAmount: 185,
                    reason: 'Discovered rusted elbow joint behind wall',
                    approvedVia: 'sms_pending'
                }
            ]
        },
        {
            id: 'job-4',
            org_id: 'org-test',
            status: 'pending',
            priority: 'critical',
            customer: { name: 'Frank Miller', phone: '808-777-8888', email: 'frank@example.com', address: '101 Elm St' },
            request: { description: 'Severe sewer backup in basement', photos: [], availability: [] }
        },
        {
            id: 'job-5',
            org_id: 'org-test',
            status: 'completed',
            priority: 'low',
            customer: { name: 'Grace Hopper', phone: '808-999-0000', email: 'grace@example.com', address: '202 Birch Blvd' },
            request: { description: 'Annual maintenance', photos: [], availability: [] }
        }
    ];

    // Test 1: Category Filtering & Extraction
    const categories = categorizeFieldActionItems(mockJobs);
    assert(categories.quoteRequests.length === 1, 'Extracts active field quote requests');
    assert(categories.partsNeeded.length === 1, 'Extracts active parts requisitions');
    assert(categories.scopeApprovals.length === 1, 'Extracts pending scope amendments');
    assert(categories.criticalUnscheduled.length === 1, 'Identifies critical unscheduled emergency jobs');
    assert(categories.totalActionsCount === 3, 'Calculates total pending action count accurately');

    // Test 2: Priority Ordering
    const itemsToSort = [
        { id: '1', type: 'parts', urgency: 'standard', title: 'Standard Part' },
        { id: '2', type: 'approval', urgency: 'emergency', title: 'Emergency Scope Approval' },
        { id: '3', type: 'quote', urgency: 'high', title: 'High Quote Request' },
        { id: '4', type: 'parts', urgency: 'emergency', title: 'Emergency Part' }
    ];

    const sorted = sortActionItemsByPriority(itemsToSort);
    assert(sorted[0].id === '2', 'Emergency Scope Approval is prioritized at position 1');
    assert(sorted[1].id === '4', 'Emergency Part Requisition is prioritized at position 2');
    assert(sorted[2].id === '3', 'High Quote Request is prioritized at position 3');
    assert(sorted[3].id === '1', 'Standard Part is placed last');

    // Test 3: Resolution Transitions
    const jobToResolveQuote = { ...mockJobs[0] };
    jobToResolveQuote.field_quote_requested = false;
    if (jobToResolveQuote.field_quote_details) {
        jobToResolveQuote.field_quote_details.status = 'resolved';
    }
    const resolvedCategories = categorizeFieldActionItems([jobToResolveQuote, mockJobs[1], mockJobs[2]]);
    assert(resolvedCategories.quoteRequests.length === 0, 'Quote request resolves cleanly when flag is cleared');

    const jobToResolveParts = { ...mockJobs[1] };
    jobToResolveParts.parts_needed = false;
    jobToResolveParts.parts_procurement_status = 'resolved';
    const partsResolvedCategories = categorizeFieldActionItems([mockJobs[0], jobToResolveParts, mockJobs[2]]);
    assert(partsResolvedCategories.partsNeeded.length === 0, 'Parts requisition resolves cleanly when status is resolved');

    const jobToApproveScope = { ...mockJobs[2] };
    jobToApproveScope.pending_scope_approval = false;
    jobToApproveScope.has_scope_amendment = false;
    const scopeResolvedCategories = categorizeFieldActionItems([mockJobs[0], mockJobs[1], jobToApproveScope]);
    assert(scopeResolvedCategories.scopeApprovals.length === 0, 'Scope approval resolves cleanly');

    return { passed: allPassed, results };
}

// Auto-run when executed directly
if (typeof window === 'undefined') {
    const { passed, results } = runFieldActionTests();
    console.log('\n--- Field Action Items Test Suite Results ---');
    results.forEach(r => console.log(r));
    console.log(`\nOverall Test Status: ${passed ? 'ALL PASSED (100%)' : 'SOME FAILED'}\n`);
}
