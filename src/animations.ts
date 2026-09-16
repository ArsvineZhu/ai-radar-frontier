import { GRID_MIN_VISIBLE_CARDS, GRID_PREVIEW_HEIGHT } from "./config.js";
import type { AnimationState, RuntimeState } from "./config.js";

function motionAllowed() {
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function clearGridAnimation(animationState: AnimationState): void {
  const animation = animationState.grid;
  animation.active?.cleanup();
  animation.active = null;
  if (animation.frame) {
    window.cancelAnimationFrame(animation.frame);
    animation.frame = 0;
  }
  window.clearTimeout(animation.timer);
  animation.timer = 0;
}

export function measureGridViewport(grid: HTMLElement): {
  fullHeight: number;
  collapsedHeight: number;
  visibleCount: number;
  hasOverflow: boolean;
} {
  const cards = Array.from(grid.querySelectorAll<HTMLElement>(".cr-card"));
  const fullHeight = grid.getBoundingClientRect().height;
  if (cards.length === 0) {
    return {
      fullHeight,
      collapsedHeight: fullHeight,
      visibleCount: 0,
      hasOverflow: false,
    };
  }

  const rows = [];
  const gridOffsetTop = grid.offsetTop;
  for (const card of cards) {
    const top = card.offsetTop - gridOffsetTop;
    const bottom = top + card.offsetHeight;
    let row = rows.find((candidate) => Math.abs(candidate.top - top) < 1);
    if (!row) {
      row = { top, bottom, cards: [] };
      rows.push(row);
    }
    row.bottom = Math.max(row.bottom, bottom);
    row.cards.push(card);
  }
  rows.sort((left, right) => left.top - right.top);

  const columns = Math.max(1, rows[0]?.cards.length || 1);
  const visibleCount = Math.min(
    cards.length,
    Math.max(GRID_MIN_VISIBLE_CARDS, columns * 2),
  );
  const fullRowCount = Math.max(1, Math.ceil(visibleCount / columns));
  const lastVisibleRow = rows[Math.min(fullRowCount, rows.length) - 1];
  const collapsedHeight =
    cards.length > visibleCount && lastVisibleRow
      ? Math.min(
          fullHeight,
          Math.max(0, lastVisibleRow.bottom + GRID_PREVIEW_HEIGHT),
        )
      : fullHeight;

  return {
    fullHeight,
    collapsedHeight,
    visibleCount,
    hasOverflow: cards.length > visibleCount,
  };
}

function animateGridHeight(
  animationState: AnimationState,
  shell: HTMLElement,
  targetHeight: number,
  initialized: boolean,
): void {
  clearGridAnimation(animationState);
  const previousHeight = shell.getBoundingClientRect().height;
  if (
    !initialized ||
    !motionAllowed() ||
    Math.abs(previousHeight - targetHeight) < 1
  ) {
    shell.style.height = `${targetHeight}px`;
    return;
  }

  const animation = animationState.grid;
  const token = Symbol("grid-animation");
  shell.style.height = `${previousHeight}px`;
  void shell.offsetHeight;

  const finish = () => {
    if (animation.active?.token !== token) {
      return;
    }
    shell.removeEventListener("transitionend", onTransitionEnd);
    window.clearTimeout(animation.timer);
    animation.timer = 0;
    animation.frame = 0;
    animation.active = null;
    shell.style.height = `${targetHeight}px`;
  };
  const onTransitionEnd = (event: TransitionEvent) => {
    if (event.target === shell && event.propertyName === "height") {
      finish();
    }
  };

  animation.active = {
    token,
    cleanup() {
      shell.removeEventListener("transitionend", onTransitionEnd);
      shell.style.height = `${targetHeight}px`;
    },
  };
  shell.addEventListener("transitionend", onTransitionEnd);
  animation.frame = window.requestAnimationFrame(() => {
    if (animation.active?.token !== token) {
      return;
    }
    shell.style.height = `${targetHeight}px`;
  });
  animation.timer = window.setTimeout(finish, 360);
}

export function syncGridViewport(
  animationState: AnimationState,
  state: RuntimeState,
  grid: HTMLElement,
  shell: HTMLElement,
) {
  const metrics = measureGridViewport(grid);
  if (!metrics.hasOverflow) {
    state.expanded = false;
  }
  const collapsed = metrics.hasOverflow && !state.expanded;
  const targetHeight = collapsed ? metrics.collapsedHeight : metrics.fullHeight;
  const initialized = shell.dataset.crInitialized === "true";
  shell.dataset.collapsed = String(collapsed);
  shell.dataset.hasOverflow = String(metrics.hasOverflow);
  animateGridHeight(animationState, shell, targetHeight, initialized);
  shell.dataset.crInitialized = "true";
  return metrics;
}

export function resetGridViewport(
  animationState: AnimationState,
  state: RuntimeState,
  shell: HTMLElement | null,
): void {
  clearGridAnimation(animationState);
  state.expanded = false;
  state.animateCardsOnNextRender = true;
  state.gridWidth = null;
  if (!(shell instanceof HTMLElement)) {
    return;
  }
  shell.dataset.collapsed = "false";
  shell.dataset.hasOverflow = "false";
  shell.dataset.crInitialized = "false";
  shell.style.removeProperty("height");
}

export function clearDisclosureAnimation(animationState: AnimationState): void {
  const animation = animationState.disclosure;
  animation.active?.cleanup();
  animation.active = null;
  if (animation.frame) {
    window.cancelAnimationFrame(animation.frame);
    animation.frame = 0;
  }
  window.clearTimeout(animation.timer);
  animation.timer = 0;
}

export function resetDisclosureStyles(
  disclosure: HTMLElement,
  content: HTMLElement,
): void {
  disclosure.dataset.animating = "false";
  content.style.removeProperty("height");
  content.style.removeProperty("opacity");
  content.style.removeProperty("overflow");
}

export function animateDisclosureToggle(
  animationState: AnimationState,
  disclosure: HTMLDetailsElement,
  content: HTMLElement,
): void {
  clearDisclosureAnimation(animationState);
  const opening = !disclosure.open;
  if (!motionAllowed()) {
    disclosure.open = opening;
    resetDisclosureStyles(disclosure, content);
    return;
  }

  const animation = animationState.disclosure;
  const token = Symbol("disclosure-animation");
  const finish = () => {
    if (animation.active?.token !== token) {
      return;
    }
    content.removeEventListener("transitionend", onTransitionEnd);
    window.clearTimeout(animation.timer);
    animation.timer = 0;
    animation.frame = 0;
    animation.active = null;
    if (!opening) {
      disclosure.open = false;
    }
    resetDisclosureStyles(disclosure, content);
  };
  const onTransitionEnd = (event: TransitionEvent) => {
    if (event.target === content && event.propertyName === "height") {
      finish();
    }
  };

  if (opening) {
    disclosure.open = true;
    content.style.height = "0px";
    content.style.opacity = "0";
  } else {
    content.style.height = `${content.getBoundingClientRect().height}px`;
    content.style.opacity = "1";
  }
  content.style.overflow = "hidden";
  disclosure.dataset.animating = "true";
  void content.offsetHeight;

  const targetHeight = opening ? content.scrollHeight : 0;
  animation.active = {
    token,
    cleanup() {
      content.removeEventListener("transitionend", onTransitionEnd);
      resetDisclosureStyles(disclosure, content);
    },
  };
  content.addEventListener("transitionend", onTransitionEnd);
  animation.frame = window.requestAnimationFrame(() => {
    if (animation.active?.token !== token) {
      return;
    }
    content.style.height = `${targetHeight}px`;
    content.style.opacity = opening ? "1" : "0";
  });
  animation.timer = window.setTimeout(finish, 300);
}
