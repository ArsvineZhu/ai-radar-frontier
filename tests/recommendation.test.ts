import assert from "node:assert/strict";
import test from "node:test";
import { FAST_COST_MULTIPLIER } from "../src/config.js";
import { createDefaultCalibrationContext } from "../src/scoring.js";
import { buildStrategyResult } from "../src/recommendation.js";
import { createFastEstimator } from "../src/radar.js";
import { getCopy } from "../src/i18n.js";
import type { FastEstimator, FastMeasurement } from "../src/radar.js";
import type { ModelRecord } from "../src/scoring.js";

function record(overrides: Partial<ModelRecord> = {}): ModelRecord {
  return {
    model: "gpt-6-astra",
    family: "astra",
    effort: "medium",
    label: "Astra medium",
    iq: 106,
    qualityIq: 106,
    benchmarkCostEquivalent: 2,
    benchmarkMinutes: 10,
    index: 0,
    key: "gpt-6-astra::medium",
    sampleCount: 100,
    quotaBudget20x: 1847,
    quotaSource: "family-radar",
    mode: "standard",
    ...overrides,
  };
}

function estimator(ratio = 2): FastEstimator {
  return {
    measurementCount: 3,
    estimate: () => ({
      ratio,
      evidenceLevel: "exact",
      sampleCount: 3,
      ageDays: 0,
      nominalRatio: 2,
      timeKind: "transferred-e2e-estimate",
      sourceLabel: "test evidence",
    }),
  };
}

test("Fast is a separate candidate with unchanged quality, 2.5x cost, and transferred time", () => {
  const standard = record({
    benchmarkCostEquivalent: 1.2,
    benchmarkMinutes: 10,
    qualityIq: 108,
  });
  const result = buildStrategyResult(
    [standard],
    estimator(2),
    "effectiveness",
    "pro20",
    true,
  );
  const fast = result.orderedScored.find(
    (candidate) => candidate.mode === "fast",
  );
  assert.ok(fast);
  assert.equal(fast.key, `${standard.key}::fast`);
  assert.equal(fast.qualityIq, standard.qualityIq);
  assert.equal(
    fast.benchmarkCostEquivalent,
    standard.benchmarkCostEquivalent * FAST_COST_MULTIPLIER,
  );
  assert.equal(fast.benchmarkMinutes, 5);
  assert.equal(fast.timeKind, "transferred-e2e-estimate");
  assert.notEqual(
    result.groups.find((group) => group.representative.key === standard.key)
      ?.representative.key,
    fast.key,
  );
});

test("Fast candidates are omitted when evidence is unavailable or Fast is disabled", () => {
  const noEvidence: FastEstimator = {
    measurementCount: 0,
    estimate: () => null,
  };
  const omitted = buildStrategyResult(
    [record()],
    noEvidence,
    "effectiveness",
    "pro20",
    true,
  );
  assert.equal(
    omitted.orderedScored.some((candidate) => candidate.mode === "fast"),
    false,
  );
  assert.equal(omitted.excluded.fastEvidenceUnavailable.length, 1);
  const disabled = buildStrategyResult(
    [record()],
    estimator(),
    "effectiveness",
    "pro20",
    false,
  );
  assert.equal(
    disabled.orderedScored.some((candidate) => candidate.mode === "fast"),
    false,
  );
  assert.equal(disabled.excluded.fastEvidenceUnavailable.length, 0);
});

test("a measured ratio at or below one is retained as evidence", () => {
  const result = buildStrategyResult(
    [record()],
    estimator(0.94),
    "speed",
    "pro20",
    true,
  );
  const fast = result.orderedScored.find(
    (candidate) => candidate.mode === "fast",
  );
  assert.ok(fast);
  assert.equal(fast.fastMultiplier, 0.94);
  assert.equal(fast.benchmarkMinutes, 10 / 0.94);
});

test("undated history is rejected while live DOM evidence remains fresh", () => {
  const measurements: FastMeasurement[] = [
    {
      model: "gpt-6-astra",
      effort: "low",
      ratio: 1.8,
      measuredAt: null,
      source: "history",
      sampleCount: 3,
      validPairs: 3,
    },
    {
      model: "gpt-6-astra",
      effort: "low",
      ratio: 1.2,
      measuredAt: null,
      source: "live-dom",
      sampleCount: 3,
      validPairs: 3,
    },
  ];
  const estimator = createFastEstimator(
    measurements,
    getCopy("en"),
    Date.UTC(2026, 8, 17),
  );
  const estimate = estimator.estimate(record({ effort: "low" }));
  assert.ok(estimate);
  assert.equal(estimate.ratio, 1.2);
});

test("quota-unavailable families are represented in exclusions and never score", () => {
  const result = buildStrategyResult(
    [
      record({ key: "known", family: "astra", quotaBudget20x: 1847 }),
      record({
        key: "unknown",
        model: "gpt-5.6-terra",
        family: "terra",
        quotaBudget20x: null,
      }),
    ],
    estimator(),
    "budget",
    "pro20",
    false,
  );
  assert.equal(
    result.orderedScored.some((candidate) => candidate.key === "unknown"),
    false,
  );
  assert.equal(
    result.excluded.quotaUnknown.some(
      (candidate) => candidate.key === "unknown",
    ),
    true,
  );
});

test("practical compression happens after ranking while Pareto remains diagnostic", () => {
  const result = buildStrategyResult(
    [
      record({
        key: "high",
        qualityIq: 106,
        benchmarkCostEquivalent: 2,
        benchmarkMinutes: 10,
      }),
      record({
        key: "near",
        qualityIq: 104,
        benchmarkCostEquivalent: 1.5,
        benchmarkMinutes: 9,
      }),
      record({
        key: "tradeoff",
        qualityIq: 102,
        benchmarkCostEquivalent: 0.2,
        benchmarkMinutes: 30,
      }),
    ],
    estimator(),
    "effectiveness",
    "pro20",
    false,
  );
  assert.ok(result.orderedScored.length >= result.orderedMeaningful.length);
  assert.equal(result.diagnostics.paretoFrontier.length > 0, true);
  assert.equal(result.diagnostics.groupCount, result.groups.length);
  assert.equal(
    result.excluded.practicalDominated.length,
    result.orderedScored.length - result.orderedMeaningful.length,
  );
});

test("strong calibrated resource infeasibility is hard exclusion, otherwise it remains scoreable", () => {
  const candidate = record({ benchmarkCostEquivalent: 1847 });
  const weak = buildStrategyResult(
    [candidate],
    estimator(),
    "budget",
    "pro20",
    false,
  );
  assert.equal(weak.orderedScored.length, 1);
  const strongContext = {
    ...createDefaultCalibrationContext("pro20"),
    workload: {
      alpha: 1,
      beta: 1,
      quotaConfidence: 0.67,
      timeConfidence: 1,
      status: "calibrated" as const,
      sampleCount: 3,
    },
  };
  const strong = buildStrategyResult(
    [candidate],
    estimator(),
    "budget",
    "pro20",
    false,
    strongContext,
  );
  assert.equal(strong.orderedScored.length, 0);
  assert.equal(strong.excluded.resourceWeekly.length, 1);
});

test("all plan and strategy combinations are deterministic on a compact fixture", () => {
  const fixture = [
    record({
      key: "astra-medium",
      effort: "medium",
      qualityIq: 106,
      benchmarkCostEquivalent: 2.2,
    }),
    record({
      key: "astra-high",
      effort: "high",
      qualityIq: 108,
      benchmarkCostEquivalent: 3.1,
      benchmarkMinutes: 13,
    }),
    record({
      key: "astra-ultra",
      effort: "ultra",
      qualityIq: 108.3,
      benchmarkCostEquivalent: 10,
      benchmarkMinutes: 14,
    }),
    record({
      key: "luna-max",
      model: "gpt-5.6-luna",
      family: "luna",
      effort: "max",
      label: "Luna max",
      qualityIq: 102,
      benchmarkCostEquivalent: 0.54,
      quotaBudget20x: 1145,
    }),
    record({
      key: "luna-xhigh",
      model: "gpt-5.6-luna",
      family: "luna",
      effort: "xhigh",
      label: "Luna xhigh",
      qualityIq: 87,
      benchmarkCostEquivalent: 0.34,
      quotaBudget20x: 1145,
    }),
    record({
      key: "sol-medium",
      model: "gpt-5.6-sol",
      family: "sol",
      effort: "medium",
      label: "Sol medium",
      qualityIq: 95,
      benchmarkCostEquivalent: 2.7,
      quotaBudget20x: 1919,
    }),
  ];
  for (const plan of ["plus", "pro5", "pro20"] as const) {
    for (const strategy of [
      "quality",
      "effectiveness",
      "budget",
      "speed",
    ] as const) {
      const first = buildStrategyResult(
        fixture,
        estimator(),
        strategy,
        plan,
        true,
      );
      const second = buildStrategyResult(
        fixture.slice().reverse(),
        estimator(),
        strategy,
        plan,
        true,
      );
      assert.deepEqual(
        first.orderedScored.map((candidate) => candidate.key),
        second.orderedScored.map((candidate) => candidate.key),
      );
      assert.ok(
        first.diagnostics.scoreableCount >= first.diagnostics.groupCount,
      );
      assert.ok(first.groups.length <= first.orderedMeaningful.length);
    }
  }
});
