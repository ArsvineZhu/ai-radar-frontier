export const VERSION = "1.1.0";
export const HOST_ID = "ai-radar-frontier-userscript";

export const SELECTORS = Object.freeze({
  source: "#intelligence-efficiency",
  card: "[data-efficiency-card]",
  fastSource: "#fast-radar",
  fastHistoryFallback: "[data-fast-radar-history-fallback]",
  quotaSource: "#quota-radar",
  quotaValue: "strong",
  header: ".shell > header",
  fallbackHeader: "header",
  cardIq: ".intelligence-efficiency-card-iq > strong",
  cardMeta: ".intelligence-efficiency-card-meta > span",
  cardLabel: ".intelligence-efficiency-card-label",
  fastEffort: "[data-fast-current-effort]",
  fastE2e: ".fast-radar-metric-e2e strong",
  refresh: "[data-intelligence-efficiency-refresh]",
  root: "[data-cr-root]",
  grid: "[data-cr-grid]",
  gridShell: "[data-cr-grid-shell]",
  menu: "[data-cr-menu]",
  menuTrigger: "[data-cr-menu-trigger]",
  menuContent: "[data-cr-menu-content]",
  menuOption: "[data-cr-menu-option]",
  fastToggle: "[data-cr-fast-toggle]",
  fastLabel: "[data-cr-fast-label]",
  expandWrap: "[data-cr-expand-wrap]",
  expand: "[data-cr-expand]",
  expandLabel: "[data-cr-expand-label]",
  disclosure: "[data-cr-disclosure]",
  disclosureBody: "[data-cr-exclusion-body]",
  disclosureContent: "[data-cr-exclusion-content]",
  disclosureNotes: "[data-cr-exclusion-notes]",
  disclosureLabel: "[data-cr-disclosure-label]",
  announcer: "[data-cr-announcer]",
  info: "[data-cr-info]",
  infoWrap: ".cr-info-wrap",
  infoTooltip: ".cr-info-tooltip",
  panel: ".cr-panel",
});

export const TARGET_MODE = "comprehensive";
const DEFAULT_SUBSCRIPTION = "plus";
export const DEFAULT_STRATEGY = "quality";
const DEFAULT_FAST_ENABLED = true;
export const IQ_MINIMUM = 70;
export const IQ_REFERENCE = 100;
export const IQ_RESOLUTION = 4;
export const DEFAULT_WORKLOAD_ALPHA = 5;
export const FAST_COST_MULTIPLIER = 2.5;
export const FAST_MODEL_ID = "gpt-6-astra";
export const PLAN_LIMITS = Object.freeze({
  plus: Object.freeze({
    multiplier: 1,
    shortWindow: Object.freeze({
      enabled: true,
      hours: 5,
      ratioPrior: 0.155,
      ratioPriorExposure: 1,
    }),
  }),
  pro5: Object.freeze({
    multiplier: 5,
    shortWindow: Object.freeze({
      enabled: false,
      hours: 5,
      ratioPrior: 0.155,
      ratioPriorExposure: 1,
    }),
  }),
  pro20: Object.freeze({
    multiplier: 20,
    shortWindow: Object.freeze({
      enabled: false,
      hours: 5,
      ratioPrior: 0.155,
      ratioPriorExposure: 1,
    }),
  }),
});
export const RADAR_ENDPOINTS = Object.freeze({
  efficiency:
    "https://api.codexradar.com/api/v1/intelligence-efficiency?benchmark=deep-swe",
  fastHistory: "/data/fast-radar-history.json",
});
export const FAST_MEASUREMENT_MAX_AGE_DAYS = 30;
export const TIME_EQUIV_REL = 0.04;
export const WEEKLY_EQUIV_REL = 0.04;
export const ENDURANCE_EQUIV_REL = 0.08;
export const TIME_UTILITY_REFERENCE_MINUTES = 10;
export const WEEKLY_UTILITY_REFERENCE_SHARE = 0.01;
export const ENDURANCE_UTILITY_REFERENCE_MINUTES = 60;
export const STRATEGY_WEIGHTS = Object.freeze({
  effectiveness: Object.freeze({
    quality: 0.45,
    time: 0.25,
    weekly: 0.2,
    shortEndurance: 0.1,
  }),
  budget: Object.freeze({
    quality: 0.2,
    time: 0.1,
    weekly: 0.45,
    shortEndurance: 0.25,
  }),
  speed: Object.freeze({
    quality: 0.2,
    time: 0.55,
    weekly: 0.1,
    shortEndurance: 0.15,
  }),
});
export const QUALITY_BAND_WEIGHTS = Object.freeze({
  quality: 0.15,
  time: 0.4,
  weekly: 0.3,
  shortEndurance: 0.15,
});
export const IQ_EQUIV = 4;
export const FAST_GROUP_MIN_MEASUREMENTS = 6;
export const MODEL_CATALOG = Object.freeze({
  "gpt-6-astra": Object.freeze({
    label: "Astra",
    family: "astra",
    generation: "gpt-6",
    nominalFastSpeedup: 2,
    fastGroup: "gpt-6",
  }),
  "gpt-5.6-sol": Object.freeze({
    label: "Sol",
    family: "sol",
    generation: "gpt-5.6",
    nominalFastSpeedup: 1.5,
    fastGroup: "gpt-5.6",
  }),
  "gpt-5.6-terra": Object.freeze({
    label: "Terra",
    family: "terra",
    generation: "gpt-5.6",
    nominalFastSpeedup: 1.5,
    fastGroup: "gpt-5.6",
  }),
  "gpt-5.6-luna": Object.freeze({
    label: "Luna",
    family: "luna",
    generation: "gpt-5.6",
    nominalFastSpeedup: 1.5,
    fastGroup: "gpt-5.6",
  }),
  "gpt-5.5": Object.freeze({
    label: "5.5",
    family: "5.5",
    generation: "gpt-5.5",
    nominalFastSpeedup: 1.5,
    fastGroup: null,
  }),
});
export const SUPPORTED_MODEL_IDS = Object.freeze(Object.keys(MODEL_CATALOG));
export const GRID_MIN_VISIBLE_CARDS = 4;
export const GRID_PREVIEW_CARD_LIMIT = 12;
export const GRID_PREVIEW_HEIGHT = 72;
export const STRATEGY_KEYS = Object.freeze([
  "quality",
  "effectiveness",
  "budget",
  "speed",
]);
export const SUBSCRIPTION_KEYS = Object.freeze(["plus", "pro5", "pro20"]);
export const SOURCE_STATUS_PATTERNS = Object.freeze({
  failed: /失败|错误|暂不可用|重试|unavailable|error|retry/i,
  loading:
    /正在读取|正在加载|读取效能数据|loading update time|loading performance data/i,
});

interface AnimationHandle {
  token: symbol;
  cleanup(): void;
}

interface AnimationSlot {
  frame: number;
  timer: number;
  active: AnimationHandle | null;
}

export interface AnimationState {
  grid: AnimationSlot;
  disclosure: AnimationSlot;
}

export interface RuntimeState {
  host: HTMLElement | null;
  shadow: ShadowRoot | null;
  source: HTMLElement | null;
  fastSource: HTMLElement | null;
  mediaQuery: MediaQueryList | null;
  observers: {
    source: MutationObserver | null;
    fast: MutationObserver | null;
    page: MutationObserver | null;
    theme: MutationObserver | null;
    gridResize: ResizeObserver | null;
  };
  animations: AnimationState;
  renderTimer: number;
  renderQueued: boolean;
  gridWidth: number | null;
  hasRendered: boolean;
  subscription: string;
  sortStrategy: string;
  fastEnabled: boolean;
  expanded: boolean;
  animateCardsOnNextRender: boolean;
  menuOpen: boolean;
}

export function createState(): RuntimeState {
  return {
    host: null,
    shadow: null,
    source: null,
    fastSource: null,
    mediaQuery: null,
    observers: {
      source: null,
      fast: null,
      page: null,
      theme: null,
      gridResize: null,
    },
    animations: {
      grid: { frame: 0, timer: 0, active: null },
      disclosure: { frame: 0, timer: 0, active: null },
    },
    renderTimer: 0,
    renderQueued: false,
    gridWidth: null,
    hasRendered: false,
    subscription: DEFAULT_SUBSCRIPTION,
    sortStrategy: DEFAULT_STRATEGY,
    fastEnabled: DEFAULT_FAST_ENABLED,
    expanded: false,
    animateCardsOnNextRender: true,
    menuOpen: false,
  };
}
