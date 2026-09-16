import {
  DEFAULT_STRATEGY,
  HOST_ID,
  IQ_MINIMUM,
  SELECTORS,
  SOURCE_STATUS_PATTERNS,
  STRATEGY_KEYS,
  SUBSCRIPTION_KEYS,
  TARGET_MODE,
  VERSION,
  createState,
} from "./config.js";
import type { RuntimeState } from "./config.js";
import {
  animateDisclosureToggle,
  clearDisclosureAnimation,
  clearGridAnimation,
  measureGridViewport,
  resetDisclosureStyles,
  resetGridViewport,
  syncGridViewport,
} from "./animations.js";
import {
  createStrategyCatalog,
  createSubscriptionCatalog,
  getCopy,
  getLocale,
} from "./i18n.js";
import { buildStrategyResult } from "./recommendation.js";
import type { StrategyResult } from "./recommendation.js";
import { loadRadarSnapshot } from "./radar.js";
import type { RadarSnapshot } from "./radar.js";
import { isValidRecord } from "./scoring.js";
import { loadPreferences, savePreferences } from "./storage.js";
import {
  createShellMarkup,
  makeElement,
  renderCard,
  renderEmpty,
  renderExclusionItem,
  renderSkeleton,
  styles,
} from "./ui.js";

function isSupportedPage() {
  const pageUrl = new URL(window.location.href);
  return (
    pageUrl.hostname === "codexradar.com" &&
    ["/", "/en", "/en/"].includes(pageUrl.pathname)
  );
}

function getElement<T extends Element = Element>(
  state: RuntimeState,
  selector: string,
): T | null {
  return state.shadow?.querySelector<T>(selector) || null;
}

function setText(state: RuntimeState, selector: string, text: string) {
  const element = getElement(state, selector);
  if (element) {
    element.textContent = text;
  }
}

function announce(state: RuntimeState, message: string) {
  setText(state, SELECTORS.announcer, message);
}

function getStrategy(strategies, strategyKey) {
  return strategies[strategyKey] || strategies[DEFAULT_STRATEGY];
}

function getSubscription(subscriptions, subscriptionKey) {
  return subscriptions[subscriptionKey] || subscriptions.plus;
}

function strategyDescription(copy, strategyKey) {
  return (
    copy.strategyDescriptions[strategyKey] ||
    copy.strategyDescriptions.effectiveness
  );
}

interface RadarRuntimeState {
  snapshot: RadarSnapshot | null;
  error: Error | null;
  request: Promise<void> | null;
}

function syncStrategyControl(
  state: RuntimeState,
  copy,
  strategies,
  subscriptions,
) {
  const trigger = getElement<HTMLButtonElement>(state, SELECTORS.menuTrigger);
  const value = getElement<HTMLElement>(state, "[data-cr-menu-value]");
  const options =
    state.shadow?.querySelectorAll<HTMLButtonElement>(SELECTORS.menuOption) ||
    [];
  const strategy = getStrategy(strategies, state.sortStrategy);
  const subscription = getSubscription(subscriptions, state.subscription);
  const multiplier = copy.subscriptionMultipliers[state.subscription] || "1×";

  if (value) {
    value.textContent = `${multiplier} ${strategy.label}${state.fastEnabled ? ` ${copy.fast}` : ""}`;
  }
  if (trigger instanceof HTMLButtonElement) {
    trigger.setAttribute(
      "aria-label",
      `${copy.sort}: ${subscription.label}, ${strategy.label}`,
    );
  }
  options.forEach((option) => {
    const sortSelected = option.dataset.crSortOption === state.sortStrategy;
    const subscriptionSelected =
      option.dataset.crSubscriptionOption === state.subscription;
    option.setAttribute(
      "aria-checked",
      String(sortSelected || subscriptionSelected),
    );
  });
}

function syncFastControl(state: RuntimeState, copy) {
  const toggle = getElement<HTMLInputElement>(state, SELECTORS.fastToggle);
  const label = getElement<HTMLElement>(state, SELECTORS.fastLabel);
  if (toggle instanceof HTMLInputElement) {
    toggle.checked = state.fastEnabled;
  }
  if (label instanceof HTMLElement) {
    label.textContent = state.fastEnabled ? copy.fastInclude : copy.fastExclude;
  }
}

function syncControls(state: RuntimeState, copy, strategies, subscriptions) {
  syncStrategyControl(state, copy, strategies, subscriptions);
  syncFastControl(state, copy);
}

function persistPreferences(state: RuntimeState): void {
  savePreferences({
    subscription: state.subscription,
    sortStrategy: state.sortStrategy,
    fastEnabled: state.fastEnabled,
  });
}

function syncExpandControl(
  state: RuntimeState,
  copy,
  metrics,
  fallenWinnerLabels,
) {
  const wrap = getElement<HTMLElement>(state, SELECTORS.expandWrap);
  const button = getElement<HTMLButtonElement>(state, SELECTORS.expand);
  const label = getElement<HTMLElement>(state, SELECTORS.expandLabel);
  if (
    !(wrap instanceof HTMLElement) ||
    !(button instanceof HTMLButtonElement) ||
    !(label instanceof HTMLElement)
  ) {
    return;
  }

  if (!metrics.hasOverflow) {
    state.expanded = false;
    wrap.hidden = true;
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", copy.expandAria);
    button.dataset.hasFallen = "false";
    label.textContent = "";
    return;
  }

  wrap.hidden = false;
  button.setAttribute("aria-expanded", String(state.expanded));
  const fallenCount = state.expanded ? 0 : fallenWinnerLabels.length;
  button.dataset.hasFallen = String(fallenCount > 0);
  if (fallenCount > 0) {
    label.textContent = copy.fallenHint(fallenCount);
    button.setAttribute("aria-label", copy.fallenHintAria(fallenCount));
  } else {
    label.textContent = "";
    button.setAttribute(
      "aria-label",
      state.expanded ? copy.collapseAria : copy.expandAria,
    );
  }
}

function updateDisclosure(
  state,
  copy,
  strategy,
  dominated,
  quotaExcluded,
  invalidCount,
  lowIqCount,
  totalCount,
  fastSummary,
) {
  const disclosure = getElement<HTMLDetailsElement>(
    state,
    SELECTORS.disclosure,
  );
  const body = getElement<HTMLElement>(state, SELECTORS.disclosureBody);
  const content = getElement<HTMLElement>(state, SELECTORS.disclosureContent);
  const notes = getElement<HTMLElement>(state, SELECTORS.disclosureNotes);
  const label = getElement<HTMLElement>(state, SELECTORS.disclosureLabel);
  if (!disclosure || !body || !content || !notes || !label) {
    return;
  }

  const wasOpen = disclosure.open;
  clearDisclosureAnimation(state.animations);
  resetDisclosureStyles(disclosure, body);
  disclosure.hidden = false;
  const excludedRecords = [...dominated, ...quotaExcluded];
  label.textContent =
    excludedRecords.length > 0
      ? copy.excluded(excludedRecords.length)
      : copy.dominanceCheck;
  content.replaceChildren();
  notes.replaceChildren();
  notes.hidden = true;

  notes.append(
    makeElement("p", "cr-exclusion-note", copy.qualityDataNote),
    makeElement("p", "cr-exclusion-note", copy.quotaDataNote),
  );

  if (excludedRecords.length > 0) {
    const list = makeElement("ul", "cr-exclusion-list");
    for (const record of excludedRecords) {
      list.append(renderExclusionItem(record, copy.recommendationScore, copy));
    }
    content.append(list);
  } else {
    content.append(
      renderEmpty(copy.noDominatedTitle, copy.noDominatedDescription, copy, {
        icon: "✓",
      }),
    );
  }

  if (fastSummary?.fastCandidateCount > 0) {
    notes.append(
      makeElement(
        "p",
        "cr-exclusion-note",
        copy.fastNote({
          included: fastSummary.fastCandidateCount,
          exact: fastSummary.fastExactCount,
          model: fastSummary.fastModelCount,
          generation: fastSummary.fastGenerationCount,
          omitted: fastSummary.fastOmittedCount,
          frontier: fastSummary.fastFrontierCount,
        }),
      ),
    );
  }
  if (fastSummary?.quotaExcluded.length > 0) {
    notes.append(
      makeElement(
        "p",
        "cr-exclusion-note",
        copy.quotaGateNote({
          overLimit: fastSummary.quotaOverLimitCount,
          unknown: fastSummary.quotaUnknownCount,
          limit: fastSummary.quotaLimit,
        }),
      ),
    );
  }
  if (lowIqCount > 0) {
    notes.append(
      makeElement("p", "cr-exclusion-note", copy.lowIqNote(lowIqCount)),
    );
  }
  if (invalidCount > 0) {
    notes.append(
      makeElement("p", "cr-exclusion-note", copy.invalidNote(invalidCount)),
    );
  }
  if (
    totalCount > 0 &&
    excludedRecords.length === 0 &&
    lowIqCount === 0 &&
    invalidCount === 0
  ) {
    notes.append(makeElement("p", "cr-exclusion-note", copy.dominanceRule));
  }
  notes.hidden = notes.childElementCount === 0;
  disclosure.open = wasOpen;
}

function renderInactive(
  state: RuntimeState,
  copy,
  mode,
  strategies,
  subscriptions,
) {
  const root = getElement<HTMLElement>(state, SELECTORS.root);
  const grid = getElement<HTMLElement>(state, SELECTORS.grid);
  const shell = getElement<HTMLElement>(state, SELECTORS.gridShell);
  const disclosure = getElement<HTMLDetailsElement>(
    state,
    SELECTORS.disclosure,
  );
  if (!root || !grid || !disclosure) {
    return;
  }

  const modeName = copy.modeNames[mode] || copy.currentAbilityPage;
  root.dataset.state = "inactive";
  root.removeAttribute("aria-busy");
  resetGridViewport(state.animations, state, shell);
  clearDisclosureAnimation(state.animations);
  disclosure.open = false;
  grid.replaceChildren(
    renderEmpty(copy.inactiveTitle, copy.inactiveDescription(modeName), copy),
  );
  disclosure.hidden = true;
  syncControls(state, copy, strategies, subscriptions);
  syncExpandControl(state, copy, { hasOverflow: false }, []);
  announce(state, copy.announcedInactive(modeName));
}

function renderLoading(
  state: RuntimeState,
  copy,
  strategies,
  subscriptions,
  message = copy.loading,
) {
  const root = getElement<HTMLElement>(state, SELECTORS.root);
  const grid = getElement<HTMLElement>(state, SELECTORS.grid);
  const shell = getElement<HTMLElement>(state, SELECTORS.gridShell);
  const disclosure = getElement<HTMLDetailsElement>(
    state,
    SELECTORS.disclosure,
  );
  if (!root || !grid || !disclosure) {
    return;
  }

  root.dataset.state = "loading";
  root.setAttribute("aria-busy", "true");
  resetGridViewport(state.animations, state, shell);
  clearDisclosureAnimation(state.animations);
  disclosure.open = false;
  renderSkeleton(grid);
  disclosure.hidden = true;
  syncControls(state, copy, strategies, subscriptions);
  syncExpandControl(state, copy, { hasOverflow: false }, []);
  announce(state, message);
}

function renderError(
  state: RuntimeState,
  copy,
  strategies,
  subscriptions,
  message,
  retryRadar,
) {
  const root = getElement<HTMLElement>(state, SELECTORS.root);
  const grid = getElement<HTMLElement>(state, SELECTORS.grid);
  const shell = getElement<HTMLElement>(state, SELECTORS.gridShell);
  const disclosure = getElement<HTMLDetailsElement>(
    state,
    SELECTORS.disclosure,
  );
  if (!root || !grid || !disclosure) {
    return;
  }

  root.dataset.state = "error";
  root.removeAttribute("aria-busy");
  resetGridViewport(state.animations, state, shell);
  clearDisclosureAnimation(state.animations);
  disclosure.open = false;
  grid.replaceChildren(
    renderEmpty(copy.errorTitle, message, copy, {
      retry: true,
      icon: "!",
      onRetry: () => {
        retryRadar?.();
        const refresh = state.source?.querySelector(SELECTORS.refresh);
        if (refresh instanceof HTMLElement) {
          refresh.click();
        }
      },
    }),
  );
  disclosure.hidden = true;
  syncControls(state, copy, strategies, subscriptions);
  syncExpandControl(state, copy, { hasOverflow: false }, []);
  announce(state, message);
}

function replaceGridChildren(state: RuntimeState, grid: HTMLElement, children) {
  clearGridAnimation(state.animations);
  grid.replaceChildren(...children);
}

function renderData(
  state: RuntimeState,
  copy,
  strategies,
  subscriptions,
  snapshot: RadarSnapshot,
  openDetail,
) {
  const root = getElement<HTMLElement>(state, SELECTORS.root);
  const grid = getElement<HTMLElement>(state, SELECTORS.grid);
  const shell = getElement<HTMLElement>(state, SELECTORS.gridShell);
  if (!root || !grid) {
    return;
  }

  const animateCardEntries = state.animateCardsOnNextRender;
  state.animateCardsOnNextRender = true;
  const records = snapshot.records;
  const validRecords = records.filter(isValidRecord);
  const invalidCount = records.length - validRecords.length;
  const lowIqCount = validRecords.filter(
    (record) => record.iq < IQ_MINIMUM,
  ).length;
  const standardRecords = validRecords.filter(
    (record) => record.iq >= IQ_MINIMUM,
  );
  const strategyResults: Record<string, StrategyResult> = {};
  for (const strategyKey of STRATEGY_KEYS) {
    strategyResults[strategyKey] = buildStrategyResult(
      standardRecords,
      snapshot.fastEstimator,
      strategyKey,
      state.subscription,
      state.fastEnabled,
    );
  }

  const strategyKey = STRATEGY_KEYS.includes(state.sortStrategy)
    ? state.sortStrategy
    : DEFAULT_STRATEGY;
  state.sortStrategy = strategyKey;
  const currentResult = strategyResults[strategyKey];
  const { frontier, dominated, quotaExcluded } = currentResult;
  const orderedFrontier = currentResult.orderedFrontier;
  const strategyWinners = new Map<string, string[]>();
  for (const key of STRATEGY_KEYS) {
    const winner = strategyResults[key].orderedFrontier[0];
    if (winner) {
      const labels = strategyWinners.get(winner.key) || [];
      labels.push(strategies[key].winnerLabel);
      strategyWinners.set(winner.key, labels);
    }
  }

  const strategy = strategies[strategyKey];
  const ranks = new Map(
    orderedFrontier.map((record, index) => [record.key, index + 1]),
  );
  root.dataset.state = "ready";
  root.removeAttribute("aria-busy");
  syncControls(state, copy, strategies, subscriptions);

  const nextChildren = [];
  for (const record of orderedFrontier) {
    nextChildren.push(
      renderCard(
        record,
        ranks.get(record.key) || 0,
        strategy,
        strategyWinners.get(record.key) || [],
        strategyDescription(copy, strategyKey),
        copy,
        animateCardEntries,
        openDetail,
      ),
    );
  }
  if (frontier.length === 0) {
    const noModels = standardRecords.length === 0;
    const quotaBlocked = !noModels && quotaExcluded.length > 0;
    const emptyTitle = noModels
      ? copy.noModelsTitle
      : quotaBlocked
        ? copy.noQuotaModelsTitle
        : copy.noValidTitle;
    const emptyDescription = noModels
      ? copy.noModelsDescription
      : quotaBlocked
        ? copy.noQuotaModelsDescription
        : copy.noValidDescription;
    nextChildren.push(renderEmpty(emptyTitle, emptyDescription, copy));
  }
  replaceGridChildren(state, grid, nextChildren);

  const viewportMetrics =
    shell instanceof HTMLElement
      ? syncGridViewport(state.animations, state, grid, shell)
      : measureGridViewport(grid);
  const fallenWinnerLabels = [];
  for (const [winnerKey, labels] of strategyWinners) {
    const winnerIndex = orderedFrontier.findIndex(
      (record) => record.key === winnerKey,
    );
    if (winnerIndex >= viewportMetrics.visibleCount) {
      fallenWinnerLabels.push(...labels);
    }
  }
  syncExpandControl(state, copy, viewportMetrics, fallenWinnerLabels);
  updateDisclosure(
    state,
    copy,
    strategy,
    dominated,
    quotaExcluded,
    invalidCount,
    lowIqCount,
    records.length,
    currentResult,
  );
  announce(
    state,
    copy.announced(
      frontier.length,
      strategy.label,
      currentResult.fastCandidateCount,
    ),
  );
}

function getTheme() {
  const explicitTheme = document.documentElement.dataset.theme;
  if (explicitTheme === "light") {
    return "light";
  }
  if (explicitTheme === "dark") {
    return "dark";
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function syncTheme(state: RuntimeState) {
  if (state.host) {
    state.host.dataset.crTheme = getTheme();
  }
}

function render(
  state: RuntimeState,
  copy,
  strategies,
  subscriptions,
  openDetail,
  scheduleRender,
  radarState: RadarRuntimeState,
) {
  state.renderQueued = false;
  const source = document.querySelector<HTMLElement>(SELECTORS.source);
  if (!source || !state.shadow) {
    return;
  }
  state.hasRendered = true;

  if (state.source !== source) {
    observeSource(state, source, scheduleRender);
  }

  const mode = source.dataset.efficiencyMode;
  if (mode !== TARGET_MODE) {
    renderInactive(state, copy, mode, strategies, subscriptions);
    return;
  }

  const sourceText = source.textContent || "";
  const failed = SOURCE_STATUS_PATTERNS.failed.test(sourceText);
  const loading = !failed && SOURCE_STATUS_PATTERNS.loading.test(sourceText);
  if (!radarState.snapshot && (loading || !radarState.error)) {
    renderLoading(state, copy, strategies, subscriptions);
    return;
  }
  if (!radarState.snapshot) {
    renderError(
      state,
      copy,
      strategies,
      subscriptions,
      failed || radarState.error ? copy.errorLoading : copy.errorMissing,
      () => {
        radarState.error = null;
        loadRadarData(radarState, copy, scheduleRender);
      },
    );
    return;
  }
  renderData(
    state,
    copy,
    strategies,
    subscriptions,
    radarState.snapshot,
    openDetail,
  );
}

function queueRender(state: RuntimeState, renderCallback, animateCards = true) {
  if (!animateCards) {
    state.animateCardsOnNextRender = false;
  }
  if (state.renderQueued) {
    return;
  }
  state.renderQueued = true;
  window.clearTimeout(state.renderTimer);
  state.renderTimer = window.setTimeout(renderCallback, 80);
}

function observeSource(
  state: RuntimeState,
  source: HTMLElement,
  renderCallback,
) {
  state.observers.source?.disconnect();
  state.source = source;
  state.observers.source = new MutationObserver(() => renderCallback());
  state.observers.source.observe(source, {
    attributes: true,
    attributeFilter: [
      "class",
      "data-efficiency-mode",
      "data-model",
      "data-effort",
      "style",
      "aria-label",
    ],
    characterData: true,
    childList: true,
    subtree: true,
  });
}

function observeFastSource(
  state: RuntimeState,
  source: HTMLElement,
  renderCallback,
) {
  state.observers.fast?.disconnect();
  state.fastSource = source;
  state.observers.fast = new MutationObserver(() => renderCallback());
  state.observers.fast.observe(source, {
    attributes: true,
    attributeFilter: [
      "class",
      "data-fast-run-id",
      "data-fast-current-effort",
      "data-fast-simple-effort",
    ],
    characterData: true,
    childList: true,
    subtree: true,
  });
}

function loadRadarData(
  radarState: RadarRuntimeState,
  copy,
  renderCallback,
): void {
  if (radarState.request) {
    return;
  }
  const fastRoot = document.querySelector<HTMLElement>(SELECTORS.fastSource);
  const quotaRoot = document.querySelector<HTMLElement>(SELECTORS.quotaSource);
  radarState.request = loadRadarSnapshot(copy, fastRoot, quotaRoot)
    .then((snapshot) => {
      radarState.snapshot = snapshot;
      radarState.error = null;
      radarState.request = null;
      renderCallback();
    })
    .catch((error: unknown) => {
      radarState.snapshot = null;
      radarState.error =
        error instanceof Error ? error : new Error(String(error));
      radarState.request = null;
      renderCallback();
    });
}

function openOriginalDetail(state: RuntimeState, copy, record, renderCallback) {
  const baseRecord = record.baseRecord || record;
  const source = document.querySelector<HTMLElement>(SELECTORS.source);
  const original = source
    ? Array.from(source.querySelectorAll<HTMLElement>(SELECTORS.card)).find(
        (card) =>
          card.dataset.model === baseRecord.model &&
          card.dataset.effort === baseRecord.effort,
      )
    : null;
  if (!(original instanceof HTMLElement)) {
    announce(state, copy.announcedOriginalChanged);
    renderCallback();
    return;
  }

  const reducedMotion = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  original.scrollIntoView({
    behavior: reducedMotion ? "auto" : "smooth",
    block: "center",
    inline: "nearest",
  });
  original.focus({ preventScroll: true });
  original.click();
}

function releaseDetachedHost(state: RuntimeState) {
  if (!state.host || document.contains(state.host)) {
    return;
  }

  clearGridAnimation(state.animations);
  clearDisclosureAnimation(state.animations);
  const pageObserver = state.observers.page;
  state.observers.source?.disconnect();
  state.observers.fast?.disconnect();
  state.observers.theme?.disconnect();
  state.observers.gridResize?.disconnect();
  state.mediaQuery?.removeEventListener?.("change", () => syncTheme(state));
  state.observers = {
    source: null,
    fast: null,
    page: pageObserver,
    theme: null,
    gridResize: null,
  };
  state.mediaQuery = null;
  state.source = null;
  state.fastSource = null;
  state.shadow = null;
  state.host = null;
  state.gridWidth = null;
  state.hasRendered = false;
}

function mount(
  state: RuntimeState,
  copy,
  strategies,
  subscriptions,
  radarState: RadarRuntimeState,
  renderCallback,
  renderFastCallback,
) {
  releaseDetachedHost(state);
  if (state.host || document.getElementById(HOST_ID)) {
    return true;
  }

  const header =
    document.querySelector(".shell > header") ||
    document.querySelector("header");
  if (!(header instanceof HTMLElement)) {
    return false;
  }

  const host = document.createElement("section");
  host.id = HOST_ID;
  host.className = "ai-radar-frontier-host";
  host.dataset.crVersion = VERSION;
  host.setAttribute("aria-label", copy.title);
  header.insertAdjacentElement("afterend", host);

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>${styles}</style>${createShellMarkup(copy, strategies, subscriptions, state)}`;
  state.host = host;
  state.shadow = shadow;
  syncTheme(state);

  const grid = shadow.querySelector<HTMLElement>(SELECTORS.grid);
  if (grid instanceof HTMLElement && typeof ResizeObserver === "function") {
    state.observers.gridResize = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width * 100) / 100;
      if (width === state.gridWidth) {
        return;
      }
      state.gridWidth = width;
      if (state.hasRendered) {
        renderCallback(false);
      }
    });
    state.observers.gridResize.observe(grid);
  }

  const menu = shadow.querySelector<HTMLElement>(SELECTORS.menu);
  const menuTrigger = shadow.querySelector<HTMLButtonElement>(
    SELECTORS.menuTrigger,
  );
  const menuContent = shadow.querySelector<HTMLElement>(SELECTORS.menuContent);
  const menuOptions = Array.from(
    shadow.querySelectorAll<HTMLButtonElement>(SELECTORS.menuOption),
  );
  const setMenuOpen = (open, focusSelected = false) => {
    if (
      !(menuTrigger instanceof HTMLButtonElement) ||
      !(menuContent instanceof HTMLElement)
    ) {
      return;
    }
    state.menuOpen = open;
    menuContent.dataset.open = String(open);
    menuContent.setAttribute("aria-hidden", String(!open));
    menuTrigger.setAttribute("aria-expanded", String(open));
    if (open && focusSelected) {
      const selected = menuOptions.find(
        (option) => option.getAttribute("aria-checked") === "true",
      );
      (selected || menuOptions[0])?.focus();
    }
  };
  if (
    menu instanceof HTMLElement &&
    menuTrigger instanceof HTMLButtonElement &&
    menuContent instanceof HTMLElement
  ) {
    menuTrigger.addEventListener("click", (event) => {
      setMenuOpen(!state.menuOpen, event.detail === 0 && !state.menuOpen);
    });
    menuTrigger.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
        return;
      }
      event.preventDefault();
      setMenuOpen(true, true);
      if (event.key === "ArrowUp") {
        const selectedIndex = menuOptions.findIndex(
          (option) => option.getAttribute("aria-checked") === "true",
        );
        (
          menuOptions[
            selectedIndex > 0 ? selectedIndex - 1 : menuOptions.length - 1
          ] || menuOptions[0]
        )?.focus();
      }
    });
    menuOptions.forEach((option, index) => {
      option.addEventListener("click", () => {
        const selectedStrategy = option.dataset.crSortOption;
        const selectedSubscription = option.dataset.crSubscriptionOption;
        if (STRATEGY_KEYS.includes(selectedStrategy)) {
          state.sortStrategy = selectedStrategy;
        }
        if (SUBSCRIPTION_KEYS.includes(selectedSubscription)) {
          state.subscription = selectedSubscription;
        }
        persistPreferences(state);
        setMenuOpen(false);
        menuTrigger.focus();
        renderCallback();
      });
      option.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const delta = event.key === "ArrowDown" ? 1 : -1;
          menuOptions[
            (index + delta + menuOptions.length) % menuOptions.length
          ]?.focus();
        } else if (event.key === "Escape") {
          event.preventDefault();
          setMenuOpen(false);
          menuTrigger.focus();
        }
      });
    });
    shadow.addEventListener("click", (event) => {
      if (!(event.target instanceof Node) || !menu.contains(event.target)) {
        setMenuOpen(false);
      }
    });
  }

  const fastToggle = shadow.querySelector(SELECTORS.fastToggle);
  if (fastToggle instanceof HTMLInputElement) {
    fastToggle.checked = state.fastEnabled;
    fastToggle.addEventListener("change", () => {
      state.fastEnabled = fastToggle.checked;
      persistPreferences(state);
      renderCallback();
    });
  }

  const expandButton = shadow.querySelector(SELECTORS.expand);
  if (expandButton instanceof HTMLButtonElement) {
    expandButton.addEventListener("click", () => {
      state.animateCardsOnNextRender = false;
      state.expanded = !state.expanded;
      renderCallback();
    });
  }

  const disclosure = shadow.querySelector<HTMLDetailsElement>(
    SELECTORS.disclosure,
  );
  const disclosureSummary = disclosure?.querySelector("summary");
  const disclosureBody = shadow.querySelector<HTMLElement>(
    SELECTORS.disclosureBody,
  );
  if (
    disclosure instanceof HTMLDetailsElement &&
    disclosureSummary instanceof HTMLElement &&
    disclosureBody instanceof HTMLElement
  ) {
    disclosureSummary.addEventListener("click", (event) => {
      event.preventDefault();
      animateDisclosureToggle(state.animations, disclosure, disclosureBody);
    });
  }

  const infoButton = shadow.querySelector(SELECTORS.info);
  const infoWrap = shadow.querySelector(SELECTORS.infoWrap);
  const infoTooltip = shadow.querySelector(SELECTORS.infoTooltip);
  const infoPanel = shadow.querySelector(SELECTORS.panel);
  const positionInfoTooltip = () => {
    if (
      !(infoWrap instanceof HTMLElement) ||
      !(infoTooltip instanceof HTMLElement) ||
      !(infoPanel instanceof HTMLElement)
    ) {
      return;
    }
    const wrapRect = infoWrap.getBoundingClientRect();
    const tooltipRect = infoTooltip.getBoundingClientRect();
    const panelRect = infoPanel.getBoundingClientRect();
    const padding = 12;
    const preferredLeft = wrapRect.right - tooltipRect.width;
    const minimumLeft = panelRect.left + padding;
    const maximumLeft = Math.max(
      minimumLeft,
      panelRect.right - tooltipRect.width - padding,
    );
    const clampedLeft = Math.min(
      Math.max(preferredLeft, minimumLeft),
      maximumLeft,
    );
    infoTooltip.style.left = `${clampedLeft - wrapRect.left}px`;
    infoTooltip.style.right = "auto";
  };
  const closeInfo = () => {
    if (
      infoWrap instanceof HTMLElement &&
      infoButton instanceof HTMLButtonElement
    ) {
      infoWrap.dataset.open = "false";
      infoButton.setAttribute("aria-expanded", "false");
    }
  };
  if (
    infoButton instanceof HTMLButtonElement &&
    infoWrap instanceof HTMLElement
  ) {
    infoButton.addEventListener("click", (event) => {
      event.stopPropagation();
      const open = infoWrap.dataset.open !== "true";
      infoWrap.dataset.open = String(open);
      infoButton.setAttribute("aria-expanded", String(open));
      positionInfoTooltip();
    });
    infoButton.addEventListener("mouseenter", positionInfoTooltip);
    infoButton.addEventListener("focus", positionInfoTooltip);
    infoButton.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeInfo();
        infoButton.blur();
      }
    });
    shadow.addEventListener("click", (event) => {
      if (!(event.target instanceof Node) || !infoWrap.contains(event.target)) {
        closeInfo();
      }
    });
    window.addEventListener("resize", positionInfoTooltip, { passive: true });
    positionInfoTooltip();
  }
  window.addEventListener("resize", () => renderCallback(false), {
    passive: true,
  });

  const source = document.querySelector<HTMLElement>(SELECTORS.source);
  if (source) {
    observeSource(state, source, renderCallback);
  }
  const fastSource = document.querySelector<HTMLElement>(SELECTORS.fastSource);
  if (fastSource) {
    observeFastSource(state, fastSource, renderFastCallback);
  }
  loadRadarData(radarState, copy, renderCallback);

  state.observers.theme = new MutationObserver(() => syncTheme(state));
  state.observers.theme.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  state.mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
  state.mediaQuery?.addEventListener?.("change", () => syncTheme(state));
  renderCallback();
  return true;
}

function observePage(
  state: RuntimeState,
  mountCallback,
  renderCallback,
  renderFastCallback,
) {
  if (state.observers.page) {
    return;
  }
  state.observers.page = new MutationObserver(() => {
    if (!state.host || !document.contains(state.host)) {
      if (!mountCallback()) {
        return;
      }
    }
    const source = document.querySelector<HTMLElement>(SELECTORS.source);
    if (source && state.source !== source) {
      observeSource(state, source, renderCallback);
      renderCallback();
    }
    const fastSource = document.querySelector<HTMLElement>(
      SELECTORS.fastSource,
    );
    if (fastSource && state.fastSource !== fastSource) {
      observeFastSource(state, fastSource, renderFastCallback);
      renderCallback();
    }
  });
  state.observers.page.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function start() {
  if (!isSupportedPage() || document.getElementById(HOST_ID)) {
    return;
  }

  const state = createState();
  const preferences = loadPreferences();
  if (preferences.subscription) {
    state.subscription = preferences.subscription;
  }
  if (preferences.sortStrategy) {
    state.sortStrategy = preferences.sortStrategy;
  }
  if (preferences.fastEnabled !== undefined) {
    state.fastEnabled = preferences.fastEnabled;
  }
  const radarState: RadarRuntimeState = {
    snapshot: null,
    error: null,
    request: null,
  };
  const copy = getCopy(getLocale());
  const strategies = createStrategyCatalog(copy);
  const subscriptions = createSubscriptionCatalog(copy);
  const renderCallback = (animateCards = true) =>
    queueRender(
      state,
      () =>
        render(
          state,
          copy,
          strategies,
          subscriptions,
          openOriginalDetailCallback,
          renderCallback,
          radarState,
        ),
      animateCards,
    );
  const renderFastCallback = () => renderCallback();
  const openOriginalDetailCallback = (record) =>
    openOriginalDetail(state, copy, record, renderCallback);
  const mountCallback = () =>
    mount(
      state,
      copy,
      strategies,
      subscriptions,
      radarState,
      renderCallback,
      renderFastCallback,
    );

  mountCallback();
  observePage(state, mountCallback, renderCallback, renderFastCallback);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
