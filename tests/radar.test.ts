import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeBenchSummary,
  normalizeRecords,
  loadRadarSnapshot,
} from "../src/radar.js";
import { getCopy } from "../src/i18n.js";

const binding = {
  enabled: true,
  production_read_verified: true,
  benchmark: "bench-64",
  task_set_sha256: "hash",
  score_max: 150,
  model_efforts: [
    { model: "gpt-6.1-sol", effort: "high" },
    { model: "gpt-6-astra", effort: "high" },
  ],
};
const selection = binding.model_efforts[0];
const summary = {
  ...selection,
  benchmark: binding.benchmark,
  task_set_sha256: binding.task_set_sha256,
  score_version: "radar-bench-v2-150",
  score_max: 150,
  score: 104.6,
  coverage: 50,
  statistics: {
    metrics: {
      api_equivalent_usd: {
        known_total: 24,
        known_samples: 50,
        missing_samples: 4,
      },
      elapsed_ms: {
        known_total: 52500000,
        known_samples: 50,
        missing_samples: 4,
      },
    },
  },
};

test("Bench uses authoritative 150-point score and known-sample means with ms conversion", () => {
  const [record] = normalizeRecords({
    points: [normalizeBenchSummary(summary, binding, selection)],
  });
  assert.equal(record.iq, 104.6);
  assert.equal(record.benchmarkCostEquivalent, 0.48);
  assert.equal(record.benchmarkMinutes, 17.5);
  assert.equal(record.sampleCount, 50);
  assert.ok(record.quotaWeight);
  assert.equal(record.quotaSource, "matrix-estimate");
});
test("Bench rejects identity, task-set and score-scale mismatches", () => {
  for (const changes of [
    { model: "gpt-6-sol" },
    { task_set_sha256: "old" },
    { score_max: 100 },
    { score_version: "old" },
  ]) {
    assert.throws(() =>
      normalizeBenchSummary({ ...summary, ...changes }, binding, selection),
    );
  }
});
test("missing cost or duration cannot become a scored recommendation", () => {
  const point = normalizeBenchSummary(
    { ...summary, statistics: { metrics: {} } },
    binding,
    selection,
  );
  assert.equal(normalizeRecords({ points: [point] }).length, 0);
});
test("a failed tier retains successful current Bench data and never requests retired endpoints", async () => {
  const original = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.includes("binding")) return Response.json(binding);
    if (url.includes("gpt-6.1-sol")) return Response.json(summary);
    return new Response("unavailable", { status: 503 });
  };
  try {
    const snapshot = await loadRadarSnapshot(getCopy("en"), null);
    assert.equal(snapshot.records.length, 1);
    assert.equal(snapshot.missingTierCount, 1);
    assert.ok(
      requests.some((url) => url.includes("selection=user-selected-v1")),
    );
    assert.ok(
      requests.every((url) => !url.includes("intelligence-efficiency")),
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("successful tiers publish before stalled tiers and Fast finish", async () => {
  const original = globalThis.fetch;
  let releaseSlow!: () => void;
  const slow = new Promise<void>((resolve) => {
    releaseSlow = resolve;
  });
  let firstRecord!: (snapshot: import("../src/radar.js").RadarSnapshot) => void;
  const published = new Promise<import("../src/radar.js").RadarSnapshot>(
    (resolve) => {
      firstRecord = resolve;
    },
  );
  let finished = false;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("binding")) return Response.json(binding);
    if (url.includes("gpt-6.1-sol")) return Response.json(summary);
    await slow;
    return new Response("unavailable", { status: 503 });
  };
  try {
    const loading = loadRadarSnapshot(getCopy("en"), null, firstRecord).then(
      (snapshot) => {
        finished = true;
        return snapshot;
      },
    );
    const first = await published;
    assert.equal(first.records.length, 1);
    assert.equal(first.pendingTierCount, 1);
    assert.equal(finished, false);
    releaseSlow();
    const final = await loading;
    assert.equal(final.pendingTierCount, 0);
    assert.equal(final.missingTierCount, 1);
    assert.equal(first.records.length, 1);
  } finally {
    releaseSlow();
    globalThis.fetch = original;
  }
});

test("fresh native snapshots avoid duplicate score requests", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const requests: string[] = [];
  const values = new Map<string, string>([
    [
      "radar-bench-observed-snapshots-v2-150",
      JSON.stringify({
        schema: "radar-bench-observed-snapshots-v2-150",
        entries: [{ observed_at: new Date().toISOString(), summary }],
      }),
    ],
  ]);
  Object.assign(globalThis, {
    window: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    },
  });
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.includes("binding")) return Response.json(binding);
    return new Response("unavailable", { status: 503 });
  };
  try {
    const result = await loadRadarSnapshot(getCopy("en"), null);
    assert.equal(result.records.length, 1);
    assert.ok(result.cachedAt);
    assert.equal(
      requests.some((url) => url.includes("gpt-6.1-sol")),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(globalThis, { window: originalWindow });
  }
});

test("a saved snapshot renders before binding finishes, but changed task sets never reuse it", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const cacheKey = "ai-radar-frontier-userscript:radar-bench-cache";
  const values = new Map<string, string>([
    [
      cacheKey,
      JSON.stringify({
        schema: "radar-bench-observed-snapshots-v2-150",
        binding,
        entries: [{ observed_at: new Date().toISOString(), summary }],
      }),
    ],
  ]);
  Object.assign(globalThis, {
    window: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    },
  });
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let published = false;
  globalThis.fetch = async (input) => {
    if (String(input).includes("binding")) {
      await blocked;
      return Response.json({ ...binding, task_set_sha256: "changed" });
    }
    return new Response("unavailable", { status: 503 });
  };
  try {
    const loading = loadRadarSnapshot(getCopy("en"), null, (snapshot) => {
      if (snapshot.records.length) published = true;
    });
    assert.equal(published, true);
    release();
    await assert.rejects(loading, /no supported tiers/);
  } finally {
    release();
    globalThis.fetch = originalFetch;
    Object.assign(globalThis, { window: originalWindow });
  }
});
