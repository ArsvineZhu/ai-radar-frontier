import { WORKLOAD_ALPHA_PRIOR, PLAN_LIMITS } from "./config.js";
import type { SubscriptionKey } from "./scoring.js";

type ShortWindowMethod = "full-window" | "paired-meter";
type CalibrationObservationStatus = "accepted" | "rejected";
type ShortCalibrationStatus = "baseline" | "initial" | "calibrated" | "stable";
type WorkloadCalibrationStatus = "baseline" | "initial" | "calibrated";

export interface ShortWindowObservationInput {
  plan: SubscriptionKey;
  method: ShortWindowMethod;
  fullWindows?: number;
  shortBefore?: number;
  shortAfter?: number;
  weeklyBefore: number;
  weeklyAfter: number;
  recordedAt?: string;
  id?: string;
}

export interface ShortWindowObservation {
  id: string;
  recordedAt: string;
  plan: SubscriptionKey;
  method: ShortWindowMethod;
  fullWindows?: number;
  shortBefore?: number;
  shortAfter?: number;
  weeklyBefore: number;
  weeklyAfter: number;
  deltaShort: number;
  deltaWeekly: number;
  estimatedKappa: number | null;
  status: CalibrationObservationStatus;
  rejectionReason?: string;
}

export interface WorkloadCalibrationObservationInput {
  plan: SubscriptionKey;
  model: string;
  family: string;
  effort: string;
  mode: "standard" | "fast";
  benchmarkCostEquivalent: number;
  benchmarkMinutes: number;
  quotaBudget20x: number;
  actualMinutes: number;
  weeklyBefore?: number;
  weeklyAfter?: number;
  shortBefore?: number;
  shortAfter?: number;
  weeklyUsage?: number;
  shortWindowUsage?: number;
  representativeTask: true;
  recordedAt?: string;
  id?: string;
}

export interface WorkloadCalibrationObservation extends WorkloadCalibrationObservationInput {
  id: string;
  recordedAt: string;
  weeklyUsage?: number;
  shortWindowUsage?: number;
  alphaObservation: number | null;
  betaObservation: number | null;
  status: CalibrationObservationStatus;
  rejectionReason?: string;
}

export interface CalibrationStoreV1 {
  schemaVersion: 1;
  shortWindowObservations: ShortWindowObservation[];
  workloadObservations: WorkloadCalibrationObservation[];
}

export interface CalibrationSummary {
  shortWindow: {
    ratio: number;
    exposure: number;
    status: ShortCalibrationStatus;
  };
  workload: {
    alpha: number;
    beta: number;
    quotaConfidence: number;
    timeConfidence: number;
    status: WorkloadCalibrationStatus;
    sampleCount: number;
  };
}

export interface CalibrationDerivedContext extends CalibrationSummary {
  shortWindowEnabled: boolean;
  shortWindowHours: number;
}

export function createEmptyCalibrationStore(): CalibrationStoreV1 {
  return {
    schemaVersion: 1,
    shortWindowObservations: [],
    workloadObservations: [],
  };
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function fraction(value: unknown): value is number {
  return finite(value) && value >= 0 && value <= 1;
}

function id(prefix: string): string {
  const cryptoObject = globalThis.crypto;
  return typeof cryptoObject?.randomUUID === "function"
    ? cryptoObject.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function recordedAt(value?: string): string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? value
    : new Date().toISOString();
}

function rejectShort(
  input: ShortWindowObservationInput,
  deltaShort: number,
  deltaWeekly: number,
  reason: string,
): ShortWindowObservation {
  return {
    ...input,
    id: input.id ?? id("short"),
    recordedAt: recordedAt(input.recordedAt),
    deltaShort,
    deltaWeekly,
    estimatedKappa: null,
    status: "rejected",
    rejectionReason: reason,
  };
}

export function createShortWindowObservation(
  input: ShortWindowObservationInput,
): ShortWindowObservation {
  const deltaShort =
    input.method === "full-window"
      ? (input.fullWindows ?? Number.NaN)
      : (input.shortBefore ?? Number.NaN) - (input.shortAfter ?? Number.NaN);
  const deltaWeekly = input.weeklyBefore - input.weeklyAfter;
  if (!fraction(input.weeklyBefore) || !fraction(input.weeklyAfter)) {
    return rejectShort(input, deltaShort, deltaWeekly, "weekly_meter_invalid");
  }
  if (input.method === "full-window") {
    if (!finite(input.fullWindows) || input.fullWindows <= 0) {
      return rejectShort(
        input,
        deltaShort,
        deltaWeekly,
        "window_exposure_invalid",
      );
    }
  } else if (!fraction(input.shortBefore) || !fraction(input.shortAfter)) {
    return rejectShort(input, deltaShort, deltaWeekly, "short_meter_invalid");
  }
  const ratio = deltaWeekly / deltaShort;
  if (!(deltaShort > 0) || !(deltaWeekly >= 0) || !(ratio > 0 && ratio < 1)) {
    return rejectShort(input, deltaShort, deltaWeekly, "ratio_out_of_range");
  }
  return {
    ...input,
    id: input.id ?? id("short"),
    recordedAt: recordedAt(input.recordedAt),
    deltaShort,
    deltaWeekly,
    estimatedKappa: ratio,
    status: "accepted",
  };
}

function shortStatus(exposure: number): ShortCalibrationStatus {
  if (exposure <= 0) return "baseline";
  if (exposure < 1) return "initial";
  if (exposure < 3) return "calibrated";
  return "stable";
}

export function estimateKappa(
  plan: SubscriptionKey,
  observations: ShortWindowObservation[],
): CalibrationSummary["shortWindow"] {
  const config = PLAN_LIMITS[plan].shortWindow;
  const accepted = observations.filter(
    (observation) =>
      observation.plan === plan && observation.status === "accepted",
  );
  const usable = accepted.filter(
    (observation) =>
      finite(observation.deltaShort) &&
      observation.deltaShort > 0 &&
      finite(observation.deltaWeekly) &&
      observation.deltaWeekly >= 0 &&
      observation.deltaWeekly / observation.deltaShort > 0 &&
      observation.deltaWeekly / observation.deltaShort < 1,
  );
  const exposure = usable.reduce(
    (sum, observation) => sum + observation.deltaShort,
    0,
  );
  const deltaWeekly = usable.reduce(
    (sum, observation) => sum + observation.deltaWeekly,
    0,
  );
  const ratio =
    (config.ratioPrior * config.ratioPriorExposure + deltaWeekly) /
    (config.ratioPriorExposure + exposure);
  return {
    ratio,
    exposure,
    status: shortStatus(exposure),
  };
}

function geoMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const ordered = values.map(Math.log).sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  const median =
    ordered.length % 2 === 0
      ? (ordered[middle - 1] + ordered[middle]) / 2
      : ordered[middle];
  return Math.exp(median);
}

function workloadStatus(
  quotaConfidence: number,
  timeConfidence: number,
): WorkloadCalibrationStatus {
  if (quotaConfidence === 0 && timeConfidence === 0) return "baseline";
  if (quotaConfidence < 0.67 || timeConfidence < 0.67) return "initial";
  return "calibrated";
}

export function createWorkloadObservation(
  input: WorkloadCalibrationObservationInput,
  kappa: number,
): WorkloadCalibrationObservation {
  const weeklyUsage =
    input.weeklyUsage ??
    (fraction(input.weeklyBefore) && fraction(input.weeklyAfter)
      ? input.weeklyBefore - input.weeklyAfter
      : undefined);
  const shortWindowUsage =
    input.shortWindowUsage ??
    (fraction(input.shortBefore) && fraction(input.shortAfter)
      ? input.shortBefore - input.shortAfter
      : undefined);
  const inferredWeekly =
    weeklyUsage ??
    (shortWindowUsage !== undefined && kappa > 0
      ? kappa * shortWindowUsage
      : undefined);
  const baseWeeklyShare =
    finite(input.quotaBudget20x) && input.quotaBudget20x > 0
      ? input.benchmarkCostEquivalent /
        ((input.quotaBudget20x * PLAN_LIMITS[input.plan].multiplier) / 20)
      : Number.NaN;
  const alphaObservation =
    inferredWeekly !== undefined && inferredWeekly > 0 && baseWeeklyShare > 0
      ? inferredWeekly / baseWeeklyShare
      : null;
  const betaObservation =
    finite(input.actualMinutes) &&
    finite(input.benchmarkMinutes) &&
    input.actualMinutes > 0 &&
    input.benchmarkMinutes > 0
      ? input.actualMinutes / input.benchmarkMinutes
      : null;
  const commonInvalid =
    input.representativeTask !== true ||
    input.benchmarkMinutes <= 0 ||
    input.actualMinutes <= 0 ||
    (weeklyUsage !== undefined &&
      (!fraction(weeklyUsage) || weeklyUsage < 0)) ||
    (shortWindowUsage !== undefined &&
      (!fraction(shortWindowUsage) || shortWindowUsage < 0));
  const alphaInvalid =
    alphaObservation !== null &&
    (alphaObservation < 0.05 || alphaObservation > 100);
  const betaInvalid =
    betaObservation === null || betaObservation < 0.05 || betaObservation > 100;
  const invalid = commonInvalid || betaInvalid || alphaInvalid;
  return {
    ...input,
    id: input.id ?? id("workload"),
    recordedAt: recordedAt(input.recordedAt),
    weeklyUsage: inferredWeekly,
    shortWindowUsage,
    alphaObservation: invalid || alphaInvalid ? null : alphaObservation,
    betaObservation: invalid || betaInvalid ? null : betaObservation,
    status: invalid ? "rejected" : "accepted",
    rejectionReason: invalid
      ? betaInvalid
        ? "time_observation_invalid"
        : alphaInvalid
          ? "quota_observation_invalid"
          : "observation_invalid"
      : undefined,
  };
}

export function estimateWorkload(
  observations: WorkloadCalibrationObservation[],
): CalibrationSummary["workload"] {
  const accepted = observations.filter(
    (observation) =>
      observation.status === "accepted" &&
      (observation.alphaObservation === null ||
        (finite(observation.alphaObservation) &&
          observation.alphaObservation >= 0.05 &&
          observation.alphaObservation <= 100)) &&
      (observation.betaObservation === null ||
        (finite(observation.betaObservation) &&
          observation.betaObservation >= 0.05 &&
          observation.betaObservation <= 100)),
  );
  const alphaRaw = geoMedian(
    accepted
      .map((observation) => observation.alphaObservation)
      .filter((value): value is number => value !== null),
  );
  const betaRaw = geoMedian(
    accepted
      .map((observation) => observation.betaObservation)
      .filter((value): value is number => value !== null),
  );
  const quotaExposure = accepted.reduce(
    (sum, observation) =>
      sum +
      (observation.alphaObservation !== null
        ? (observation.weeklyUsage ?? 0)
        : 0),
    0,
  );
  const quotaConfidence = Math.min(1, quotaExposure / 0.3);
  const timeSampleCount = accepted.filter(
    (observation) => observation.betaObservation !== null,
  ).length;
  const timeConfidence = Math.min(1, timeSampleCount / 3);
  const alpha =
    alphaRaw === null
      ? WORKLOAD_ALPHA_PRIOR
      : Math.exp(
          Math.log(WORKLOAD_ALPHA_PRIOR) +
            quotaConfidence *
              (Math.log(alphaRaw) - Math.log(WORKLOAD_ALPHA_PRIOR)),
        );
  const beta =
    betaRaw === null ? 1 : Math.exp(timeConfidence * Math.log(betaRaw));
  return {
    alpha,
    beta,
    quotaConfidence,
    timeConfidence,
    status: workloadStatus(quotaConfidence, timeConfidence),
    sampleCount: accepted.length,
  };
}

export function buildCalibrationSummary(
  store: CalibrationStoreV1,
  plan: SubscriptionKey,
): CalibrationDerivedContext {
  const shortWindow = estimateKappa(plan, store.shortWindowObservations);
  const workload = estimateWorkload(store.workloadObservations);
  const config = PLAN_LIMITS[plan].shortWindow;
  return {
    shortWindow,
    workload,
    shortWindowEnabled: config.enabled,
    shortWindowHours: config.hours,
  };
}
