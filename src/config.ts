export const VERSION = "1.0.1";
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
export const IQ_TARGET = 100;
export const IQ_DEFICIT_SCALE = 15;
export const IQ_SURPLUS_SCALE = 10;
export const IQ_QUALITY_TOLERANCE = 2;
export const FAST_COST_MULTIPLIER = 2.5;
export const FAST_MODEL_ID = "gpt-6-astra";
export const PLAN_MULTIPLIERS = Object.freeze({ plus: 1, pro5: 5, pro20: 20 });
export const RADAR_ENDPOINTS = Object.freeze({
  efficiency: "/data/intelligence-efficiency.json",
  fastHistory: "/data/fast-radar-history.json",
  insights: "/api/radar-insights",
  ratings: "/api/model-ratings?history=14",
});
export const HISTORY_WINDOW_SIZE = 18;
export const HISTORY_MIN_POINTS = 3;
export const HISTORY_CURRENT_WEIGHT = 0.75;
export const HISTORY_CORRECTION_LIMIT = 2;
export const UNCERTAINTY_PENALTY_LIMIT = 2;
export const ECONOMY_MAX_MINUTES = 45;
export const ECONOMY_TIME_WEIGHT = 0.15;
export const BALANCED_COST_WEIGHT = 1;
export const BALANCED_TIME_WEIGHT = 1;
export const BALANCED_QUALITY_WEIGHT = 1;
export const QUOTA_COMFORTABLE_LIMIT = 0.025;
export const QUOTA_EXPENSIVE_LIMIT = 0.05;
export const QUOTA_WEEKLY_LIMITS = Object.freeze({
  budget: QUOTA_COMFORTABLE_LIMIT,
  effectiveness: 0.04,
  quality: QUOTA_EXPENSIVE_LIMIT,
  speed: QUOTA_EXPENSIVE_LIMIT,
});
export const FAST_GENERATION_MIN_MEASUREMENTS = 3;
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
