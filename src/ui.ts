import styles from "./styles.css?raw";
import { IQ_REFERENCE } from "./config.js";
import type { RuntimeState } from "./config.js";
import type { CalibrationDerivedContext } from "./calibration.js";
import type { Copy } from "./i18n.js";
import type {
  EligibilityExclusionReason,
  ModelRecord,
  ScoredRecord,
} from "./scoring.js";
import type { RecommendationGroup } from "./recommendation.js";

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
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function menuOptionMarkup(
  key: string,
  label: string,
  dataAttribute: string,
  selectedKey: string,
): string {
  return `<button class="cr-menu-option" type="button" role="menuitemradio" aria-label="${label}" aria-checked="${key === selectedKey}" data-cr-menu-option ${dataAttribute}="${key}">${label}</button>`;
}

function calibrationPlanOptions(state: RuntimeState, copy: Copy): string {
  return Object.entries(copy.subscriptions)
    .map(
      ([key, label]) =>
        `<option value="${key}"${key === state.subscription ? " selected" : ""}>${label}</option>`,
    )
    .join("");
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
  const selectedStrategy = strategies[state.sortStrategy]?.label || copy.sort;
  const selectedStrategyLabel = `${copy.subscriptionMultipliers[state.subscription] || "1×"} ${selectedStrategy}${state.fastEnabled ? ` ${copy.fast}` : ""}`;

  return `
    <div class="cr-panel" data-cr-root data-state="loading" aria-busy="true">
      <div class="cr-header">
        <div class="cr-heading">
          <div class="cr-eyebrow"><span class="cr-eyebrow-dot" aria-hidden="true"></span><span>${copy.eyebrow}</span></div>
          <div class="cr-title-row">
            <h2 class="cr-title">${copy.title}</h2>
            <span class="cr-info-wrap">
              <button class="cr-info" type="button" data-cr-info aria-label="${copy.infoAria}" aria-expanded="false" aria-describedby="cr-frontier-info-tooltip">i</button>
              <span class="cr-info-tooltip" id="cr-frontier-info-tooltip" role="tooltip">${copy.frontierExplanation}</span>
            </span>
          </div>
        </div>
        <div class="cr-controls">
          <div class="cr-menu" data-cr-menu>
            <button class="cr-menu-trigger" type="button" data-cr-menu-trigger aria-haspopup="menu" aria-expanded="false" aria-label="${copy.sort}: ${selectedStrategyLabel}">
              <span class="cr-menu-main"><span class="cr-menu-value" data-cr-menu-value>${selectedStrategyLabel}</span></span>
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
              <div class="cr-menu-separator" role="separator"></div>
              <button class="cr-menu-action" type="button" data-cr-open-calibration>${copy.openCalibration}</button>
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
      <div class="cr-calibration-backdrop" data-cr-calibration-backdrop hidden>
        <dialog class="cr-calibration-dialog" data-cr-calibration-dialog aria-labelledby="cr-calibration-title">
          <div class="cr-calibration-header">
            <div class="cr-calibration-title-wrap">
              <span class="cr-dialog-kicker">${copy.calibration}</span>
              <h3 id="cr-calibration-title">${copy.calibrationDialogTitle}</h3>
            </div>
            <button class="cr-dialog-close" type="button" data-cr-close-calibration aria-label="${copy.close}">×</button>
          </div>
          <section class="cr-calibration-plan-card">
            <div class="cr-calibration-section-header">
              <span class="cr-section-index">01</span>
              <div><h4>${copy.subscription}</h4><p>${copy.quotaObservationHint}</p></div>
            </div>
            <label class="cr-field"><span>${copy.subscription}</span><select data-cr-calibration-plan>${calibrationPlanOptions(state, copy)}</select></label>
          </section>
          <div class="cr-calibration-status-card">
            <span class="cr-status-dot" aria-hidden="true"></span>
            <div>
              <strong>${copy.calibration}</strong>
              <p data-cr-calibration-status>${copy.noCalibration}</p>
            </div>
          </div>
          <p class="cr-calibration-note">${copy.calibrationNote}</p>
          <div class="cr-calibration-mode-tabs" role="tablist" aria-label="${copy.calibration}">
            <button type="button" role="tab" aria-selected="true" data-cr-calibration-mode="quota">${copy.quotaObservation}</button>
            <button type="button" role="tab" aria-selected="false" data-cr-calibration-mode="workload">${copy.workloadObservation}</button>
          </div>
          <section class="cr-calibration-section" data-cr-quota-panel data-cr-active="true" role="tabpanel">
            <div class="cr-calibration-section-header">
              <span class="cr-section-index">02</span>
              <div><h4>${copy.quotaObservation}</h4><p>${copy.quotaObservationHint}</p></div>
            </div>
            <div class="cr-calibration-segmented" role="group" aria-label="${copy.quotaObservation}">
              <button type="button" aria-pressed="true" data-cr-window-method="full-window">${copy.fullWindowMode}</button>
              <button type="button" aria-pressed="false" data-cr-window-method="paired-meter">${copy.meterMode}</button>
            </div>
            <form data-cr-short-form class="cr-calibration-form">
              <div class="cr-window-field-set" data-cr-window-fields="full-window" data-cr-active="true">
                <label class="cr-field"><span>${copy.fullWindows}</span><input name="fullWindows" type="number" min="0.01" step="0.01"></label>
              </div>
              <div class="cr-window-field-set" data-cr-window-fields="paired-meter" data-cr-active="false">
                <label class="cr-field"><span>${copy.shortBefore}</span><input name="shortBefore" type="number" min="0" max="100" step="0.1"></label>
                <label class="cr-field"><span>${copy.shortAfter}</span><input name="shortAfter" type="number" min="0" max="100" step="0.1"></label>
              </div>
              <label class="cr-field"><span>${copy.weeklyBefore}</span><input name="weeklyBefore" type="number" min="0" max="100" step="0.1" required></label>
              <label class="cr-field"><span>${copy.weeklyAfter}</span><input name="weeklyAfter" type="number" min="0" max="100" step="0.1" required></label>
              <div class="cr-form-actions"><button class="cr-action cr-action-primary" type="submit">${copy.save}</button></div>
            </form>
          </section>
          <section class="cr-calibration-section" data-cr-workload-panel data-cr-active="false" role="tabpanel" aria-hidden="true">
            <div class="cr-calibration-section-header">
              <span class="cr-section-index">02</span>
              <div><h4>${copy.workloadObservation}</h4><p>${copy.workloadObservationHint}</p></div>
            </div>
            <form data-cr-workload-form class="cr-calibration-form">
              <label class="cr-field"><span>${copy.modelEffort}</span><input name="modelEffort" type="text" placeholder="gpt-6-astra / medium" required></label>
              <label class="cr-field"><span>${copy.executionMode}</span><select name="mode"><option value="standard">Standard</option><option value="fast">Fast</option></select></label>
              <label class="cr-field"><span>${copy.actualMinutes}</span><input name="actualMinutes" type="number" min="0.01" step="0.1" required></label>
              <label class="cr-field"><span>${copy.weeklyBefore}</span><input name="weeklyBefore" type="number" min="0" max="100" step="0.1"></label>
              <label class="cr-field"><span>${copy.weeklyAfter}</span><input name="weeklyAfter" type="number" min="0" max="100" step="0.1"></label>
              <label class="cr-field"><span>${copy.shortBefore}</span><input name="shortBefore" type="number" min="0" max="100" step="0.1"></label>
              <label class="cr-field"><span>${copy.shortAfter}</span><input name="shortAfter" type="number" min="0" max="100" step="0.1"></label>
              <label class="cr-checkbox"><input name="representativeTask" type="checkbox" required><span>${copy.representativeTask}</span></label>
              <div class="cr-form-actions"><button class="cr-action cr-action-primary" type="submit">${copy.save}</button></div>
            </form>
          </section>
          <details class="cr-calibration-history">
            <summary><span>${copy.observations}</span><span class="cr-disclosure-chevron" aria-hidden="true">${CHEVRON_SVG}</span></summary>
            <div class="cr-calibration-observations" data-cr-calibration-observations></div>
          </details>
          <div class="cr-dialog-footer"><button class="cr-action cr-action-danger" type="button" data-cr-reset-calibration>${copy.resetCalibration}</button></div>
        </dialog>
      </div>
      <span class="cr-sr-only" data-cr-announcer aria-live="polite"></span>
    </div>
  `;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatMinutes(value: number, copy: Copy): string {
  return `${formatNumber(value)}${copy.minutes}`;
}

function formatQualityMargin(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return "0 IQ";
  const absolute = Math.abs(rounded);
  const formatted = Number.isInteger(absolute)
    ? String(absolute)
    : absolute.toFixed(1);
  return `${rounded > 0 ? "+" : "−"}${formatted} IQ`;
}

function formatMultiplier(value: number): string {
  return `${value.toFixed(2)}×`;
}

function formatBenchmarkCost(value: number): string {
  return `$${value.toFixed(2)}`;
}

function familyName(record: ModelRecord): string {
  const parts = record.label.trim().split(/\s+/);
  if (parts.at(-1)?.toLowerCase() === record.effort.toLowerCase()) parts.pop();
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

function renderIqValue(value: number): HTMLElement {
  const iq = makeElement("strong", "cr-iq");
  const [integer, decimal] = String(value).split(".");
  iq.append(makeElement("span", "cr-iq-integer", integer));
  if (decimal !== undefined)
    iq.append(makeElement("span", "cr-iq-decimal", `.${decimal}`));
  return iq;
}

function quotaValue(record: ScoredRecord, copy: Copy): string {
  return copy.quotaValue(record.effectiveWeeklyShare);
}

function timeValue(
  record: ScoredRecord,
  copy: Copy,
  calibrated: boolean,
): string {
  const label = calibrated ? copy.calibratedCardTime : copy.cardTime;
  return `${label} ${formatMinutes(record.effectiveMinutes, copy)}`;
}

function enduranceValue(
  record: ScoredRecord,
  copy: Copy,
  calibration: CalibrationDerivedContext,
): string {
  return calibration.shortWindowEnabled
    ? copy.enduranceValue(
        record.shortWindowEnduranceMinutes,
        calibration.shortWindowHours,
      )
    : copy.weeklyEnduranceValue(record.weeklyContinuousEnduranceMinutes);
}

export function renderCard(
  record: ScoredRecord,
  rank: number,
  group: RecommendationGroup,
  strategy: CatalogEntry,
  winnerLabels: string[],
  strategyDescription: string,
  copy: Copy,
  calibration: CalibrationDerivedContext,
  animateEntry: boolean,
  onOpen: (record: ScoredRecord) => void,
): HTMLButtonElement {
  const button = makeElement("button", "cr-card");
  button.type = "button";
  if (animateEntry)
    button.style.setProperty(
      "--cr-card-delay",
      `${Math.min(Math.max(rank - 1, 0), 7) * 18}ms`,
    );
  else button.dataset.crStatic = "true";

  const modeLabel = record.mode === "fast" ? ` ${copy.fast}` : "";
  const winnerText = copy.ariaPreferred(winnerLabels);
  const fastDescription =
    record.mode === "fast"
      ? copy.ariaFast(
          formatMultiplier(record.fastMultiplier ?? 1),
          record.fastEvidenceLevel,
          record.fastSampleCount,
        )
      : "";
  const alternatives = group.alternatives.length
    ? copy.alternativesTitle(group.alternatives.length)
    : "";
  const calibrated = calibration.workload.status !== "baseline";
  const timeText = timeValue(record, copy, calibrated);
  const quotaText = quotaValue(record, copy);
  const enduranceText = enduranceValue(record, copy, calibration);
  button.setAttribute(
    "aria-label",
    copy.cardAria({
      rankLabel: copy.ariaRank(rank),
      label: record.label,
      modeLabel,
      winnerText,
      fastDescription,
      iq: record.qualityIq,
      qualityMargin: formatQualityMargin(record.qualityIq - IQ_REFERENCE),
      quota: quotaText,
      time: timeText,
      endurance: enduranceText,
      strategyLabel: strategy.label,
      strategyDescription,
      originalDetails: copy.originalDetails,
      alternatives,
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
      source: record.fastEvidenceSource,
      multiplier: formatMultiplier(record.fastMultiplier ?? 1),
      sampleCount: record.fastSampleCount,
      ageDays: record.fastAgeDays,
    });
    model.append(fastBadge);
  }
  if (group.alternatives.length) {
    const alternativesBadge = makeElement(
      "span",
      "cr-alternatives-chip",
      `+${group.alternatives.length}`,
    );
    alternativesBadge.title = alternatives;
    alternativesBadge.setAttribute("aria-label", alternatives);
    model.append(alternativesBadge);
  }
  const meta = makeElement("div", "cr-card-meta");
  meta.append(
    makeElement("span", "cr-rank", `#${String(rank).padStart(2, "0")}`),
  );
  for (const winnerLabel of winnerLabels)
    meta.append(makeElement("span", "cr-badge", winnerLabel));
  head.append(model, meta);

  const iqRow = makeElement("div", "cr-iq-row");
  iqRow.append(
    makeElement("span", "cr-iq-label", "IQ"),
    renderIqValue(record.qualityIq),
  );
  const foot = makeElement("div", "cr-card-foot");
  const quotaMetric = renderMetric(copy.quota, quotaText);
  quotaMetric.title = copy.quotaDataNote;
  foot.append(
    quotaMetric,
    renderMetric(
      calibrated ? copy.calibratedCardTime : copy.cardTime,
      formatMinutes(record.effectiveMinutes, copy),
    ),
  );
  foot.append(
    renderMetric(
      calibration.shortWindowEnabled ? copy.endurance : copy.weeklyEndurance,
      enduranceText,
    ),
  );

  button.append(head, iqRow, foot);
  button.addEventListener("click", () => onOpen(record));
  return button;
}

function recordDetails(record: ModelRecord | ScoredRecord, copy: Copy): string {
  const scored = "effectiveWeeklyShare" in record;
  const quota = scored
    ? copy.quotaValue(record.effectiveWeeklyShare)
    : copy.quotaUnavailableShort;
  const time = scored
    ? formatMinutes(record.effectiveMinutes, copy)
    : formatMinutes(record.benchmarkMinutes, copy);
  return `IQ ${record.qualityIq} · benchmark equivalent ${formatBenchmarkCost(record.benchmarkCostEquivalent)} · ${time} · ${copy.quota} ${quota}`;
}

function exclusionReason(
  record: ModelRecord | ScoredRecord,
  reason: EligibilityExclusionReason,
  copy: Copy,
): string {
  switch (reason) {
    case "below-iq-floor":
      return copy.iqFloorReason(record.qualityIq);
    case "quota-unknown":
      return copy.quotaReason;
    case "resource-weekly":
      return copy.weeklyResourceReason;
    case "resource-short-window":
      return copy.shortResourceReason;
    case "practical-dominated":
      return copy.practicalReason;
    case "fast-evidence-unavailable":
      return copy.fastReason;
    default:
      return copy.invalidNote(1);
  }
}

export function renderExclusionItem(
  record: ModelRecord | ScoredRecord,
  copy: Copy,
  reason: EligibilityExclusionReason,
): HTMLLIElement {
  const item = makeElement("li", "cr-exclusion-item");
  const modeLabel = record.mode === "fast" ? ` ${copy.fast}` : "";
  const details = makeElement("div");
  details.append(
    makeElement("div", "cr-exclusion-model", `${record.label}${modeLabel}`),
    makeElement("div", "cr-exclusion-values", recordDetails(record, copy)),
  );
  item.append(
    details,
    makeElement(
      "span",
      "cr-exclusion-witness",
      exclusionReason(record, reason, copy),
    ),
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
