import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  compileQuotaReference,
  type QuotaTableInput,
} from "../src/quota-math.js";

const TABLE_URL = "https://api.codexradar.com/api/v1/table";
const QUOTA_URL = "https://codexradar.com/?station=codex";
const OUTPUT = resolve("src/quota-reference.json");

async function readSource(
  url: string,
): Promise<{ text: string; sha256: string }> {
  const response = await fetch(url, { headers: { Accept: "*/*" } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    text: bytes.toString("utf8"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function quotaAnchors(html: string): Record<string, number> {
  const labels: Record<string, string> = {
    "GPT-6 Astra": "gpt-6-astra",
    "GPT-6 Sol": "gpt-6-sol",
    "GPT-5.6 Sol": "gpt-5.6-sol",
    "GPT-5.6 Luna": "gpt-5.6-luna",
  };
  const anchors: Record<string, number> = {};
  const articles = html.matchAll(
    /<article\b[^>]*class="[^"]*quota-radar-current-card[^"]*"[^>]*>([\s\S]*?)<\/article>/g,
  );
  for (const [, content] of articles) {
    const label = content
      .match(/<span[^>]*>\s*20x Pro\s*·\s*只跑\s*([^<]+)<\/span>/)?.[1]
      ?.trim();
    const model = label ? labels[label] : undefined;
    const rawCapacity = content.match(
      /<strong[^>]*>\s*\$([\d,.]+)\s*<\/strong>/,
    )?.[1];
    const capacity = rawCapacity
      ? Number(rawCapacity.replaceAll(",", ""))
      : NaN;
    if (model && Number.isFinite(capacity) && capacity > 0) {
      anchors[model] = capacity;
    }
  }
  for (const model of Object.values(labels)) {
    if (!anchors[model])
      throw new Error(`Missing exact quota anchor for ${model}`);
  }
  return anchors;
}

const [tableSource, quotaSource] = await Promise.all([
  readSource(TABLE_URL),
  readSource(QUOTA_URL),
]);
const table = JSON.parse(tableSource.text) as QuotaTableInput;
const reference = compileQuotaReference(table, quotaAnchors(quotaSource.text), {
  table: tableSource.sha256,
  quotaPage: quotaSource.sha256,
});
for (const key of [
  "gpt-6-sol::high",
  "gpt-6-luna::max",
  "gpt-5.6-sol::medium",
]) {
  if (!reference.entries[key])
    throw new Error(`Missing quota reference ${key}`);
}
if (reference.entries["gpt-6-sol::high"]?.evidence !== "measured-anchor") {
  throw new Error("GPT-6 Sol must use the public measured quota anchor");
}
if (reference.anchors20x["gpt-6-luna"] !== undefined) {
  throw new Error("GPT-6 Luna must remain without a guessed quota anchor");
}
await writeFile(OUTPUT, `${JSON.stringify(reference, null, 2)}\n`, "utf8");
process.stdout.write(
  `Quota reference: ${Object.keys(reference.entries).length} tiers, ${reference.taskCount} tasks, correction ${reference.globalCorrection.toFixed(4)}\n`,
);
