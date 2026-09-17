import {
  ENDURANCE_EQUIV_REL,
  ENDURANCE_UTILITY_REFERENCE_MINUTES,
  DEFAULT_WORKLOAD_ALPHA,
  IQ_MINIMUM,
  IQ_EQUIV,
  IQ_REFERENCE,
  IQ_RESOLUTION,
  PLAN_LIMITS,
  QUALITY_BAND_WEIGHTS,
  STRATEGY_WEIGHTS,
  TIME_EQUIV_REL,
  TIME_UTILITY_REFERENCE_MINUTES,
  WEEKLY_EQUIV_REL,
  WEEKLY_UTILITY_REFERENCE_SHARE,
} from "./config.js";
import type { CalibrationDerivedContext } from "./calibration.js";

export type StrategyKey = "quality" | "effectiveness" | "budget" | "speed";
export type SubscriptionKey = "plus" | "pro5" | "pro20";
type Mode = "standard" | "fast";
export type FastEvidenceLevel = "exact" | "model" | "fastGroup";

export type EligibilityExclusionReason =
  | "invalid"
  | "below-iq-floor"
  | "quota-unknown"
  | "resource-weekly"
  | "resource-short-window"
  | "fast-evidence-unavailable"
  | "practical-dominated";

export interface ModelRecord {
  model: string;
  family: string;
  effort: string;
  label: string;
  iq: number;
  qualityIq: number;
  benchmarkCostEquivalent: number;
  benchmarkMinutes: number;
  index: number;
  key: string;
  sampleCount: number | null;
  quotaBudget20x: number | null;
  quotaSource: "family-radar" | "unavailable";
  mode: Mode;
  fastMultiplier?: number;
  fastEvidenceLevel?: FastEvidenceLevel;
  fastEvidenceSource?: string;
  fastSampleCount?: number;
  fastAgeDays?: number | null;
  fastNominalRatio?: number;
  timeKind?: "transferred-e2e-estimate";
  baseRecord?: ModelRecord;
}

export interface ScoredRecord extends ModelRecord {
  effectiveMinutes: number;
  benchmarkWeeklyShare: number | null;
  effectiveWeeklyShare: number | null;
  effectiveShortWindowShare: number | null;
  weeklyCapacityTasks: number | null;
  shortWindowCapacityTasks: number | null;
  shortWindowEnduranceMinutes: number | null;
  weeklyContinuousEnduranceMinutes: number | null;
  qualityUtility: number;
  timeUtility: number;
  weeklyUtility: number;
  enduranceUtility: number | null;
  strategyScore: number;
  quotaEligible?: boolean;
  quotaExclusionReason?: EligibilityExclusionReason;
  practicalDominators?: ScoredRecord[];
  representative?: ScoredRecord;
}

export interface CandidateEligibilityResult {
  eligible: boolean;
  reason?: EligibilityExclusionReason;
}

const EFFORT_ORDER = ["low", "medium", "high", "xhigh", "max", "ultra"];
const SCORE_EPSILON = 1e-12;

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function qualityValue(record: ModelRecord): number {
  return finite(record.qualityIq) ? record.qualityIq : record.iq;
}

function effortOrder(effort: string): number {
  const index = EFFORT_ORDER.indexOf(effort.toLowerCase());
  return index < 0 ? EFFORT_ORDER.length : index;
}

function stableKey(record: ModelRecord): string {
  const modeOrder = record.mode === "standard" ? 0 : 1;
  return [
    record.model,
    String(effortOrder(record.effort)).padStart(2, "0"),
    String(modeOrder),
    record.key,
  ].join("\u0000");
}

function compareNullableAscending(
  left: number | null,
  right: number | null,
): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

function compareStable(left: ModelRecord, right: ModelRecord): number {
  const a = stableKey(left);
  const b = stableKey(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function createDefaultCalibrationContext(
  subscriptionKey: SubscriptionKey,
): CalibrationDerivedContext {
  const shortWindow = PLAN_LIMITS[subscriptionKey].shortWindow;
  return {
    shortWindow: {
      ratio: shortWindow.ratioPrior,
      exposure: 0,
      status: "baseline",
    },
    workload: {
      alpha: DEFAULT_WORKLOAD_ALPHA,
      beta: 1,
      quotaConfidence: 0,
      timeConfidence: 0,
      status: "baseline",
      sampleCount: 0,
    },
    shortWindowEnabled: shortWindow.enabled,
    shortWindowHours: shortWindow.hours,
  };
}

export function isValidRecord(record: ModelRecord): boolean {
  return Boolean(
    record.model &&
    record.family &&
    record.effort &&
    record.label &&
    finite(record.qualityIq) &&
    finite(record.benchmarkCostEquivalent) &&
    finite(record.benchmarkMinutes) &&
    record.qualityIq >= 0 &&
    record.benchmarkCostEquivalent > 0 &&
    record.benchmarkMinutes > 0,
  );
}

function weeklyShare(
  record: ModelRecord,
  subscriptionKey: SubscriptionKey,
): number | null {
  if (
    record.quotaBudget20x === null ||
    !finite(record.quotaBudget20x) ||
    record.quotaBudget20x <= 0
  ) {
    return null;
  }
  const plan = PLAN_LIMITS[subscriptionKey];
  const capacity = (record.quotaBudget20x * plan.multiplier) / 20;
  if (!(capacity > 0)) return null;
  return record.benchmarkCostEquivalent / capacity;
}

function qualityUtility(iq: number): number {
  const deficit = Math.pow(Math.max(0, IQ_REFERENCE - iq) / IQ_RESOLUTION, 2);
  const gain = Math.log1p(Math.max(0, iq - IQ_REFERENCE) / IQ_RESOLUTION);
  return gain - deficit;
}

function timeUtility(minutes: number): number {
  return -Math.log2(minutes / TIME_UTILITY_REFERENCE_MINUTES);
}

function weeklyUtility(share: number | null): number {
  return share === null || share <= 0
    ? Number.NEGATIVE_INFINITY
    : -Math.log2(share / WEEKLY_UTILITY_REFERENCE_SHARE);
}

function enduranceUtility(
  endurance: number | null,
  windowMinutes: number,
): number | null {
  if (endurance === null || endurance <= 0) return null;
  return Math.log2(
    Math.min(endurance, windowMinutes) / ENDURANCE_UTILITY_REFERENCE_MINUTES,
  );
}

export function evaluateRecords(
  records: ModelRecord[],
  subscriptionKey: SubscriptionKey,
  calibration = createDefaultCalibrationContext(subscriptionKey),
): ScoredRecord[] {
  const windowMinutes = calibration.shortWindowHours * 60;
  return records.map((record) => {
    const benchmarkWeeklyShare = weeklyShare(record, subscriptionKey);
    const effectiveWeeklyShare =
      benchmarkWeeklyShare === null
        ? null
        : benchmarkWeeklyShare * calibration.workload.alpha;
    const effectiveMinutes =
      record.benchmarkMinutes * calibration.workload.beta;
    const effectiveShortWindowShare =
      calibration.shortWindowEnabled &&
      effectiveWeeklyShare !== null &&
      calibration.shortWindow.ratio > 0
        ? effectiveWeeklyShare / calibration.shortWindow.ratio
        : null;
    const weeklyCapacityTasks =
      effectiveWeeklyShare !== null && effectiveWeeklyShare > 0
        ? 1 / effectiveWeeklyShare
        : null;
    const shortWindowCapacityTasks =
      effectiveShortWindowShare !== null && effectiveShortWindowShare > 0
        ? 1 / effectiveShortWindowShare
        : null;
    const shortWindowEnduranceMinutes =
      effectiveShortWindowShare !== null && effectiveShortWindowShare > 0
        ? Math.min(effectiveMinutes / effectiveShortWindowShare, windowMinutes)
        : null;
    const weeklyContinuousEnduranceMinutes =
      effectiveWeeklyShare !== null && effectiveWeeklyShare > 0
        ? effectiveMinutes / effectiveWeeklyShare
        : null;
    return {
      ...record,
      effectiveMinutes,
      benchmarkWeeklyShare,
      effectiveWeeklyShare,
      effectiveShortWindowShare,
      weeklyCapacityTasks,
      shortWindowCapacityTasks,
      shortWindowEnduranceMinutes,
      weeklyContinuousEnduranceMinutes,
      qualityUtility: qualityUtility(qualityValue(record)),
      timeUtility: timeUtility(effectiveMinutes),
      weeklyUtility: weeklyUtility(effectiveWeeklyShare),
      enduranceUtility: calibration.shortWindowEnabled
        ? enduranceUtility(shortWindowEnduranceMinutes, windowMinutes)
        : null,
      strategyScore: 0,
    };
  });
}

export function evaluateCandidateEligibility(
  record: ScoredRecord,
  calibration: CalibrationDerivedContext,
): CandidateEligibilityResult {
  if (!isValidRecord(record)) {
    return { eligible: false, reason: "invalid" };
  }
  if (qualityValue(record) < IQ_MINIMUM) {
    return { eligible: false, reason: "below-iq-floor" };
  }
  if (record.effectiveWeeklyShare === null) {
    return { eligible: false, reason: "quota-unknown" };
  }
  if (calibration.workload.quotaConfidence >= 0.67) {
    if (record.effectiveWeeklyShare >= 1) {
      return { eligible: false, reason: "resource-weekly" };
    }
    if (
      calibration.shortWindowEnabled &&
      record.effectiveShortWindowShare !== null &&
      record.effectiveShortWindowShare >= 1
    ) {
      return { eligible: false, reason: "resource-short-window" };
    }
  }
  return { eligible: true };
}

function weights(
  source: Readonly<Record<string, number>>,
  shortWindowEnabled: boolean,
): Record<string, number> {
  const entries = Object.entries(source).filter(
    ([key]) => shortWindowEnabled || key !== "shortEndurance",
  );
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  return Object.fromEntries(
    entries.map(([key, value]) => [key, total > 0 ? value / total : 0]),
  );
}

function scoreWithWeights(
  record: ScoredRecord,
  source: Readonly<Record<string, number>>,
  shortWindowEnabled: boolean,
): number {
  const values = {
    quality: record.qualityUtility,
    time: record.timeUtility,
    weekly: record.weeklyUtility,
    shortEndurance: record.enduranceUtility ?? 0,
  };
  const active = weights(source, shortWindowEnabled);
  return Object.entries(active).reduce(
    (sum, [key, weight]) => sum + weight * values[key as keyof typeof values],
    0,
  );
}

function compareRank(left: ScoredRecord, right: ScoredRecord): number {
  if (Math.abs(left.strategyScore - right.strategyScore) > SCORE_EPSILON) {
    return right.strategyScore - left.strategyScore;
  }
  return (
    qualityValue(right) - qualityValue(left) ||
    compareNullableAscending(
      left.effectiveWeeklyShare,
      right.effectiveWeeklyShare,
    ) ||
    left.effectiveMinutes - right.effectiveMinutes ||
    (left.mode === "standard" ? 0 : 1) - (right.mode === "standard" ? 0 : 1) ||
    compareStable(left, right)
  );
}

export function scoreRecords(
  records: ScoredRecord[],
  strategyKey: StrategyKey | string,
  calibration: CalibrationDerivedContext,
): ScoredRecord[] {
  const source =
    strategyKey === "quality"
      ? QUALITY_BAND_WEIGHTS
      : (STRATEGY_WEIGHTS[strategyKey as keyof typeof STRATEGY_WEIGHTS] ??
        STRATEGY_WEIGHTS.effectiveness);
  return records.map((record) => ({
    ...record,
    strategyScore: scoreWithWeights(
      record,
      source,
      calibration.shortWindowEnabled,
    ),
  }));
}

export function sortScoredRecords(
  records: ScoredRecord[],
  strategyKey: StrategyKey | string,
): ScoredRecord[] {
  const ordered = records.slice().sort(compareRank);
  if (strategyKey !== "quality" || ordered.length === 0) return ordered;
  const maximumQuality = Math.max(...ordered.map(qualityValue));
  const topBand = new Set(
    ordered
      .filter(
        (record) => qualityValue(record) >= maximumQuality - IQ_RESOLUTION,
      )
      .map((record) => record.key),
  );
  return [
    ...ordered.filter((record) => topBand.has(record.key)),
    ...ordered.filter((record) => !topBand.has(record.key)),
  ];
}

export function practicalDominates(
  candidate: ScoredRecord,
  target: ScoredRecord,
  shortWindowEnabled: boolean,
): boolean {
  const candidateEndurance = candidate.shortWindowEnduranceMinutes;
  const targetEndurance = target.shortWindowEnduranceMinutes;
  const noWorseQuality =
    qualityValue(candidate) >= qualityValue(target) - IQ_EQUIV;
  const noWorseTime =
    candidate.effectiveMinutes <=
    target.effectiveMinutes * (1 + TIME_EQUIV_REL);
  const noWorseWeekly =
    candidate.effectiveWeeklyShare !== null &&
    target.effectiveWeeklyShare !== null &&
    candidate.effectiveWeeklyShare <=
      target.effectiveWeeklyShare * (1 + WEEKLY_EQUIV_REL);
  const noWorseEndurance =
    !shortWindowEnabled ||
    (candidateEndurance !== null &&
      targetEndurance !== null &&
      candidateEndurance >= targetEndurance / (1 + ENDURANCE_EQUIV_REL));
  if (!noWorseQuality || !noWorseTime || !noWorseWeekly || !noWorseEndurance) {
    return false;
  }
  return Boolean(
    qualityValue(candidate) > qualityValue(target) + IQ_EQUIV ||
    candidate.effectiveMinutes <
      target.effectiveMinutes / (1 + TIME_EQUIV_REL) ||
    (candidate.effectiveWeeklyShare !== null &&
      target.effectiveWeeklyShare !== null &&
      candidate.effectiveWeeklyShare <
        target.effectiveWeeklyShare / (1 + WEEKLY_EQUIV_REL)) ||
    (shortWindowEnabled &&
      candidateEndurance !== null &&
      targetEndurance !== null &&
      candidateEndurance > targetEndurance * (1 + ENDURANCE_EQUIV_REL)),
  );
}

export function isSimilar(
  left: ScoredRecord,
  right: ScoredRecord,
  shortWindowEnabled: boolean,
): boolean {
  if (left.mode !== right.mode) return false;
  if (Math.abs(qualityValue(left) - qualityValue(right)) > IQ_RESOLUTION) {
    return false;
  }
  if (
    Math.abs(Math.log(left.effectiveMinutes / right.effectiveMinutes)) >
    Math.log1p(TIME_EQUIV_REL)
  ) {
    return false;
  }
  if (
    left.effectiveWeeklyShare === null ||
    right.effectiveWeeklyShare === null ||
    Math.abs(Math.log(left.effectiveWeeklyShare / right.effectiveWeeklyShare)) >
      Math.log1p(WEEKLY_EQUIV_REL)
  ) {
    return false;
  }
  if (shortWindowEnabled) {
    if (
      left.shortWindowEnduranceMinutes === null ||
      right.shortWindowEnduranceMinutes === null ||
      Math.abs(
        Math.log(
          left.shortWindowEnduranceMinutes / right.shortWindowEnduranceMinutes,
        ),
      ) > Math.log1p(ENDURANCE_EQUIV_REL)
    ) {
      return false;
    }
  }
  return true;
}

function paretoDominates(
  candidate: ScoredRecord,
  target: ScoredRecord,
  shortWindowEnabled: boolean,
): boolean {
  if (
    candidate.effectiveWeeklyShare === null ||
    target.effectiveWeeklyShare === null
  ) {
    return false;
  }
  const qualityNoWorse = qualityValue(candidate) >= qualityValue(target);
  const timeNoWorse = candidate.effectiveMinutes <= target.effectiveMinutes;
  const weeklyNoWorse =
    candidate.effectiveWeeklyShare <= target.effectiveWeeklyShare;
  const enduranceNoWorse =
    !shortWindowEnabled ||
    (candidate.shortWindowEnduranceMinutes !== null &&
      target.shortWindowEnduranceMinutes !== null &&
      candidate.shortWindowEnduranceMinutes >=
        target.shortWindowEnduranceMinutes);
  const strict =
    qualityValue(candidate) > qualityValue(target) ||
    candidate.effectiveMinutes < target.effectiveMinutes ||
    candidate.effectiveWeeklyShare < target.effectiveWeeklyShare ||
    (shortWindowEnabled &&
      candidate.shortWindowEnduranceMinutes !== null &&
      target.shortWindowEnduranceMinutes !== null &&
      candidate.shortWindowEnduranceMinutes >
        target.shortWindowEnduranceMinutes);
  return (
    qualityNoWorse && timeNoWorse && weeklyNoWorse && enduranceNoWorse && strict
  );
}

export function analyzeParetoDiagnostics(
  records: ScoredRecord[],
  shortWindowEnabled: boolean,
): { frontier: ScoredRecord[]; dominated: ScoredRecord[] } {
  const frontier: ScoredRecord[] = [];
  const dominated: ScoredRecord[] = [];
  for (const target of records) {
    const dominators = records.filter(
      (candidate) =>
        candidate !== target &&
        paretoDominates(candidate, target, shortWindowEnabled),
    );
    if (dominators.length > 0) {
      dominated.push({ ...target, practicalDominators: dominators });
    } else {
      frontier.push(target);
    }
  }
  return {
    frontier: frontier.slice().sort(compareRank),
    dominated: dominated.slice().sort(compareRank),
  };
}
