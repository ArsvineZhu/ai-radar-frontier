export interface QuotaReferenceEntry {
  matrixMultiplier: number;
  validTasks: number;
  discriminationCoverage: number;
  discriminationConfidence: number | null;
  quotaWeight: number;
  evidence: "measured-anchor" | "matrix-estimate";
}

export interface QuotaReference {
  schemaVersion: 2;
  benchmarkId: "deep-swe";
  taskCount: number;
  sourceUpdatedAt: string | null;
  rollingWindow: number | null;
  discriminationGeneratedAt: string | null;
  discriminationMethod: string | null;
  sourceHashes: { table: string; quotaPage: string };
  planCapacities: { plus: number; pro5: number; pro20: number };
  globalCorrection: number;
  anchors20x: Record<string, number>;
  entries: Record<string, QuotaReferenceEntry>;
}

interface TaskCell {
  cost?: number | null;
  mult?: number | null;
}

interface TaskDiscrimination {
  confidence?: number | null;
  score?: number | null;
}

export interface QuotaTableInput {
  benchmark_id?: string;
  tasks?: Array<{ id: string; discrimination?: TaskDiscrimination | null }>;
  combos?: Array<{ model: string; effort: string }>;
  cells?: Record<string, TaskCell>;
  tier_windows_usd?: Record<string, number>;
  baseline_generated_at?: string | null;
  rolling_window?: number | null;
  discrimination_generated_at?: string | null;
  discrimination_method?: string | null;
}

function median(values: number[]): number {
  if (values.length === 0) throw new Error("No quota calibration values");
  const sorted = values.slice().sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function compileQuotaReference(
  table: QuotaTableInput,
  anchors20x: Record<string, number>,
  sourceHashes: QuotaReference["sourceHashes"],
): QuotaReference {
  if (
    table.benchmark_id !== "deep-swe" ||
    !Array.isArray(table.tasks) ||
    !Array.isArray(table.combos) ||
    !table.cells
  ) {
    throw new Error("Expected a DeepSWE task table");
  }
  const windows = table.tier_windows_usd;
  const plus = windows?.plus;
  const pro5 = windows?.["pro-5x"];
  const pro20 = windows?.["pro-20x"];
  if (!positive(plus) || !positive(pro5) || !positive(pro20)) {
    throw new Error("Missing public plan capacity");
  }

  const matrix = new Map<
    string,
    {
      multiplier: number;
      validTasks: number;
      discriminationCoverage: number;
      discriminationConfidence: number | null;
    }
  >();
  for (const combo of table.combos) {
    if (!combo.model || !combo.effort) continue;
    let costSum = 0;
    let weightedCostSum = 0;
    let validTasks = 0;
    let discriminationTasks = 0;
    const discriminationConfidences: number[] = [];
    for (const task of table.tasks) {
      const cell = table.cells[`${task.id}|${combo.model}|${combo.effort}`];
      if (!positive(cell?.cost) || !positive(cell?.mult)) continue;
      costSum += cell.cost;
      weightedCostSum += cell.cost * cell.mult;
      validTasks += 1;
      const confidence = task.discrimination?.confidence;
      if (positive(confidence)) {
        discriminationTasks += 1;
        discriminationConfidences.push(confidence);
      }
    }
    if (costSum > 0) {
      matrix.set(`${combo.model}::${combo.effort}`, {
        multiplier: weightedCostSum / costSum,
        validTasks,
        discriminationCoverage:
          validTasks > 0 ? discriminationTasks / validTasks : 0,
        discriminationConfidence:
          discriminationConfidences.length > 0
            ? discriminationConfidences.reduce((sum, value) => sum + value, 0) /
              discriminationConfidences.length
            : null,
      });
    }
  }

  const anchorCorrections: number[] = [];
  for (const [model, capacity] of Object.entries(anchors20x)) {
    if (!positive(capacity)) continue;
    const effortCorrections = [...matrix.entries()]
      .filter(([key]) => key.startsWith(`${model}::`))
      .map(([, value]) => pro20 / capacity / value.multiplier);
    if (effortCorrections.length > 0) {
      anchorCorrections.push(median(effortCorrections));
    }
  }
  const globalCorrection = median(anchorCorrections);
  const entries: Record<string, QuotaReferenceEntry> = {};
  for (const [key, value] of matrix) {
    const model = key.slice(0, key.indexOf("::"));
    const measuredCapacity = anchors20x[model];
    entries[key] = {
      matrixMultiplier: value.multiplier,
      validTasks: value.validTasks,
      discriminationCoverage: value.discriminationCoverage,
      discriminationConfidence: value.discriminationConfidence,
      quotaWeight: positive(measuredCapacity)
        ? pro20 / measuredCapacity
        : value.multiplier * globalCorrection,
      evidence: positive(measuredCapacity)
        ? "measured-anchor"
        : "matrix-estimate",
    };
  }

  return {
    schemaVersion: 2,
    benchmarkId: "deep-swe",
    taskCount: table.tasks.length,
    sourceUpdatedAt: table.baseline_generated_at ?? null,
    rollingWindow: table.rolling_window ?? null,
    discriminationGeneratedAt: table.discrimination_generated_at ?? null,
    discriminationMethod: table.discrimination_method ?? null,
    sourceHashes,
    planCapacities: { plus, pro5, pro20 },
    globalCorrection,
    anchors20x,
    entries,
  };
}
