import styles from "./styles.css?raw";
import { IQ_TARGET } from "./config.js";
import type { RuntimeState } from "./config.js";
import type { Copy } from "./i18n.js";
import type { ScoredRecord } from "./scoring.js";

export interface CatalogEntry {
  label: string;
  winnerLabel?: string;
}

export type Catalog = Record<string, CatalogEntry>;

export interface EmptyOptions {
  icon?: string;
  retry?: boolean;
  onRetry?: () => void;
}

const CHEVRON_SVG =
  '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3.5 5.75 8 10.25l4.5-4.5"></path></svg>';

export function makeElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K];
export function makeElement(
  tagName: string,
  className?: string,
  text?: string,
): HTMLElement {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function menuOptionMarkup(key, label, dataAttribute, selectedKey) {
  return `<button class="cr-menu-option" type="button" role="menuitemradio" aria-label="${label}" aria-checked="${key === selectedKey}" data-cr-menu-option ${dataAttribute}="${key}">${label}</button>`;
}

export function createShellMarkup(
  copy: Copy,
  strategies: Catalog,
  subscriptions: Catalog,
  state: RuntimeState,
): string {
  const subscriptionMenuMarkup = Object.entries(subscriptions)
    .map(([key, profile]) =>
      menuOptionMarkup(
        key,
        profile.label,
        "data-cr-subscription-option",
        state.subscription,
      ),
    )
    .join("");
  const strategyMenuMarkup = Object.entries(strategies)
    .map(([key, strategy]) =>
      menuOptionMarkup(
        key,
        strategy.label,
        "data-cr-sort-option",
        state.sortStrategy,
      ),
    )
    .join("");

  return `
    <div class="cr-panel" data-cr-root data-state="loading" aria-busy="true">
      <div class="cr-header">
        <div class="cr-heading">
          <div class="cr-eyebrow"><span class="cr-eyebrow-dot" aria-hidden="true"></span><span>${copy.eyebrow}</span></div>
          <div class="cr-title-row">
            <h2 class="cr-title">${copy.title}</h2>
            <span class="cr-info-wrap">
              <button class="cr-info" type="button" data-cr-info aria-label="${copy.infoAria}" aria-expanded="false" aria-describedby="cr-frontier-info-tooltip" title="${copy.frontierExplanation}">i</button>
              <span class="cr-info-tooltip" id="cr-frontier-info-tooltip" role="tooltip">${copy.frontierExplanation}</span>
            </span>
          </div>
        </div>
        <div class="cr-controls">
          <div class="cr-menu" data-cr-menu>
            <button class="cr-menu-trigger" type="button" data-cr-menu-trigger aria-haspopup="menu" aria-expanded="false" aria-label="${copy.sort}">
              <span class="cr-menu-main"><span class="cr-menu-value" data-cr-menu-value>${copy.sort}</span></span>
              <span class="cr-menu-chevron" aria-hidden="true">${CHEVRON_SVG}</span>
            </button>
            <div class="cr-menu-content" data-cr-menu-content data-open="false" aria-hidden="true" role="menu">
              <div class="cr-menu-label">${copy.subscription}</div>
              ${subscriptionMenuMarkup}
              <div class="cr-menu-separator" role="separator"></div>
              <div class="cr-menu-label">${copy.sorting}</div>
              ${strategyMenuMarkup}
              <div class="cr-menu-separator" role="separator"></div>
              <div class="cr-menu-label">${copy.fastSection}</div>
              <label class="cr-toggle cr-menu-toggle">
                <input type="checkbox" data-cr-fast-toggle checked aria-label="${copy.fastToggleAria}">
                <span class="cr-toggle-track" aria-hidden="true"><span class="cr-toggle-thumb"></span></span>
                <span class="cr-toggle-label" data-cr-fast-label>${copy.fastInclude}</span>
              </label>
            </div>
          </div>
        </div>
      </div>
      <div class="cr-grid-shell" data-cr-grid-shell data-collapsed="false">
        <div class="cr-grid" data-cr-grid aria-label="${copy.gridAria}"></div>
        <div class="cr-grid-mask" data-cr-grid-mask aria-hidden="true"></div>
      </div>
      <div class="cr-expand-wrap" data-cr-expand-wrap hidden>
        <div class="cr-expand-actions">
          <button class="cr-expand-button" type="button" data-cr-expand data-has-fallen="false" aria-expanded="false" aria-label="${copy.expandAria}">
            <span class="cr-expand-chevron" aria-hidden="true">${CHEVRON_SVG}</span>
            <span class="cr-expand-label" data-cr-expand-label></span>
          </button>
        </div>
      </div>
      <details class="cr-disclosure" data-cr-disclosure hidden>
        <summary><span data-cr-disclosure-label>${copy.details}</span><span class="cr-disclosure-chevron" aria-hidden="true">${CHEVRON_SVG}</span></summary>
        <div class="cr-exclusion-body" data-cr-exclusion-body>
          <div class="cr-exclusion-scroll" data-cr-exclusion-scroll>
            <div class="cr-exclusion-content" data-cr-exclusion-content></div>
          </div>
          <section class="cr-exclusion-notes" data-cr-exclusion-notes hidden aria-label="${copy.notes}"></section>
        </div>
      </details>
      <span class="cr-sr-only" data-cr-announcer aria-live="polite"></span>
    </div>
  `;
}

function formatCost(cost: number): string {
  const rounded = Math.round((cost + Number.EPSILON) * 100) / 100;
  return `$${rounded.toFixed(2)}`;
}

function formatMinutes(minutes: number, copy: Copy): string {
  const display = Number.isInteger(minutes)
    ? String(minutes)
    : minutes.toFixed(1);
  return `${display}${copy.minutes}`;
}

function formatScore(value: number): string {
  return value.toFixed(2);
}

function formatMultiplier(value: number): string {
  return `${value.toFixed(2)}×`;
}

function formatQualityMargin(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) {
    return "0 IQ";
  }
  const absolute = Math.abs(rounded);
  const formatted = Number.isInteger(absolute)
    ? String(absolute)
    : absolute.toFixed(1);
  return `${rounded > 0 ? "+" : "−"}${formatted} IQ`;
}

function formatQuotaShare(value: number | null, copy: Copy): string {
  return value === null
    ? copy.quotaUnavailableShort
    : `${copy.approximate} ${(value * 100).toFixed(1)}% / ${copy.week}`;
}

function familyName(record: ScoredRecord): string {
  const parts = record.label.trim().split(/\s+/);
  const last = parts[parts.length - 1];
  if (parts.length > 1 && last?.toLowerCase() === record.effort.toLowerCase()) {
    parts.pop();
  }
  return parts.join(" ") || record.label;
}

function renderMetric(label: string, value: string): HTMLElement {
  const metric = makeElement("span", "cr-metric");
  metric.append(
    makeElement("span", "cr-metric-label", label),
    makeElement("strong", "cr-metric-value", value),
  );
  return metric;
}

export function renderCard(
  record: ScoredRecord,
  rank: number,
  strategy: CatalogEntry,
  winnerLabels: string[],
  strategyDescription: string,
  copy: Copy,
  animateEntry: boolean,
  onOpen: (record: ScoredRecord) => void,
): HTMLButtonElement {
  const button = makeElement("button", "cr-card");
  button.type = "button";
  if (animateEntry) {
    button.style.setProperty(
      "--cr-card-delay",
      `${Math.min(Math.max(rank - 1, 0), 7) * 18}ms`,
    );
  } else {
    button.dataset.crStatic = "true";
  }

  const modeLabel = record.mode === "fast" ? ` ${copy.fast}` : "";
  const winnerText = copy.ariaPreferred(winnerLabels);
  const fastDescription =
    record.mode === "fast"
      ? copy.ariaFast(formatMultiplier(record.fastMultiplier))
      : "";
  button.setAttribute(
    "aria-label",
    copy.cardAria({
      label: record.label,
      modeLabel,
      strategyLabel: strategy.label,
      strategyDescription,
      winnerText,
      fastDescription,
      iq: record.iq,
      qualityMargin: formatQualityMargin(record.iq - IQ_TARGET),
      quota: formatQuotaShare(record.quotaShare, copy),
      cost: formatCost(record.cost),
      time: formatMinutes(record.minutes, copy),
      rankLabel: copy.ariaRank(rank),
      qualityLabel: copy.quality,
      quotaLabel: copy.quota,
      costLabel: copy.cost,
      timeLabel: copy.time,
      originalDetails: copy.originalDetails,
    }),
  );

  const head = makeElement("div", "cr-card-head");
  const model = makeElement("div", "cr-card-model");
  model.append(
    makeElement("span", "cr-family", familyName(record)),
    makeElement("span", "cr-effort", record.effort),
  );
  if (record.mode === "fast") {
    const fastBadge = makeElement("span", "cr-mode", copy.fast);
    fastBadge.title = copy.fastBadgeTitle({
      source: record.fastMultiplierSource,
      multiplier: formatMultiplier(record.fastMultiplier),
    });
    model.append(fastBadge);
  }
  const meta = makeElement("div", "cr-card-meta");
  meta.append(
    makeElement("span", "cr-rank", `#${String(rank).padStart(2, "0")}`),
  );
  for (const winnerLabel of winnerLabels) {
    meta.append(makeElement("span", "cr-badge", winnerLabel));
  }
  head.append(model, meta);

  const iqRow = makeElement("div", "cr-iq-row");
  iqRow.append(
    makeElement("span", "cr-iq-label", "IQ"),
    makeElement("strong", "cr-iq", String(record.iq)),
  );

  const qualityRow = makeElement("div", "cr-quality-row");
  qualityRow.append(
    makeElement("span", "cr-quality-label", copy.quality),
    makeElement(
      "strong",
      "cr-quality-margin",
      formatQualityMargin(record.iq - IQ_TARGET),
    ),
  );

  const foot = makeElement("div", "cr-card-foot");
  foot.append(
    renderMetric(copy.quota, formatQuotaShare(record.quotaShare, copy)),
    renderMetric(copy.time, formatMinutes(record.minutes, copy)),
  );

  button.append(head, iqRow, qualityRow, foot);
  button.addEventListener("click", () => onOpen(record));
  return button;
}

export function renderExclusionItem(
  record: ScoredRecord,
  scoreLabel: string,
  copy: Copy,
): HTMLLIElement {
  const item = makeElement("li", "cr-exclusion-item");
  const score = Number.isFinite(record.strategyScore)
    ? ` · ${scoreLabel} ${formatScore(record.strategyScore)}`
    : "";
  const modeLabel = record.mode === "fast" ? ` ${copy.fast}` : "";
  const quotaLabel =
    record.quotaShare === null
      ? ""
      : ` · ${(record.quotaShare * 100).toFixed(1)}% ${copy.quotaPerWeek}`;
  const representativeLabel = record.representative
    ? `${record.representative.label}${record.representative.mode === "fast" ? ` ${copy.fast}` : ""}`
    : "";
  const exclusionLabel =
    record.quotaExclusionReason === "over-limit"
      ? copy.quotaOverLimit(record.quotaShare, record.quotaLimit)
      : record.quotaExclusionReason === "unavailable"
        ? copy.quotaUnavailable
        : copy.dominatedBy(representativeLabel);
  const details = makeElement("div");
  details.append(
    makeElement("div", "cr-exclusion-model", `${record.label}${modeLabel}`),
    makeElement(
      "div",
      "cr-exclusion-values",
      `IQ ${record.iq}${score} · ${formatCost(record.cost)} · ${formatMinutes(record.minutes, copy)}${quotaLabel}`,
    ),
  );
  item.append(
    details,
    makeElement("span", "cr-exclusion-witness", exclusionLabel),
  );
  return item;
}

export function renderEmpty(
  title: string,
  description: string,
  copy: Copy,
  options: EmptyOptions = {},
): HTMLElement {
  const empty = makeElement("div", "cr-empty");
  empty.append(
    makeElement("span", "cr-empty-icon", options.icon || "○"),
    makeElement("strong", "", title),
    makeElement("p", "", description),
  );
  if (options.retry) {
    const retryButton = makeElement("button", "cr-action", copy.refresh);
    retryButton.type = "button";
    retryButton.addEventListener("click", options.onRetry);
    empty.append(retryButton);
  }
  return empty;
}

export function renderSkeleton(grid: HTMLElement): void {
  grid.replaceChildren(
    makeElement("div", "cr-skeleton"),
    makeElement("div", "cr-skeleton"),
    makeElement("div", "cr-skeleton"),
  );
}

export { styles };
