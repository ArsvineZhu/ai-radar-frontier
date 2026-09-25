import snapshot from "./quota-reference.json";
import type { QuotaReference, QuotaReferenceEntry } from "./quota-math.js";
import type { SubscriptionKey } from "./scoring.js";

export const QUOTA_REFERENCE = snapshot as QuotaReference;

export function quotaEntry(
  model: string,
  effort: string,
): QuotaReferenceEntry | null {
  return QUOTA_REFERENCE.entries[`${model}::${effort}`] ?? null;
}

export function planCapacity(plan: SubscriptionKey): number {
  return QUOTA_REFERENCE.planCapacities[plan];
}
