/**
 * Workflow engine unit tests (Node built-in test runner).
 * Run:  npm test   (from firebase/functions)
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp({ projectId: "workflow-unit-test" });

const { computePartsStatus } = require("../lib/workflow/partsReadiness");
const { computeReadiness, jobNeedsParts } = require("../lib/workflow/jobReadiness");
const { resolveWorkflow } = require("../lib/workflow/orgWorkflow");
const { zonedTimeToUtc, findBestAssignment, localDateKey } = require("../lib/workflow/autoSchedule");

const TZ = "Pacific/Honolulu"; // UTC-10, no DST

// ───────────── parts readiness ─────────────
test("parts: all POs received → ready", () => {
    assert.deepEqual(computePartsStatus(["received", "received"]), { status: "ready", ready: true });
});
test("parts: one PO open → not ready (was the old bug)", () => {
    assert.deepEqual(computePartsStatus(["received", "sent"]), { status: "partially_received", ready: false });
});
test("parts: partial receipt → not ready", () => {
    assert.deepEqual(computePartsStatus(["partially_received"]), { status: "partially_received", ready: false });
});
test("parts: canceled POs ignored", () => {
    assert.deepEqual(computePartsStatus(["received", "canceled"]), { status: "ready", ready: true });
    assert.equal(computePartsStatus(["canceled"]), null);
});
test("parts: sent only → ordered; draft only → pending office order", () => {
    assert.equal(computePartsStatus(["sent"]).status, "ordered");
    assert.equal(computePartsStatus(["draft"]).status, "pending_office_order");
});

// ───────────── ready-to-schedule gate ─────────────
const needsPartsJob = { materials_needed: [{ name: "Valve", received: false }], parts_ready: false };
test("gate: unpaid deposit blocks", () => {
    assert.deepEqual(computeReadiness({ deposit_required: true, deposit_paid: false }, { partsRule: "schedule_anyway" }).blockers, ["deposit"]);
    assert.deepEqual(computeReadiness({ deposit_required: true, deposit_paid: true }, { partsRule: "schedule_anyway" }).blockers, []);
});
test("gate: parts rule block/warn/schedule_anyway", () => {
    assert.deepEqual(computeReadiness(needsPartsJob, { partsRule: "block" }).blockers, ["parts"]);
    const warn = computeReadiness(needsPartsJob, { partsRule: "warn" });
    assert.deepEqual(warn.blockers, []);
    assert.equal(warn.warnings.length, 1);
    assert.deepEqual(computeReadiness(needsPartsJob, { partsRule: "schedule_anyway" }), { blockers: [], warnings: [] });
});
test("gate: parts_ready or per-job override clears parts", () => {
    assert.equal(jobNeedsParts({ ...needsPartsJob, parts_ready: true }), false);
    assert.equal(jobNeedsParts({ ...needsPartsJob, materialSchedulingOverride: "allow_all" }), false);
});

// ───────────── workflow resolution ─────────────
test("workflow: plan → team type defaults", () => {
    const solo = resolveWorkflow({ plan: "individual" });
    assert.equal(solo.teamType, "solo");
    assert.equal(solo.schedulingMode, "manual");
    assert.equal(solo.requireDispatchAck, false);
    assert.equal(solo.prepEnabled, false);
    const co = resolveWorkflow({ plan: "enterprise" });
    assert.equal(co.teamType, "company");
    assert.equal(co.prepEnabled, true);
    assert.equal(co.schedulingMode, "auto");
});
test("workflow: legacy settings respected until setup is saved", () => {
    const wf = resolveWorkflow({ materialSchedulingMode: "in_stock_only", autoCallbackEnabled: true });
    assert.equal(wf.partsRule, "block");
    assert.equal(wf.schedulingMode, "customer_picks");
    assert.equal(wf.configured, false);
});
test("workflow: saved answers win; solo never requires dispatch ack", () => {
    const wf = resolveWorkflow({ settings: { workflow: { teamType: "solo", requireDispatchAck: true, prepEnabled: true, partsRule: "warn" } } });
    assert.equal(wf.requireDispatchAck, false);
    assert.equal(wf.prepEnabled, true);
    assert.equal(wf.partsRule, "warn");
    assert.equal(wf.configured, true);
});

// ───────────── timezone-correct scheduling ─────────────
test("tz: 9:00 AM Honolulu = 19:00 UTC", () => {
    const ms = zonedTimeToUtc(2026, 9, 27, 9 * 60, TZ);
    assert.equal(new Date(ms).toISOString(), "2026-10-27T19:00:00.000Z");
});

// "now" = Mon Oct 26 2026 13:00 HST → search starts with today (needs +2h) then Tue
const NOW = zonedTimeToUtc(2026, 9, 26, 13 * 60, TZ);
const tech = (id, extra = {}) => ({ id, name: id, email: `${id}@x.com`, role: "technician", ...extra });

test("auto-schedule: avoids overlapping an existing booking", () => {
    const tue9 = zonedTimeToUtc(2026, 9, 27, 8 * 60, TZ);
    const job = { id: "J", estimated_duration: 120, request: { availabilityWindows: [{ day: "2026-10-27", startTime: "08:00", endTime: "17:00" }] } };
    const existing = [{ id: "E", assigned_tech_id: "A", status: "scheduled", scheduled_at: new Date(tue9), estimated_duration: 180 }];
    const pick = findBestAssignment(job, [tech("A")], existing, TZ, NOW);
    assert.ok(pick);
    // Existing job 8:00–11:00 → first fit is 11:00 HST = 21:00 UTC
    assert.equal(new Date(pick.startMs).toISOString(), "2026-10-27T21:00:00.000Z");
});
test("auto-schedule: honors customer 'afternoon' preference", () => {
    const job = { id: "J", estimated_duration: 60, request: { availabilityWindows: [{ day: "tuesday", preferredTime: "afternoon" }] } };
    const pick = findBestAssignment(job, [tech("A")], [], TZ, NOW);
    assert.equal(localDateKey(pick.startMs, TZ), "2026-10-27");
    assert.equal(new Date(pick.startMs).toISOString(), "2026-10-27T22:00:00.000Z"); // 12:00 HST
});
test("auto-schedule: prefers the skilled tech", () => {
    const job = { id: "J", estimated_duration: 60, category: "plumbing" };
    const pick = findBestAssignment(job, [tech("Elec", { specialties: ["electrical"] }), tech("Plumb", { specialties: ["plumbing"] })], [], TZ, NOW);
    assert.equal(pick.techId, "Plumb");
});
test("auto-schedule: skips techs on vacation or with day off", () => {
    const job = { id: "J", estimated_duration: 60, request: { availabilityWindows: [{ day: "2026-10-27" }] } };
    const vac = tech("V", { vacationDates: [{ start: "2026-10-27T00:00:00-10:00", end: "2026-10-28T00:00:00-10:00" }] });
    const off = tech("O", { weeklyAvailability: { tuesday: { available: false } } });
    assert.equal(findBestAssignment(job, [vac, off], [], TZ, NOW), null);
});
test("auto-schedule: same-day slots start at least 2h out", () => {
    const job = { id: "J", estimated_duration: 60 };
    const pick = findBestAssignment(job, [tech("A")], [], TZ, NOW);
    assert.ok(pick.startMs >= NOW + 2 * 3600000);
});
