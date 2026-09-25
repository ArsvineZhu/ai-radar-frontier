import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeRenderReason,
  shouldAnimateCards,
  shouldReplaceGrid,
} from "../src/render-policy.js";

test("only initial and deliberate selection renders animate card entry", () => {
  assert.equal(shouldAnimateCards("initial"), true);
  assert.equal(shouldAnimateCards("selection"), true);
  assert.equal(shouldAnimateCards("data-refresh"), false);
  assert.equal(shouldAnimateCards("layout"), false);
  assert.equal(shouldAnimateCards("incidental"), false);
});

test("higher-value render intent survives a coalesced incidental mutation", () => {
  assert.equal(mergeRenderReason("initial", "incidental"), "initial");
  assert.equal(mergeRenderReason("selection", "layout"), "selection");
  assert.equal(mergeRenderReason("incidental", "data-refresh"), "data-refresh");
});

test("stable render signatures preserve the existing card nodes", () => {
  assert.equal(shouldReplaceGrid(null, "first"), true);
  assert.equal(shouldReplaceGrid("same", "same"), false);
  assert.equal(shouldReplaceGrid("old", "new"), true);
});
