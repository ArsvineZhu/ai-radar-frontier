import { HOST_ID, STRATEGY_KEYS, SUBSCRIPTION_KEYS } from "./config.js";
import {
  createEmptyCalibrationStore,
  type CalibrationStoreV2,
  type ShortWindowObservation,
  type WorkloadCalibrationObservation,
} from "./calibration.js";

const STORAGE_KEY = `${HOST_ID}:preferences`;
const CALIBRATION_KEY = `${HOST_ID}:quota-calibration:radar-bench-v1`;

export interface UserPreferences {
  subscription?: string;
  sortStrategy?: string;
  fastEnabled?: boolean;
}

function isStorageObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function loadPreferences(): UserPreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const value: unknown = JSON.parse(raw);
    if (!isObject(value)) {
      return {};
    }
    if (value.subscription === "pro5") value.subscription = "pro100";
    if (value.subscription === "pro20") value.subscription = "pro200";
    return {
      subscription:
        typeof value.subscription === "string" &&
        SUBSCRIPTION_KEYS.includes(value.subscription)
          ? value.subscription
          : undefined,
      sortStrategy:
        typeof value.sortStrategy === "string" &&
        STRATEGY_KEYS.includes(value.sortStrategy)
          ? value.sortStrategy
          : undefined,
      fastEnabled:
        typeof value.fastEnabled === "boolean" ? value.fastEnabled : undefined,
    };
  } catch {
    return {};
  }
}

export function savePreferences(preferences: UserPreferences): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Storage can be unavailable in private or restricted browsing contexts.
  }
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function validStore(value: unknown): value is CalibrationStoreV2 {
  if (!isStorageObject(value) || value.schemaVersion !== 2) return false;
  return (
    isArray(value.shortWindowObservations) &&
    isArray(value.workloadObservations)
  );
}

export function loadCalibrationStore(): CalibrationStoreV2 {
  const store = storage();
  if (!store) return createEmptyCalibrationStore();
  try {
    const raw = store.getItem(CALIBRATION_KEY);
    if (raw) {
      const value: unknown = JSON.parse(raw);
      if (!validStore(value)) return createEmptyCalibrationStore();
      return {
        schemaVersion: 2,
        shortWindowObservations: value.shortWindowObservations.filter(
          isStorageObject,
        ) as ShortWindowObservation[],
        workloadObservations: value.workloadObservations.filter(
          isStorageObject,
        ) as WorkloadCalibrationObservation[],
      };
    }
    return createEmptyCalibrationStore();
  } catch {
    return createEmptyCalibrationStore();
  }
}

function saveCalibrationStore(storeValue: CalibrationStoreV2): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(CALIBRATION_KEY, JSON.stringify(storeValue));
  } catch {
    // Storage can be unavailable in private or restricted browsing contexts.
  }
}

export function appendShortWindowObservation(
  observation: ShortWindowObservation,
): CalibrationStoreV2 {
  const next = loadCalibrationStore();
  next.shortWindowObservations.push(observation);
  saveCalibrationStore(next);
  return next;
}

export function appendWorkloadObservation(
  observation: WorkloadCalibrationObservation,
): CalibrationStoreV2 {
  const next = loadCalibrationStore();
  next.workloadObservations.push(observation);
  saveCalibrationStore(next);
  return next;
}

export function deleteCalibrationObservation(id: string): CalibrationStoreV2 {
  const next = loadCalibrationStore();
  next.shortWindowObservations = next.shortWindowObservations.filter(
    (observation) => observation.id !== id,
  );
  next.workloadObservations = next.workloadObservations.filter(
    (observation) => observation.id !== id,
  );
  saveCalibrationStore(next);
  return next;
}

export function clearCalibration(): CalibrationStoreV2 {
  const empty = createEmptyCalibrationStore();
  saveCalibrationStore(empty);
  return empty;
}
