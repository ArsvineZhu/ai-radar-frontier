import assert from "node:assert/strict";
import test from "node:test";
import {
  BALANCED_QUOTA_WEIGHT,
  BALANCED_TIME_WEIGHT,
  IQ_ACCEPTABLE,
  IQ_MINIMUM,
  IQ_QUALITY_TOLERANCE,
  PLAN_LIMITS,
  PLAN_MULTIPLIERS,
  QUOTA_WEEKLY_LIMITS,
  SPEED_TIE_REL,
} from "../src/config.js";
import { getCopy } from "../src/i18n.js";
import { buildStrategyResult } from "../src/recommendation.js";
import {
  analyzeParetoDiagnostics,
  balancedLoss,
  evaluateQuotaGate,
  evaluateRecords,
  rankBudget,
  rankEffectiveness,
  rankQuality,
  rankSpeed,
} from "../src/scoring.js";
import type { FastEstimator, FastMeasurement } from "../src/radar.js";
import type { ModelRecord, ScoredRecord } from "../src/scoring.js";

function makeRecord(overrides: Partial<ModelRecord> = {}): ModelRecord {
  return {
    model: "gpt-6-astra",
    family: "astra",
    effort: "low",
    label: "Astra low",
    iq: 100,
    qualityIq: 100,
    cost: 1,
    minutes: 10,
    index: 0,
    key: "gpt-6-astra::low",
    sampleCount: 100,
    quotaBudget20x: 1847,
    quotaShare: null,
    quotaSource: "family-radar",
    mode: "standard",
    ...overrides,
  };
}

function estimate(
  ratio = 2,
  evidenceLevel: "exact" | "model" | "fastGroup" = "exact",
): FastEstimator {
  return {
    measurementCount: 3,
    estimate: () => ({
      ratio,
      evidenceLevel,
      sampleCount: 3,
      ageDays: 0,
      nominalRatio: 2,
      timeKind: "transferred-e2e-estimate",
      sourceLabel: `test ${evidenceLevel}`,
    }),
  };
}

function evaluate(
  records: ModelRecord[],
  plan: string = "pro20",
): ScoredRecord[] {
  return evaluateRecords(records, plan);
}

test("input order does not change any strategy ordering", () => {
  const records = [
    makeRecord({ key: "a", model: "gpt-6-astra", effort: "low", index: 0 }),
    makeRecord({
      key: "b",
      model: "gpt-5.6-sol",
      effort: "medium",
      label: "Sol medium",
      iq: 104,
      qualityIq: 104,
      cost: 1.2,
      minutes: 10,
      index: 1,
    }),
    makeRecord({
      key: "c",
      model: "gpt-5.6-luna",
      effort: "max",
      label: "Luna max",
      iq: 100,
      qualityIq: 100,
      cost: 0.5,
      minutes: 30,
      quotaBudget20x: 1145,
      index: 2,
    }),
  ];
  for (const strategy of ["quality", "effectiveness", "budget", "speed"]) {
    const first = buildStrategyResult(
      records,
      estimate(),
      strategy,
      "pro20",
      false,
    );
    const shuffled = buildStrategyResult(
      [records[2], records[0], records[1]],
      estimate(),
      strategy,
      "pro20",
      false,
    );
    assert.deepEqual(
      first.orderedEligible.map((record) => record.key),
      shuffled.orderedEligible.map((record) => record.key),
    );
  }
});

test("Plus, Pro5, and Pro20 scale the same family capacity", () => {
  const records = [makeRecord({ cost: 7.85 })];
  const plus = evaluate(records, "plus")[0];
  const pro5 = evaluate(records, "pro5")[0];
  const pro20 = evaluate(records, "pro20")[0];

  assert.equal(PLAN_MULTIPLIERS.plus, 1);
  assert.equal(PLAN_MULTIPLIERS.pro5, 5);
  assert.equal(PLAN_MULTIPLIERS.pro20, 20);
  assert.equal(pro5.quotaShare! * 5, plus.quotaShare);
  assert.equal(pro20.quotaShare! * 20, plus.quotaShare);
  assert.equal(QUOTA_WEEKLY_LIMITS.quality, 0.05);
  assert.equal(evaluateQuotaGate(plus, "quality").eligible, false);
});

test("Fast cost is exactly 2.5x and quality is unchanged", () => {
  const standard = makeRecord({
    cost: 1.2,
    minutes: 10,
    iq: 106,
    qualityIq: 106,
  });
  const result = buildStrategyResult(
    [standard],
    estimate(2),
    "effectiveness",
    "pro20",
    true,
  );
  const fast = result.orderedEligible.find((record) => record.mode === "fast");

  assert.ok(fast);
  assert.equal(fast.cost, 3);
  assert.equal(fast.minutes, 5);
  assert.equal(fast.qualityIq, standard.qualityIq);
  assert.equal(fast.timeKind, "transferred-e2e-estimate");
});

test("Fast preserves Standard quality as a separate invariant", () => {
  const standard = makeRecord({ iq: 108, qualityIq: 108 });
  const result = buildStrategyResult(
    [standard],
    estimate(0.9),
    "quality",
    "pro20",
    true,
  );
  const fast = result.orderedEligible.find((record) => record.mode === "fast");

  assert.ok(fast);
  assert.equal(fast.iq, standard.iq);
  assert.equal(fast.qualityIq, standard.qualityIq);
});

test("Fast evidence is required before a Fast candidate is generated", () => {
  const noEvidence: FastEstimator = {
    measurementCount: 0,
    estimate: () => null,
  };
  const result = buildStrategyResult(
    [makeRecord()],
    noEvidence,
    "effectiveness",
    "pro20",
    true,
  );

  assert.equal(
    result.orderedEligible.some((record) => record.mode === "fast"),
    false,
  );
  assert.equal(result.excluded.fastEvidenceUnavailable.length, 1);
});

test("Fast evidence keeps a measured ratio at or below 1", () => {
  const result = buildStrategyResult(
    [makeRecord({ minutes: 10 })],
    estimate(0.94),
    "speed",
    "pro20",
    true,
  );
  const fast = result.orderedEligible.find((record) => record.mode === "fast");

  assert.ok(fast);
  assert.equal(fast.fastMultiplier, 0.94);
  assert.equal(fast.minutes, 10 / 0.94);
});

test("fastGroup fallback uses the fulfillment P25", async () => {
  const measurements: FastMeasurement[] = [0, 0.2, 0.4, 0.6, 0.8, 1].map(
    (fulfillment, index) => ({
      model: index % 2 ? "gpt-5.6-terra" : "gpt-5.6-sol",
      effort: null,
      ratio: 1 + fulfillment * 0.5,
      sampleCount: 1,
      measuredAt: Date.UTC(2026, 8, 15 - index),
    }),
  );
  const { createFastEstimator } = await import("../src/radar.js");
  const estimator = createFastEstimator(
    measurements,
    getCopy("en"),
    Date.UTC(2026, 8, 16),
  );
  const result = estimator.estimate(
    makeRecord({
      model: "gpt-5.6-luna",
      effort: "max",
      label: "Luna max",
    }),
  );

  assert.ok(result);
  assert.equal(result.evidenceLevel, "fastGroup");
  assert.equal(result.ratio, 1.125);
  assert.equal(result.sampleCount, 6);
});

test("same-model fallback requires three observations and uses a capped P25", async () => {
  const measurements: FastMeasurement[] = [2, 3, 4].map((ratio, index) => ({
    model: "gpt-6-astra",
    effort: null,
    ratio,
    sampleCount: 1,
    measuredAt: Date.UTC(2026, 8, 15 - index),
  }));
  const { createFastEstimator } = await import("../src/radar.js");
  const estimator = createFastEstimator(
    measurements,
    getCopy("en"),
    Date.UTC(2026, 8, 16),
  );
  const result = estimator.estimate(
    makeRecord({ model: "gpt-6-astra", effort: "low" }),
  );

  assert.ok(result);
  assert.equal(result.evidenceLevel, "model");
  assert.equal(result.ratio, 2);
  assert.equal(result.sampleCount, 3);
});

test("unknown family quota never enters automatic recommendation", () => {
  const result = buildStrategyResult(
    [makeRecord({ quotaBudget20x: null })],
    estimate(),
    "quality",
    "plus",
    false,
  );

  assert.equal(result.winner, null);
  assert.equal(result.excluded.quotaUnknown.length, 1);
});

test("IQ below 70 is always excluded", () => {
  const result = buildStrategyResult(
    [makeRecord({ iq: IQ_MINIMUM - 0.01, qualityIq: IQ_MINIMUM - 0.01 })],
    estimate(),
    "quality",
    "pro20",
    true,
  );

  assert.equal(result.winner, null);
  assert.equal(result.excluded.belowIqFloor.length, 1);
});

test("Quality uses the highest 4 IQ band, then time, instead of raw IQ", () => {
  const records = evaluate([
    makeRecord({ key: "slower-high", iq: 104, qualityIq: 104, minutes: 20 }),
    makeRecord({ key: "faster-band", iq: 100, qualityIq: 100, minutes: 10 }),
  ]);
  const ranked = rankQuality(records);

  assert.equal(IQ_QUALITY_TOLERANCE, 4);
  assert.deepEqual(
    ranked.map((record) => record.key),
    ["faster-band", "slower-high"],
  );
});

test("Budget prefers acceptable quality before lower quota among weak models", () => {
  const ranked = rankBudget(
    evaluate([
      makeRecord({
        key: "acceptable",
        iq: IQ_ACCEPTABLE,
        qualityIq: IQ_ACCEPTABLE,
        cost: 2,
      }),
      makeRecord({ key: "cheap-weak", iq: 90, qualityIq: 90, cost: 0.2 }),
    ]),
  );

  assert.equal(ranked[0].key, "acceptable");
});

test("Speed uses acceptable quality and a 5% time band before quality", () => {
  const ranked = rankSpeed(
    evaluate([
      makeRecord({ key: "quality", iq: 104, qualityIq: 104, minutes: 10.4 }),
      makeRecord({ key: "fast-enough", iq: 100, qualityIq: 100, minutes: 10 }),
      makeRecord({ key: "unacceptable", iq: 90, qualityIq: 90, minutes: 1 }),
    ]),
  );

  assert.equal(SPEED_TIE_REL, 0.05);
  assert.deepEqual(
    ranked.slice(0, 2).map((record) => record.key),
    ["quality", "fast-enough"],
  );
  assert.equal(ranked[2].key, "unacceptable");
});

test("Balanced loss worsens monotonically as quality, quota, or time worsens", () => {
  const base = evaluate([makeRecord({ iq: 100, qualityIq: 100 })])[0];
  const lowerQuality = evaluate([makeRecord({ iq: 99, qualityIq: 99 })])[0];
  const higherQuota = evaluate([makeRecord({ cost: 2 })])[0];
  const slower = evaluate([makeRecord({ minutes: 20 })])[0];

  assert.ok(balancedLoss(lowerQuality) > balancedLoss(base));
  assert.ok(balancedLoss(higherQuota) > balancedLoss(base));
  assert.ok(balancedLoss(slower) > balancedLoss(base));
  assert.equal(BALANCED_QUOTA_WEIGHT, 0.5);
  assert.equal(BALANCED_TIME_WEIGHT, 0.5);
  assert.deepEqual(
    rankEffectiveness([lowerQuality, base]).map((record) => record.key),
    [base.key, lowerQuality.key],
  );
});

test("upgrading a plan never increases weekly share", () => {
  const record = makeRecord({ cost: 7.85 });
  const shares = ["plus", "pro5", "pro20"].map(
    (plan) => evaluate([record], plan)[0].quotaShare!,
  );

  assert.ok(shares[0] >= shares[1]);
  assert.ok(shares[1] >= shares[2]);
});

test("Plus reports the 5h window as unquantified without inferring capacity", () => {
  const result = buildStrategyResult(
    [makeRecord()],
    estimate(),
    "quality",
    "plus",
    false,
  );

  assert.equal(PLAN_LIMITS.plus.shortWindowHours, 5);
  assert.equal(PLAN_LIMITS.plus.shortWindowCapacity, null);
  assert.equal(result.diagnostics.shortWindowUnquantified, true);
  assert.equal(result.diagnostics.shortWindowHours, 5);
});

test("other plans do not inherit the Plus short-window warning", () => {
  const result = buildStrategyResult(
    [makeRecord()],
    estimate(),
    "quality",
    "pro5",
    false,
  );

  assert.equal(result.diagnostics.shortWindowUnquantified, false);
  assert.equal(result.diagnostics.shortWindowHours, null);
});

test("community metadata cannot change a core strategy ordering", () => {
  const first = rankQuality(
    evaluate([
      makeRecord({
        key: "first",
        communityRating: 1,
        communityRatingCount: 100,
      }),
      makeRecord({
        key: "second",
        communityRating: 10,
        communityRatingCount: 100,
      }),
    ]),
  ).map((record) => record.key);
  const second = rankQuality(
    evaluate([
      makeRecord({
        key: "first",
        communityRating: 10,
        communityRatingCount: 100,
      }),
      makeRecord({
        key: "second",
        communityRating: 1,
        communityRatingCount: 100,
      }),
    ]),
  ).map((record) => record.key);

  assert.deepEqual(first, second);
});

test("Pareto diagnostics do not remove a candidate from strategy ordering", () => {
  const records = evaluate([
    makeRecord({ key: "winner", cost: 1, minutes: 10 }),
    makeRecord({ key: "dominated", cost: 2, minutes: 20 }),
  ]);
  const diagnostics = analyzeParetoDiagnostics(records);
  const result = buildStrategyResult(
    [
      makeRecord({ key: "winner", cost: 1, minutes: 10 }),
      makeRecord({ key: "dominated", cost: 2, minutes: 20 }),
    ],
    estimate(),
    "effectiveness",
    "pro20",
    false,
  );

  assert.equal(
    diagnostics.dominated.some((record) => record.key === "dominated"),
    true,
  );
  assert.deepEqual(result.orderedEligible.map((record) => record.key).sort(), [
    "dominated",
    "winner",
  ]);
  assert.equal(result.winner?.key, "winner");
});

test("current snapshot golden fixture produces a stable winner", () => {
  const result = buildStrategyResult(
    [
      makeRecord({
        key: "astra-medium",
        effort: "medium",
        label: "Astra medium",
        iq: 106.49,
        qualityIq: 106.49,
        cost: 2.24,
        minutes: 8.96,
      }),
      makeRecord({
        key: "astra-high",
        effort: "high",
        label: "Astra high",
        iq: 108.2,
        qualityIq: 108.2,
        cost: 3.14,
        minutes: 12.88,
      }),
      makeRecord({
        key: "luna-max",
        model: "gpt-5.6-luna",
        effort: "max",
        label: "Luna max",
        iq: 102.68,
        qualityIq: 102.68,
        cost: 0.54,
        minutes: 37.1,
        quotaBudget20x: 1145,
      }),
    ],
    estimate(),
    "effectiveness",
    "plus",
    false,
  );

  assert.equal(result.winner?.key, "astra-medium");
});

test("the implementation yields one result for every plan and strategy", () => {
  const records = [makeRecord()];
  const results = [];
  for (const plan of ["plus", "pro5", "pro20"]) {
    for (const strategy of ["quality", "effectiveness", "budget", "speed"]) {
      results.push(
        buildStrategyResult(records, estimate(), strategy, plan, false),
      );
    }
  }

  assert.equal(results.length, 12);
  assert.equal(
    results.every((result) => result.plan && result.strategy),
    true,
  );
});
