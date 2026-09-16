import {
  EFFORT_ORDER,
  FAST_COST_MULTIPLIER,
  FAST_DEFAULT_MULTIPLIERS,
  FAST_E2E_DECAY_EXPONENT,
  FAST_MEASURED_MODEL,
  SELECTORS,
} from "./config.js";
import {
  analyze,
  isValidRecord,
  ModelRecord,
  scoreRecords,
  sortScoredRecords,
} from "./scoring.js";
import { Copy } from "./i18n.js";

export interface StrategyResult {
  frontier: ReturnType<typeof analyze>["frontier"];
  dominated: ReturnType<typeof analyze>["dominated"];
  orderedFrontier: ReturnType<typeof sortScoredRecords>;
  fastComparedCount: number;
  fastCandidateCount: number;
  fastLowerThanNextCount: number;
  fastFrontierCount: number;
}

function parseFirstNumber(value: unknown): number {
  const match = String(value ?? "")
    .replace(/,/g, "")
    .match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : Number.NaN;
}

export function readCard(card: HTMLElement, index: number): ModelRecord {
  const iq = parseFirstNumber(
    card.querySelector(SELECTORS.cardIq)?.textContent,
  );
  const meta = card.querySelectorAll(SELECTORS.cardMeta);
  const cost = parseFirstNumber(meta[0]?.textContent);
  const minutes = parseFirstNumber(meta[1]?.textContent);
  const model = String(card.dataset.model ?? "").trim();
  const effort = String(card.dataset.effort ?? "").trim();
  const label = String(
    card.querySelector(SELECTORS.cardLabel)?.textContent ?? "",
  ).trim();

  return {
    model,
    effort,
    label: label || [model, effort].filter(Boolean).join(" "),
    iq,
    cost,
    minutes,
    index,
    key: `${model}::${effort}`,
  };
}

export function readFastE2EMultipliers(
  root: HTMLElement | null,
): Map<string, number> {
  const multipliers = new Map();
  if (!root) {
    return multipliers;
  }

  for (const row of root.querySelectorAll<HTMLElement>(SELECTORS.fastEffort)) {
    const effort = String(row.dataset.fastCurrentEffort ?? "")
      .trim()
      .toLowerCase();
    const ratio = parseFirstNumber(
      row.querySelector(SELECTORS.fastE2e)?.textContent,
    );
    if (effort && Number.isFinite(ratio) && ratio > 1) {
      multipliers.set(`${FAST_MEASURED_MODEL}::${effort}`, ratio);
    }
  }
  return multipliers;
}

function getFastMultiplier(
  record: ModelRecord,
  e2eMultipliers: Map<string, number>,
  copy: Copy,
): { value: number; source: string } {
  const nominal =
    record.model === FAST_MEASURED_MODEL
      ? FAST_DEFAULT_MULTIPLIERS.astra
      : FAST_DEFAULT_MULTIPLIERS.other;
  const measured = e2eMultipliers.get(`${record.model}::${record.effort}`);
  if (Number.isFinite(measured) && measured > 1) {
    return {
      value: Math.min(nominal, measured),
      source: copy.fastMeasuredSource,
    };
  }
  return {
    value: Math.pow(nominal, FAST_E2E_DECAY_EXPONENT),
    source: copy.fastFallbackSource,
  };
}

function findNextHigher(
  record: ModelRecord,
  records: ModelRecord[],
): ModelRecord | null {
  const currentIndex = EFFORT_ORDER.indexOf(record.effort);
  if (currentIndex < 0 || currentIndex + 1 >= EFFORT_ORDER.length) {
    return null;
  }
  const nextEffort = EFFORT_ORDER[currentIndex + 1];
  return (
    records.find(
      (candidate) =>
        candidate.model === record.model && candidate.effort === nextEffort,
    ) || null
  );
}

export function buildStrategyResult(
  standardRecords: ModelRecord[],
  e2eMultipliers: Map<string, number>,
  strategyKey: string,
  subscriptionKey: string,
  includeFast: boolean,
  copy: Copy,
): StrategyResult {
  const scoredStandards = scoreRecords(
    standardRecords,
    strategyKey,
    subscriptionKey,
    standardRecords,
  );
  const scoredByKey = new Map(
    scoredStandards.map((record) => [record.key, record]),
  );
  const fastCandidates = [];
  const fastComparisons = [];
  let fastComparedCount = 0;
  let fastLowerThanNextCount = 0;

  for (const standard of includeFast ? standardRecords : []) {
    const nextHigher = findNextHigher(standard, standardRecords);
    const fast = getFastMultiplier(standard, e2eMultipliers, copy);
    fastCandidates.push({
      ...standard,
      key: `${standard.key}::fast`,
      mode: "fast",
      cost: standard.cost * FAST_COST_MULTIPLIER,
      minutes: standard.minutes / fast.value,
      fastMultiplier: fast.value,
      fastMultiplierSource: fast.source,
      baseRecord: standard,
      index: standard.index + 0.1,
    });
    fastComparisons.push({
      fastKey: `${standard.key}::fast`,
      nextHigher,
    });
  }

  const scoredFastCandidates = scoreRecords(
    fastCandidates,
    strategyKey,
    subscriptionKey,
    standardRecords,
  );
  const scoredFastByKey = new Map(
    scoredFastCandidates.map((record) => [record.key, record]),
  );
  for (const { fastKey, nextHigher } of fastComparisons) {
    const scoredFast = scoredFastByKey.get(fastKey);
    const scoredNextHigher = nextHigher
      ? scoredByKey.get(nextHigher.key)
      : null;
    if (!scoredFast || !scoredNextHigher) {
      continue;
    }
    fastComparedCount += 1;
    if (scoredFast.strategyScore < scoredNextHigher.strategyScore) {
      fastLowerThanNextCount += 1;
    }
  }

  const analysis = analyze([...scoredStandards, ...scoredFastCandidates]);
  return {
    ...analysis,
    orderedFrontier: sortScoredRecords(analysis.frontier, strategyKey),
    fastComparedCount,
    fastCandidateCount: includeFast ? fastCandidates.length : 0,
    fastLowerThanNextCount,
    fastFrontierCount: analysis.frontier.filter(
      (record) => record.mode === "fast",
    ).length,
  };
}

export { isValidRecord };
