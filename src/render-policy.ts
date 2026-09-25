export type RenderReason =
  "initial" | "selection" | "data-refresh" | "layout" | "incidental";

const RENDER_REASON_PRIORITY: Record<RenderReason, number> = {
  incidental: 0,
  layout: 1,
  "data-refresh": 2,
  selection: 3,
  initial: 4,
};

export function mergeRenderReason(
  current: RenderReason,
  next: RenderReason,
): RenderReason {
  return RENDER_REASON_PRIORITY[next] >= RENDER_REASON_PRIORITY[current]
    ? next
    : current;
}

export function shouldAnimateCards(reason: RenderReason): boolean {
  return reason === "initial" || reason === "selection";
}

export function shouldReplaceGrid(
  previousSignature: string | null,
  nextSignature: string,
): boolean {
  return previousSignature !== nextSignature;
}
