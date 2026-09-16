import {
  FAST_GENERATION_MIN_MEASUREMENTS,
  FAST_MODEL_ID,
  HISTORY_CORRECTION_LIMIT,
  HISTORY_CURRENT_WEIGHT,
  HISTORY_MIN_POINTS,
  HISTORY_WINDOW_SIZE,
  MODEL_CATALOG,
  RADAR_ENDPOINTS,
  SELECTORS,
  SUPPORTED_MODEL_IDS,
  UNCERTAINTY_PENALTY_LIMIT,
} from "./config.js";
import type { Copy } from "./i18n.js";
import type {
  FastEvidenceSource,
  ModelRecord,
  StabilityStatus,
} from "./scoring.js";

interface RawObject {
  [key: string]: unknown;
}

interface HistoryObservation {
  timestamp: number;
  iq: number;
  sampleCount: number | null;
}

interface FastMeasurement {
  model: string;
  effort: string | null;
  ratio: number;
  measuredAt: number | null;
}

export interface FastEstimate {
  value: number;
  source: FastEvidenceSource;
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
  if (values.length === 0) {
    return null;
  }
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = values.slice().sort((left, right) => left - right);
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sorted[lower];
  }
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
  if (!raw) {
    return null;
  }
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

function buildInsightIqMap(payload: unknown): Map<string, number> {
  const map = new Map<string, number>();
  const root = asObject(payload);
  for (const item of asArray(root?.comprehensive_points)) {
    const point = asObject(item);
    if (!point) {
      continue;
    }
    const model = asString(point.model).toLowerCase();
    const effort = asString(point.effort).toLowerCase();
    const softwareIq = asNumber(point.software_iq);
    if (model && effort && softwareIq !== null) {
      map.set(keyFor(model, effort), softwareIq);
    }
  }
  return map;
}

function buildHistoryMap(payload: unknown): Map<string, HistoryObservation[]> {
  const map = new Map<string, HistoryObservation[]>();
  const root = asObject(payload);
  for (const snapshot of asArray(root?.history)) {
    const snapshotObject = asObject(snapshot);
    const timestamp = parseTimestamp(snapshotObject?.at);
    if (!snapshotObject || timestamp === null) {
      continue;
    }
    for (const item of asArray(snapshotObject.points)) {
      const point = normalizePoint(item);
      if (!point) {
        continue;
      }
      const key = keyFor(point.model, point.effort);
      const observations = map.get(key) || [];
      observations.push({
        timestamp,
        iq: point.iq,
        sampleCount: point.sampleCount,
      });
      map.set(key, observations);
    }
  }
  for (const observations of map.values()) {
    observations.sort((left, right) => left.timestamp - right.timestamp);
  }
  return map;
}

function classifyStability(
  observations: HistoryObservation[],
): StabilityStatus {
  if (observations.length < HISTORY_MIN_POINTS * 2) {
    return "unknown";
  }
  const recent = median(
    observations.slice(-HISTORY_MIN_POINTS).map((point) => point.iq),
  );
  const previous = median(
    observations
      .slice(-HISTORY_MIN_POINTS * 2, -HISTORY_MIN_POINTS)
      .map((point) => point.iq),
  );
  if (recent === null || previous === null) {
    return "unknown";
  }
  const delta = recent - previous;
  if (delta <= -2) {
    return "degrading";
  }
  if (delta >= 2) {
    return "recovering";
  }
  return "stable";
}

function stabilizeIq(
  currentIq: number,
  observations: HistoryObservation[],
  sampleCount: number | null,
): {
  qualityIq: number;
  historyCenter: number | null;
  uncertainty: number;
  stability: StabilityStatus;
} {
  const recent = observations.slice(-HISTORY_WINDOW_SIZE);
  const historyCenter = median(recent.map((point) => point.iq));
  const spread =
    historyCenter === null
      ? 0
      : median(recent.map((point) => Math.abs(point.iq - historyCenter))) || 0;
  const correction =
    historyCenter === null
      ? 0
      : Math.min(
          HISTORY_CORRECTION_LIMIT,
          Math.max(
            -HISTORY_CORRECTION_LIMIT,
            (historyCenter - currentIq) * (1 - HISTORY_CURRENT_WEIGHT),
          ),
        );
  const samplePenalty = Math.min(
    UNCERTAINTY_PENALTY_LIMIT,
    8 / Math.sqrt(Math.max(sampleCount || 1, 1)),
  );
  const volatilityPenalty = Math.min(UNCERTAINTY_PENALTY_LIMIT, spread * 0.15);
  const uncertainty = Math.min(
    UNCERTAINTY_PENALTY_LIMIT,
    samplePenalty + volatilityPenalty,
  );
  return {
    qualityIq: currentIq + correction - uncertainty,
    historyCenter,
    uncertainty,
    stability: classifyStability(recent),
  };
}

function buildCommunityMap(
  payload: unknown,
): Map<string, { average: number; count: number }> {
  const map = new Map<string, { average: number; count: number }>();
  const root = asObject(payload);
  for (const item of asArray(root?.models)) {
    const point = asObject(item);
    const id = asString(point?.id).toLowerCase();
    const average = asNumber(point?.average);
    const count = asNumber(point?.count);
    if (id && average !== null && count !== null) {
      map.set(id, { average, count });
    }
  }
  return map;
}

function buildQuotaMap(root: HTMLElement | null): Map<string, number> {
  const map = new Map<string, number>();
  if (!root) {
    return map;
  }
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
    if (Number.isFinite(value) && value > 0) {
      map.set(family, value);
    }
  }
  return map;
}

function normalizeModelId(family: string): string | null {
  const normalized = family.toLowerCase().trim();
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
  return ratio > 1 ? ratio : null;
}

function readFastFallback(root: HTMLElement | null): RawObject | null {
  const fallback = root?.querySelector(SELECTORS.fastHistoryFallback);
  if (!fallback?.textContent) {
    return null;
  }
  try {
    return asObject(JSON.parse(fallback.textContent));
  } catch {
    return null;
  }
}

function readFastMeasurements(
  root: HTMLElement | null,
  payload: unknown,
): FastMeasurement[] {
  const measurements: FastMeasurement[] = [];
  if (root) {
    for (const row of root.querySelectorAll<HTMLElement>(
      SELECTORS.fastEffort,
    )) {
      const effort = asString(row.dataset.fastCurrentEffort).toLowerCase();
      const ratio = parseFirstNumber(
        row.querySelector(SELECTORS.fastE2e)?.textContent,
      );
      if (effort && Number.isFinite(ratio) && ratio > 1) {
        measurements.push({
          model: FAST_MODEL_ID,
          effort,
          ratio,
          measuredAt: null,
        });
      }
    }
  }

  const apiRoot = asObject(payload);
  const historyRoot =
    apiRoot && asArray(apiRoot.runs).length > 0
      ? apiRoot
      : (readFastFallback(root) ?? apiRoot);
  for (const item of asArray(historyRoot?.runs)) {
    const run = asObject(item);
    if (!run) {
      continue;
    }
    const measuredAt = parseTimestamp(run.measured_at);
    const runModel = normalizeModelId(asString(run.model));
    const runEffort = asString(run.effort).toLowerCase() || null;
    const models = asObject(run.models);
    for (const [family, value] of Object.entries(models || {})) {
      const model = runModel || normalizeModelId(family);
      const ratio = readFastRatio(asObject(value));
      if (model && ratio !== null) {
        measurements.push({ model, effort: runEffort, ratio, measuredAt });
      }
    }
  }
  return measurements;
}

function createFastEstimator(
  measurements: FastMeasurement[],
  copy: Copy,
): FastEstimator {
  const exact = new Map<string, number[]>();
  const byModel = new Map<string, number[]>();
  const byGeneration = new Map<string, number[]>();

  for (const measurement of measurements) {
    const modelValues = byModel.get(measurement.model) || [];
    modelValues.push(measurement.ratio);
    byModel.set(measurement.model, modelValues);
    if (measurement.effort) {
      const key = keyFor(measurement.model, measurement.effort);
      const exactValues = exact.get(key) || [];
      exactValues.push(measurement.ratio);
      exact.set(key, exactValues);
    }
    const catalog = MODEL_CATALOG[measurement.model];
    if (catalog?.fastGroup && catalog.nominalFastSpeedup > 1) {
      const groupValues = byGeneration.get(catalog.fastGroup) || [];
      groupValues.push(
        Math.min(
          1,
          Math.max(
            0,
            (measurement.ratio - 1) / (catalog.nominalFastSpeedup - 1),
          ),
        ),
      );
      byGeneration.set(catalog.fastGroup, groupValues);
    }
  }

  return {
    measurementCount: measurements.length,
    estimate(record) {
      const catalog = MODEL_CATALOG[record.model];
      if (!catalog || catalog.nominalFastSpeedup <= 1) {
        return null;
      }
      const exactRatio = median(
        exact.get(keyFor(record.model, record.effort)) || [],
      );
      if (exactRatio !== null) {
        return {
          value: Math.min(catalog.nominalFastSpeedup, exactRatio),
          source: "exact",
          sourceLabel: copy.fastExactSource,
        };
      }
      const modelRatio = percentile(byModel.get(record.model) || [], 0.25);
      if (modelRatio !== null) {
        return {
          value: Math.min(catalog.nominalFastSpeedup, modelRatio),
          source: "model",
          sourceLabel: copy.fastModelSource,
        };
      }
      const generationValues = byGeneration.get(catalog.fastGroup || "") || [];
      if (generationValues.length < FAST_GENERATION_MIN_MEASUREMENTS) {
        return null;
      }
      const fulfillment = percentile(generationValues, 0.25);
      if (fulfillment === null) {
        return null;
      }
      return {
        value: 1 + fulfillment * (catalog.nominalFastSpeedup - 1),
        source: "generation",
        sourceLabel: copy.fastGenerationSource,
      };
    },
  };
}

function normalizeRecords(
  efficiencyPayload: unknown,
  insightsPayload: unknown,
  historyMap: Map<string, HistoryObservation[]>,
  quotaBudgets: Map<string, number>,
  community: Map<string, { average: number; count: number }>,
): ModelRecord[] {
  const insightIq = buildInsightIqMap(insightsPayload);
  const root = asObject(efficiencyPayload);
  const records: ModelRecord[] = [];
  for (const point of asArray(root?.points)) {
    const normalized = normalizePoint(point);
    if (!normalized || !SUPPORTED_MODEL_IDS.includes(normalized.model)) {
      continue;
    }
    const catalog = MODEL_CATALOG[normalized.model];
    const key = keyFor(normalized.model, normalized.effort);
    const rawIq = insightIq.get(key) ?? normalized.iq;
    const stability = stabilizeIq(
      rawIq,
      historyMap.get(key) || [],
      normalized.sampleCount,
    );
    const rating = community.get(`${normalized.model}-${normalized.effort}`);
    const quotaBudget20x = quotaBudgets.get(catalog.family) ?? null;
    records.push({
      model: normalized.model,
      effort: normalized.effort,
      label: `${catalog.label} ${normalized.effort}`,
      iq: rawIq,
      qualityIq: stability.qualityIq,
      hardIq: null,
      cost: normalized.cost,
      minutes: normalized.minutes,
      index: records.length,
      key,
      sampleCount: normalized.sampleCount,
      historyCenter: stability.historyCenter,
      uncertainty: stability.uncertainty,
      stability: stability.stability,
      quotaBudget20x,
      quotaShare: null,
      quotaSource:
        quotaBudget20x === null ? "plan-normalized-cost" : "family-radar",
      communityRating: rating?.average ?? null,
      communityRatingCount: rating?.count ?? 0,
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
        `/api/intelligence-efficiency-metrics?benchmark=deep-swe`,
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
  const [fastResult, insightsResult, ratingsResult] = await Promise.allSettled([
    fetchJson(RADAR_ENDPOINTS.fastHistory),
    fetchJson(RADAR_ENDPOINTS.insights),
    fetchJson(RADAR_ENDPOINTS.ratings),
  ]);
  const historyMap = buildHistoryMap(efficiencyPayload);
  const quotaBudgets = buildQuotaMap(quotaRoot);
  const community =
    ratingsResult.status === "fulfilled"
      ? buildCommunityMap(ratingsResult.value)
      : new Map<string, { average: number; count: number }>();
  const records = normalizeRecords(
    efficiencyPayload,
    insightsResult.status === "fulfilled" ? insightsResult.value : null,
    historyMap,
    quotaBudgets,
    community,
  );
  if (records.length === 0) {
    throw new Error("Radar returned no supported DeepSWE model tiers");
  }
  const fastMeasurements = readFastMeasurements(
    fastRoot,
    fastResult.status === "fulfilled" ? fastResult.value : null,
  );
  return {
    records,
    fastEstimator: createFastEstimator(fastMeasurements, copy),
    updatedAt: asString(asObject(efficiencyPayload)?.source_updated_at) || null,
  };
}
