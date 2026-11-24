import assert from "node:assert/strict";
import test from "node:test";
import { foldLayout } from "./fold.ts";

test("a phone stays one column, folded or sideways", () => {
  const portrait = foldLayout(390, 844);
  assert.equal(portrait.sizeClass, "compact");
  assert.equal(portrait.twoPane, false);
  assert.equal(portrait.hingeAxis, "none");
  assert.equal(portrait.rail, false);

  const landscape = foldLayout(844, 390);
  assert.equal(landscape.hingeAxis, "none");
  assert.equal(landscape.rail, true);
  assert.equal(landscape.twoPane, true);
});

test("an open book fold keeps a vertical gutter between panes", () => {
  const open = foldLayout(1100, 840);
  assert.equal(open.twoPane, true);
  assert.equal(open.hingeAxis, "vertical");
  assert.ok(open.hinge >= 16 && open.hinge <= 48);
  assert.equal(open.rail, true);
});

test("a tall open fold uses a horizontal gutter and no rail across the crease", () => {
  const tall = foldLayout(840, 1200);
  assert.equal(tall.hingeAxis, "horizontal");
  assert.equal(tall.rail, false);
  assert.equal(tall.twoPane, true);
});
