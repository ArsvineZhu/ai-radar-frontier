import { FAST_COST_MULTIPLIER, IQ_MINIMUM } from "./config.js";
import {
  buildCalibrationSummary,
  createEmptyCalibrationStore,
} from "./calibration.js";
import type { CalibrationDerivedContext } from "./calibration.js";
import type { FastEstimate, FastEstimator } from "./radar.js";
import {
  analyzeParetoDiagnostics,
  evaluateCandidateEligibility,
  evaluateRecords,
  isSimilar,
  isValidRecord,
  practicalDominates,
  scoreRecords,
  sortScoredRecords,
} from "./scoring.js";
import type {
  EligibilityExclusionReason,
  ModelRecord,
  ScoredRecord,
  StrategyKey,
  SubscriptionKey,
} from "./scoring.js";

export interface RecommendationGroup {
  representative: ScoredRecord;
  alternatives: ScoredRecord[];
  members: ScoredRecord[];
}

interface StrategyExclusions {
  invalid: ModelRecord[];
  belowIqFloor: ScoredRecord[];
  quotaUnknown: ScoredRecord[];
  resourceWeekly: ScoredRecord[];
  resourceShortWindow: ScoredRecord[];
  fastEvidenceUnavailable: ModelRecord[];
  practicalDominated: ScoredRecord[];
}

interface StrategyDiagnostics {
  paretoFrontier: string[];
  paretoDominated: string[];
  practicalDominated: string[];
  scoreableCount: number;
  meaningfulCount: number;
  groupCount: number;
  shortWindowEnabled: boolean;
  shortWindowHours: number;
  calibration: CalibrationDerivedContext;
}

export interface StrategyResult {
  plan: SubscriptionKey;
  strategy: StrategyKey;
  winner: ScoredRecord | null;
  orderedScored: ScoredRecord[];
  orderedMeaningful: ScoredRecord[];
  groups: RecommendationGroup[];
  excluded: StrategyExclusions;
  diagnostics: StrategyDiagnostics;
  fastCandidateCount: number;
  fastExactCount: number;
  fastModelCount: number;
  fastGroupCount: number;
  fastOmittedCount: number;
  explanation: {
    winnerKey: string | null;
    strategy: StrategyKey;
    shortWindowEnabled: boolean;
    shortWindowHours: number;
    fastEvidenceLevel: ScoredRecord["fastEvidenceLevel"] | null;
    fastTimeKind: ScoredRecord["timeKind"] | null;
  };
}

function createFastCandidate(
  record: ModelRecord,
  estimate: FastEstimate,
): ModelRecord {
  return {
    ...record,
    key: `${record.key}::fast`,
    mode: "fast",
    benchmarkCostEquivalent:
      record.benchmarkCostEquivalent * FAST_COST_MULTIPLIER,
    benchmarkMinutes: record.benchmarkMinutes / estimate.ratio,
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

function markReason(
  record: ScoredRecord,
  reason: EligibilityExclusionReason,
): ScoredRecord {
  return {
    ...record,
    quotaEligible: false,
    quotaExclusionReason: reason,
  };
}

function makeGroups(
  records: ScoredRecord[],
  shortWindowEnabled: boolean,
): RecommendationGroup[] {
  const groups: RecommendationGroup[] = [];
  for (const record of records) {
    const group = groups.find((candidate) =>
      isSimilar(candidate.representative, record, shortWindowEnabled),
    );
    if (group) {
      group.alternatives.push(record);
      group.members.push(record);
    } else {
      groups.push({
        representative: record,
        alternatives: [],
        members: [record],
      });
    }
  }
  return groups;
}

function emptyCalibration(
  subscriptionKey: SubscriptionKey,
): CalibrationDerivedContext {
  return buildCalibrationSummary(
    createEmptyCalibrationStore(),
    subscriptionKey,
  );
}

export function buildStrategyResult(
  standardRecords: ModelRecord[],
  fastEstimator: FastEstimator,
  strategyKey: StrategyKey | string,
  subscriptionKey: SubscriptionKey | string,
  includeFast: boolean,
  calibration?: CalibrationDerivedContext,
): StrategyResult {
  const plan: SubscriptionKey =
    subscriptionKey === "pro5" || subscriptionKey === "pro20"
      ? subscriptionKey
      : "plus";
  const strategy: StrategyKey =
    strategyKey === "effectiveness" ||
    strategyKey === "budget" ||
    strategyKey === "speed"
      ? strategyKey
      : "quality";
  const context = calibration ?? emptyCalibration(plan);
  const invalid = standardRecords.filter((record) => !isValidRecord(record));
  const valid = standardRecords.filter(isValidRecord);
  const fastEvidenceUnavailable: ModelRecord[] = [];
  const fastCandidates: ModelRecord[] = [];

  if (includeFast) {
    for (const standard of valid) {
      if (standard.qualityIq < IQ_MINIMUM) continue;
      const estimate = fastEstimator.estimate(standard);
      if (!estimate) {
        fastEvidenceUnavailable.push(standard);
      } else {
        fastCandidates.push(createFastCandidate(standard, estimate));
      }
    }
  }

  const evaluated = evaluateRecords(
    [...valid, ...fastCandidates],
    plan,
    context,
  );
  const eligible: ScoredRecord[] = [];
  const belowIqFloor: ScoredRecord[] = [];
  const quotaUnknown: ScoredRecord[] = [];
  const resourceWeekly: ScoredRecord[] = [];
  const resourceShortWindow: ScoredRecord[] = [];

  for (const record of evaluated) {
    const result = evaluateCandidateEligibility(record, context);
    if (result.eligible) {
      eligible.push({ ...record, quotaEligible: true });
      continue;
    }
    const marked = markReason(record, result.reason ?? "invalid");
    switch (result.reason) {
      case "below-iq-floor":
        belowIqFloor.push(marked);
        break;
      case "quota-unknown":
        quotaUnknown.push(marked);
        break;
      case "resource-weekly":
        resourceWeekly.push(marked);
        break;
      case "resource-short-window":
        resourceShortWindow.push(marked);
        break;
      default:
        break;
    }
  }

  const scored = scoreRecords(eligible, strategy, context);
  const orderedScored = sortScoredRecords(scored, strategy);
  const pareto = analyzeParetoDiagnostics(
    orderedScored,
    context.shortWindowEnabled,
  );
  const orderedMeaningful: ScoredRecord[] = [];
  const practicalDominated: ScoredRecord[] = [];
  for (let index = 0; index < orderedScored.length; index += 1) {
    const record = orderedScored[index];
    const dominators = orderedScored
      .slice(0, index)
      .filter((candidate) =>
        practicalDominates(candidate, record, context.shortWindowEnabled),
      );
    if (dominators.length > 0) {
      practicalDominated.push({
        ...markReason(record, "practical-dominated"),
        practicalDominators: dominators,
      });
    } else {
      orderedMeaningful.push(record);
    }
  }
  const groups = makeGroups(orderedMeaningful, context.shortWindowEnabled);
  const shortWindowHours = context.shortWindowHours;

  return {
    plan,
    strategy,
    winner: orderedScored[0] ?? null,
    orderedScored,
    orderedMeaningful,
    groups,
    excluded: {
      invalid,
      belowIqFloor,
      quotaUnknown,
      resourceWeekly,
      resourceShortWindow,
      fastEvidenceUnavailable,
      practicalDominated,
    },
    diagnostics: {
      paretoFrontier: pareto.frontier.map((record) => record.key),
      paretoDominated: pareto.dominated.map((record) => record.key),
      practicalDominated: practicalDominated.map((record) => record.key),
      scoreableCount: orderedScored.length,
      meaningfulCount: orderedMeaningful.length,
      groupCount: groups.length,
      shortWindowEnabled: context.shortWindowEnabled,
      shortWindowHours,
      calibration: context,
    },
    fastCandidateCount: fastCandidates.length,
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
    explanation: {
      winnerKey: orderedScored[0]?.key ?? null,
      strategy,
      shortWindowEnabled: context.shortWindowEnabled,
      shortWindowHours,
      fastEvidenceLevel: orderedScored[0]?.fastEvidenceLevel ?? null,
      fastTimeKind: orderedScored[0]?.timeKind ?? null,
    },
  };
}
