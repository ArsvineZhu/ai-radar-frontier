import assert from "node:assert/strict";
import test from "node:test";
import { buildStrategyResult as sharedBuildStrategyResult } from "../packages/core/src/index.js";
import { buildStrategyResult as userscriptBuildStrategyResult } from "../src/recommendation.js";
import { QUOTA_REFERENCE } from "../src/quota.js";
import type { FastEstimator, ModelRecord } from "../src/radar.js";

const record: ModelRecord = {
  model: "gpt-6-sol",
  family: "sol",
  effort: "medium",
  label: "GPT-6 Sol medium",
  iq: 104.65,
  qualityIq: 104.65,
  benchmarkCostEquivalent: 2.2,
  benchmarkMinutes: 22.8,
  index: 0,
  key: "gpt-6-sol::medium",
  sampleCount: 59,
  runs24h: 2,
  sourceUpdatedAt: "2026-09-25T00:00:00Z",
  quotaWeight:
    QUOTA_REFERENCE.entries["gpt-6-sol::medium"]?.quotaWeight ?? null,
  quotaValidTasks: 112,
  quotaDiscriminationCoverage: 1,
  quotaDiscriminationConfidence: 1,
  quotaSource: "measured-anchor",
  mode: "standard",
};

const noFast: FastEstimator = { measurementCount: 0, estimate: () => null };

test("desktop shared core stays behaviorally identical to the userscript entry", () => {
  const direct = userscriptBuildStrategyResult(
    [record],
    noFast,
    "effectiveness",
    "plus",
    false,
  );
  const shared = sharedBuildStrategyResult(
    [record],
    noFast,
    "effectiveness",
    "plus",
    false,
  );
  assert.deepEqual(shared, direct);
});
