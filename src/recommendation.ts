import {
  FAST_COST_MULTIPLIER,
  IQ_MINIMUM,
  IQ_QUALITY_TOLERANCE,
  PLAN_LIMITS,
  QUOTA_WEEKLY_LIMITS,
} from "./config.js";
import type { FastEstimate, FastEstimator } from "./radar.js";
import {
  analyzeParetoDiagnostics,
  evaluateCandidateEligibility,
  evaluateRecords,
  isValidRecord,
  scoreRecords,
  sortScoredRecords,
} from "./scoring.js";
import type {
  ModelRecord,
  ScoredRecord,
  StrategyKey,
  SubscriptionKey,
} from "./scoring.js";

interface RecommendationExplanation {
  winnerKey: string | null;
  strategy: StrategyKey | string;
  quotaGate: number;
  qualityTolerance: number;
  shortWindowUnquantified: boolean;
  shortWindowHours: number | null;
  fastEvidenceLevel: ScoredRecord["fastEvidenceLevel"] | null;
  fastTimeKind: ScoredRecord["timeKind"] | null;
}

interface StrategyExclusions {
  belowIqFloor: ScoredRecord[];
  quotaUnknown: ScoredRecord[];
  quotaOverLimit: ScoredRecord[];
  fastEvidenceUnavailable: ModelRecord[];
}

interface StrategyDiagnostics {
  paretoFrontier: string[];
  paretoDominated: string[];
  shortWindowUnquantified: boolean;
  shortWindowHours: number | null;
}

export interface StrategyResult {
  plan: SubscriptionKey | string;
  strategy: StrategyKey | string;
  winner: ScoredRecord | null;
  orderedEligible: ScoredRecord[];
  excluded: StrategyExclusions;
  diagnostics: StrategyDiagnostics;
  explanation: RecommendationExplanation;

  // These aliases keep the UI migration small; Pareto values are diagnostics only.
  frontier: ScoredRecord[];
  dominated: ScoredRecord[];
  orderedFrontier: ScoredRecord[];
  quotaExcluded: ScoredRecord[];
  quotaLimit: number;
  quotaOverLimitCount: number;
  quotaUnknownCount: number;
  fastCandidateCount: number;
  fastFrontierCount: number;
  fastExactCount: number;
  fastModelCount: number;
  fastGroupCount: number;
  fastOmittedCount: number;
}

function createFastCandidate(
  record: ModelRecord,
  estimate: FastEstimate,
): ModelRecord {
  return {
    ...record,
    key: `${record.key}::fast`,
    mode: "fast",
    cost: record.cost * FAST_COST_MULTIPLIER,
    minutes: record.minutes / estimate.ratio,
    fastMultiplier: estimate.ratio,
    fastEvidenceLevel: estimate.evidenceLevel,
    fastEvidenceSource: estimate.sourceLabel,
    fastSampleCount: estimate.sampleCount,
    fastAgeDays: estimate.ageDays,
    fastNominalRatio: estimate.nominalRatio,
    timeKind: estimate.timeKind,
    baseRecord: record,
  };
}

function markEligibility(
  records: ScoredRecord[],
  strategyKey: string,
): ScoredRecord[] {
  return records.map((record) => {
    const gate = evaluateCandidateEligibility(record, strategyKey);
    return {
      ...record,
      quotaEligible: gate.eligible,
      quotaZone: gate.zone,
      quotaLimit: gate.limit,
      quotaExclusionReason:
        gate.reason === "quota-over-limit" || gate.reason === "quota-unknown"
          ? gate.reason
          : undefined,
    };
  });
}

function buildExplanation(
  winner: ScoredRecord | null,
  strategyKey: string,
  subscriptionKey: string,
  quotaLimit: number,
): RecommendationExplanation {
  const plan = PLAN_LIMITS[subscriptionKey] ?? PLAN_LIMITS.plus;
  return {
    winnerKey: winner?.key ?? null,
    strategy: strategyKey,
    quotaGate: quotaLimit,
    qualityTolerance: IQ_QUALITY_TOLERANCE,
    shortWindowUnquantified:
      subscriptionKey === "plus" && plan.shortWindowCapacity === null,
    shortWindowHours: plan.shortWindowHours,
    fastEvidenceLevel: winner?.fastEvidenceLevel ?? null,
    fastTimeKind: winner?.timeKind ?? null,
  };
}

export function buildStrategyResult(
  standardRecords: ModelRecord[],
  fastEstimator: FastEstimator,
  strategyKey: string,
  subscriptionKey: string,
  includeFast: boolean,
): StrategyResult {
  const validRecords = standardRecords.filter(isValidRecord);
  const eligibleQualityRecords = validRecords.filter(
    (record) => record.qualityIq >= IQ_MINIMUM,
  );
  const fastCandidates: ModelRecord[] = [];
  const fastEvidenceUnavailable: ModelRecord[] = [];

  if (includeFast) {
    for (const standard of eligibleQualityRecords) {
      const estimate = fastEstimator.estimate(standard);
      if (!estimate) {
        fastEvidenceUnavailable.push(standard);
        continue;
      }
      fastCandidates.push(createFastCandidate(standard, estimate));
    }
  }

  const evaluated = evaluateRecords(
    [...validRecords, ...fastCandidates],
    subscriptionKey,
  );
  const quotaLimit =
    QUOTA_WEEKLY_LIMITS[strategyKey] ?? QUOTA_WEEKLY_LIMITS.effectiveness;
  const marked = markEligibility(evaluated, strategyKey);
  const belowIqFloor = marked.filter((record) => record.qualityIq < IQ_MINIMUM);
  const aboveIqFloor = marked.filter(
    (record) => record.qualityIq >= IQ_MINIMUM,
  );
  const eligible = aboveIqFloor.filter((record) => record.quotaEligible);
  const quotaUnknown = aboveIqFloor.filter(
    (record) => record.quotaExclusionReason === "quota-unknown",
  );
  const quotaOverLimit = aboveIqFloor.filter(
    (record) => record.quotaExclusionReason === "quota-over-limit",
  );
  const scored = scoreRecords(eligible, strategyKey);
  const orderedEligible = sortScoredRecords(scored, strategyKey);
  const pareto = analyzeParetoDiagnostics(scored);
  const winner = orderedEligible[0] ?? null;
  const plan = PLAN_LIMITS[subscriptionKey] ?? PLAN_LIMITS.plus;
  const excluded: StrategyExclusions = {
    belowIqFloor,
    quotaUnknown,
    quotaOverLimit,
    fastEvidenceUnavailable,
  };
  const diagnostics: StrategyDiagnostics = {
    paretoFrontier: pareto.frontier.map((record) => record.key),
    paretoDominated: pareto.dominated.map((record) => record.key),
    shortWindowUnquantified:
      subscriptionKey === "plus" && plan.shortWindowCapacity === null,
    shortWindowHours: plan.shortWindowHours,
  };

  return {
    plan: subscriptionKey,
    strategy: strategyKey,
    winner,
    orderedEligible,
    excluded,
    diagnostics,
    explanation: buildExplanation(
      winner,
      strategyKey,
      subscriptionKey,
      quotaLimit,
    ),
    frontier: pareto.frontier,
    dominated: pareto.dominated,
    orderedFrontier: orderedEligible,
    quotaExcluded: [...quotaUnknown, ...quotaOverLimit],
    quotaLimit,
    quotaOverLimitCount: quotaOverLimit.length,
    quotaUnknownCount: quotaUnknown.length,
    fastCandidateCount: fastCandidates.length,
    fastFrontierCount: pareto.frontier.filter(
      (record) => record.mode === "fast",
    ).length,
    fastExactCount: fastCandidates.filter(
      (record) => record.fastEvidenceLevel === "exact",
    ).length,
    fastModelCount: fastCandidates.filter(
      (record) => record.fastEvidenceLevel === "model",
    ).length,
    fastGroupCount: fastCandidates.filter(
      (record) => record.fastEvidenceLevel === "fastGroup",
    ).length,
    fastOmittedCount: includeFast ? fastEvidenceUnavailable.length : 0,
  };
}
