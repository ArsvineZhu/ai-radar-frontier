import {
  BALANCED_COST_WEIGHT,
  BALANCED_QUALITY_WEIGHT,
  BALANCED_TIME_WEIGHT,
  COMMUNITY_MIN_RATING_COUNT,
  ECONOMY_MAX_MINUTES,
  ECONOMY_TIME_WEIGHT,
  IQ_DEFICIT_SCALE,
  IQ_QUALITY_TOLERANCE,
  IQ_SURPLUS_SCALE,
  IQ_TARGET,
  PLAN_MULTIPLIERS,
  QUOTA_COMFORTABLE_LIMIT,
  QUOTA_EXPENSIVE_LIMIT,
  QUOTA_WEEKLY_LIMITS,
} from "./config.js";

export type StabilityStatus = "stable" | "degrading" | "recovering" | "unknown";

export type FastEvidenceSource = "exact" | "model" | "generation";

type QuotaZone = "comfortable" | "expensive" | "burst" | "unknown";

type QuotaExclusionReason = "over-limit" | "unavailable";

export interface ModelRecord {
  model: string;
  effort: string;
  label: string;
  iq: number;
  qualityIq: number;
  hardIq: number | null;
  cost: number;
  minutes: number;
  index: number;
  key: string;
  sampleCount: number | null;
  historyCenter: number | null;
  uncertainty: number;
  stability: StabilityStatus;
  quotaBudget20x: number | null;
  quotaShare: number | null;
  quotaSource: "family-radar" | "plan-normalized-cost";
  communityRating: number | null;
  communityRatingCount: number;
  mode?: "fast";
  fastMultiplier?: number;
  fastMultiplierSource?: string;
  fastEvidenceSource?: FastEvidenceSource;
  baseRecord?: ModelRecord;
}

export interface ScoredRecord extends ModelRecord {
  qualityGain: number;
  qualityDeficit: number;
  quotaPressure: number;
  timePressure: number;
  strategyScore: number;
  dominators?: ScoredRecord[];
  representative?: ScoredRecord;
  quotaEligible?: boolean;
  quotaZone?: QuotaZone;
  quotaLimit?: number;
  quotaExclusionReason?: QuotaExclusionReason;
}

interface StrategyScoreContext {
  strategyKey: string;
  candidates: ScoredRecord[];
}

function qualityValue(record: ModelRecord): number {
  return Number.isFinite(record.qualityIq) ? record.qualityIq : record.iq;
}

function planMultiplier(subscriptionKey: string): number {
  return PLAN_MULTIPLIERS[subscriptionKey] || PLAN_MULTIPLIERS.plus;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function quotaShare(
  record: ModelRecord,
  subscriptionKey: string,
): number | null {
  const multiplier = planMultiplier(subscriptionKey);
  if (!record.quotaBudget20x || record.quotaBudget20x <= 0) {
    return null;
  }
  const planBudget = (record.quotaBudget20x * multiplier) / 20;
  return planBudget > 0 ? record.cost / planBudget : null;
}

function quotaPressure(record: ModelRecord, subscriptionKey: string): number {
  const multiplier = planMultiplier(subscriptionKey);
  const share = quotaShare(record, subscriptionKey);
  if (share !== null) {
    return -Math.log1p(-clamp(share, 0, 0.99));
  }
  return Math.log1p(record.cost / multiplier);
}

function qualityDeficit(iq: number): number {
  return Math.pow(Math.max(0, IQ_TARGET - iq) / IQ_DEFICIT_SCALE, 2);
}

function qualityGain(iq: number): number {
  return Math.log1p(Math.max(0, iq - IQ_TARGET) / IQ_SURPLUS_SCALE);
}

function timePressure(minutes: number): number {
  return Math.log1p(minutes / 10);
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
    return {
      ...record,
      qualityGain: qualityGain(stableIq),
      qualityDeficit: qualityDeficit(stableIq),
      quotaPressure: quotaPressure(record, subscriptionKey),
      quotaShare: quotaShare(record, subscriptionKey),
      timePressure: timePressure(record.minutes),
      strategyScore: 0,
    };
  });
}

export interface QuotaGateResult {
  eligible: boolean;
  zone: QuotaZone;
  limit: number;
  reason?: QuotaExclusionReason;
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
      reason: "unavailable",
    };
  }
  const zone =
    share <= QUOTA_COMFORTABLE_LIMIT
      ? "comfortable"
      : share <= QUOTA_EXPENSIVE_LIMIT
        ? "expensive"
        : "burst";
  return {
    eligible: share <= limit,
    zone,
    limit,
    reason: share <= limit ? undefined : "over-limit",
  };
}

function compareBaseQuality(left: ScoredRecord, right: ScoredRecord): number {
  return (
    qualityValue(right) - qualityValue(left) ||
    right.qualityGain - left.qualityGain ||
    left.quotaPressure - right.quotaPressure ||
    left.timePressure - right.timePressure ||
    compareRisk(left, right) ||
    compareCommunity(left, right) ||
    left.index - right.index
  );
}

function compareCommunity(left: ScoredRecord, right: ScoredRecord): number {
  const leftRating =
    left.communityRatingCount >= COMMUNITY_MIN_RATING_COUNT
      ? left.communityRating
      : null;
  const rightRating =
    right.communityRatingCount >= COMMUNITY_MIN_RATING_COUNT
      ? right.communityRating
      : null;
  if (leftRating === null && rightRating === null) {
    return 0;
  }
  return (
    (rightRating ?? -1) - (leftRating ?? -1) ||
    (rightRating === null || leftRating === null
      ? 0
      : right.communityRatingCount - left.communityRatingCount)
  );
}

function stabilityPenalty(status: StabilityStatus): number {
  if (status === "degrading") return 1;
  if (status === "unknown") return 0.5;
  return 0;
}

function compareRisk(left: ScoredRecord, right: ScoredRecord): number {
  return (
    stabilityPenalty(left.stability) - stabilityPenalty(right.stability) ||
    left.uncertainty - right.uncertainty
  );
}

function compareQuota(left: ScoredRecord, right: ScoredRecord): number {
  return (
    left.quotaPressure - right.quotaPressure ||
    qualityValue(right) - qualityValue(left) ||
    left.timePressure - right.timePressure ||
    compareRisk(left, right) ||
    compareCommunity(left, right) ||
    left.index - right.index
  );
}

function compareTime(left: ScoredRecord, right: ScoredRecord): number {
  return (
    left.minutes - right.minutes ||
    qualityValue(right) - qualityValue(left) ||
    left.quotaPressure - right.quotaPressure ||
    compareRisk(left, right) ||
    compareCommunity(left, right) ||
    left.index - right.index
  );
}

function compareQualityBand(
  left: ScoredRecord,
  right: ScoredRecord,
  candidates: ScoredRecord[],
): number {
  const maximumQuality = Math.max(...candidates.map(qualityValue));
  const leftInBand =
    qualityValue(left) >= maximumQuality - IQ_QUALITY_TOLERANCE;
  const rightInBand =
    qualityValue(right) >= maximumQuality - IQ_QUALITY_TOLERANCE;
  if (leftInBand !== rightInBand) {
    return leftInBand ? -1 : 1;
  }
  if (leftInBand) {
    return (
      (right.hardIq ?? qualityValue(right)) -
        (left.hardIq ?? qualityValue(left)) ||
      left.minutes - right.minutes ||
      left.quotaPressure - right.quotaPressure ||
      qualityValue(right) - qualityValue(left) ||
      compareRisk(left, right) ||
      compareCommunity(left, right) ||
      left.index - right.index
    );
  }
  return compareBaseQuality(left, right);
}

function compareEconomy(
  left: ScoredRecord,
  right: ScoredRecord,
  candidates: ScoredRecord[],
): number {
  const hasSatisfactory = candidates.some(
    (candidate) => qualityValue(candidate) >= IQ_TARGET,
  );
  if (hasSatisfactory) {
    const leftSatisfactory = qualityValue(left) >= IQ_TARGET;
    const rightSatisfactory = qualityValue(right) >= IQ_TARGET;
    if (leftSatisfactory !== rightSatisfactory) {
      return leftSatisfactory ? -1 : 1;
    }
  }

  const leftExtreme = left.minutes > ECONOMY_MAX_MINUTES;
  const rightExtreme = right.minutes > ECONOMY_MAX_MINUTES;
  if (leftExtreme !== rightExtreme) {
    return leftExtreme ? 1 : -1;
  }
  return compareQuota(left, right);
}

function compareSpeed(
  left: ScoredRecord,
  right: ScoredRecord,
  candidates: ScoredRecord[],
): number {
  const hasQualityFloor = candidates.some(
    (candidate) => qualityValue(candidate) >= IQ_TARGET,
  );
  if (hasQualityFloor) {
    const leftHasFloor = qualityValue(left) >= IQ_TARGET;
    const rightHasFloor = qualityValue(right) >= IQ_TARGET;
    if (leftHasFloor !== rightHasFloor) {
      return leftHasFloor ? -1 : 1;
    }
  }
  return compareTime(left, right);
}

function kneeDistance(
  record: ScoredRecord,
  candidates: ScoredRecord[],
): number {
  const qualities = candidates.map(qualityUtility);
  const quotas = candidates.map((candidate) => candidate.quotaPressure);
  const times = candidates.map((candidate) => candidate.minutes);
  const maximumQuality = Math.max(...qualities);
  const minimumQuality = Math.min(...qualities);
  const maximumQuota = Math.max(...quotas);
  const minimumQuota = Math.min(...quotas);
  const maximumTime = Math.max(...times);
  const minimumTime = Math.min(...times);
  const qualityRange = maximumQuality - minimumQuality || 1;
  const quotaRange = maximumQuota - minimumQuota || 1;
  const timeRange = maximumTime - minimumTime || 1;
  const qualityDistance =
    ((maximumQuality - qualityUtility(record)) / qualityRange) *
    BALANCED_QUALITY_WEIGHT;
  const quotaDistance =
    ((record.quotaPressure - minimumQuota) / quotaRange) * BALANCED_COST_WEIGHT;
  const timeDistance =
    ((record.minutes - minimumTime) / timeRange) * BALANCED_TIME_WEIGHT;
  return Math.sqrt(
    qualityDistance ** 2 + quotaDistance ** 2 + timeDistance ** 2,
  );
}

function qualityUtility(record: ScoredRecord): number {
  return record.qualityGain - record.qualityDeficit;
}

function calculateStrategyScore(
  record: ScoredRecord,
  context: StrategyScoreContext,
): number {
  switch (context.strategyKey) {
    case "quality":
      return record.qualityDeficit - record.qualityGain;
    case "effectiveness":
      return kneeDistance(record, context.candidates);
    case "budget":
      return (
        record.qualityDeficit +
        record.quotaPressure +
        ECONOMY_TIME_WEIGHT * record.timePressure
      );
    case "speed":
      return (
        record.timePressure +
        0.25 * record.quotaPressure +
        record.qualityDeficit
      );
    default:
      return record.qualityDeficit + record.quotaPressure + record.timePressure;
  }
}

export function scoreRecords(
  records: ScoredRecord[],
  strategyKey: string,
  decisionSet: ScoredRecord[] = records,
): ScoredRecord[] {
  const context: StrategyScoreContext = {
    strategyKey,
    candidates: decisionSet,
  };
  return records.map((record) => ({
    ...record,
    strategyScore: calculateStrategyScore(record, context),
  }));
}

function dominates(candidate: ScoredRecord, target: ScoredRecord): boolean {
  const candidateQuality = qualityValue(candidate);
  const targetQuality = qualityValue(target);
  const qualityDifference = candidateQuality - targetQuality;
  const noWorse =
    candidateQuality >= targetQuality &&
    candidate.quotaPressure <= target.quotaPressure &&
    candidate.minutes <= target.minutes;
  const clearQualityImprovement = qualityDifference > IQ_QUALITY_TOLERANCE;
  const clearResourceImprovement =
    candidate.quotaPressure < target.quotaPressure ||
    candidate.minutes < target.minutes;
  return (
    noWorse &&
    (clearQualityImprovement ||
      (Math.abs(qualityDifference) <= IQ_QUALITY_TOLERANCE &&
        clearResourceImprovement))
  );
}

function compareWitnessPriority(
  left: ScoredRecord,
  right: ScoredRecord,
): number {
  return (
    left.quotaPressure - right.quotaPressure ||
    qualityValue(right) - qualityValue(left) ||
    left.minutes - right.minutes ||
    left.index - right.index
  );
}

export function analyze(records: ScoredRecord[]): {
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
      .sort(compareWitnessPriority);
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
  frontier.sort(compareWitnessPriority);
  dominated.sort(compareWitnessPriority);
  return { frontier, dominated };
}

export function sortScoredRecords(
  records: ScoredRecord[],
  strategyKey: string,
): ScoredRecord[] {
  const candidates = records.slice();
  const compare =
    strategyKey === "quality"
      ? (left: ScoredRecord, right: ScoredRecord) =>
          compareQualityBand(left, right, candidates)
      : strategyKey === "budget"
        ? (left: ScoredRecord, right: ScoredRecord) =>
            compareEconomy(left, right, candidates)
        : strategyKey === "speed"
          ? (left: ScoredRecord, right: ScoredRecord) =>
              compareSpeed(left, right, candidates)
          : (left: ScoredRecord, right: ScoredRecord) =>
              left.strategyScore - right.strategyScore ||
              compareBaseQuality(left, right);
  return candidates.sort(compare);
}
