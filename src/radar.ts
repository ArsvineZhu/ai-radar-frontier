import {
  FAST_GROUP_MIN_MEASUREMENTS,
  FAST_MEASUREMENT_MAX_AGE_DAYS,
  FAST_MODEL_ID,
  HOST_ID,
  MODEL_CATALOG,
  RADAR_ENDPOINTS,
  SELECTORS,
  SUPPORTED_MODEL_IDS,
} from "./config.js";
import type { Copy } from "./i18n.js";
import { quotaEntry } from "./quota.js";
import type { FastEvidenceLevel, ModelRecord } from "./scoring.js";

interface RawObject {
  [key: string]: unknown;
}

export interface FastMeasurement {
  model: string;
  effort: string | null;
  ratio: number;
  measuredAt: number | null;
  source: "live-dom" | "history";
  sampleCount: number | null;
  validPairs?: number | null;
}

export interface FastEstimate {
  ratio: number;
  evidenceLevel: FastEvidenceLevel;
  sampleCount: number;
  ageDays: number | null;
  nominalRatio: number;
  timeKind: "transferred-e2e-estimate";
  sourceLabel: string;
}

export interface FastEstimator {
  estimate(record: ModelRecord): FastEstimate | null;
  measurementCount: number;
}

export interface RadarSnapshot {
  records: ModelRecord[];
  fastEstimator: FastEstimator;
  updatedAt: string | null;
  missingTierCount?: number;
  pendingTierCount?: number;
  cachedAt?: string | null;
  refreshFailed?: boolean;
}

function asObject(value: unknown): RawObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RawObject)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    typeof value === "boolean"
  ) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseTimestamp(value: unknown): number | null {
  const timestamp = Date.parse(asString(value));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function parseFirstNumber(value: unknown): number {
  const match = String(value ?? "")
    .replace(/,/g, "")
    .match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : Number.NaN;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((left, right) => left - right);
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function keyFor(model: string, effort: string): string {
  return `${model}::${effort}`;
}

function normalizePoint(point: unknown): {
  model: string;
  effort: string;
  iq: number;
  benchmarkCostEquivalent: number;
  benchmarkMinutes: number;
  sampleCount: number | null;
  runs24h: number | null;
  sourceUpdatedAt: string | null;
} | null {
  const raw = asObject(point);
  if (!raw) return null;
  const model = asString(raw.model).toLowerCase();
  const effort = asString(raw.effort).toLowerCase();
  const iq = asNumber(raw.iq);
  const benchmarkCostEquivalent = asNumber(raw.average_price_usd);
  const benchmarkMinutes = asNumber(raw.average_minutes);
  const sampleCount =
    asNumber(raw.valid_tasks) ??
    asNumber(raw.total) ??
    asNumber(raw.runs_total);
  const runs24h = asNumber(raw.runs_24h);
  const sourceUpdatedAt = asString(raw.source_updated_at) || null;
  if (
    !model ||
    !effort ||
    iq === null ||
    benchmarkCostEquivalent === null ||
    benchmarkMinutes === null ||
    !MODEL_CATALOG[model]
  ) {
    return null;
  }
  return {
    model,
    effort,
    iq,
    benchmarkCostEquivalent,
    benchmarkMinutes,
    sampleCount,
    runs24h,
    sourceUpdatedAt,
  };
}

function normalizeModelId(value: string): string | null {
  const normalized = value.toLowerCase().trim();
  if (normalized === "astra") return "gpt-6-astra";
  if (normalized === "sol") return "gpt-5.6-sol";
  if (normalized === "terra") return "gpt-5.6-terra";
  if (normalized === "luna") return "gpt-5.6-luna";
  return MODEL_CATALOG[normalized] ? normalized : null;
}

function readFastRatio(entry: RawObject | null): number | null {
  const standard = asNumber(asObject(entry?.standard)?.e2e_seconds);
  const fast = asNumber(asObject(entry?.fast)?.e2e_seconds);
  if (standard === null || fast === null || standard <= 0 || fast <= 0) {
    return null;
  }
  const ratio = standard / fast;
  return ratio > 0 ? ratio : null;
}

function readFastFallback(root: HTMLElement | null): RawObject | null {
  const fallback = root?.querySelector(SELECTORS.fastHistoryFallback);
  if (!fallback?.textContent) return null;
  try {
    return asObject(JSON.parse(fallback.textContent));
  } catch {
    return null;
  }
}

function readCurrentPairCount(root: HTMLElement | null): number | null {
  const text = root?.querySelector(".fast-radar-explain p")?.textContent ?? "";
  const match = text.match(
    /Standard\s+(\d+)\s*(?:次|times|runs?)[\s\S]*?Fast\s+(\d+)\s*(?:次|times|runs?)/i,
  );
  if (!match) return null;
  const standard = Number(match[1]);
  const fast = Number(match[2]);
  return Number.isFinite(standard) && Number.isFinite(fast)
    ? Math.min(standard, fast)
    : null;
}

function runPairCount(run: RawObject): number | null {
  return asNumber(run.valid_pairs);
}

function runSampleCount(run: RawObject): number | null {
  return asNumber(run.sample_count) ?? runPairCount(run);
}

function fallbackPairCount(
  fallback: RawObject | null,
  model: string,
  effort: string,
): number | null {
  for (const item of asArray(fallback?.runs)) {
    const run = asObject(item);
    if (!run) continue;
    const runModel = normalizeModelId(asString(run.model));
    const runEffort = asString(run.effort).toLowerCase();
    if (runModel === model && runEffort === effort) {
      return runPairCount(run);
    }
  }
  return null;
}

export function readFastMeasurements(
  root: HTMLElement | null,
  payload: unknown,
): FastMeasurement[] {
  const measurements: FastMeasurement[] = [];
  const fallback = readFastFallback(root);
  const currentPairCount = readCurrentPairCount(root);
  if (root) {
    for (const row of root.querySelectorAll<HTMLElement>(
      SELECTORS.fastEffort,
    )) {
      const effort = asString(row.dataset.fastCurrentEffort).toLowerCase();
      const ratio = parseFirstNumber(
        row.querySelector(SELECTORS.fastE2e)?.textContent,
      );
      if (!effort || !Number.isFinite(ratio) || ratio <= 0) continue;
      measurements.push({
        model: FAST_MODEL_ID,
        effort,
        ratio,
        measuredAt: null,
        source: "live-dom",
        sampleCount:
          fallbackPairCount(fallback, FAST_MODEL_ID, effort) ??
          currentPairCount,
        validPairs:
          fallbackPairCount(fallback, FAST_MODEL_ID, effort) ??
          currentPairCount,
      });
    }
  }

  const apiRoot = asObject(payload);
  const historyRoot =
    apiRoot && asArray(apiRoot.runs).length > 0
      ? apiRoot
      : (fallback ?? apiRoot);
  for (const item of asArray(historyRoot?.runs)) {
    const run = asObject(item);
    if (!run) continue;
    const measuredAt = parseTimestamp(run.measured_at);
    const runModel = normalizeModelId(asString(run.model));
    const runEffort = asString(run.effort).toLowerCase() || null;
    const models = asObject(run.models);
    for (const [family, value] of Object.entries(models || {})) {
      const model = runModel || normalizeModelId(family);
      const ratio = readFastRatio(asObject(value));
      if (!model || ratio === null) continue;
      measurements.push({
        model,
        effort: runEffort,
        ratio,
        measuredAt,
        source: "history",
        sampleCount: runSampleCount(run),
        validPairs: runPairCount(run),
      });
    }
  }
  return measurements;
}

function measurementSampleCount(measurements: FastMeasurement[]): number {
  const known = measurements
    .map((measurement) => measurement.validPairs ?? measurement.sampleCount)
    .filter((value): value is number => value !== null && value > 0);
  return known.length > 0
    ? known.reduce((sum, value) => sum + value, 0)
    : measurements.length;
}

function ageDays(
  measurements: FastMeasurement[],
  referenceAt: number | null,
): number | null {
  const dated = measurements
    .map((measurement) => measurement.measuredAt)
    .filter((value): value is number => value !== null);
  if (referenceAt === null || dated.length === 0) return null;
  return Math.max(0, (referenceAt - Math.min(...dated)) / 86_400_000);
}

function createEstimate(
  ratio: number,
  evidenceLevel: FastEvidenceLevel,
  measurements: FastMeasurement[],
  nominalRatio: number,
  sourceLabel: string,
  referenceAt: number | null,
): FastEstimate {
  return {
    ratio: Math.min(nominalRatio, ratio),
    evidenceLevel,
    sampleCount: measurementSampleCount(measurements),
    ageDays: ageDays(measurements, referenceAt),
    nominalRatio,
    timeKind: "transferred-e2e-estimate",
    sourceLabel,
  };
}

export function createFastEstimator(
  measurements: FastMeasurement[],
  copy: Copy,
  referenceAt: number | null,
): FastEstimator {
  const datedMeasurements = measurements
    .map((measurement) => measurement.measuredAt)
    .filter((value): value is number => value !== null);
  const freshnessReference =
    referenceAt ??
    (datedMeasurements.length > 0 ? Math.max(...datedMeasurements) : null);
  const freshnessCutoff =
    freshnessReference === null
      ? null
      : freshnessReference - FAST_MEASUREMENT_MAX_AGE_DAYS * 86_400_000;
  const freshMeasurements = measurements.filter(
    (measurement) =>
      measurement.source === "live-dom" ||
      (measurement.measuredAt !== null &&
        freshnessCutoff !== null &&
        measurement.measuredAt >= freshnessCutoff),
  );
  const exact = new Map<string, FastMeasurement[]>();
  const byModel = new Map<string, FastMeasurement[]>();
  const byGroup = new Map<string, FastMeasurement[]>();

  for (const measurement of freshMeasurements) {
    const modelValues = byModel.get(measurement.model) ?? [];
    modelValues.push(measurement);
    byModel.set(measurement.model, modelValues);
    if (measurement.effort) {
      const key = keyFor(measurement.model, measurement.effort);
      const exactValues = exact.get(key) ?? [];
      exactValues.push(measurement);
      exact.set(key, exactValues);
    }
    const catalog = MODEL_CATALOG[measurement.model];
    if (catalog?.fastGroup && catalog.nominalFastSpeedup > 1) {
      const groupValues = byGroup.get(catalog.fastGroup) ?? [];
      groupValues.push(measurement);
      byGroup.set(catalog.fastGroup, groupValues);
    }
  }

  return {
    measurementCount: freshMeasurements.length,
    estimate(record) {
      const catalog = MODEL_CATALOG[record.model];
      if (!catalog || catalog.nominalFastSpeedup <= 1) return null;
      const exactValues = (
        exact.get(keyFor(record.model, record.effort)) ?? []
      ).filter(
        (measurement) =>
          measurement.validPairs !== null &&
          measurement.validPairs !== undefined &&
          measurement.validPairs >= 3,
      );
      const liveExact = exactValues.filter(
        (measurement) => measurement.measuredAt === null,
      );
      const selectedExact = liveExact.length > 0 ? liveExact : exactValues;
      if (selectedExact.length > 0) {
        const ratio = median(
          selectedExact.map((measurement) => measurement.ratio),
        );
        if (ratio !== null) {
          return createEstimate(
            ratio,
            "exact",
            selectedExact,
            catalog.nominalFastSpeedup,
            copy.fastExactSource,
            referenceAt,
          );
        }
      }

      const modelValues = byModel.get(record.model) ?? [];
      if (modelValues.length >= 3) {
        const ratio = percentile(
          modelValues.map((measurement) => measurement.ratio),
          0.25,
        );
        if (ratio !== null) {
          return createEstimate(
            ratio,
            "model",
            modelValues,
            catalog.nominalFastSpeedup,
            copy.fastModelSource,
            referenceAt,
          );
        }
      }

      const groupValues = byGroup.get(catalog.fastGroup ?? "") ?? [];
      if (groupValues.length < FAST_GROUP_MIN_MEASUREMENTS) return null;
      const fulfillment = percentile(
        groupValues.map(
          (measurement) =>
            (measurement.ratio - 1) / (catalog.nominalFastSpeedup - 1),
        ),
        0.25,
      );
      if (fulfillment === null) return null;
      return createEstimate(
        1 +
          Math.min(1, Math.max(0, fulfillment)) *
            (catalog.nominalFastSpeedup - 1),
        "fastGroup",
        groupValues,
        catalog.nominalFastSpeedup,
        copy.fastGroupSource,
        referenceAt,
      );
    },
  };
}

export function normalizeRecords(efficiencyPayload: unknown): ModelRecord[] {
  const root = asObject(efficiencyPayload);
  const records: ModelRecord[] = [];
  for (const point of asArray(root?.points)) {
    const normalized = normalizePoint(point);
    if (!normalized || !SUPPORTED_MODEL_IDS.includes(normalized.model)) {
      continue;
    }
    const catalog = MODEL_CATALOG[normalized.model];
    const reference = quotaEntry(normalized.model, normalized.effort);
    records.push({
      model: normalized.model,
      family: catalog.family,
      effort: normalized.effort,
      label: `${catalog.label} ${normalized.effort}`,
      iq: normalized.iq,
      qualityIq: normalized.iq,
      index: records.length,
      key: keyFor(normalized.model, normalized.effort),
      sampleCount: normalized.sampleCount,
      runs24h: normalized.runs24h,
      sourceUpdatedAt: normalized.sourceUpdatedAt,
      quotaWeight: reference?.quotaWeight ?? null,
      quotaValidTasks: reference?.validTasks ?? null,
      quotaDiscriminationCoverage: reference?.discriminationCoverage ?? null,
      quotaDiscriminationConfidence:
        reference?.discriminationConfidence ?? null,
      quotaSource: reference?.evidence ?? "unavailable",
      mode: "standard",
      benchmarkCostEquivalent: normalized.benchmarkCostEquivalent,
      benchmarkMinutes: normalized.benchmarkMinutes,
    });
  }
  return records;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    credentials: "omit",
    signal: AbortSignal.timeout(15000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Radar request failed: ${response.status}`);
  }
  return response.json();
}

export function normalizeBenchSummary(
  payload: unknown,
  binding: Record<string, unknown>,
  selection: { model: string; effort: string },
): RawObject {
  const raw = asObject(payload);
  if (
    !raw ||
    raw.model !== selection.model ||
    raw.effort !== selection.effort ||
    raw.benchmark !== binding.benchmark ||
    raw.task_set_sha256 !== binding.task_set_sha256 ||
    raw.score_version !== "radar-bench-v2-150" ||
    raw.score_max !== 150
  ) {
    throw new Error("Radar Bench summary does not match the active binding");
  }
  const metrics = asObject(asObject(raw.statistics)?.metrics);
  const mean = (name: string): number | null => {
    const metric = asObject(metrics?.[name]);
    const count = asNumber(metric?.known_samples);
    const total = asNumber(metric?.known_total);
    return count !== null && count > 0 && total !== null && total > 0
      ? total / count
      : null;
  };
  const elapsed = mean("elapsed_ms");
  return {
    model: raw.model,
    effort: raw.effort,
    iq: raw.score,
    average_price_usd: mean("api_equivalent_usd"),
    average_minutes: elapsed === null ? null : elapsed / 60000,
    valid_tasks: raw.coverage,
  };
}

const BENCH_CACHE_KEY = `${HOST_ID}:radar-bench-cache`;
const SITE_CACHE_KEY = "radar-bench-observed-snapshots-v2-150";
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CACHE_REUSE_MS = 5 * 60 * 1000;

function storedPayload(key: string): RawObject | null {
  try {
    return asObject(JSON.parse(window.localStorage.getItem(key) ?? "null"));
  } catch {
    return null;
  }
}

interface CachedTier {
  observedAt: number;
  summary: unknown;
  point: RawObject;
  cached: boolean;
}

function cachedTiers(binding: RawObject): Map<string, CachedTier> {
  const tiers = new Map<string, CachedTier>();
  for (const key of [BENCH_CACHE_KEY, SITE_CACHE_KEY]) {
    const payload = storedPayload(key);
    if (payload?.schema !== SITE_CACHE_KEY) continue;
    for (const item of asArray(payload.entries)) {
      const entry = asObject(item);
      const summary = asObject(entry?.summary);
      const observedAt = parseTimestamp(entry?.observed_at);
      if (
        !summary ||
        observedAt === null ||
        Date.now() - observedAt < 0 ||
        Date.now() - observedAt > CACHE_MAX_AGE_MS
      )
        continue;
      const selection = {
        model: asString(summary.model),
        effort: asString(summary.effort),
      };
      if (
        !asArray(binding.model_efforts).some((selectionItem) => {
          const bound = asObject(selectionItem);
          return (
            bound?.model === selection.model &&
            bound.effort === selection.effort
          );
        })
      )
        continue;
      try {
        const point = normalizeBenchSummary(summary, binding, selection);
        if (!normalizeRecords({ points: [point] }).length) continue;
        const tierKey = keyFor(selection.model, selection.effort);
        if ((tiers.get(tierKey)?.observedAt ?? 0) < observedAt)
          tiers.set(tierKey, { summary, point, observedAt, cached: true });
      } catch {
        /* Changed task sets and invalid snapshots cannot seed recommendations. */
      }
    }
  }
  return tiers;
}

function saveBenchCache(
  binding: RawObject,
  tiers: Map<string, CachedTier>,
): void {
  try {
    window.localStorage.setItem(
      BENCH_CACHE_KEY,
      JSON.stringify({
        schema: SITE_CACHE_KEY,
        binding,
        entries: [...tiers.values()].map((tier) => ({
          observed_at: new Date(tier.observedAt).toISOString(),
          summary: tier.summary,
        })),
      }),
    );
  } catch {
    /* Storage is optional; live reads remain usable. */
  }
}

async function fetchEfficiency(
  onProgress: (payload: unknown) => void,
): Promise<unknown> {
  const previousBinding = asObject(storedPayload(BENCH_CACHE_KEY)?.binding);
  let previousPayload: RawObject | null = null;
  if (
    previousBinding?.enabled &&
    previousBinding.production_read_verified &&
    previousBinding.score_max === 150
  ) {
    const cached = [...cachedTiers(previousBinding).values()];
    if (cached.length) {
      previousPayload = {
        points: cached.map((tier) => tier.point),
        cachedAt: new Date(
          Math.min(...cached.map((tier) => tier.observedAt)),
        ).toISOString(),
        pendingTierCount: asArray(previousBinding.model_efforts).length,
      };
      onProgress(previousPayload);
    }
  }
  let binding: RawObject | null;
  try {
    binding = asObject(await fetchJson(RADAR_ENDPOINTS.binding));
  } catch (error) {
    if (previousPayload)
      return { ...previousPayload, pendingTierCount: 0, refreshFailed: true };
    throw error;
  }
  if (
    !binding?.enabled ||
    !binding.production_read_verified ||
    binding.score_max !== 150
  )
    throw new Error("Radar Bench binding is unavailable");
  const selections = asArray(binding.model_efforts)
    .map(asObject)
    .filter((item): item is RawObject =>
      Boolean(
        item && MODEL_CATALOG[asString(item.model)] && asString(item.effort),
      ),
    );
  const tiers = cachedTiers(binding);
  // Read useful quality tiers first on a cold load, rather than occupying the pool with low/medium.
  const effortPriority = ["high", "max", "xhigh", "ultra", "medium", "low"];
  selections.sort(
    (a, b) =>
      effortPriority.indexOf(asString(a.effort)) -
      effortPriority.indexOf(asString(b.effort)),
  );
  const queue = selections.filter((item) => {
    const cached = tiers.get(
      keyFor(asString(item.model), asString(item.effort)),
    );
    return !cached || Date.now() - cached.observedAt > CACHE_REUSE_MS;
  });
  let next = 0;
  let completed = selections.length - queue.length;
  const currentPayload = () => {
    const points = [...tiers.values()]
      .map((tier) => tier.point)
      .sort((a, b) =>
        `${a.model}::${a.effort}`.localeCompare(`${b.model}::${b.effort}`),
      );
    const cached = [...tiers.values()].filter((tier) => tier.cached);
    return {
      points,
      missingTierCount: Math.max(
        0,
        completed - normalizeRecords({ points }).length,
      ),
      pendingTierCount: selections.length - completed,
      cachedAt: cached.length
        ? new Date(
            Math.min(...cached.map((tier) => tier.observedAt)),
          ).toISOString()
        : null,
    };
  };
  onProgress(currentPayload());
  await Promise.all(
    Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (next < queue.length) {
        const item = queue[next++];
        const selection = {
          model: asString(item.model),
          effort: asString(item.effort),
        };
        const key = keyFor(selection.model, selection.effort);
        // The native site may have completed this tier while it waited in our queue.
        const shared = cachedTiers(binding).get(key);
        try {
          if (shared && Date.now() - shared.observedAt <= CACHE_REUSE_MS)
            tiers.set(key, shared);
          else {
            const query = new URLSearchParams({
              ...selection,
              view: "summary",
              selection: "user-selected-v1",
            });
            const summary = await fetchJson(
              `${RADAR_ENDPOINTS.score}?${query}`,
            );
            const point = normalizeBenchSummary(summary, binding, selection);
            if (normalizeRecords({ points: [point] }).length)
              tiers.set(key, {
                summary,
                point,
                observedAt: Date.now(),
                cached: false,
              });
          }
          saveBenchCache(binding, tiers);
        } catch {
          /* Keep a labeled recent snapshot if its live refresh fails. */
        } finally {
          completed += 1;
          onProgress(currentPayload());
        }
      }
    }),
  );
  saveBenchCache(binding, tiers);
  return currentPayload();
}

export async function loadRadarSnapshot(
  copy: Copy,
  fastRoot: HTMLElement | null,
  onProgress?: (snapshot: RadarSnapshot) => void,
): Promise<RadarSnapshot> {
  let latestPayload: unknown = null;
  let fastPayload: unknown = null;
  let hasPublished = false;
  const snapshotFor = (payload: unknown): RadarSnapshot => ({
    records: normalizeRecords(payload),
    fastEstimator: createFastEstimator(
      readFastMeasurements(fastRoot, fastPayload),
      copy,
      Date.now(),
    ),
    updatedAt: null,
    cachedAt: asString(asObject(payload)?.cachedAt) || null,
    refreshFailed: asObject(payload)?.refreshFailed === true,
    missingTierCount: asNumber(asObject(payload)?.missingTierCount) ?? 0,
    pendingTierCount: asNumber(asObject(payload)?.pendingTierCount) ?? 0,
  });
  const publish = (payload: unknown) => {
    latestPayload = payload;
    const snapshot = snapshotFor(payload);
    if (snapshot.records.length > 0 || hasPublished) onProgress?.(snapshot);
    hasPublished = snapshot.records.length > 0;
  };
  // Fast runs independently so its latency cannot keep Standard behind a skeleton.
  const fastRequest = fetchJson(RADAR_ENDPOINTS.fastHistory)
    .then((payload) => {
      fastPayload = payload;
      if (latestPayload) publish(latestPayload);
    })
    .catch(() => {});
  const efficiencyPayload = await fetchEfficiency(publish);
  const snapshot = snapshotFor(efficiencyPayload);
  if (snapshot.records.length === 0) {
    throw new Error(
      "Radar Bench returned no supported tiers with score, cost and duration",
    );
  }
  await fastRequest;
  return snapshotFor(efficiencyPayload);
}
