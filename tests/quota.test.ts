import assert from "node:assert/strict";
import test from "node:test";
import { compileQuotaReference } from "../src/quota-math.js";
import { QUOTA_REFERENCE, planCapacity, quotaEntry } from "../src/quota.js";
import { normalizeRecords } from "../src/radar.js";
import { buildStrategyResult } from "../src/recommendation.js";
import type { FastEstimator } from "../src/radar.js";

test("public task multipliers produce one quota scale for anchored and new models", () => {
  const reference = compileQuotaReference(
    {
      benchmark_id: "deep-swe",
      tasks: [{ id: "a" }, { id: "b" }],
      combos: [
        { model: "anchor-a", effort: "high" },
        { model: "anchor-b", effort: "high" },
        { model: "new", effort: "high" },
      ],
      tier_windows_usd: { plus: 10, "pro-5x": 50, "pro-20x": 200 },
      cells: {
        "a|anchor-a|high": { cost: 1, mult: 2 },
        "b|anchor-a|high": { cost: 3, mult: 2 },
        "a|anchor-b|high": { cost: 1, mult: 1 },
        "b|anchor-b|high": { cost: 1, mult: 1 },
        "a|new|high": { cost: 1, mult: 1 },
        "b|new|high": { cost: 3, mult: 3 },
      },
    },
    { "anchor-a": 100, "anchor-b": 200 },
    { table: "table-hash", quotaPage: "page-hash" },
  );
  assert.equal(reference.globalCorrection, 1);
  assert.equal(reference.entries["anchor-a::high"].quotaWeight, 2);
  assert.equal(reference.entries["anchor-b::high"].quotaWeight, 1);
  assert.equal(reference.entries["new::high"].quotaWeight, 2.5);
  assert.equal(reference.entries["new::high"].evidence, "matrix-estimate");
});

test("measured anchors retain their previous weekly share on every plan", () => {
  for (const [model, measuredCapacity] of Object.entries(
    QUOTA_REFERENCE.anchors20x,
  )) {
    const entry = Object.entries(QUOTA_REFERENCE.entries).find(([key]) =>
      key.startsWith(`${model}::`),
    )?.[1];
    assert.ok(entry);
    for (const [plan, multiplier] of [
      ["plus", 1],
      ["pro5", 5],
      ["pro20", 20],
    ] as const) {
      const former = 1 / ((measuredCapacity * multiplier) / 20);
      const unified = entry.quotaWeight / planCapacity(plan);
      assert.ok(Math.abs(former - unified) < 1e-12);
    }
  }
});

test("GPT-6 Sol and Luna use current DeepSWE measurements and quota evidence", () => {
  const records = normalizeRecords({
    points: [
      {
        model: "gpt-6-sol",
        effort: "high",
        iq: 100,
        average_price_usd: 0.53,
        average_minutes: 7.55,
        total: 6,
      },
      {
        model: "gpt-6-luna",
        effort: "max",
        iq: 95,
        average_price_usd: 0.06,
        average_minutes: 22.37,
        total: 41,
      },
      {
        model: "gpt-6-sol",
        effort: "max",
        iq: null,
        average_price_usd: null,
        average_minutes: null,
        total: 0,
      },
    ],
  });
  assert.equal(records.length, 2);
  assert.deepEqual(
    records.map((record) => record.model),
    ["gpt-6-sol", "gpt-6-luna"],
  );
  assert.equal(
    records[0].quotaWeight,
    quotaEntry("gpt-6-sol", "high")?.quotaWeight,
  );
  assert.equal(records[0].quotaSource, "measured-anchor");
  const noFast: FastEstimator = { measurementCount: 0, estimate: () => null };
  const result = buildStrategyResult(
    records,
    noFast,
    "effectiveness",
    "plus",
    true,
  );
  assert.equal(result.orderedScored.length, 2);
  assert.equal(result.fastCandidateCount, 0);
  assert.ok(result.winner);
});

test("the refreshed reference anchors GPT-6 Sol without inventing GPT-6 Luna capacity", () => {
  assert.equal(QUOTA_REFERENCE.anchors20x["gpt-6-sol"], 1232);
  assert.equal(QUOTA_REFERENCE.anchors20x["gpt-6-luna"], undefined);
  assert.equal(quotaEntry("gpt-6-sol", "medium")?.evidence, "measured-anchor");
  assert.equal(quotaEntry("gpt-6-luna", "max")?.evidence, "matrix-estimate");
  assert.equal(QUOTA_REFERENCE.rollingWindow, 3);
  assert.equal(QUOTA_REFERENCE.discriminationMethod, "task-discrimination-v2");
});
