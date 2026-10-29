// Frontend pure-logic tests (no browser). Run: npm run test:logic
// Bundles the TS modules with esbuild, then exercises them with node:test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'src', 'lib');
const out = mkdtempSync(join(tmpdir(), 'fsm-logic-'));

function load(name) {
    const file = join(out, `${name}.cjs`);
    const r = buildSync({ entryPoints: [join(src, `${name}.ts`)], bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' });
    writeFileSync(file, r.outputFiles[0].text);
    return createRequire(import.meta.url)(file);
}

const { buildInvoice, normalizeTaxRate, actualLaborMinutes } = load('invoiceBuilder');
const { getJobStage, isAwaitingSchedule } = load('jobStage');

// ── invoiceBuilder ─────────────────────────────────────────
test('fixed: quote lines, skip unselected optional + company expense, discount, tax, deposit', () => {
    const quote = {
        billingType: 'fixed', taxRate: 4.712, discount: 50,
        lineItems: [
            { description: 'Install', quantity: 1, unitPrice: 1000 },
            { description: 'Optional upgrade', quantity: 1, unitPrice: 300, isOptional: true },
            { description: 'Truck rental', quantity: 1, unitPrice: 80, isCompanyExpense: true },
            { description: 'Part', quantity: 2, unitPrice: 25, taxable: true },
        ],
    };
    const job = { deposit_paid: true, deposit_amount: 200 };
    const inv = buildInvoice({ job, quote });
    assert.equal(inv.billingType, 'fixed');
    assert.equal(inv.items.length, 3); // install, part, discount
    assert.equal(inv.subtotal, 1000);   // 1000 + 50 - 50
    assert.equal(inv.tax_amount, Math.round(1050 * 0.04712 * 100) / 100); // discount line not taxable
    assert.equal(inv.deposit_applied, 200);
    assert.equal(inv.balance_due, Math.round((inv.total - 200) * 100) / 100);
});

test('fixed: approved amendments added, sms_pending ignored, overruns added', () => {
    const quote = { billingType: 'fixed', taxRate: 0, lineItems: [{ description: 'Base', quantity: 1, unitPrice: 500 }] };
    const job = {
        scope_amendments: [
            { approvedVia: 'signature', items: [{ description: 'Extra valve', quantity: 1, unitPrice: 120 }] },
            { approvedVia: 'sms_pending', items: [{ description: 'Not yet', quantity: 1, unitPrice: 999 }] },
        ],
    };
    const inv = buildInvoice({ job, quote, approvedOverruns: [{ reason: 'Rot', additionalTotal: 80 }] });
    assert.equal(inv.subtotal, 700);
    assert.ok(inv.items.some(i => i.kind === 'amendment'));
    assert.ok(!inv.items.some(i => i.description.includes('Not yet')));
});

test('T&M: labor hours x rate, materials x markup, trip fee, not-to-exceed flag', () => {
    const quote = { billingType: 'time_and_materials', taxRate: 0, tmTerms: { laborRate: 100, materialMarkup: 20, tripFee: 50, notToExceed: 300 } };
    const job = {
        costs: { labor: { actualMinutes: 150 }, parts: { items: [{ name: 'Pipe', quantity: 2, unitCost: 10 }] } },
    };
    const inv = buildInvoice({ job, quote });
    assert.equal(inv.billingType, 'time_and_materials');
    const labor = inv.items.find(i => i.kind === 'labor');
    assert.equal(labor.quantity, 2.5);
    assert.equal(labor.total, 250);
    assert.equal(inv.items.find(i => i.kind === 'material').total, 24);
    assert.equal(inv.subtotal, 324);
    assert.equal(inv.exceedsCap, true);
});

test('T&M without quote uses org defaults and actual start/end', () => {
    const job = { billingType: 'time_and_materials', actual_start: '2026-10-01T10:00:00Z', actual_end: '2026-10-01T11:30:00Z' };
    assert.equal(actualLaborMinutes(job), 90);
    const inv = buildInvoice({ job, quote: null, defaults: { laborRate: 80, materialMarkup: 0 } });
    assert.equal(inv.subtotal, 120);
});

test('tax rate accepts percent or decimal', () => {
    assert.equal(normalizeTaxRate(4.712), 0.04712);
    assert.equal(normalizeTaxRate(0.05), 0.05);
    assert.equal(normalizeTaxRate(undefined), 0);
});

// ── jobStage ───────────────────────────────────────────────
const team = { teamType: 'small_team', requireDispatchAck: true };
const solo = { teamType: 'solo', requireDispatchAck: false };

test('approved job waiting on deposit vs ready', () => {
    assert.equal(getJobStage({ status: 'unscheduled', blockers: ['deposit'] }, { workflow: team }).nextAction.id, 'collect_deposit');
    assert.equal(getJobStage({ status: 'unscheduled', blockers: ['parts'] }, { workflow: team }).detail, 'Waiting on parts');
    assert.equal(getJobStage({ status: 'unscheduled', blockers: [] }, { workflow: team }).key, 'ready');
    assert.equal(isAwaitingSchedule({ status: 'pending', quoteStatus: 'approved' }), true);
});

test('scheduled → dispatch for teams, start driving for solo', () => {
    assert.equal(getJobStage({ status: 'scheduled' }, { workflow: team }).nextAction.id, 'dispatch');
    assert.equal(getJobStage({ status: 'scheduled' }, { workflow: solo }).nextAction.id, 'start_driving');
});

test('dispatched: tech must accept when required', () => {
    assert.equal(getJobStage({ status: 'dispatched' }, { workflow: team, viewerIsTech: true }).nextAction.id, 'accept');
    assert.equal(getJobStage({ status: 'dispatched' }, { workflow: team }).nextAction.id, 'await_ack');
    assert.equal(getJobStage({ status: 'dispatched', dispatch_acknowledged_at: new Date() }, { workflow: team, viewerIsTech: true }).nextAction.id, 'start_driving');
    assert.equal(getJobStage({ status: 'dispatched' }, { workflow: { teamType: 'small_team', requireDispatchAck: false }, viewerIsTech: true }).nextAction.id, 'start_driving');
});

test('completed → invoice states', () => {
    assert.equal(getJobStage({ status: 'completed' }).nextAction.id, 'create_invoice');
    assert.equal(getJobStage({ status: 'completed', invoice_id: 'x' }).nextAction.id, 'send_invoice');
    assert.equal(getJobStage({ status: 'completed' }, { invoiceStatus: 'paid' }).key, 'paid');
});
