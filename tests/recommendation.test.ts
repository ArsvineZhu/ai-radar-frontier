import assert from "node:assert/strict";
import test from "node:test";
import { buildStrategyResult } from "../src/recommendation.js";
import type { FastEstimator } from "../src/radar.js";
import {
  analyze,
  evaluateQuotaGate,
  evaluateRecords,
  scoreRecords,
  sortScoredRecords,
} from "../src/scoring.js";
import type { ModelRecord } from "../src/scoring.js";

function makeRecord(overrides: Partial<ModelRecord> = {}): ModelRecord {
  return {
    model: "gpt-6-astra",
    effort: "low",
    label: "Astra low",
    iq: 100,
    qualityIq: 100,
    hardIq: null,
    cost: 1,
    minutes: 10,
    index: 0,
    key: "gpt-6-astra::low",
    sampleCount: 100,
    historyCenter: 100,
    uncertainty: 0,
    stability: "stable",
    quotaBudget20x: 1847,
    quotaShare: null,
    quotaSource: "family-radar",
    communityRating: null,
    communityRatingCount: 0,
    ...overrides,
  };
}

function fastEstimator(value = 2): FastEstimator {
  return {
    measurementCount: 1,
    estimate: () => ({
      value,
      source: "exact",
      sourceLabel: "test E2E",
    }),
  };
}

test("quota feasibility is applied before strategy ranking", () => {
  const plus = evaluateRecords([makeRecord({ cost: 7.85 })], "plus")[0];
  const pro20 = evaluateRecords([makeRecord({ cost: 7.85 })], "pro20")[0];

  assert.equal(evaluateQuotaGate(plus, "quality").eligible, false);
  assert.equal(evaluateQuotaGate(pro20, "quality").eligible, true);
  assert.ok((plus.quotaShare ?? 0) > 0.05);
});

test("Fast inherits quality, multiplies cost, and divides time", () => {
  const standard = makeRecord({
    cost: 1.2,
    minutes: 10,
    iq: 106,
    qualityIq: 106,
  });
  const result = buildStrategyResult(
    [standard],
    fastEstimator(2),
    "effectiveness",
    "pro20",
    true,
  );
  const fast = [...result.frontier, ...result.dominated].find(
    (record) => record.mode === "fast",
  );

  assert.ok(fast);
  assert.equal(fast.cost, 3);
  assert.equal(fast.minutes, 5);
  assert.equal(fast.qualityIq, standard.qualityIq);
});

test("balanced ranking uses the nonlinear quality shortfall around IQ 100", () => {
  const records = evaluateRecords(
    [
      makeRecord({
        key: "low-quality",
        iq: 98,
        qualityIq: 98,
        cost: 1,
        minutes: 10,
        index: 0,
      }),
      makeRecord({
        key: "high-quality",
        iq: 106,
        qualityIq: 106,
        cost: 1.2,
        minutes: 5,
        index: 1,
      }),
    ],
    "pro20",
  );
  const decisionSet = analyze(records).frontier;
  const scored = scoreRecords(records, "effectiveness", decisionSet);
  const lowQuality = scored.find((record) => record.key === "low-quality");
  const highQuality = scored.find((record) => record.key === "high-quality");

  assert.ok(lowQuality && highQuality);
  assert.ok(highQuality.strategyScore < lowQuality.strategyScore);
});

test("community rating only participates after the minimum sample gate", () => {
  const scored = evaluateRecords(
    [
      makeRecord({
        key: "low-sample-high-rating",
        communityRating: 10,
        communityRatingCount: 1,
        index: 0,
      }),
      makeRecord({
        key: "reliable-rating",
        communityRating: 9,
        communityRatingCount: 20,
        index: 1,
      }),
    ],
    "pro20",
  );
  const sorted = sortScoredRecords(scored, "quality");

  assert.equal(sorted[0].key, "reliable-rating");
});

test("degrading history loses a close tie without changing primary IQ", () => {
  const scored = evaluateRecords(
    [
      makeRecord({ key: "degrading", stability: "degrading", index: 0 }),
      makeRecord({ key: "stable", stability: "stable", index: 1 }),
    ],
    "pro20",
  );
  const sorted = sortScoredRecords(scored, "quality");

  assert.equal(sorted[0].key, "stable");
  assert.equal(
    scored.find((record) => record.key === "degrading")?.qualityIq,
    100,
  );
});
