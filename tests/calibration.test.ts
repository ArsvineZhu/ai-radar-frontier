import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCalibrationSummary,
  createEmptyCalibrationStore,
  createShortWindowObservation,
  createWorkloadObservation,
  estimateKappa,
  estimateWorkload,
} from "../src/calibration.js";
import {
  clearCalibration,
  loadCalibrationStore,
  savePreferences,
} from "../src/storage.js";

function short(overrides: Record<string, unknown> = {}) {
  return createShortWindowObservation({
    plan: "plus",
    method: "full-window",
    fullWindows: 1,
    weeklyBefore: 1,
    weeklyAfter: 0.85,
    id: "short-test",
    ...overrides,
  });
}

function workload(overrides: Record<string, unknown> = {}) {
  return createWorkloadObservation(
    {
      plan: "pro20",
      model: "gpt-6-astra",
      family: "astra",
      effort: "medium",
      mode: "standard",
      benchmarkCostEquivalent: 1,
      benchmarkMinutes: 10,
      quotaBudget20x: 100,
      actualMinutes: 20,
      representativeTask: true,
      id: "workload-test",
      ...overrides,
    },
    0.155,
  );
}

test("the default short-window prior is 0.155", () => {
  const summary = estimateKappa("plus", []);
  assert.equal(summary.ratio, 0.155);
  assert.equal(summary.status, "baseline");
});

test("generated observation ids call crypto.randomUUID with its receiver", () => {
  const observation = createShortWindowObservation({
    plan: "plus",
    method: "full-window",
    fullWindows: 1,
    weeklyBefore: 1,
    weeklyAfter: 0.8,
  });
  assert.equal(observation.status, "accepted");
  assert.ok(observation.id.length > 0);
});

test("three complete windows with 100% to 55% produce .15 observation and .15125 posterior", () => {
  const observation = short({ fullWindows: 3, weeklyAfter: 0.55 });
  assert.equal(observation.estimatedKappa, 0.15);
  const summary = estimateKappa("plus", [observation]);
  assert.equal(summary.ratio, 0.15125);
  assert.equal(summary.exposure, 3);
  assert.equal(summary.status, "stable");
});

test("kappa aggregates exposure instead of averaging ratios", () => {
  const first = short({ id: "first", fullWindows: 0.1, weeklyAfter: 0.98 });
  const second = short({ id: "second", fullWindows: 3, weeklyAfter: 0.55 });
  const summary = estimateKappa("plus", [first, second]);
  const expected = (0.155 + 0.02 + 0.45) / (1 + 0.1 + 3);
  assert.ok(Math.abs(summary.ratio - expected) < 1e-12);
});

test("invalid short-window observations remain rejected", () => {
  const invalid = short({ fullWindows: 0, id: "invalid" });
  assert.equal(invalid.status, "rejected");
  assert.ok(invalid.rejectionReason);
  assert.equal(estimateKappa("plus", [invalid]).ratio, 0.155);
  const invalidRatio = short({ id: "invalid-ratio", weeklyAfter: 0 });
  assert.equal(invalidRatio.status, "rejected");
});

test("workload alpha uses measured weekly usage and beta uses active minutes", () => {
  const observation = workload({ weeklyBefore: 0.9, weeklyAfter: 0.85 });
  assert.equal(observation.status, "accepted");
  assert.ok(Math.abs(observation.alphaObservation! - 5) < 1e-12);
  assert.ok(Math.abs(observation.betaObservation! - 2) < 1e-12);
});

test("workload alpha can be inferred from short-window usage", () => {
  const observation = workload({ shortBefore: 0.9, shortAfter: 0.8 });
  assert.equal(observation.status, "accepted");
  assert.ok(Math.abs(observation.weeklyUsage! - 0.0155) < 1e-12);
  assert.ok(Math.abs(observation.alphaObservation! - 1.55) < 1e-12);
});

test("workload aggregation uses geometric medians and confidence shrinkage", () => {
  const observations = [
    workload({ id: "a", actualMinutes: 10, weeklyUsage: 0.1 }),
    workload({ id: "b", actualMinutes: 30, weeklyUsage: 0.2 }),
    workload({ id: "c", actualMinutes: 20, weeklyUsage: 0.1 }),
  ];
  const summary = estimateWorkload(observations);
  assert.equal(summary.timeConfidence, 1);
  assert.equal(summary.quotaConfidence, 1);
  assert.equal(summary.beta, 2);
  assert.ok(Math.abs(summary.alpha - 10) < 1e-12);
});

test("no valid workload observation returns neutral calibration", () => {
  const summary = estimateWorkload([workload({ actualMinutes: 0 })]);
  assert.equal(summary.alpha, 5);
  assert.equal(summary.beta, 1);
  assert.equal(summary.quotaConfidence, 0);
  assert.equal(summary.timeConfidence, 0);
});

test("one time sample is only initial confidence and three reach full confidence", () => {
  const one = estimateWorkload([workload({ actualMinutes: 20 })]);
  assert.equal(one.timeConfidence, 1 / 3);
  const three = estimateWorkload([
    workload({ id: "a" }),
    workload({ id: "b" }),
    workload({ id: "c" }),
  ]);
  assert.equal(three.timeConfidence, 1);
});

test("calibration is plan-specific for the short window and global for workload", () => {
  const store = createEmptyCalibrationStore();
  store.shortWindowObservations.push(short());
  store.workloadObservations.push(workload());
  const plus = buildCalibrationSummary(store, "plus");
  const pro5 = buildCalibrationSummary(store, "pro5");
  assert.ok(Math.abs(plus.shortWindow.ratio - (0.155 + 0.15) / 2) < 1e-12);
  assert.equal(pro5.shortWindow.ratio, 0.155);
  assert.equal(plus.workload.beta, pro5.workload.beta);
  assert.equal(plus.shortWindowEnabled, true);
  assert.equal(pro5.shortWindowEnabled, false);
});

test("corrupt local storage is safe and calibration reset preserves preferences", () => {
  const values = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (_index: number) => null,
    length: 0,
  } as Storage;
  const previous = (globalThis as Record<string, unknown>).window;
  (globalThis as Record<string, unknown>).window = { localStorage };
  try {
    values.set("ai-radar-frontier-userscript:quota-calibration:v1", "not-json");
    assert.deepEqual(loadCalibrationStore(), createEmptyCalibrationStore());
    savePreferences({ subscription: "pro5", fastEnabled: false });
    clearCalibration();
    assert.ok(values.has("ai-radar-frontier-userscript:preferences"));
  } finally {
    if (previous === undefined)
      delete (globalThis as Record<string, unknown>).window;
    else (globalThis as Record<string, unknown>).window = previous;
  }
});
