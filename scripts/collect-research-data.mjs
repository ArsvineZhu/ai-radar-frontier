import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const researchRoot = resolve(root, "research");
const rawRoot = resolve(researchRoot, "raw");
const normalizedRoot = resolve(researchRoot, "normalized");
const retrievedAt = new Date().toISOString();
const allowedHosts = new Set([
  "codexradar.com",
  "deng.codexradar.com",
  "api.codexradar.com",
]);
const sourceRecords = [];
const responseById = new Map();
const responseByUrl = new Map();
const discovered = new Map();

const knownSources = [
  {
    id: "efficiency-current",
    url: "https://api.codexradar.com/api/v1/intelligence-efficiency?benchmark=deep-swe",
    category: "deep-swe-efficiency",
    rawPath: "research/raw/efficiency-current.json",
  },
  {
    id: "efficiency-history",
    url: "https://codexradar.com/data/intelligence-efficiency.json",
    category: "deep-swe-efficiency-history",
    rawPath: "research/raw/efficiency-history.json",
  },
  {
    id: "efficiency-fallback",
    url: "https://codexradar.com/api/intelligence-efficiency-metrics?benchmark=deep-swe",
    category: "deep-swe-efficiency-fallback",
    rawPath: "research/raw/responses/efficiency-fallback.json",
  },
  {
    id: "iq-history",
    url: "https://api.codexradar.com/api/v1/iq-history",
    category: "iq-history",
    rawPath: "research/raw/iq-history.json",
  },
  {
    id: "task-table",
    url: "https://api.codexradar.com/api/v1/table",
    category: "deep-swe-task-matrix",
    rawPath: "research/raw/task-table.json",
  },
  {
    id: "leaderboard",
    url: "https://api.codexradar.com/api/v1/leaderboard",
    category: "benchmark-metadata-leaderboard",
    rawPath: "research/raw/leaderboard.json",
  },
  {
    id: "fast-history",
    url: "https://codexradar.com/data/fast-radar-history.json",
    category: "fast-radar-history",
    rawPath: "research/raw/fast-history.json",
  },
  {
    id: "radar-insights",
    url: "https://codexradar.com/api/radar-insights",
    category: "degradation-trend-insights",
    rawPath: "research/raw/radar-insights.json",
  },
  {
    id: "community",
    url: "https://codexradar.com/api/model-ratings?history=14",
    category: "model-ratings",
    rawPath: "research/raw/community.json",
  },
];

const pages = [
  {
    id: "codexradar-home",
    url: "https://codexradar.com/?station=codex",
    rawPath: "research/raw/pages/codexradar-home.html",
  },
  {
    id: "codexradar-en",
    url: "https://codexradar.com/en/?station=codex",
    rawPath: "research/raw/pages/codexradar-en.html",
  },
  {
    id: "deng-harness-codex",
    url: "https://deng.codexradar.com/?harness=codex",
    rawPath: "research/raw/pages/deng-harness-codex.html",
  },
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function decode(bytes) {
  return new TextDecoder().decode(bytes);
}

function jsonValue(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function topLevelKeys(text, type) {
  if (!type?.toLowerCase().includes("json")) {
    return type?.toLowerCase().includes("html") ? ["html"] : ["text"];
  }
  const value = jsonValue(text);
  if (Array.isArray(value)) return [`<array:${value.length}>`];
  return isObject(value) ? Object.keys(value) : [];
}

function findUpdatedAt(value) {
  if (!isObject(value)) return null;
  const keys = [
    "source_updated_at",
    "software_source_updated_at",
    "visual_source_updated_at",
    "updated_at",
    "updatedAt",
    "generated_at",
    "cached_at",
    "baseline_generated_at",
    "discrimination_generated_at",
  ];
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null) {
      return String(value[key]);
    }
  }
  return null;
}

function htmlEntityDecode(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'");
}

function hostAllowed(url) {
  try {
    return allowedHosts.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

function safeName(value) {
  return value
    .replace(/^https?:\/\//, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 180);
}

function classifyUrl(url) {
  const value = url.toLowerCase();
  if (value.includes("table") || value.includes("task")) {
    return "task-matrix";
  }
  if (value.includes("quota") || value.includes("capacity")) {
    return value.includes("history") ? "quota-history" : "quota-radar";
  }
  if (value.includes("fast")) return "fast-radar";
  if (value.includes("rating") || value.includes("score")) {
    return "model-ratings";
  }
  if (value.includes("history") || value.includes("trend")) {
    return "history-trend";
  }
  if (value.includes("benchmark") || value.includes("leaderboard")) {
    return "benchmark-metadata";
  }
  if (value.includes("intelligence") || value.includes("iq")) {
    return "deep-swe-efficiency";
  }
  if (value.includes("radar")) return "radar-data";
  return "discovered-read-only-source";
}

function isReadOnlyResearchEndpoint(url, category) {
  const path = new URL(url).pathname.toLowerCase();
  if (
    /\/(?:claim|release|oauth|whoami|mailbox|rename|suggest|assignments|my-|privacy|subscribe|subscriber-count|avatar|events)/.test(
      path,
    )
  ) {
    return false;
  }
  if (!/(\/api\/|\/data\/)/.test(path)) return false;
  return [
    "deep-swe-efficiency",
    "deep-swe-efficiency-history",
    "deep-swe-efficiency-fallback",
    "iq-history",
    "deep-swe-task-matrix",
    "benchmark-metadata",
    "model-ratings",
    "degradation-trend-insights",
    "fast-radar",
    "history-trend",
    "quota-radar",
    "quota-history",
    "task-matrix",
  ].includes(category);
}

function addDiscovered(url, discoveredFrom) {
  if (!hostAllowed(url)) return;
  const normalized = new URL(url).toString();
  const category = classifyUrl(normalized);
  if (!discovered.has(normalized)) {
    discovered.set(normalized, { url: normalized, category, discoveredFrom });
  }
}

function extractUrls(text, baseUrl, discoveredFrom) {
  const decoded = htmlEntityDecode(text);
  const absolute =
    decoded.match(
      /https?:\/\/(?:codexradar\.com|deng\.codexradar\.com|api\.codexradar\.com)[^\s"'`<>()[\]{}]+/gi,
    ) || [];
  for (const candidate of absolute) {
    addDiscovered(candidate.replace(/[),.;]+$/, ""), discoveredFrom);
  }
  const relative =
    decoded.match(/["'`]((?:\/(?:api|data|assets)\/)[^"'`<>\s]*)["'`]/gi) || [];
  for (const match of relative) {
    const candidate = match.slice(1, -1);
    try {
      addDiscovered(new URL(candidate, baseUrl).toString(), discoveredFrom);
    } catch {
      // Ignore malformed strings in minified or inline code.
    }
  }
}

async function writeBytes(relativePath, bytes) {
  const absolutePath = resolve(root, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, Buffer.from(bytes));
}

async function retrieve(source) {
  if (responseByUrl.has(source.url)) {
    const existing = responseByUrl.get(source.url);
    responseById.set(source.id, existing);
    return existing;
  }
  const record = {
    id: source.id,
    url: source.url,
    retrieved_at: retrievedAt,
    category: source.category,
    discovered_from: source.discoveredFrom ?? null,
    raw_path: source.rawPath ?? null,
    http_status: null,
    content_type: null,
    source_updated_at: null,
    etag: null,
    last_modified: null,
    sha256: null,
    byte_length: null,
    schema_top_level_keys: [],
    error: null,
  };
  let text = "";
  let parsed = null;
  try {
    const response = await fetch(source.url, {
      headers: { Accept: "application/json, text/html, text/javascript, */*" },
    });
    const bytes = new Uint8Array(await response.arrayBuffer());
    text = decode(bytes);
    parsed = jsonValue(text);
    record.http_status = response.status;
    record.content_type = response.headers.get("content-type");
    record.source_updated_at = findUpdatedAt(parsed);
    record.etag = response.headers.get("etag");
    record.last_modified = response.headers.get("last-modified");
    record.sha256 = sha256(bytes);
    record.byte_length = bytes.byteLength;
    record.schema_top_level_keys = topLevelKeys(text, record.content_type);
    if (source.rawPath) await writeBytes(source.rawPath, bytes);
    const result = { record, text, parsed, bytes };
    responseByUrl.set(source.url, result);
    responseById.set(source.id, result);
    sourceRecords.push(record);
    return result;
  } catch (error) {
    record.error = error instanceof Error ? error.message : String(error);
    sourceRecords.push(record);
    const result = { record, text, parsed, bytes: new Uint8Array() };
    responseByUrl.set(source.url, result);
    responseById.set(source.id, result);
    return result;
  }
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function writeCsv(relativePath, columns, rows) {
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(row[column])).join(","));
  }
  await writeFile(resolve(root, relativePath), `${lines.join("\n")}\n`, "utf8");
}

function number(value) {
  return value === null || value === undefined || value === ""
    ? null
    : Number.isFinite(Number(value))
      ? Number(value)
      : null;
}

function parseModelEffort(value) {
  const at = value.lastIndexOf("@");
  return at > 0
    ? { model: value.slice(0, at), effort: value.slice(at + 1) }
    : { model: value, effort: null };
}

function nominalMultiplier(model) {
  if (model === "gpt-6-astra" || model === "astra") return 2;
  if (/gpt-5\.6-|sol|terra|luna/i.test(model)) return 1.5;
  return null;
}

function parseSecondsPair(value) {
  const match = String(value ?? "").match(/([\d.]+)s\s*[→>-]+\s*([\d.]+)s/);
  return match ? { standard: Number(match[1]), fast: Number(match[2]) } : null;
}

function extractLiveFastRows(html, sourceUrl) {
  const sectionStart = html.indexOf('id="fast-radar"');
  const historyStart = html.indexOf(
    '<section class="fast-radar-history',
    sectionStart,
  );
  const sectionHtml =
    sectionStart >= 0
      ? html.slice(
          sectionStart,
          historyStart > sectionStart ? historyStart : undefined,
        )
      : html;
  const description =
    html.match(
      /<details[^>]*class="fast-radar-explain"[\s\S]*?<p>([\s\S]*?)<\/p>/i,
    )?.[1] ?? null;
  const rows = [];
  const rowPattern =
    /<div class="fast-radar-row"[^>]*data-fast-current-effort="([^"]+)"[\s\S]*?<strong>([^<]+)<\/strong>[\s\S]*?fast-radar-metric-e2e[\s\S]*?<span>([^<]+)<\/span>[\s\S]*?fast-radar-metric-ttft[\s\S]*?<span>([^<]+)<\/span>[\s\S]*?fast-radar-metric-tps[\s\S]*?<span>([^<]+)<\/span>/gi;
  for (const match of sectionHtml.matchAll(rowPattern)) {
    const e2e = parseSecondsPair(match[3]);
    const ttft = parseSecondsPair(match[4]);
    const tps = String(match[5]).match(/([\d.]+)\s*→\s*([\d.]+)/);
    const modelLabel = match[2].trim();
    const model = modelLabel.split(/\s+/)[0].toLowerCase();
    rows.push({
      measured_at: null,
      model: model === "astra" ? "gpt-6-astra" : model,
      effort: match[1],
      nominal_multiplier: nominalMultiplier(model),
      standard_e2e_seconds: e2e?.standard ?? null,
      fast_e2e_seconds: e2e?.fast ?? null,
      standard_ttft_seconds: ttft?.standard ?? null,
      fast_ttft_seconds: ttft?.fast ?? null,
      standard_tps: tps ? Number(tps[1]) : null,
      fast_tps: tps ? Number(tps[2]) : null,
      run_sample_count: null,
      benchmark_description: description,
      source: sourceUrl,
      live_dom: true,
      raw_row_text: match[0],
    });
  }
  return rows;
}

function extractQuotaCards(html, sourceUrl, rawPath) {
  const records = [];
  const pattern =
    /class="([^"]*quota-radar-current-card-([a-z0-9-]+)[^"]*)"[\s\S]{0,4000}?<strong[^>]*>([^<]+)<\/strong>/gi;
  for (const match of html.matchAll(pattern)) {
    records.push({
      family: match[2],
      plan: "pro20",
      window: "7d",
      equivalent_capacity: number(String(match[3]).replace(/[^\d.-]/g, "")),
      measured: null,
      estimated: null,
      source: sourceUrl,
      measured_at: null,
      raw_text: match[3].trim(),
      raw_class: match[1],
      raw_path: rawPath,
    });
  }
  return records;
}

function normalizeCurrent(payload, sourceUrl) {
  const points = Array.isArray(payload?.points) ? payload.points : [];
  return points.map((point) => ({
    model: point.model ?? null,
    effort: point.effort ?? null,
    iq: point.iq ?? null,
    pass_rate:
      point.passed !== undefined && point.total
        ? Number(point.passed) / Number(point.total)
        : null,
    pass: point.passed ?? null,
    attempts: point.total ?? point.valid_tasks ?? null,
    average_price_usd: point.average_price_usd ?? null,
    average_minutes: point.average_minutes ?? null,
    sample_count: point.valid_tasks ?? point.total ?? null,
    valid_tasks: point.valid_tasks ?? null,
    runs_24h: point.runs_24h ?? null,
    updated_at: point.source_updated_at ?? point.latest_graded_at ?? null,
    source: sourceUrl,
    raw_json: point,
  }));
}

function normalizeEfficiencyHistory(payload, sourceUrl) {
  const rows = [];
  for (const snapshot of payload?.history ?? []) {
    for (const point of snapshot.points ?? []) {
      rows.push({
        timestamp: snapshot.at ?? null,
        model: point.model ?? null,
        effort: point.effort ?? null,
        iq: point.iq ?? null,
        cost: point.average_price_usd ?? null,
        minutes: point.average_minutes ?? null,
        sample_count: point.valid_tasks ?? point.total ?? null,
        source: sourceUrl,
        raw_json: point,
      });
    }
  }
  return rows;
}

function normalizeIqHistory(payload, sourceUrl) {
  const rows = [];
  for (const [key, observations] of Object.entries(payload ?? {})) {
    const latest = key.startsWith("latest:");
    const parsed = parseModelEffort(latest ? key.slice(7) : key);
    if (!Array.isArray(observations)) continue;
    for (const point of observations) {
      rows.push({
        timestamp: point.ts ?? null,
        model: parsed.model,
        effort: parsed.effort,
        iq: point.score ?? null,
        cost: null,
        minutes: null,
        sample_count: point.n ?? null,
        source: sourceUrl,
        history_variant: latest ? "latest_projection" : "full_series",
        raw_json: point,
      });
    }
  }
  return rows;
}

function normalizeTaskMatrix(payload, sourceUrl) {
  const taskMap = new Map((payload.tasks ?? []).map((task) => [task.id, task]));
  const rows = [];
  for (const [key, cell] of Object.entries(payload.cells ?? {})) {
    const [taskId, model, effort] = key.split("|");
    const task = taskMap.get(taskId);
    const latestTimestamps = (cell.ran_by ?? [])
      .map((run) => run.graded_at)
      .filter(Boolean);
    rows.push({
      task_id: taskId,
      task_title: task?.title ?? null,
      task_language: task?.language ?? null,
      task_repo: task?.repo ?? null,
      task_category: task?.category ?? null,
      model: model ?? null,
      effort: effort ?? null,
      recent_passed: cell.p ?? null,
      recent_attempts: cell.n ?? null,
      total_passed: cell.total_p ?? null,
      total_attempts: cell.total_n ?? null,
      task_weight: task?.discrimination?.raw_score ?? null,
      task_weight_json: task?.discrimination ?? null,
      latest_timestamp: cell.last_graded_at ?? null,
      latest_timestamps: latestTimestamps,
      source: sourceUrl,
      raw_json: cell,
    });
  }
  return rows;
}

function normalizeFastHistory(payload, sourceUrl) {
  const rows = [];
  for (const run of payload?.runs ?? []) {
    for (const [family, modelData] of Object.entries(run.models ?? {})) {
      const standard = modelData?.standard ?? {};
      const fast = modelData?.fast ?? {};
      const model =
        run.model ??
        (family === "astra"
          ? "gpt-6-astra"
          : family === "sol"
            ? "gpt-5.6-sol"
            : family === "terra"
              ? "gpt-5.6-terra"
              : family === "luna"
                ? "gpt-5.6-luna"
                : family);
      const ratio =
        standard.e2e_seconds && fast.e2e_seconds
          ? standard.e2e_seconds / fast.e2e_seconds
          : null;
      rows.push({
        run_id: run.run_id ?? null,
        measured_at: run.measured_at ?? null,
        completed_at: run.completed_at ?? null,
        cli_version: run.cli_version ?? null,
        model,
        effort: run.effort ?? null,
        profile: run.profile ?? null,
        nominal_multiplier: nominalMultiplier(model),
        standard_e2e_seconds: standard.e2e_seconds ?? null,
        fast_e2e_seconds: fast.e2e_seconds ?? null,
        standard_ttft_seconds: standard.ttft_seconds ?? null,
        fast_ttft_seconds: fast.ttft_seconds ?? null,
        standard_tps: standard.tps ?? null,
        fast_tps: fast.tps ?? null,
        e2e_ratio: ratio,
        run_sample_count: run.sample_count ?? null,
        valid_pairs: run.valid_pairs ?? null,
        benchmark_description: null,
        source: sourceUrl,
        live_dom: false,
        raw_json: { run, family, modelData },
      });
    }
  }
  return rows;
}

async function main() {
  await rm(researchRoot, { recursive: true, force: true });
  await mkdir(resolve(rawRoot, "pages"), { recursive: true });
  await mkdir(resolve(rawRoot, "scripts"), { recursive: true });
  await mkdir(resolve(rawRoot, "responses"), { recursive: true });
  await mkdir(normalizedRoot, { recursive: true });

  for (const page of pages) {
    const result = await retrieve({
      ...page,
      category: "page-html",
    });
    if (result.text) extractUrls(result.text, page.url, page.id);
  }

  const scriptSources = [];
  for (const page of pages) {
    const result = responseById.get(page.id);
    if (!result?.text) continue;
    const decoded = htmlEntityDecode(result.text);
    const scripts = [...decoded.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)];
    for (const match of scripts) {
      const url = new URL(match[1], page.url).toString();
      if (!hostAllowed(url)) {
        discovered.set(url, {
          url,
          category: "third-party-script-skipped",
          discoveredFrom: page.id,
        });
        continue;
      }
      const id = `script-${safeName(url)}`;
      const rawPath = `research/raw/scripts/${safeName(url)}.js`;
      scriptSources.push({
        id,
        url,
        category: "public-javascript",
        rawPath,
        discoveredFrom: page.id,
      });
    }
  }
  for (const script of scriptSources) {
    const result = await retrieve(script);
    if (result.text) extractUrls(result.text, script.url, script.id);
  }

  for (const source of knownSources) await retrieve(source);

  const discoveredEntries = [...discovered.values()].filter(
    (entry) =>
      hostAllowed(entry.url) &&
      !responseByUrl.has(entry.url) &&
      isReadOnlyResearchEndpoint(entry.url, entry.category) &&
      !/\.(?:png|jpe?g|gif|svg|webp|ico|woff2?|ttf|tar\.gz|zip)(?:\?|$)/i.test(
        entry.url,
      ),
  );
  for (const entry of discoveredEntries) {
    await retrieve({
      id: `discovered-${safeName(entry.url)}`,
      url: entry.url,
      category: entry.category,
      discoveredFrom: entry.discoveredFrom,
      rawPath: `research/raw/responses/${safeName(entry.url)}.raw`,
    });
  }

  const codexPage = responseById.get("codexradar-home");
  const dengPage = responseById.get("deng-harness-codex");
  const quotaRecords = [
    ...extractQuotaCards(
      codexPage?.text ?? "",
      "https://codexradar.com/?station=codex",
      "research/raw/pages/codexradar-home.html",
    ),
    ...extractQuotaCards(
      dengPage?.text ?? "",
      "https://deng.codexradar.com/?harness=codex",
      "research/raw/pages/deng-harness-codex.html",
    ),
  ];
  const quotaCurrent = {
    extraction_type:
      "DOM/HTML extraction; original HTML is preserved separately",
    retrieved_at: retrievedAt,
    records: quotaRecords,
    short_window: {
      status: "unavailable",
      note: "No current short-window quota value was found in the collected public pages or discovered JSON responses; no value was inferred.",
    },
  };
  await writeFile(
    resolve(rawRoot, "quota-current.json"),
    `${JSON.stringify(quotaCurrent, null, 2)}\n`,
    "utf8",
  );
  const quotaHistorySources = sourceRecords.filter(
    (record) => record.category === "quota-history",
  );
  await writeFile(
    resolve(rawRoot, "quota-history.json"),
    `${JSON.stringify(
      {
        status: quotaHistorySources.length
          ? "available_sources_collected"
          : "unavailable",
        retrieved_at: retrievedAt,
        sources: quotaHistorySources,
        note: quotaHistorySources.length
          ? "See the listed raw response paths; no history fields were discarded."
          : "No public quota-history response was found in the collected HTML/JS/API inventory. Current quota cards are preserved in quota-current.json and the original page HTML.",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const current = responseById.get("efficiency-current")?.parsed ?? {};
  const efficiencyHistory =
    responseById.get("efficiency-history")?.parsed ?? {};
  const iqHistory = responseById.get("iq-history")?.parsed ?? {};
  const table = responseById.get("task-table")?.parsed ?? {};
  const fast = responseById.get("fast-history")?.parsed ?? {};
  const currentRows = normalizeCurrent(
    current,
    "https://api.codexradar.com/api/v1/intelligence-efficiency?benchmark=deep-swe",
  );
  const historyRows = [
    ...normalizeEfficiencyHistory(
      efficiencyHistory,
      "https://codexradar.com/data/intelligence-efficiency.json",
    ),
    ...normalizeIqHistory(
      iqHistory,
      "https://api.codexradar.com/api/v1/iq-history",
    ),
  ];
  const taskRows = normalizeTaskMatrix(
    table,
    "https://api.codexradar.com/api/v1/table",
  );
  const fastRows = [
    ...normalizeFastHistory(
      fast,
      "https://codexradar.com/data/fast-radar-history.json",
    ),
    ...extractLiveFastRows(
      codexPage?.text ?? "",
      "https://codexradar.com/?station=codex",
    ),
  ];
  await writeCsv(
    "research/normalized/current-candidates.csv",
    [
      "model",
      "effort",
      "iq",
      "pass_rate",
      "pass",
      "attempts",
      "average_price_usd",
      "average_minutes",
      "sample_count",
      "valid_tasks",
      "runs_24h",
      "updated_at",
      "source",
      "raw_json",
    ],
    currentRows,
  );
  await writeCsv(
    "research/normalized/history-long.csv",
    [
      "timestamp",
      "model",
      "effort",
      "iq",
      "cost",
      "minutes",
      "sample_count",
      "history_variant",
      "source",
      "raw_json",
    ],
    historyRows,
  );
  await writeCsv(
    "research/normalized/task-matrix.csv",
    [
      "task_id",
      "task_title",
      "task_language",
      "task_repo",
      "task_category",
      "model",
      "effort",
      "recent_passed",
      "recent_attempts",
      "total_passed",
      "total_attempts",
      "task_weight",
      "task_weight_json",
      "latest_timestamp",
      "latest_timestamps",
      "source",
      "raw_json",
    ],
    taskRows,
  );
  await writeCsv(
    "research/normalized/quota-history.csv",
    [
      "family",
      "plan",
      "window",
      "equivalent_capacity",
      "measured",
      "estimated",
      "source",
      "measured_at",
      "raw_text",
      "raw_path",
      "status",
    ],
    quotaRecords.length
      ? quotaRecords.map((record) => ({ ...record, status: "current_dom" }))
      : [
          {
            family: null,
            plan: null,
            window: null,
            equivalent_capacity: null,
            measured: null,
            estimated: null,
            source: null,
            measured_at: null,
            raw_text: null,
            raw_path: null,
            status: "unavailable",
          },
        ],
  );
  await writeCsv(
    "research/normalized/fast-runs.csv",
    [
      "run_id",
      "measured_at",
      "completed_at",
      "cli_version",
      "model",
      "effort",
      "profile",
      "nominal_multiplier",
      "standard_e2e_seconds",
      "fast_e2e_seconds",
      "standard_ttft_seconds",
      "fast_ttft_seconds",
      "standard_tps",
      "fast_tps",
      "e2e_ratio",
      "run_sample_count",
      "valid_pairs",
      "benchmark_description",
      "source",
      "live_dom",
      "raw_json",
    ],
    fastRows,
  );

  const benchmarkMetadata = {
    retrieved_at: retrievedAt,
    sources: [
      {
        id: "task-table",
        url: "https://api.codexradar.com/api/v1/table",
        raw_path: "research/raw/task-table.json",
        benchmark_id: table.benchmark_id ?? null,
        benchmarks: table.benchmarks ?? [],
        policy_fields: {
          scoring_mode: table.scoring_mode ?? null,
          score_label: table.score_label ?? null,
          pass_threshold: table.pass_threshold ?? null,
          rolling_window: table.rolling_window ?? null,
          benchmark_policy_version: table.benchmark_policy_version ?? null,
        },
      },
      {
        id: "leaderboard",
        url: "https://api.codexradar.com/api/v1/leaderboard",
        raw_path: "research/raw/leaderboard.json",
        benchmark_id:
          responseById.get("leaderboard")?.parsed?.benchmark_id ?? null,
        benchmarks: responseById.get("leaderboard")?.parsed?.benchmarks ?? [],
        policy_fields: {
          scoring_mode:
            responseById.get("leaderboard")?.parsed?.scoring_mode ?? null,
          score_label:
            responseById.get("leaderboard")?.parsed?.score_label ?? null,
          pass_threshold:
            responseById.get("leaderboard")?.parsed?.pass_threshold ?? null,
        },
      },
    ],
  };
  await writeFile(
    resolve(rawRoot, "benchmark-metadata.json"),
    `${JSON.stringify(benchmarkMetadata, null, 2)}\n`,
    "utf8",
  );

  const inventory = {
    retrieved_at: retrievedAt,
    allowed_hosts: [...allowedHosts],
    source_categories: [
      "deep-swe-efficiency",
      "history-trend",
      "deep-swe-task-matrix",
      "quota-radar",
      "quota-history",
      "fast-radar",
      "model-ratings",
      "degradation-trend-insights",
      "benchmark-metadata",
      "page-html",
      "public-javascript",
    ],
    endpoints: [
      ...knownSources.map((source) => ({
        url: source.url,
        category: source.category,
        discovered_from: "explicit-research-scope",
        fetched_id: source.id,
      })),
      ...[...discovered.values()].map((entry) => ({
        url: entry.url,
        category: entry.category,
        discovered_from: entry.discoveredFrom,
        fetched: Boolean(responseByUrl.has(entry.url)),
        note: /\.(?:png|jpe?g|gif|svg|webp|ico|woff2?|ttf|tar\.gz|zip)(?:\?|$)/i.test(
          entry.url,
        )
          ? "Binary/static asset was inventoried but not fetched as a data source."
          : null,
      })),
    ],
  };
  await writeFile(
    resolve(rawRoot, "endpoint-inventory.json"),
    `${JSON.stringify(inventory, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    resolve(rawRoot, "manifest.json"),
    `${JSON.stringify(
      {
        retrieved_at: retrievedAt,
        allowed_hosts: [...allowedHosts],
        raw_response_policy:
          "Every fetched HTTP response is preserved byte-for-byte at raw_path; derived JSON/CSV files retain source URLs and raw_json fields.",
        sources: sourceRecords,
        derived_files: [
          "research/raw/quota-current.json",
          "research/raw/quota-history.json",
          "research/raw/benchmark-metadata.json",
          "research/normalized/current-candidates.csv",
          "research/normalized/history-long.csv",
          "research/normalized/task-matrix.csv",
          "research/normalized/quota-history.csv",
          "research/normalized/fast-runs.csv",
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(
    JSON.stringify(
      {
        sources: sourceRecords.length,
        discovered_endpoints: discovered.size,
        current_rows: currentRows.length,
        history_rows: historyRows.length,
        task_rows: taskRows.length,
        fast_rows: fastRows.length,
        quota_rows: quotaRecords.length,
      },
      null,
      2,
    ),
  );
}

await main();
