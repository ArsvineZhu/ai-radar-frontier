import {
  BALANCED_QUOTA_WEIGHT,
  BALANCED_QUALITY_BONUS_WEIGHT,
  BALANCED_TIME_REFERENCE_MINUTES,
  BALANCED_TIME_WEIGHT,
  ECONOMY_MAX_MINUTES,
  IQ_ACCEPTABLE,
  IQ_MINIMUM,
  IQ_QUALITY_TOLERANCE,
  IQ_TARGET,
  PLAN_MULTIPLIERS,
  QUOTA_COMFORTABLE_LIMIT,
  QUOTA_WEEKLY_LIMITS,
  SPEED_TIE_REL,
} from "./config.js";

export type StrategyKey = "quality" | "effectiveness" | "budget" | "speed";
export type SubscriptionKey = "plus" | "pro5" | "pro20";
type Mode = "standard" | "fast";
export type FastEvidenceLevel = "exact" | "model" | "fastGroup";
type QuotaZone = "comfortable" | "expensive" | "burst" | "unknown";
type QuotaExclusionReason = "quota-over-limit" | "quota-unknown";
export type EligibilityExclusionReason =
  "below-iq-floor" | QuotaExclusionReason;

const EFFORT_ORDER = ["low", "medium", "high", "xhigh", "max", "ultra"];

export interface ModelRecord {
  model: string;
  family: string;
  effort: string;
  label: string;
  iq: number;
  qualityIq: number;
  cost: number;
  minutes: number;
  index: number;
  key: string;
  sampleCount: number | null;
  quotaBudget20x: number | null;
  quotaShare: number | null;
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

  hardIq?: number | null;
}

export interface ScoredRecord extends ModelRecord {
  qualityGain: number;
  qualityDeficit: number;
  quotaPressure: number;
  timePressure: number;
  strategyScore: number;
  quotaEligible?: boolean;
  quotaZone?: QuotaZone;
  quotaLimit?: number;
  quotaExclusionReason?: QuotaExclusionReason;
  dominators?: ScoredRecord[];
  representative?: ScoredRecord;
}

interface QuotaGateResult {
  eligible: boolean;
  zone: QuotaZone;
  limit: number;
  reason?: QuotaExclusionReason;
}

export interface CandidateEligibilityResult {
  eligible: boolean;
  zone: QuotaZone;
  limit: number;
  reason?: EligibilityExclusionReason;
}

function qualityValue(record: ModelRecord): number {
  return Number.isFinite(record.qualityIq) ? record.qualityIq : record.iq;
}

function planMultiplier(subscriptionKey: string): number {
  return PLAN_MULTIPLIERS[subscriptionKey] || PLAN_MULTIPLIERS.plus;
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

function effortOrder(effort: string): number {
  const index = EFFORT_ORDER.indexOf(effort.toLowerCase());
  return index < 0 ? EFFORT_ORDER.length : index;
}

function stableKey(record: ModelRecord): string {
  const modeOrder = record.mode === "fast" ? 1 : 0;
  return [
    record.model,
    String(effortOrder(record.effort)).padStart(2, "0"),
    String(modeOrder),
    record.key,
  ].join("\u0000");
}

function compareStableKey(left: ModelRecord, right: ModelRecord): number {
  const leftKey = stableKey(left);
  const rightKey = stableKey(right);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function quotaShare(
  record: ModelRecord,
  subscriptionKey: string,
): number | null {
  if (
    record.quotaBudget20x === null ||
    !Number.isFinite(record.quotaBudget20x) ||
    record.quotaBudget20x <= 0 ||
    !Number.isFinite(record.cost)
  ) {
    return null;
  }
  const planBudget =
    (record.quotaBudget20x * planMultiplier(subscriptionKey)) / 20;
  return planBudget > 0 ? record.cost / planBudget : null;
}

function quotaPressureFromShare(share: number | null): number {
  if (share === null || !Number.isFinite(share)) {
    return Number.POSITIVE_INFINITY;
  }
  if (share >= 1) return Number.POSITIVE_INFINITY;
  return -Math.log1p(-share) / -Math.log1p(-QUOTA_WEEKLY_LIMITS.effectiveness);
}

function qualityDeficit(iq: number): number {
  return Math.pow(Math.max(0, IQ_TARGET - iq) / IQ_QUALITY_TOLERANCE, 2);
}

function qualityGain(iq: number): number {
  return Math.log1p(Math.max(0, iq - IQ_TARGET) / IQ_QUALITY_TOLERANCE);
}

function timePressure(minutes: number): number {
  return Math.log2(1 + minutes / 10);
}

export function isValidRecord(record: ModelRecord): boolean {
  return Boolean(
    record.model &&
    record.effort &&
    record.label &&
    Number.isFinite(record.iq) &&
    Number.isFinite(qualityValue(record)) &&
    Number.isFinite(record.cost) &&
    Number.isFinite(record.minutes) &&
    record.iq >= 0 &&
    record.cost >= 0 &&
    record.minutes >= 0,
  );
}

export function evaluateRecords(
  records: ModelRecord[],
  subscriptionKey: string,
): ScoredRecord[] {
  return records.map((record) => {
    const stableIq = qualityValue(record);
    const share = quotaShare(record, subscriptionKey);
    return {
      ...record,
      qualityGain: qualityGain(stableIq),
      qualityDeficit: qualityDeficit(stableIq),
      quotaPressure: quotaPressureFromShare(share),
      quotaShare: share,
      timePressure: timePressure(record.minutes),
      strategyScore: 0,
    };
  });
}

export function evaluateQuotaGate(
  record: ScoredRecord,
  strategyKey: string,
): QuotaGateResult {
  const limit =
    QUOTA_WEEKLY_LIMITS[strategyKey] ?? QUOTA_WEEKLY_LIMITS.effectiveness;
  const share = record.quotaShare;
  if (share === null || !Number.isFinite(share)) {
    return {
      eligible: false,
      zone: "unknown",
      limit,
      reason: "quota-unknown",
    };
  }
  const zone =
    share <= QUOTA_COMFORTABLE_LIMIT
      ? "comfortable"
      : share <= limit
        ? "expensive"
        : "burst";
  return {
    eligible: share <= limit,
    zone,
    limit,
    reason: share <= limit ? undefined : "quota-over-limit",
  };
}

export function evaluateCandidateEligibility(
  record: ScoredRecord,
  strategyKey: string,
): CandidateEligibilityResult {
  const quota = evaluateQuotaGate(record, strategyKey);
  if (qualityValue(record) < IQ_MINIMUM) {
    return { ...quota, eligible: false, reason: "below-iq-floor" };
  }
  return quota;
}

function compareQualityDecision(
  left: ScoredRecord,
  right: ScoredRecord,
): number {
  return (
    left.minutes - right.minutes ||
    compareNullableAscending(left.quotaShare, right.quotaShare) ||
    (left.sampleCount !== null && right.sampleCount !== null
      ? right.sampleCount - left.sampleCount
      : 0) ||
    compareStableKey(left, right)
  );
}

function compareBudgetDecision(
  left: ScoredRecord,
  right: ScoredRecord,
): number {
  return (
    compareNullableAscending(left.quotaShare, right.quotaShare) ||
    qualityValue(right) - qualityValue(left) ||
    left.minutes - right.minutes ||
    compareStableKey(left, right)
  );
}

function compareSpeedDecision(left: ScoredRecord, right: ScoredRecord): number {
  return (
    qualityValue(right) - qualityValue(left) ||
    compareNullableAscending(left.quotaShare, right.quotaShare) ||
    (left.mode === "standard" ? 0 : 1) - (right.mode === "standard" ? 0 : 1) ||
    compareStableKey(left, right)
  );
}

function orderDecisionSet(
  records: ScoredRecord[],
  decisionSet: ScoredRecord[],
  compare: (left: ScoredRecord, right: ScoredRecord) => number,
): ScoredRecord[] {
  const selected = new Set(decisionSet);
  return [
    ...decisionSet.slice().sort(compare),
    ...records.filter((record) => !selected.has(record)).sort(compare),
  ];
}

export function rankQuality(records: ScoredRecord[]): ScoredRecord[] {
  if (records.length === 0) return [];
  const maximumQuality = Math.max(...records.map(qualityValue));
  const topBand = records.filter(
    (record) => qualityValue(record) >= maximumQuality - IQ_QUALITY_TOLERANCE,
  );
  return orderDecisionSet(records, topBand, compareQualityDecision);
}

export function rankBudget(records: ScoredRecord[]): ScoredRecord[] {
  if (records.length === 0) return [];
  const acceptable = records.filter(
    (record) => qualityValue(record) >= IQ_ACCEPTABLE,
  );
  if (acceptable.length > 0) {
    const comfortable = acceptable.filter(
      (record) => record.minutes <= ECONOMY_MAX_MINUTES,
    );
    return orderDecisionSet(
      records,
      comfortable.length > 0 ? comfortable : acceptable,
      compareBudgetDecision,
    );
  }
  const maximumQuality = Math.max(...records.map(qualityValue));
  return orderDecisionSet(
    records,
    records.filter(
      (record) => qualityValue(record) >= maximumQuality - IQ_QUALITY_TOLERANCE,
    ),
    compareBudgetDecision,
  );
}

export function rankSpeed(records: ScoredRecord[]): ScoredRecord[] {
  if (records.length === 0) return [];
  const acceptable = records.filter(
    (record) => qualityValue(record) >= IQ_ACCEPTABLE,
  );
  const decisionSet =
    acceptable.length > 0
      ? acceptable
      : (() => {
          const maximumQuality = Math.max(...records.map(qualityValue));
          return records.filter(
            (record) =>
              qualityValue(record) >= maximumQuality - IQ_QUALITY_TOLERANCE,
          );
        })();
  const minimumMinutes = Math.min(
    ...decisionSet.map((record) => record.minutes),
  );
  const speedBand = decisionSet.filter(
    (record) => record.minutes <= minimumMinutes * (1 + SPEED_TIE_REL),
  );
  return orderDecisionSet(records, speedBand, compareSpeedDecision);
}

export function balancedLoss(record: ScoredRecord): number {
  const share = record.quotaShare;
  if (share === null || !Number.isFinite(share) || share >= 1) {
    return Number.POSITIVE_INFINITY;
  }
  const qDeficit = qualityDeficit(qualityValue(record));
  const qBonus = Math.log1p(
    Math.max(0, qualityValue(record) - IQ_TARGET) / IQ_QUALITY_TOLERANCE,
  );
  const quotaPressure = quotaPressureFromShare(share);
  const normalizedTime = Math.log2(
    1 + record.minutes / BALANCED_TIME_REFERENCE_MINUTES,
  );
  return (
    qDeficit -
    BALANCED_QUALITY_BONUS_WEIGHT * qBonus +
    BALANCED_QUOTA_WEIGHT * quotaPressure +
    BALANCED_TIME_WEIGHT * normalizedTime
  );
}

export function rankEffectiveness(records: ScoredRecord[]): ScoredRecord[] {
  return records.slice().sort((left, right) => {
    const delta = balancedLoss(left) - balancedLoss(right);
    if (Math.abs(delta) > 1e-9) return delta;
    return (
      qualityValue(right) - qualityValue(left) ||
      compareNullableAscending(left.quotaShare, right.quotaShare) ||
      left.minutes - right.minutes ||
      compareStableKey(left, right)
    );
  });
}

export function scoreRecords(
  records: ScoredRecord[],
  strategyKey: string,
): ScoredRecord[] {
  return records.map((record) => ({
    ...record,
    strategyScore: strategyKey === "effectiveness" ? balancedLoss(record) : 0,
  }));
}

function dominates(candidate: ScoredRecord, target: ScoredRecord): boolean {
  if (
    candidate.quotaShare === null ||
    target.quotaShare === null ||
    !Number.isFinite(candidate.quotaShare) ||
    !Number.isFinite(target.quotaShare)
  ) {
    return false;
  }
  const qualityNoWorse = qualityValue(candidate) >= qualityValue(target);
  const quotaNoWorse = candidate.quotaShare <= target.quotaShare;
  const timeNoWorse = candidate.minutes <= target.minutes;
  const strictImprovement =
    qualityValue(candidate) > qualityValue(target) ||
    candidate.quotaShare < target.quotaShare ||
    candidate.minutes < target.minutes;
  return qualityNoWorse && quotaNoWorse && timeNoWorse && strictImprovement;
}

function compareParetoWitness(left: ScoredRecord, right: ScoredRecord): number {
  return (
    compareNullableAscending(left.quotaShare, right.quotaShare) ||
    qualityValue(right) - qualityValue(left) ||
    left.minutes - right.minutes ||
    compareStableKey(left, right)
  );
}

export function analyzeParetoDiagnostics(records: ScoredRecord[]): {
  frontier: ScoredRecord[];
  dominated: ScoredRecord[];
} {
  const frontier: ScoredRecord[] = [];
  const dominated: ScoredRecord[] = [];
  for (const target of records) {
    const dominators = records
      .filter(
        (candidate) => candidate !== target && dominates(candidate, target),
      )
      .sort(compareParetoWitness);
    if (dominators.length > 0) {
      dominated.push({
        ...target,
        dominators,
        representative: dominators[0],
      });
    } else {
      frontier.push(target);
    }
  }
  frontier.sort(compareParetoWitness);
  dominated.sort(compareParetoWitness);
  return { frontier, dominated };
}

export function sortScoredRecords(
  records: ScoredRecord[],
  strategyKey: string,
): ScoredRecord[] {
  switch (strategyKey) {
    case "quality":
      return rankQuality(records);
    case "budget":
      return rankBudget(records);
    case "speed":
      return rankSpeed(records);
    case "effectiveness":
    default:
      return rankEffectiveness(records);
  }
}
