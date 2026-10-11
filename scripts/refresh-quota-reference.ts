import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import type { QuotaReference } from "../src/quota-math.js";

async function source(url: string): Promise<{ text: string; hash: string }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  const text = await response.text();
  return { text, hash: createHash("sha256").update(text).digest("hex") };
}
const [bindingSource, page] = await Promise.all([
  source("https://codexradar.com/data/radar-bench-binding.json"),
  source("https://codexradar.com/?station=codex"),
]);
const binding = JSON.parse(bindingSource.text) as {
  enabled: boolean;
  production_read_verified: boolean;
  score_version: string;
  model_efforts: Array<{ model: string; effort: string }>;
  total_tasks: number;
};
if (
  !binding.enabled ||
  !binding.production_read_verified ||
  binding.score_version !== "radar-bench-v2-150"
) {
  throw new Error("Expected a verified Radar Bench 150-point binding");
}
const anchors: Record<string, number> = {};
for (const [, content] of page.text.matchAll(
  /<article\b[^>]*class="[^"]*quota-radar-current-card[^"]*"[^>]*>([\s\S]*?)<\/article>/g,
)) {
  const label = content.match(
    /Pro 200\s*·\s*只跑\s*GPT-([\d.]+)\s+([A-Za-z]+)/,
  );
  const value = content.match(/<strong[^>]*>\s*\$([\d,.]+)/)?.[1];
  if (label && value)
    anchors[`gpt-${label[1]}-${label[2].toLowerCase()}`] = Number(
      value.replaceAll(",", ""),
    );
}
if (!anchors["gpt-6.1-sol"])
  throw new Error("Missing GPT-6.1 Sol quota reference");
// Historical Plus API-equivalent scale; new plan capacities use a price-ratio prior,
// not a claim about included subscription allowance. Every quota result is approximate.
const plus = 82.486;
const entries: QuotaReference["entries"] = {};
for (const { model, effort } of binding.model_efforts) {
  if (!anchors[model]) continue;
  const quotaWeight = (plus * 20) / anchors[model];
  entries[`${model}::${effort}`] = {
    matrixMultiplier: quotaWeight,
    quotaWeight,
    validTasks: 0,
    discriminationCoverage: 0,
    discriminationConfidence: null,
    evidence: "matrix-estimate",
  };
}
const reference: QuotaReference = {
  schemaVersion: 2,
  benchmarkId: "radar-bench-v2-150",
  taskCount: binding.total_tasks,
  sourceUpdatedAt: null,
  rollingWindow: null,
  discriminationGeneratedAt: null,
  discriminationMethod: null,
  sourceHashes: { table: bindingSource.hash, quotaPage: page.hash },
  planCapacities: {
    plus,
    pro100: plus * 5,
    pro200: plus * 10,
    pro500: plus * 25,
  },
  globalCorrection: 1,
  anchors20x: anchors,
  entries,
};
await writeFile(
  "src/quota-reference.json",
  `${JSON.stringify(reference, null, 2)}\n`,
);
process.stdout.write(
  `Radar Bench quota prior: ${Object.keys(entries).length} tiers; all capacities estimated\n`,
);
