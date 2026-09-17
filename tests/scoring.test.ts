import assert from "node:assert/strict";
import test from "node:test";
import { WORKLOAD_ALPHA_PRIOR, PLAN_LIMITS } from "../src/config.js";
import {
  createDefaultCalibrationContext,
  evaluateCandidateEligibility,
  evaluateRecords,
  isSimilar,
  practicalDominates,
  scoreRecords,
  sortScoredRecords,
} from "../src/scoring.js";
import type { CalibrationDerivedContext } from "../src/calibration.js";
import type { ModelRecord } from "../src/scoring.js";

function record(overrides: Partial<ModelRecord> = {}): ModelRecord {
  return {
    model: "gpt-6-astra",
    family: "astra",
    effort: "medium",
    label: "Astra medium",
    iq: 100,
    qualityIq: 100,
    benchmarkCostEquivalent: 1,
    benchmarkMinutes: 10,
    index: 0,
    key: "gpt-6-astra::medium",
    sampleCount: 100,
    quotaBudget20x: 100,
    quotaSource: "family-radar",
    mode: "standard",
    ...overrides,
  };
}

function context(
  plan: "plus" | "pro5" | "pro20" = "plus",
  overrides: Partial<CalibrationDerivedContext> = {},
): CalibrationDerivedContext {
  const base = createDefaultCalibrationContext(plan);
  return {
    ...base,
    ...overrides,
    shortWindow: { ...base.shortWindow, ...(overrides.shortWindow || {}) },
    workload: { ...base.workload, ...(overrides.workload || {}) },
  };
}

test("family capacity scales by 1, 5, and 20 plan multipliers", () => {
  const candidate = record({ benchmarkCostEquivalent: 1 });
  const plus = evaluateRecords([candidate], "plus")[0];
  const pro5 = evaluateRecords([candidate], "pro5")[0];
  const pro20 = evaluateRecords([candidate], "pro20")[0];
  assert.equal(PLAN_LIMITS.plus.multiplier, 1);
  assert.equal(PLAN_LIMITS.pro5.multiplier, 5);
  assert.equal(PLAN_LIMITS.pro20.multiplier, 20);
  assert.equal(plus.effectiveWeeklyShare, 5 * pro5.effectiveWeeklyShare!);
  assert.equal(plus.effectiveWeeklyShare, 20 * pro20.effectiveWeeklyShare!);
});

test("derived weekly share, short share, and endurance follow the V3 formulas", () => {
  const evaluated = evaluateRecords(
    [record({ benchmarkCostEquivalent: 1, benchmarkMinutes: 10 })],
    "pro20",
    context("pro20", {
      shortWindow: { ratio: 0.2, exposure: 0, status: "baseline" },
      workload: {
        alpha: 2,
        beta: 3,
        quotaConfidence: 0,
        timeConfidence: 0,
        status: "baseline",
        sampleCount: 0,
      },
      shortWindowEnabled: true,
    }),
  )[0];
  assert.ok(Math.abs(evaluated.effectiveWeeklyShare! - 0.02) < 1e-12);
  assert.ok(Math.abs(evaluated.effectiveShortWindowShare! - 0.1) < 1e-12);
  assert.equal(evaluated.effectiveMinutes, 30);
  assert.equal(evaluated.shortWindowEnduranceMinutes, 300);
  assert.equal(evaluated.weeklyCapacityTasks, 50);
});

test("short-window disabled removes the H metric and does not create a hidden gate", () => {
  const evaluated = evaluateRecords([record()], "pro5")[0];
  assert.equal(evaluated.enduranceUtility, null);
  assert.equal(evaluated.shortWindowEnduranceMinutes, null);
  const scored = scoreRecords(
    [evaluated],
    "budget",
    createDefaultCalibrationContext("pro5"),
  )[0];
  assert.ok(Number.isFinite(scored.strategyScore));
});

test("the default workload alpha is 5 and scales default endurance accordingly", () => {
  const defaultContext = createDefaultCalibrationContext("plus");
  const neutralContext = context("plus", {
    workload: {
      alpha: 1,
      beta: 1,
      quotaConfidence: 0,
      timeConfidence: 0,
      status: "baseline",
      sampleCount: 0,
    },
  });
  const defaultRecord = evaluateRecords([record()], "plus", defaultContext)[0];
  const neutralRecord = evaluateRecords([record()], "plus", neutralContext)[0];
  assert.equal(defaultContext.workload.alpha, WORKLOAD_ALPHA_PRIOR);
  assert.ok(
    Math.abs(
      neutralRecord.shortWindowEnduranceMinutes! /
        defaultRecord.shortWindowEnduranceMinutes! -
        WORKLOAD_ALPHA_PRIOR,
    ) < 1e-10,
  );
});

test("alpha worsens burden and endurance while beta changes effective time and active endurance", () => {
  const base = evaluateRecords(
    [record()],
    "plus",
    context("plus", {
      workload: {
        alpha: 1,
        beta: 1,
        quotaConfidence: 0,
        timeConfidence: 0,
        status: "baseline",
        sampleCount: 0,
      },
    }),
  )[0];
  const heavier = evaluateRecords(
    [record()],
    "plus",
    context("plus", {
      workload: {
        alpha: 2,
        beta: 1,
        quotaConfidence: 0,
        timeConfidence: 0,
        status: "baseline",
        sampleCount: 0,
      },
    }),
  )[0];
  const slower = evaluateRecords(
    [record()],
    "plus",
    context("plus", {
      workload: {
        alpha: 1,
        beta: 2,
        quotaConfidence: 0,
        timeConfidence: 0,
        status: "baseline",
        sampleCount: 0,
      },
    }),
  )[0];
  assert.ok(heavier.effectiveWeeklyShare! > base.effectiveWeeklyShare!);
  assert.ok(
    heavier.shortWindowEnduranceMinutes! < base.shortWindowEnduranceMinutes!,
  );
  assert.ok(slower.effectiveMinutes > base.effectiveMinutes);
  assert.ok(
    slower.shortWindowEnduranceMinutes! > base.shortWindowEnduranceMinutes!,
  );
});

test("utility values are candidate-set independent", () => {
  const candidate = record({ key: "candidate" });
  const alone = evaluateRecords([candidate], "pro20")[0];
  const withOther = evaluateRecords(
    [
      candidate,
      record({ key: "other", qualityIq: 130, benchmarkCostEquivalent: 9 }),
    ],
    "pro20",
  )[0];
  assert.equal(alone.qualityUtility, withOther.qualityUtility);
  assert.equal(alone.timeUtility, withOther.timeUtility);
  assert.equal(alone.weeklyUtility, withOther.weeklyUtility);
});

test("non-quality score is monotonic in each favorable dimension", () => {
  const base = evaluateRecords([record()], "pro20")[0];
  const betterQuality = evaluateRecords(
    [record({ qualityIq: 104 })],
    "pro20",
  )[0];
  const slower = evaluateRecords(
    [record({ benchmarkMinutes: 20 })],
    "pro20",
  )[0];
  const heavier = evaluateRecords(
    [record({ benchmarkCostEquivalent: 2 })],
    "pro20",
  )[0];
  const basePlus = evaluateRecords([record()], "plus")[0];
  const longerEndurance = evaluateRecords(
    [record({ benchmarkMinutes: 20 })],
    "plus",
  )[0];
  assert.ok(
    scoreRecords(
      [betterQuality],
      "effectiveness",
      createDefaultCalibrationContext("pro20"),
    )[0].strategyScore >=
      scoreRecords(
        [base],
        "effectiveness",
        createDefaultCalibrationContext("pro20"),
      )[0].strategyScore,
  );
  assert.ok(
    scoreRecords(
      [slower],
      "effectiveness",
      createDefaultCalibrationContext("pro20"),
    )[0].strategyScore <
      scoreRecords(
        [base],
        "effectiveness",
        createDefaultCalibrationContext("pro20"),
      )[0].strategyScore,
  );
  assert.ok(
    scoreRecords(
      [heavier],
      "effectiveness",
      createDefaultCalibrationContext("pro20"),
    )[0].strategyScore <
      scoreRecords(
        [base],
        "effectiveness",
        createDefaultCalibrationContext("pro20"),
      )[0].strategyScore,
  );
  assert.ok(longerEndurance.enduranceUtility! >= basePlus.enduranceUtility!);
});

test("IQ 96 has no special qualification gate and IQ below 70 remains excluded", () => {
  const contextValue = createDefaultCalibrationContext("pro20");
  const candidates = evaluateRecords(
    [
      record({ key: "95", qualityIq: 95 }),
      record({ key: "69", qualityIq: 69 }),
    ],
    "pro20",
  );
  assert.equal(
    evaluateCandidateEligibility(candidates[0], contextValue).eligible,
    true,
  );
  assert.equal(
    evaluateCandidateEligibility(candidates[1], contextValue).reason,
    "below-iq-floor",
  );
});

test("quality winner is constrained to the highest four-IQ band but exact IQ remains in score", () => {
  const candidates = evaluateRecords(
    [
      record({
        key: "quality",
        qualityIq: 108,
        benchmarkCostEquivalent: 8,
        benchmarkMinutes: 40,
      }),
      record({
        key: "faster",
        qualityIq: 104,
        benchmarkCostEquivalent: 1,
        benchmarkMinutes: 5,
      }),
      record({
        key: "outside",
        qualityIq: 103.9,
        benchmarkCostEquivalent: 0.2,
        benchmarkMinutes: 1,
      }),
    ],
    "pro20",
  );
  const ordered = sortScoredRecords(
    scoreRecords(
      candidates,
      "quality",
      createDefaultCalibrationContext("pro20"),
    ),
    "quality",
  );
  assert.ok(["quality", "faster"].includes(ordered[0].key));
  assert.notEqual(ordered[0].key, "outside");
});

test("practical dominance uses tolerances and rejects a one-IQ but much heavier candidate", () => {
  const candidates = evaluateRecords(
    [
      record({
        key: "lighter",
        qualityIq: 100,
        benchmarkCostEquivalent: 1,
        benchmarkMinutes: 10,
      }),
      record({
        key: "heavier",
        qualityIq: 101,
        benchmarkCostEquivalent: 1.4,
        benchmarkMinutes: 14,
      }),
    ],
    "pro20",
  );
  assert.equal(practicalDominates(candidates[1], candidates[0], false), false);
  assert.equal(practicalDominates(candidates[0], candidates[1], false), true);
});

test("a low-burden but much slower candidate remains an independent trade-off", () => {
  const candidates = evaluateRecords(
    [
      record({ key: "fast", benchmarkCostEquivalent: 1, benchmarkMinutes: 10 }),
      record({
        key: "cheap-slow",
        benchmarkCostEquivalent: 0.1,
        benchmarkMinutes: 100,
      }),
    ],
    "pro20",
  );
  assert.equal(practicalDominates(candidates[1], candidates[0], false), false);
});

test("similarity is strict, mode-aware, and representative anchored by callers", () => {
  const candidates = evaluateRecords(
    [
      record({ key: "a", benchmarkMinutes: 10, benchmarkCostEquivalent: 1 }),
      record({
        key: "b",
        benchmarkMinutes: 10.3,
        benchmarkCostEquivalent: 1.03,
      }),
      record({
        key: "c",
        benchmarkMinutes: 10.6,
        benchmarkCostEquivalent: 1.06,
      }),
    ],
    "plus",
  );
  assert.equal(isSimilar(candidates[0], candidates[1], true), true);
  assert.equal(isSimilar(candidates[1], candidates[2], true), true);
  assert.equal(isSimilar(candidates[0], candidates[2], true), false);
  assert.equal(
    isSimilar({ ...candidates[0], mode: "fast" }, candidates[0], true),
    false,
  );
});

test("input permutation does not change ranking", () => {
  const records = [
    record({ key: "a", model: "gpt-6-astra", qualityIq: 104 }),
    record({
      key: "b",
      model: "gpt-5.6-sol",
      family: "sol",
      effort: "high",
      qualityIq: 102,
      benchmarkCostEquivalent: 0.8,
    }),
    record({
      key: "c",
      model: "gpt-5.6-luna",
      family: "luna",
      effort: "max",
      qualityIq: 100,
      benchmarkCostEquivalent: 0.5,
    }),
  ];
  const contextValue = createDefaultCalibrationContext("pro20");
  const first = sortScoredRecords(
    scoreRecords(
      evaluateRecords(records, "pro20"),
      "effectiveness",
      contextValue,
    ),
    "effectiveness",
  );
  const second = sortScoredRecords(
    scoreRecords(
      evaluateRecords([records[2], records[0], records[1]], "pro20"),
      "effectiveness",
      contextValue,
    ),
    "effectiveness",
  );
  assert.deepEqual(
    first.map((item) => item.key),
    second.map((item) => item.key),
  );
});

test("strong quota calibration can exclude actual resource infeasibility", () => {
  const candidate = evaluateRecords(
    [record({ benchmarkCostEquivalent: 100 })],
    "pro20",
    context("pro20", {
      workload: {
        alpha: 1,
        beta: 1,
        quotaConfidence: 0.67,
        timeConfidence: 0,
        status: "calibrated",
        sampleCount: 1,
      },
    }),
  )[0];
  assert.equal(
    evaluateCandidateEligibility(
      candidate,
      context("pro20", {
        workload: {
          alpha: 1,
          beta: 1,
          quotaConfidence: 0.67,
          timeConfidence: 0,
          status: "calibrated",
          sampleCount: 1,
        },
      }),
    ).reason,
    "resource-weekly",
  );
});

test("plan and workload scale change relative score gaps", () => {
  const fastHeavy = record({
    key: "fast-heavy",
    benchmarkCostEquivalent: 4,
    benchmarkMinutes: 5,
    qualityIq: 104,
  });

  const slowCheap = record({
    key: "slow-cheap",
    benchmarkCostEquivalent: 0.5,
    benchmarkMinutes: 20,
    qualityIq: 104,
  });

  function gap(alpha: number) {
    const ctx = context("pro20", {
      workload: {
        alpha,
        beta: 1,
        quotaConfidence: 0,
        timeConfidence: 0,
        status: "baseline",
        sampleCount: 0,
      },
    });

    const evaluated = evaluateRecords([fastHeavy, slowCheap], "pro20", ctx);

    const scored = scoreRecords(evaluated, "effectiveness", ctx);

    return scored[0].strategyScore - scored[1].strategyScore;
  }

  assert.notEqual(gap(1), gap(5));
});
