import {
  DEFAULT_SUBSCRIPTION,
  IQ_SATURATION,
  SUBSCRIPTION_WEIGHTS,
} from "./config.js";

export interface ModelRecord {
  model: string;
  effort: string;
  label: string;
  iq: number;
  cost: number;
  minutes: number;
  index: number;
  key: string;
  mode?: "fast";
  fastMultiplier?: number;
  fastMultiplierSource?: string;
  baseRecord?: ModelRecord;
}

export interface ScoredRecord extends ModelRecord {
  strategyScore: number;
  dominators?: ScoredRecord[];
  representative?: ScoredRecord;
}

interface StrategyWeights {
  qualityWeight: number;
  feeWeight: number;
  timeWeight: number;
}

export function getStrategyWeights(
  strategyKey: string,
  subscriptionKey: string,
): StrategyWeights {
  return (
    SUBSCRIPTION_WEIGHTS[subscriptionKey]?.[strategyKey] ||
    SUBSCRIPTION_WEIGHTS[DEFAULT_SUBSCRIPTION]?.[strategyKey] ||
    SUBSCRIPTION_WEIGHTS[DEFAULT_SUBSCRIPTION].quality
  );
}

export function isValidRecord(record: ModelRecord): boolean {
  return Boolean(
    record.model &&
    record.effort &&
    record.label &&
    Number.isFinite(record.iq) &&
    Number.isFinite(record.cost) &&
    Number.isFinite(record.minutes) &&
    record.iq >= 0 &&
    record.cost >= 0 &&
    record.minutes >= 0,
  );
}

function dominates(candidate: ModelRecord, target: ModelRecord): boolean {
  const noWorse =
    candidate.iq >= target.iq &&
    candidate.cost <= target.cost &&
    candidate.minutes <= target.minutes;
  const strictlyBetter =
    candidate.iq > target.iq ||
    candidate.cost < target.cost ||
    candidate.minutes < target.minutes;
  return noWorse && strictlyBetter;
}

function compareByWitnessPriority(
  left: ModelRecord,
  right: ModelRecord,
): number {
  return (
    left.cost - right.cost ||
    right.iq - left.iq ||
    left.minutes - right.minutes ||
    left.index - right.index
  );
}

function getCompositeBaselines(records: ModelRecord[]) {
  const minimumCost = Math.min(...records.map((record) => record.cost));
  const minimumTime = Math.min(...records.map((record) => record.minutes));
  return {
    cost: Number.isFinite(minimumCost) && minimumCost > 0 ? minimumCost : 1,
    time: Number.isFinite(minimumTime) && minimumTime > 0 ? minimumTime : 1,
  };
}

function scoreRecord(
  record: ModelRecord,
  weights: StrategyWeights,
  baselines: { cost: number; time: number },
): ScoredRecord {
  return {
    ...record,
    strategyScore:
      Math.pow(record.cost / baselines.cost, weights.feeWeight) *
      Math.pow(record.minutes / baselines.time, weights.timeWeight) *
      Math.pow(Math.max(1, IQ_SATURATION / record.iq), weights.qualityWeight),
  };
}

export function scoreRecords(
  records: ModelRecord[],
  strategyKey: string,
  subscriptionKey: string,
  baselineRecords: ModelRecord[] = records,
): ScoredRecord[] {
  const weights = getStrategyWeights(strategyKey, subscriptionKey);
  const baselines = getCompositeBaselines(baselineRecords);
  return records.map((record) => scoreRecord(record, weights, baselines));
}

const compareByIq = (left: ScoredRecord, right: ScoredRecord) =>
  right.iq - left.iq;
const compareByCost = (left: ScoredRecord, right: ScoredRecord) =>
  left.cost - right.cost;
const compareBySpeed = (left: ScoredRecord, right: ScoredRecord) =>
  left.minutes - right.minutes;
const compareByStrategyScore = (left: ScoredRecord, right: ScoredRecord) =>
  left.strategyScore - right.strategyScore;
const compareByStableIndex = (left: ScoredRecord, right: ScoredRecord) =>
  left.index - right.index;

function compareScoredRecords(
  left: ScoredRecord,
  right: ScoredRecord,
  strategyKey: string,
): number {
  if (strategyKey === "speed") {
    return (
      compareByStrategyScore(left, right) ||
      compareBySpeed(left, right) ||
      compareByIq(left, right) ||
      compareByCost(left, right) ||
      compareByStableIndex(left, right)
    );
  }
  return (
    compareByStrategyScore(left, right) ||
    compareByIq(left, right) ||
    compareByCost(left, right) ||
    compareBySpeed(left, right) ||
    compareByStableIndex(left, right)
  );
}

export function sortScoredRecords(
  records: ScoredRecord[],
  strategyKey: string,
): ScoredRecord[] {
  return records
    .slice()
    .sort((left, right) => compareScoredRecords(left, right, strategyKey));
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
      .sort(compareByWitnessPriority);

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

  frontier.sort(compareByWitnessPriority);
  dominated.sort(compareByWitnessPriority);
  return { frontier, dominated };
}
