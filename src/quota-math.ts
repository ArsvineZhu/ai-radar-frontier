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
  benchmarkId: "deep-swe" | "radar-bench-v2-150";
  taskCount: number;
  sourceUpdatedAt: string | null;
  rollingWindow: number | null;
  discriminationGeneratedAt: string | null;
  discriminationMethod: string | null;
  sourceHashes: { table: string; quotaPage: string };
  planCapacities: {
    plus: number;
    pro100: number;
    pro200: number;
    pro500: number;
  };
  globalCorrection: number;
  anchors20x: Record<string, number>;
  entries: Record<string, QuotaReferenceEntry>;
}
