import { FAST_COST_MULTIPLIER, QUOTA_WEEKLY_LIMITS } from "./config.js";
import type { FastEstimator, FastEstimate } from "./radar.js";
import {
  analyze,
  evaluateRecords,
  evaluateQuotaGate,
  scoreRecords,
  sortScoredRecords,
} from "./scoring.js";
import type { ModelRecord, ScoredRecord } from "./scoring.js";

export interface StrategyResult {
  frontier: ScoredRecord[];
  dominated: ScoredRecord[];
  quotaExcluded: ScoredRecord[];
  orderedFrontier: ScoredRecord[];
  quotaLimit: number;
  quotaOverLimitCount: number;
  quotaUnknownCount: number;
  fastCandidateCount: number;
  fastFrontierCount: number;
  fastExactCount: number;
  fastModelCount: number;
  fastGenerationCount: number;
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
    minutes: record.minutes / estimate.value,
    fastMultiplier: estimate.value,
    fastMultiplierSource: estimate.sourceLabel,
    fastEvidenceSource: estimate.source,
    baseRecord: record,
    index: record.index + 0.1,
  };
}

export function buildStrategyResult(
  standardRecords: ModelRecord[],
  fastEstimator: FastEstimator,
  strategyKey: string,
  subscriptionKey: string,
  includeFast: boolean,
): StrategyResult {
  const fastCandidates: ModelRecord[] = [];

  for (const standard of includeFast ? standardRecords : []) {
    const estimate = fastEstimator.estimate(standard);
    if (!estimate) {
      continue;
    }
    fastCandidates.push(createFastCandidate(standard, estimate));
  }

  const evaluatedCandidates = evaluateRecords(
    [...standardRecords, ...fastCandidates],
    subscriptionKey,
  );
  const quotaLimit =
    QUOTA_WEEKLY_LIMITS[strategyKey] ?? QUOTA_WEEKLY_LIMITS.effectiveness;
  const quotaMarkedCandidates = evaluatedCandidates.map((record) => {
    const gate = evaluateQuotaGate(record, strategyKey);
    return {
      ...record,
      quotaEligible: gate.eligible,
      quotaZone: gate.zone,
      quotaLimit: gate.limit,
      quotaExclusionReason: gate.reason,
    };
  });
  const eligibleCandidates = quotaMarkedCandidates.filter(
    (record) => record.quotaEligible,
  );
  const quotaExcluded = quotaMarkedCandidates
    .filter((record) => !record.quotaEligible)
    .map((record) => ({ ...record, strategyScore: Number.NaN }));
  const provisionalAnalysis = analyze(eligibleCandidates);
  const scoredCandidates = scoreRecords(
    eligibleCandidates,
    strategyKey,
    provisionalAnalysis.frontier,
  );
  const analysis = analyze(scoredCandidates);
  const eligibleFast = eligibleCandidates.filter(
    (record) => record.mode === "fast",
  );

  return {
    ...analysis,
    quotaExcluded,
    orderedFrontier: sortScoredRecords(analysis.frontier, strategyKey),
    quotaLimit,
    quotaOverLimitCount: quotaExcluded.filter(
      (record) => record.quotaExclusionReason === "over-limit",
    ).length,
    quotaUnknownCount: quotaExcluded.filter(
      (record) => record.quotaExclusionReason === "unavailable",
    ).length,
    fastCandidateCount: eligibleFast.length,
    fastFrontierCount: analysis.frontier.filter(
      (record) => record.mode === "fast",
    ).length,
    fastExactCount: eligibleFast.filter(
      (record) => record.fastEvidenceSource === "exact",
    ).length,
    fastModelCount: eligibleFast.filter(
      (record) => record.fastEvidenceSource === "model",
    ).length,
    fastGenerationCount: eligibleFast.filter(
      (record) => record.fastEvidenceSource === "generation",
    ).length,
    fastOmittedCount: includeFast
      ? standardRecords.length - fastCandidates.length
      : 0,
  };
}
