import {
  FAST_GROUP_MIN_MEASUREMENTS,
  FAST_MEASUREMENT_MAX_AGE_DAYS,
  FAST_MODEL_ID,
  MODEL_CATALOG,
  RADAR_ENDPOINTS,
  SELECTORS,
  SUPPORTED_MODEL_IDS,
} from "./config.js";
import type { Copy } from "./i18n.js";
import type { FastEvidenceLevel, ModelRecord } from "./scoring.js";

interface RawObject {
  [key: string]: unknown;
}

export interface FastMeasurement {
  model: string;
  effort: string | null;
  ratio: number;
  measuredAt: number | null;
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
  cost: number;
  minutes: number;
  sampleCount: number | null;
} | null {
  const raw = asObject(point);
  if (!raw) return null;
  const model = asString(raw.model).toLowerCase();
  const effort = asString(raw.effort).toLowerCase();
  const iq = asNumber(raw.iq);
  const cost = asNumber(raw.average_price_usd);
  const minutes = asNumber(raw.average_minutes);
  const sampleCount =
    asNumber(raw.valid_tasks) ??
    asNumber(raw.total) ??
    asNumber(raw.runs_total);
  if (
    !model ||
    !effort ||
    iq === null ||
    cost === null ||
    minutes === null ||
    !MODEL_CATALOG[model]
  ) {
    return null;
  }
  return { model, effort, iq, cost, minutes, sampleCount };
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

function readFastMeasurements(
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
      measurement.measuredAt === null ||
      (freshnessCutoff !== null && measurement.measuredAt >= freshnessCutoff),
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

function buildQuotaMap(root: HTMLElement | null): Map<string, number> {
  const map = new Map<string, number>();
  if (!root) return map;
  const familySelectors = {
    astra: ".quota-radar-current-card-astra",
    sol: ".quota-radar-current-card-sol",
    terra: ".quota-radar-current-card-terra",
    luna: ".quota-radar-current-card-luna",
  };
  for (const [family, selector] of Object.entries(familySelectors)) {
    const value = parseFirstNumber(
      root.querySelector(`${selector} ${SELECTORS.quotaValue}`)?.textContent,
    );
    if (Number.isFinite(value) && value > 0) map.set(family, value);
  }
  return map;
}

function normalizeRecords(
  efficiencyPayload: unknown,
  quotaBudgets: Map<string, number>,
): ModelRecord[] {
  const root = asObject(efficiencyPayload);
  const records: ModelRecord[] = [];
  for (const point of asArray(root?.points)) {
    const normalized = normalizePoint(point);
    if (!normalized || !SUPPORTED_MODEL_IDS.includes(normalized.model)) {
      continue;
    }
    const catalog = MODEL_CATALOG[normalized.model];
    const quotaBudget20x = quotaBudgets.get(catalog.family) ?? null;
    records.push({
      model: normalized.model,
      family: catalog.family,
      effort: normalized.effort,
      label: `${catalog.label} ${normalized.effort}`,
      iq: normalized.iq,
      qualityIq: normalized.iq,
      cost: normalized.cost,
      minutes: normalized.minutes,
      index: records.length,
      key: keyFor(normalized.model, normalized.effort),
      sampleCount: normalized.sampleCount,
      quotaBudget20x,
      quotaShare: null,
      quotaSource: quotaBudget20x === null ? "unavailable" : "family-radar",
      mode: "standard",
    });
  }
  return records;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    credentials: "omit",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Radar request failed: ${response.status}`);
  }
  return response.json();
}

async function fetchEfficiency(): Promise<unknown> {
  try {
    return await fetchJson(RADAR_ENDPOINTS.efficiency);
  } catch (error) {
    try {
      return await fetchJson(
        "/api/intelligence-efficiency-metrics?benchmark=deep-swe",
      );
    } catch {
      throw error;
    }
  }
}

export async function loadRadarSnapshot(
  copy: Copy,
  fastRoot: HTMLElement | null,
  quotaRoot: HTMLElement | null,
): Promise<RadarSnapshot> {
  const efficiencyPayload = await fetchEfficiency();
  const [fastResult] = await Promise.allSettled([
    fetchJson(RADAR_ENDPOINTS.fastHistory),
  ]);
  const quotaBudgets = buildQuotaMap(quotaRoot);
  const records = normalizeRecords(efficiencyPayload, quotaBudgets);
  if (records.length === 0) {
    throw new Error("Radar returned no supported DeepSWE model tiers");
  }
  const fastMeasurements = readFastMeasurements(
    fastRoot,
    fastResult.status === "fulfilled" ? fastResult.value : null,
  );
  const updatedAt =
    asString(asObject(efficiencyPayload)?.source_updated_at) || null;
  return {
    records,
    fastEstimator: createFastEstimator(
      fastMeasurements,
      copy,
      parseTimestamp(updatedAt),
    ),
    updatedAt,
  };
}
