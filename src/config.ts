export const VERSION = "1.0.0";
export const HOST_ID = "ai-radar-frontier-userscript";

export const SELECTORS = Object.freeze({
  source: "#intelligence-efficiency",
  card: "[data-efficiency-card]",
  fastSource: "#fast-radar",
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
export const DEFAULT_SUBSCRIPTION = "plus";
export const DEFAULT_STRATEGY = "quality";
const DEFAULT_FAST_ENABLED = true;
export const IQ_MINIMUM = 70;
export const IQ_SATURATION = 100;
export const FAST_COST_MULTIPLIER = 2.5;
export const FAST_E2E_DECAY_EXPONENT = 0.9;
export const FAST_MEASURED_MODEL = "gpt-6-astra";
export const FAST_DEFAULT_MULTIPLIERS = Object.freeze({
  astra: 2,
  other: 1.5,
});
export const GRID_MIN_VISIBLE_CARDS = 4;
export const GRID_PREVIEW_HEIGHT = 72;
export const STRATEGY_KEYS = Object.freeze([
  "quality",
  "effectiveness",
  "budget",
  "speed",
]);
export const SUBSCRIPTION_KEYS = Object.freeze(["plus", "pro5", "pro20"]);
export const EFFORT_ORDER = Object.freeze([
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
]);
export const SOURCE_STATUS_PATTERNS = Object.freeze({
  failed: /失败|错误|暂不可用|重试|unavailable|error|retry/i,
  loading:
    /正在读取|正在加载|读取效能数据|loading update time|loading performance data/i,
});

export const SUBSCRIPTION_WEIGHTS = Object.freeze({
  [DEFAULT_SUBSCRIPTION]: Object.freeze({
    quality: Object.freeze({
      qualityWeight: 0.85,
      feeWeight: 0.1,
      timeWeight: 0.05,
    }),
    effectiveness: Object.freeze({
      qualityWeight: 0.6,
      feeWeight: 0.2,
      timeWeight: 0.2,
    }),
    budget: Object.freeze({
      qualityWeight: 0.25,
      feeWeight: 0.65,
      timeWeight: 0.1,
    }),
    speed: Object.freeze({
      qualityWeight: 0.25,
      feeWeight: 0.1,
      timeWeight: 0.65,
    }),
  }),
  pro5: Object.freeze({
    quality: Object.freeze({
      qualityWeight: 0.88,
      feeWeight: 0.04,
      timeWeight: 0.08,
    }),
    effectiveness: Object.freeze({
      qualityWeight: 0.68,
      feeWeight: 0.12,
      timeWeight: 0.2,
    }),
    budget: Object.freeze({
      qualityWeight: 0.32,
      feeWeight: 0.5,
      timeWeight: 0.18,
    }),
    speed: Object.freeze({
      qualityWeight: 0.3,
      feeWeight: 0.04,
      timeWeight: 0.66,
    }),
  }),
  pro20: Object.freeze({
    quality: Object.freeze({
      qualityWeight: 0.9,
      feeWeight: 0.02,
      timeWeight: 0.08,
    }),
    effectiveness: Object.freeze({
      qualityWeight: 0.75,
      feeWeight: 0.08,
      timeWeight: 0.17,
    }),
    budget: Object.freeze({
      qualityWeight: 0.4,
      feeWeight: 0.38,
      timeWeight: 0.22,
    }),
    speed: Object.freeze({
      qualityWeight: 0.34,
      feeWeight: 0.01,
      timeWeight: 0.65,
    }),
  }),
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
