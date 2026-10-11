import assert from "node:assert/strict";
import test from "node:test";
import { QUOTA_REFERENCE, planCapacity, quotaEntry } from "../src/quota.js";
import { normalizeRecords } from "../src/radar.js";
import { buildStrategyResult } from "../src/recommendation.js";
import type { FastEstimator } from "../src/radar.js";

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
      ["pro100", 5],
      ["pro200", 10],
      ["pro500", 25],
    ] as const) {
      const former = 1 / ((measuredCapacity * multiplier) / 20);
      const unified = entry.quotaWeight / planCapacity(plan);
      assert.ok(Math.abs(former - unified) < 1e-12);
    }
  }
});

test("GPT-6.1 Sol uses current measurements while Luna has unknown quota", () => {
  const records = normalizeRecords({
    points: [
      {
        model: "gpt-6.1-sol",
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
        model: "gpt-6.1-sol",
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
    ["gpt-6.1-sol", "gpt-6-luna"],
  );
  assert.equal(
    records[0].quotaWeight,
    quotaEntry("gpt-6.1-sol", "high")?.quotaWeight,
  );
  assert.equal(records[0].quotaSource, "matrix-estimate");
  const noFast: FastEstimator = { measurementCount: 0, estimate: () => null };
  const result = buildStrategyResult(
    records,
    noFast,
    "effectiveness",
    "plus",
    true,
  );
  assert.equal(result.orderedScored.length, 1);
  assert.equal(result.fastCandidateCount, 0);
  assert.ok(result.winner);
});

test("the refreshed reference uses historical GPT-6.1 Sol capacity without inventing GPT-6 Luna capacity", () => {
  assert.equal(QUOTA_REFERENCE.anchors20x["gpt-6.1-sol"], 1014);
  assert.equal(QUOTA_REFERENCE.anchors20x["gpt-6-luna"], undefined);
  assert.equal(
    quotaEntry("gpt-6.1-sol", "medium")?.evidence,
    "matrix-estimate",
  );
  assert.equal(quotaEntry("gpt-6-luna", "max"), null);
  assert.equal(QUOTA_REFERENCE.rollingWindow, null);
  assert.equal(QUOTA_REFERENCE.discriminationMethod, null);
});
