import {
  DEFAULT_STRATEGY,
  HOST_ID,
  IQ_MINIMUM,
  GRID_PREVIEW_CARD_LIMIT,
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
  buildCalibrationSummary,
  createShortWindowObservation,
  createWorkloadObservation,
  type CalibrationStoreV1,
} from "./calibration.js";
import type { Copy } from "./i18n.js";
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
import type { ModelRecord, ScoredRecord, SubscriptionKey } from "./scoring.js";
import {
  appendShortWindowObservation,
  appendWorkloadObservation,
  clearCalibration,
  deleteCalibrationObservation,
  loadCalibrationStore,
  loadPreferences,
  savePreferences,
} from "./storage.js";
import {
  createShellMarkup,
  makeElement,
  renderCard,
  renderEmpty,
  renderExclusionItem,
  renderSkeleton,
  styles,
} from "./ui.js";

function isSupportedPage(): boolean {
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

function setText(state: RuntimeState, selector: string, text: string): void {
  const element = getElement(state, selector);
  if (element) element.textContent = text;
}

function announce(state: RuntimeState, message: string): void {
  setText(state, SELECTORS.announcer, message);
}

function getStrategy(strategies: any, strategyKey: string): any {
  return strategies[strategyKey] || strategies[DEFAULT_STRATEGY];
}

function getSubscription(subscriptions: any, subscriptionKey: string): any {
  return subscriptions[subscriptionKey] || subscriptions.plus;
}

function strategyDescription(copy: Copy, strategyKey: string): string {
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

interface RuntimeController {
  getStore(): CalibrationStoreV1;
  setStore(store: CalibrationStoreV1): void;
  getSnapshot(): RadarSnapshot | null;
  getResult(): StrategyResult | null;
  setResult(result: StrategyResult): void;
  rerender(): void;
}

function syncStrategyControl(
  state: RuntimeState,
  copy: Copy,
  strategies: any,
  subscriptions: any,
): void {
  const trigger = getElement<HTMLButtonElement>(state, SELECTORS.menuTrigger);
  const value = getElement<HTMLElement>(state, "[data-cr-menu-value]");
  const options =
    state.shadow?.querySelectorAll<HTMLButtonElement>(SELECTORS.menuOption) ||
    [];
  const strategy = getStrategy(strategies, state.sortStrategy);
  const subscription = getSubscription(subscriptions, state.subscription);
  const multiplier = copy.subscriptionMultipliers[state.subscription] || "1×";
  const selectedLabel = `${multiplier} ${strategy.label}${state.fastEnabled ? ` ${copy.fast}` : ""}`;
  if (value) value.textContent = selectedLabel;
  if (trigger instanceof HTMLButtonElement) {
    trigger.setAttribute(
      "aria-label",
      `${copy.sort}: ${subscription.label}, ${selectedLabel}`,
    );
    trigger.title = "";
  }
  options.forEach((option) => {
    const selected =
      option.dataset.crSortOption === state.sortStrategy ||
      option.dataset.crSubscriptionOption === state.subscription;
    option.setAttribute("aria-checked", String(selected));
  });
}

function syncFastControl(state: RuntimeState, copy: Copy): void {
  const toggle = getElement<HTMLInputElement>(state, SELECTORS.fastToggle);
  const label = getElement<HTMLElement>(state, SELECTORS.fastLabel);
  if (toggle) toggle.checked = state.fastEnabled;
  if (label)
    label.textContent = state.fastEnabled ? copy.fastInclude : copy.fastExclude;
}

function syncControls(
  state: RuntimeState,
  copy: Copy,
  strategies: any,
  subscriptions: any,
): void {
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
  copy: Copy,
  metrics: { hasOverflow: boolean },
  fallenLabels: string[],
): void {
  const wrap = getElement<HTMLElement>(state, SELECTORS.expandWrap);
  const button = getElement<HTMLButtonElement>(state, SELECTORS.expand);
  const label = getElement<HTMLElement>(state, SELECTORS.expandLabel);
  if (
    !(wrap instanceof HTMLElement) ||
    !(button instanceof HTMLButtonElement) ||
    !(label instanceof HTMLElement)
  )
    return;
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
  const fallenCount = state.expanded ? 0 : fallenLabels.length;
  button.dataset.hasFallen = String(fallenCount > 0);
  label.textContent = fallenCount > 0 ? copy.fallenHint(fallenCount) : "";
  button.setAttribute(
    "aria-label",
    fallenCount > 0
      ? copy.fallenHintAria(fallenCount)
      : state.expanded
        ? copy.collapseAria
        : copy.expandAria,
  );
}

function updateCalibrationStatus(
  state: RuntimeState,
  copy: Copy,
  controller: RuntimeController,
  plan?: SubscriptionKey,
): void {
  const status = getElement<HTMLElement>(state, "[data-cr-calibration-status]");
  if (!status) return;
  const selectedPlan = plan ?? (state.subscription as SubscriptionKey);
  const summary = buildCalibrationSummary(controller.getStore(), selectedPlan);
  status.textContent = copy.calibrationStatus({
    ratio: summary.shortWindow.ratio,
    exposure: summary.shortWindow.exposure,
    status: summary.shortWindow.status,
    alpha: summary.workload.alpha,
    beta: summary.workload.beta,
    workloadStatus: summary.workload.status,
  });
  const observations = getElement<HTMLElement>(
    state,
    "[data-cr-calibration-observations]",
  );
  if (!observations) return;
  observations.replaceChildren();
  const store = controller.getStore();
  const entries = [
    ...store.shortWindowObservations.map((observation) => ({
      id: observation.id,
      text: `${observation.recordedAt} · ${observation.plan} · ${observation.method} · ${observation.status}`,
    })),
    ...store.workloadObservations.map((observation) => ({
      id: observation.id,
      text: `${observation.recordedAt} · ${observation.model} / ${observation.effort} · ${observation.mode} · ${observation.status}`,
    })),
  ];
  if (entries.length === 0) {
    observations.append(
      makeElement("span", "cr-calibration-empty", copy.noCalibration),
    );
    return;
  }
  for (const entry of entries) {
    const row = makeElement("div", "cr-calibration-observation");
    const label = makeElement(
      "span",
      "cr-calibration-observation-label",
      entry.text,
    );
    const remove = makeElement(
      "button",
      "cr-calibration-delete",
      copy.deleteObservation,
    );
    remove.type = "button";
    remove.addEventListener("click", () => {
      controller.setStore(deleteCalibrationObservation(entry.id));
      const dialogPlan = state.shadow?.querySelector<HTMLSelectElement>(
        "[data-cr-calibration-plan]",
      )?.value as SubscriptionKey | undefined;
      updateCalibrationStatus(state, copy, controller, dialogPlan);
      controller.rerender();
    });
    row.append(label, remove);
    observations.append(row);
  }
}

function updateDisclosure(
  state: RuntimeState,
  copy: Copy,
  result: StrategyResult,
  totalCount: number,
): void {
  const disclosure = getElement<HTMLDetailsElement>(
    state,
    SELECTORS.disclosure,
  );
  const body = getElement<HTMLElement>(state, SELECTORS.disclosureBody);
  const content = getElement<HTMLElement>(state, SELECTORS.disclosureContent);
  const notes = getElement<HTMLElement>(state, SELECTORS.disclosureNotes);
  const label = getElement<HTMLElement>(state, SELECTORS.disclosureLabel);
  if (!disclosure || !body || !content || !notes || !label) return;

  const wasOpen = disclosure.open;
  clearDisclosureAnimation(state.animations);
  resetDisclosureStyles(disclosure, body);
  disclosure.hidden = false;
  const entries: Array<[ModelRecord | ScoredRecord, any]> = [];
  for (const record of result.excluded.invalid)
    entries.push([record, "invalid"]);
  for (const record of result.excluded.belowIqFloor)
    entries.push([record, "below-iq-floor"]);
  for (const record of result.excluded.quotaUnknown)
    entries.push([record, "quota-unknown"]);
  for (const record of result.excluded.resourceWeekly)
    entries.push([record, "resource-weekly"]);
  for (const record of result.excluded.resourceShortWindow)
    entries.push([record, "resource-short-window"]);
  for (const record of result.excluded.fastEvidenceUnavailable)
    entries.push([record, "fast-evidence-unavailable"]);
  for (const record of result.excluded.practicalDominated)
    entries.push([record, "practical-dominated"]);
  label.textContent =
    entries.length > 0 ? copy.excluded(entries.length) : copy.dominanceCheck;
  content.replaceChildren();
  notes.replaceChildren();
  notes.hidden = true;
  notes.append(
    makeElement("p", "cr-exclusion-note", copy.qualityDataNote),
    makeElement("p", "cr-exclusion-note", copy.quotaDataNote),
    makeElement("p", "cr-exclusion-note", copy.calibrationNote),
  );
  if (entries.length > 0) {
    const list = makeElement("ul", "cr-exclusion-list");
    for (const [record, reason] of entries)
      list.append(renderExclusionItem(record, copy, reason));
    content.append(list);
  } else {
    content.append(
      renderEmpty(copy.noDominatedTitle, copy.noDominatedDescription, copy, {
        icon: "✓",
      }),
    );
  }
  if (result.fastCandidateCount > 0 || result.fastOmittedCount > 0) {
    notes.append(
      makeElement(
        "p",
        "cr-exclusion-note",
        copy.fastNote({
          included: result.fastCandidateCount,
          exact: result.fastExactCount,
          model: result.fastModelCount,
          group: result.fastGroupCount,
          omitted: result.fastOmittedCount,
        }),
      ),
    );
  }
  if (
    result.excluded.resourceWeekly.length +
      result.excluded.resourceShortWindow.length >
    0
  ) {
    notes.append(
      makeElement(
        "p",
        "cr-exclusion-note",
        copy.resourceNote(
          result.excluded.resourceWeekly.length,
          result.excluded.resourceShortWindow.length,
        ),
      ),
    );
  }
  if (result.excluded.belowIqFloor.length > 0)
    notes.append(
      makeElement(
        "p",
        "cr-exclusion-note",
        copy.lowIqNote(result.excluded.belowIqFloor.length),
      ),
    );
  if (result.excluded.invalid.length > 0)
    notes.append(
      makeElement(
        "p",
        "cr-exclusion-note",
        copy.invalidNote(result.excluded.invalid.length),
      ),
    );
  if (result.excluded.practicalDominated.length > 0)
    notes.append(
      makeElement(
        "p",
        "cr-exclusion-note",
        copy.practicalNote(result.excluded.practicalDominated.length),
      ),
    );
  if (totalCount > 0 && entries.length === 0)
    notes.append(makeElement("p", "cr-exclusion-note", copy.qualityDataNote));
  notes.hidden = notes.childElementCount === 0;
  disclosure.open = wasOpen;
}

function renderInactive(
  state: RuntimeState,
  copy: Copy,
  mode: string,
  strategies: any,
  subscriptions: any,
): void {
  const root = getElement<HTMLElement>(state, SELECTORS.root);
  const grid = getElement<HTMLElement>(state, SELECTORS.grid);
  const shell = getElement<HTMLElement>(state, SELECTORS.gridShell);
  const disclosure = getElement<HTMLDetailsElement>(
    state,
    SELECTORS.disclosure,
  );
  if (!root || !grid || !disclosure) return;
  const modeName = copy.modeNames[mode] || mode || "the current ability page";
  root.dataset.state = "inactive";
  root.removeAttribute("aria-busy");
  resetGridViewport(state.animations, state, shell);
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
  copy: Copy,
  strategies: any,
  subscriptions: any,
  message = copy.loading,
): void {
  const root = getElement<HTMLElement>(state, SELECTORS.root);
  const grid = getElement<HTMLElement>(state, SELECTORS.grid);
  const shell = getElement<HTMLElement>(state, SELECTORS.gridShell);
  const disclosure = getElement<HTMLDetailsElement>(
    state,
    SELECTORS.disclosure,
  );
  if (!root || !grid || !disclosure) return;
  root.dataset.state = "loading";
  root.setAttribute("aria-busy", "true");
  resetGridViewport(state.animations, state, shell);
  disclosure.open = false;
  renderSkeleton(grid);
  disclosure.hidden = true;
  syncControls(state, copy, strategies, subscriptions);
  syncExpandControl(state, copy, { hasOverflow: false }, []);
  announce(state, message);
}

function renderError(
  state: RuntimeState,
  copy: Copy,
  strategies: any,
  subscriptions: any,
  message: string,
  retryRadar: () => void,
): void {
  const root = getElement<HTMLElement>(state, SELECTORS.root);
  const grid = getElement<HTMLElement>(state, SELECTORS.grid);
  const shell = getElement<HTMLElement>(state, SELECTORS.gridShell);
  const disclosure = getElement<HTMLDetailsElement>(
    state,
    SELECTORS.disclosure,
  );
  if (!root || !grid || !disclosure) return;
  root.dataset.state = "error";
  root.removeAttribute("aria-busy");
  resetGridViewport(state.animations, state, shell);
  disclosure.open = false;
  grid.replaceChildren(
    renderEmpty(copy.errorTitle, message, copy, {
      retry: true,
      icon: "!",
      onRetry: retryRadar,
    }),
  );
  disclosure.hidden = true;
  syncControls(state, copy, strategies, subscriptions);
  syncExpandControl(state, copy, { hasOverflow: false }, []);
  announce(state, message);
}

function renderData(
  state: RuntimeState,
  copy: Copy,
  strategies: any,
  subscriptions: any,
  snapshot: RadarSnapshot,
  calibrationStore: CalibrationStoreV1,
  openDetail: (record: ScoredRecord) => void,
  setCurrentResult: (result: StrategyResult) => void,
): void {
  const root = getElement<HTMLElement>(state, SELECTORS.root);
  const grid = getElement<HTMLElement>(state, SELECTORS.grid);
  const shell = getElement<HTMLElement>(state, SELECTORS.gridShell);
  if (!root || !grid) return;
  const animateCards = state.animateCardsOnNextRender;
  state.animateCardsOnNextRender = true;
  const context = buildCalibrationSummary(
    calibrationStore,
    state.subscription as SubscriptionKey,
  );
  const strategyResults: Record<string, StrategyResult> = {};
  for (const key of STRATEGY_KEYS) {
    strategyResults[key] = buildStrategyResult(
      snapshot.records,
      snapshot.fastEstimator,
      key,
      state.subscription as SubscriptionKey,
      state.fastEnabled,
      context,
    );
  }
  const strategyKey = STRATEGY_KEYS.includes(state.sortStrategy)
    ? state.sortStrategy
    : DEFAULT_STRATEGY;
  state.sortStrategy = strategyKey;
  const currentResult = strategyResults[strategyKey];
  setCurrentResult(currentResult);
  const displayedGroups = state.expanded
    ? currentResult.groups
    : currentResult.groups.slice(0, GRID_PREVIEW_CARD_LIMIT);
  const winners = new Map<string, string[]>();
  for (const key of STRATEGY_KEYS) {
    const winner = strategyResults[key].winner;
    if (winner)
      winners.set(winner.key, [
        ...(winners.get(winner.key) || []),
        strategies[key].winnerLabel,
      ]);
  }
  const groupRanks = new Map(
    currentResult.groups.map((group, index) => [
      group.representative.key,
      index + 1,
    ]),
  );
  root.dataset.state = "ready";
  root.removeAttribute("aria-busy");
  syncControls(state, copy, strategies, subscriptions);
  const strategy = strategies[strategyKey];
  const children: HTMLElement[] = displayedGroups.map((group) =>
    renderCard(
      group.representative,
      groupRanks.get(group.representative.key) || 0,
      group,
      strategy,
      winners.get(group.representative.key) || [],
      strategyDescription(copy, strategyKey),
      copy,
      context,
      animateCards,
      openDetail,
    ),
  );
  if (currentResult.groups.length === 0) {
    const noModels = snapshot.records
      .filter(isValidRecord)
      .every((record) => record.qualityIq < IQ_MINIMUM);
    const quotaBlocked =
      currentResult.excluded.quotaUnknown.length > 0 ||
      currentResult.excluded.resourceWeekly.length > 0 ||
      currentResult.excluded.resourceShortWindow.length > 0;
    children.push(
      renderEmpty(
        noModels
          ? copy.noModelsTitle
          : quotaBlocked
            ? copy.noQuotaModelsTitle
            : copy.noValidTitle,
        noModels
          ? copy.noModelsDescription
          : quotaBlocked
            ? copy.noQuotaModelsDescription
            : copy.noValidDescription,
        copy,
      ),
    );
  }
  clearGridAnimation(state.animations);
  grid.replaceChildren(...children);
  const viewport =
    shell instanceof HTMLElement
      ? syncGridViewport(state.animations, state, grid, shell)
      : measureGridViewport(grid);
  const hasMoreGroups = currentResult.groups.length > displayedGroups.length;
  const fallen = currentResult.groups
    .slice(0, displayedGroups.length)
    .filter((group) => {
      const index = displayedGroups.indexOf(group);
      return (
        index >= viewport.visibleCount && winners.has(group.representative.key)
      );
    })
    .flatMap((group) => winners.get(group.representative.key) || []);
  syncExpandControl(
    state,
    copy,
    { hasOverflow: viewport.hasOverflow || hasMoreGroups },
    fallen,
  );
  updateDisclosure(state, copy, currentResult, snapshot.records.length);
  announce(
    state,
    copy.announced(
      currentResult.orderedScored.length,
      strategy.label,
      currentResult.fastCandidateCount,
      currentResult.groups.length,
    ),
  );
}

function getTheme(): string {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === "light" || explicit === "dark") return explicit;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function syncTheme(state: RuntimeState): void {
  if (state.host) state.host.dataset.crTheme = getTheme();
}

function render(
  state: RuntimeState,
  copy: Copy,
  strategies: any,
  subscriptions: any,
  controller: RuntimeController,
  openDetail: (record: ScoredRecord) => void,
  scheduleRender: () => void,
  radarState: RadarRuntimeState,
): void {
  state.renderQueued = false;
  const source = document.querySelector<HTMLElement>(SELECTORS.source);
  if (!source || !state.shadow) return;
  state.hasRendered = true;
  if (state.source !== source) observeSource(state, source, scheduleRender);
  const mode = source.dataset.efficiencyMode;
  if (mode !== TARGET_MODE) {
    renderInactive(state, copy, mode || "", strategies, subscriptions);
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
    controller.getStore(),
    openDetail,
    controller.setResult,
  );
}

function queueRender(
  state: RuntimeState,
  callback: () => void,
  animateCards = true,
): void {
  if (!animateCards) state.animateCardsOnNextRender = false;
  if (state.renderQueued) return;
  state.renderQueued = true;
  window.clearTimeout(state.renderTimer);
  state.renderTimer = window.setTimeout(callback, 80);
}

function observeSource(
  state: RuntimeState,
  source: HTMLElement,
  renderCallback: () => void,
): void {
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
  renderCallback: () => void,
): void {
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
  copy: Copy,
  renderCallback: () => void,
): void {
  if (radarState.request) return;
  radarState.request = loadRadarSnapshot(
    copy,
    document.querySelector<HTMLElement>(SELECTORS.fastSource),
    document.querySelector<HTMLElement>(SELECTORS.quotaSource),
  )
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

function openOriginalDetail(
  state: RuntimeState,
  copy: Copy,
  record: ScoredRecord,
  renderCallback: () => void,
): void {
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

function releaseDetachedHost(state: RuntimeState): void {
  if (!state.host || document.contains(state.host)) return;
  clearGridAnimation(state.animations);
  clearDisclosureAnimation(state.animations);
  const pageObserver = state.observers.page;
  state.observers.source?.disconnect();
  state.observers.fast?.disconnect();
  state.observers.theme?.disconnect();
  state.observers.gridResize?.disconnect();
  state.observers = {
    source: null,
    fast: null,
    page: pageObserver,
    theme: null,
    gridResize: null,
  };
  state.source = null;
  state.fastSource = null;
  state.shadow = null;
  state.host = null;
  state.gridWidth = null;
  state.hasRendered = false;
}

function numberField(form: HTMLFormElement, name: string): number | undefined {
  const element = form.elements.namedItem(name);
  if (!(element instanceof HTMLInputElement) || element.value === "")
    return undefined;
  const value = Number(element.value);
  return Number.isFinite(value) ? value : undefined;
}

function setupCalibration(
  state: RuntimeState,
  copy: Copy,
  controller: RuntimeController,
): void {
  const shadow = state.shadow;
  if (!shadow) return;
  const backdrop = shadow.querySelector<HTMLElement>(
    "[data-cr-calibration-backdrop]",
  );
  const dialog = shadow.querySelector<HTMLDialogElement>(
    "[data-cr-calibration-dialog]",
  );
  const open = () => {
    if (!backdrop || !dialog) return;
    backdrop.hidden = false;
    if (typeof dialog.showModal === "function" && !dialog.open)
      dialog.showModal();
    else dialog.open = true;
    syncCandidateOptions();
    updateCalibrationStatus(state, copy, controller, calibrationPlan());
  };
  const close = () => {
    if (!backdrop || !dialog) return;
    if (dialog.open && typeof dialog.close === "function") dialog.close();
    dialog.open = false;
    backdrop.hidden = true;
  };
  shadow
    .querySelector("[data-cr-open-calibration]")
    ?.addEventListener("click", open);
  shadow
    .querySelector("[data-cr-close-calibration]")
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      close();
    });
  backdrop?.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  dialog?.addEventListener("close", () => {
    if (backdrop) backdrop.hidden = true;
  });

  const planSelect = shadow.querySelector<HTMLSelectElement>(
    "[data-cr-calibration-plan]",
  );
  if (planSelect) planSelect.value = state.subscription;
  const calibrationPlan = (): SubscriptionKey =>
    (planSelect?.value || state.subscription) as SubscriptionKey;
  planSelect?.addEventListener("change", () => {
    updateCalibrationStatus(state, copy, controller, calibrationPlan());
  });
  const candidateSelect = shadow.querySelector<HTMLSelectElement>(
    "[data-cr-workload-candidate]",
  );
  const syncCandidateOptions = (): void => {
    if (!candidateSelect) return;
    const result = controller.getResult();
    const snapshot = controller.getSnapshot();
    const map = new Map<string, ModelRecord | ScoredRecord>();
    for (const record of snapshot?.records ?? []) map.set(record.key, record);
    for (const record of result?.orderedScored ?? [])
      map.set(record.key, record);
    candidateSelect.replaceChildren(
      ...Array.from(map.values()).map((candidate) => {
        const option = document.createElement("option");
        option.value = candidate.key;
        option.textContent =
          candidate.label +
          (candidate.mode === "fast" ? ` · ${copy.fast}` : "");
        return option;
      }),
    );
  };
  let calibrationMode: "quota" | "workload" = "quota";
  let shortMethod: "full-window" | "paired-meter" = "full-window";
  const quotaPanel = shadow.querySelector<HTMLElement>("[data-cr-quota-panel]");
  const workloadPanel = shadow.querySelector<HTMLElement>(
    "[data-cr-workload-panel]",
  );
  const modeButtons = Array.from(
    shadow.querySelectorAll<HTMLButtonElement>("[data-cr-calibration-mode]"),
  );
  const methodButtons = Array.from(
    shadow.querySelectorAll<HTMLButtonElement>("[data-cr-window-method]"),
  );
  const syncCalibrationForm = () => {
    modeButtons.forEach((button) => {
      const selected = button.dataset.crCalibrationMode === calibrationMode;
      button.setAttribute("aria-selected", String(selected));
    });
    if (quotaPanel) {
      const active = calibrationMode === "quota";
      quotaPanel.dataset.crActive = String(active);
      quotaPanel.setAttribute("aria-hidden", String(!active));
    }
    if (workloadPanel) {
      const active = calibrationMode === "workload";
      workloadPanel.dataset.crActive = String(active);
      workloadPanel.setAttribute("aria-hidden", String(!active));
    }
    methodButtons.forEach((button) => {
      const selected = button.dataset.crWindowMethod === shortMethod;
      button.setAttribute("aria-pressed", String(selected));
    });
    shadow
      .querySelectorAll<HTMLElement>("[data-cr-window-fields]")
      .forEach((field) => {
        const active = field.dataset.crWindowFields === shortMethod;
        field.dataset.crActive = String(active);
        field.setAttribute("aria-hidden", String(!active));
        field.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
          input.required = active;
        });
      });
  };
  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      calibrationMode =
        button.dataset.crCalibrationMode === "workload" ? "workload" : "quota";
      syncCalibrationForm();
    });
  });
  methodButtons.forEach((button) => {
    button.addEventListener("click", () => {
      shortMethod =
        button.dataset.crWindowMethod === "paired-meter"
          ? "paired-meter"
          : "full-window";
      syncCalibrationForm();
    });
  });
  syncCalibrationForm();
  shadow
    .querySelector<HTMLFormElement>("[data-cr-short-form]")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const plan = (planSelect?.value || state.subscription) as SubscriptionKey;
      const before = numberField(form, "weeklyBefore");
      const after = numberField(form, "weeklyAfter");
      if (before === undefined || after === undefined) return;
      const observation =
        shortMethod === "full-window"
          ? (() => {
              const windows = numberField(form, "fullWindows");
              return windows === undefined
                ? null
                : createShortWindowObservation({
                    plan,
                    method: "full-window",
                    fullWindows: windows,
                    weeklyBefore: before / 100,
                    weeklyAfter: after / 100,
                  });
            })()
          : (() => {
              const shortBefore = numberField(form, "shortBefore");
              const shortAfter = numberField(form, "shortAfter");
              return shortBefore === undefined || shortAfter === undefined
                ? null
                : createShortWindowObservation({
                    plan,
                    method: "paired-meter",
                    shortBefore: shortBefore / 100,
                    shortAfter: shortAfter / 100,
                    weeklyBefore: before / 100,
                    weeklyAfter: after / 100,
                  });
            })();
      if (!observation) return;
      controller.setStore(appendShortWindowObservation(observation));
      form.reset();
      updateCalibrationStatus(state, copy, controller, calibrationPlan());
      controller.rerender();
    });
  shadow
    .querySelector<HTMLFormElement>("[data-cr-workload-form]")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const snapshot = controller.getSnapshot();
      if (!snapshot) return;
      const plan = calibrationPlan();
      const candidateKey = (
        form.elements.namedItem("candidateKey") as HTMLSelectElement | null
      )?.value;
      const actualMinutes = numberField(form, "actualMinutes");
      const representative = form.elements.namedItem(
        "representativeTask",
      ) as HTMLInputElement | null;
      if (
        !candidateKey ||
        actualMinutes === undefined ||
        !representative?.checked
      )
        return;
      const result = controller.getResult();
      const record =
        result?.orderedScored.find(
          (candidate) => candidate.key === candidateKey,
        ) ||
        snapshot.records.find((candidate) => candidate.key === candidateKey);
      if (!record) return;
      const weeklyBefore = numberField(form, "weeklyBefore");
      const weeklyAfter = numberField(form, "weeklyAfter");
      const shortBefore = numberField(form, "shortBefore");
      const shortAfter = numberField(form, "shortAfter");
      const kappa = buildCalibrationSummary(controller.getStore(), plan)
        .shortWindow.ratio;
      const workload = createWorkloadObservation(
        {
          plan,
          model: record.model,
          family: record.family,
          effort: record.effort,
          mode: record.mode,
          benchmarkCostEquivalent: record.benchmarkCostEquivalent,
          benchmarkMinutes: record.benchmarkMinutes,
          quotaBudget20x: record.quotaBudget20x || 0,
          actualMinutes,
          weeklyBefore:
            weeklyBefore === undefined ? undefined : weeklyBefore / 100,
          weeklyAfter:
            weeklyAfter === undefined ? undefined : weeklyAfter / 100,
          shortBefore:
            shortBefore === undefined ? undefined : shortBefore / 100,
          shortAfter: shortAfter === undefined ? undefined : shortAfter / 100,
          representativeTask: true,
        },
        kappa,
      );
      controller.setStore(appendWorkloadObservation(workload));
      form.reset();
      updateCalibrationStatus(state, copy, controller, calibrationPlan());
      controller.rerender();
    });
  shadow
    .querySelector("[data-cr-reset-calibration]")
    ?.addEventListener("click", () => {
      if (!window.confirm("Reset local calibration?")) return;
      controller.setStore(clearCalibration());
      updateCalibrationStatus(state, copy, controller, calibrationPlan());
      controller.rerender();
    });
}

function mount(
  state: RuntimeState,
  copy: Copy,
  strategies: any,
  subscriptions: any,
  controller: RuntimeController,
  radarState: RadarRuntimeState,
  renderCallback: () => void,
  renderFastCallback: () => void,
): boolean {
  releaseDetachedHost(state);
  if (state.host || document.getElementById(HOST_ID)) return true;
  const header =
    document.querySelector<HTMLElement>(".shell > header") ||
    document.querySelector<HTMLElement>("header");
  if (!(header instanceof HTMLElement)) return false;
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
  if (grid && typeof ResizeObserver === "function") {
    state.observers.gridResize = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width * 100) / 100;
      if (width === state.gridWidth) return;
      state.gridWidth = width;
      if (state.hasRendered) renderCallback();
    });
    state.observers.gridResize.observe(grid);
  }
  const menu = shadow.querySelector<HTMLElement>(SELECTORS.menu);
  const trigger = shadow.querySelector<HTMLButtonElement>(
    SELECTORS.menuTrigger,
  );
  const content = shadow.querySelector<HTMLElement>(SELECTORS.menuContent);
  const options = Array.from(
    shadow.querySelectorAll<HTMLButtonElement>(SELECTORS.menuOption),
  );
  const setMenuOpen = (open: boolean, focusSelected = false) => {
    if (!trigger || !content) return;
    state.menuOpen = open;
    content.dataset.open = String(open);
    content.setAttribute("aria-hidden", String(!open));
    trigger.setAttribute("aria-expanded", String(open));
    if (open && focusSelected)
      (
        options.find(
          (option) => option.getAttribute("aria-checked") === "true",
        ) || options[0]
      )?.focus();
  };
  trigger?.addEventListener("click", (event) =>
    setMenuOpen(!state.menuOpen, event.detail === 0 && !state.menuOpen),
  );
  trigger?.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    setMenuOpen(true, true);
  });
  options.forEach((option) =>
    option.addEventListener("click", () => {
      if (
        option.dataset.crSortOption &&
        STRATEGY_KEYS.includes(option.dataset.crSortOption)
      )
        state.sortStrategy = option.dataset.crSortOption;
      if (
        option.dataset.crSubscriptionOption &&
        SUBSCRIPTION_KEYS.includes(option.dataset.crSubscriptionOption)
      )
        state.subscription = option.dataset.crSubscriptionOption;
      persistPreferences(state);
      setMenuOpen(false);
      trigger?.focus();
      renderCallback();
    }),
  );
  shadow.addEventListener("click", (event) => {
    if (!(event.target instanceof Node) || !menu?.contains(event.target))
      setMenuOpen(false);
  });
  const fastToggle = shadow.querySelector<HTMLInputElement>(
    SELECTORS.fastToggle,
  );
  fastToggle?.addEventListener("change", () => {
    state.fastEnabled = fastToggle.checked;
    persistPreferences(state);
    renderCallback();
  });
  shadow
    .querySelector<HTMLButtonElement>(SELECTORS.expand)
    ?.addEventListener("click", () => {
      state.animateCardsOnNextRender = false;
      state.expanded = !state.expanded;
      renderCallback();
    });
  const disclosure = shadow.querySelector<HTMLDetailsElement>(
    SELECTORS.disclosure,
  );
  const disclosureSummary = disclosure?.querySelector("summary");
  const disclosureBody = shadow.querySelector<HTMLElement>(
    SELECTORS.disclosureBody,
  );
  if (disclosure && disclosureSummary instanceof HTMLElement && disclosureBody)
    disclosureSummary.addEventListener("click", (event) => {
      event.preventDefault();
      animateDisclosureToggle(state.animations, disclosure, disclosureBody);
    });
  const infoButton = shadow.querySelector<HTMLButtonElement>(SELECTORS.info);
  const infoWrap = shadow.querySelector<HTMLElement>(SELECTORS.infoWrap);
  const infoTooltip = shadow.querySelector<HTMLElement>(SELECTORS.infoTooltip);
  const infoPanel = shadow.querySelector<HTMLElement>(SELECTORS.panel);
  const positionInfoTooltip = () => {
    if (!infoWrap || !infoTooltip || !infoPanel) return;
    const wrapRect = infoWrap.getBoundingClientRect();
    const tooltipRect = infoTooltip.getBoundingClientRect();
    const panelRect = infoPanel.getBoundingClientRect();
    const left = Math.min(
      Math.max(wrapRect.right - tooltipRect.width, panelRect.left + 12),
      Math.max(panelRect.left + 12, panelRect.right - tooltipRect.width - 12),
    );
    infoTooltip.style.left = `${left - wrapRect.left}px`;
    infoTooltip.style.right = "auto";
  };
  infoButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = infoWrap?.dataset.open !== "true";
    if (infoWrap) infoWrap.dataset.open = String(open);
    infoButton.setAttribute("aria-expanded", String(open));
    positionInfoTooltip();
  });
  infoButton?.addEventListener("mouseenter", positionInfoTooltip);
  infoButton?.addEventListener("focus", positionInfoTooltip);
  shadow.addEventListener("click", (event) => {
    if (!(event.target instanceof Node) || !infoWrap?.contains(event.target)) {
      if (infoWrap) infoWrap.dataset.open = "false";
      infoButton?.setAttribute("aria-expanded", "false");
    }
  });
  window.addEventListener(
    "resize",
    () => {
      positionInfoTooltip();
      renderCallback();
    },
    { passive: true },
  );
  setupCalibration(state, copy, controller);
  const source = document.querySelector<HTMLElement>(SELECTORS.source);
  if (source) observeSource(state, source, renderCallback);
  const fastSource = document.querySelector<HTMLElement>(SELECTORS.fastSource);
  if (fastSource) observeFastSource(state, fastSource, renderFastCallback);
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
  mountCallback: () => boolean,
  renderCallback: () => void,
  renderFastCallback: () => void,
): void {
  if (state.observers.page) return;
  state.observers.page = new MutationObserver(() => {
    if (!state.host || !document.contains(state.host)) mountCallback();
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

function start(): void {
  if (!isSupportedPage() || document.getElementById(HOST_ID)) return;
  const state = createState();
  const preferences = loadPreferences();
  if (preferences.subscription) state.subscription = preferences.subscription;
  if (preferences.sortStrategy) state.sortStrategy = preferences.sortStrategy;
  if (preferences.fastEnabled !== undefined)
    state.fastEnabled = preferences.fastEnabled;
  let calibrationStore = loadCalibrationStore();
  let latestResult: StrategyResult | null = null;
  const radarState: RadarRuntimeState = {
    snapshot: null,
    error: null,
    request: null,
  };
  const copy = getCopy(getLocale());
  const strategies = createStrategyCatalog(copy);
  const subscriptions = createSubscriptionCatalog(copy);
  let renderCallback: () => void;
  const controller: RuntimeController = {
    getStore: () => calibrationStore,
    setStore: (store) => {
      calibrationStore = store;
    },
    getSnapshot: () => radarState.snapshot,
    getResult: () => latestResult,
    setResult: (result) => {
      latestResult = result;
    },
    rerender: () => renderCallback(),
  };
  renderCallback = () =>
    queueRender(state, () =>
      render(
        state,
        copy,
        strategies,
        subscriptions,
        controller,
        (record) => openOriginalDetail(state, copy, record, renderCallback),
        renderCallback,
        radarState,
      ),
    );
  const renderFastCallback = () => renderCallback();
  const mountCallback = () =>
    mount(
      state,
      copy,
      strategies,
      subscriptions,
      controller,
      radarState,
      renderCallback,
      renderFastCallback,
    );
  mountCallback();
  observePage(state, mountCallback, renderCallback, renderFastCallback);
}

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
