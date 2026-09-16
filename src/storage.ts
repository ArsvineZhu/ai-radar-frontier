import { HOST_ID, STRATEGY_KEYS, SUBSCRIPTION_KEYS } from "./config.js";

const STORAGE_KEY = `${HOST_ID}:preferences`;

export interface UserPreferences {
  subscription?: string;
  sortStrategy?: string;
  fastEnabled?: boolean;
}

function isObject(value: unknown): value is Record<string, unknown> {
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
