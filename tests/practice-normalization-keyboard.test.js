import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PRACTICE_KEYBOARD_GEOMETRY_VERSION,
  classifyPracticeKeyboardGeometry,
  getPracticeKeyGeometry,
  getPracticeKeyboardLayoutGeometry,
} from "../js/practiceLab/practiceKeyboardGeometry.js";

test("PL10 keyboard geometry exposes deterministic physical row/column/side without finger assumptions", () => {
  assert.equal(PRACTICE_KEYBOARD_GEOMETRY_VERSION, 1);
  assert.deepEqual(
    { row: getPracticeKeyGeometry("qwerty", "q").row, column: getPracticeKeyGeometry("qwerty", "q").column },
    { row: 0, column: 0 },
  );
  assert.deepEqual(
    { row: getPracticeKeyGeometry("qwerty", "p").row, column: getPracticeKeyGeometry("qwerty", "p").column },
    { row: 0, column: 9 },
  );
  const serialized = JSON.stringify(getPracticeKeyboardLayoutGeometry("qwerty"));
  for (const forbidden of ["finger", "fingerId", "handUsed"]) assert.equal(serialized.includes(forbidden), false);
});

test("PL10 QWERTZ swaps Y/Z physical positions relative to QWERTY", () => {
  const qwertyY = getPracticeKeyGeometry("qwerty", "Y");
  const qwertzY = getPracticeKeyGeometry("qwertz", "Y");
  const qwertyZ = getPracticeKeyGeometry("qwerty", "z");
  const qwertzZ = getPracticeKeyGeometry("qwertz", "z");
  assert.deepEqual([qwertyY.row, qwertyY.column], [0, 5]);
  assert.deepEqual([qwertzY.row, qwertzY.column], [2, 0]);
  assert.deepEqual([qwertyZ.row, qwertyZ.column], [2, 0]);
  assert.deepEqual([qwertzZ.row, qwertzZ.column], [0, 5]);
});

test("PL10 geometry classes distinguish same-key, near, far, cross-side and unknown", () => {
  assert.equal(classifyPracticeKeyboardGeometry({ layout: "qwerty", previousExpected: "a", currentExpected: "A" }).geometryClass, "same-key");
  assert.equal(classifyPracticeKeyboardGeometry({ layout: "qwerty", previousExpected: "a", currentExpected: "s" }).geometryClass, "same-side-near");
  assert.equal(classifyPracticeKeyboardGeometry({ layout: "qwerty", previousExpected: "a", currentExpected: "g" }).geometryClass, "same-side-far");
  assert.equal(classifyPracticeKeyboardGeometry({ layout: "qwerty", previousExpected: "q", currentExpected: "p" }).geometryClass, "cross-side");
  const unsupported = classifyPracticeKeyboardGeometry({ layout: "mystery-layout", previousExpected: "a", currentExpected: "s" });
  assert.equal(unsupported.geometryClass, "unknown");
  assert.equal(unsupported.distance, null);
  assert.equal(unsupported.known, false);
  assert.equal(getPracticeKeyboardLayoutGeometry("mystery-layout").status, "unsupported");
});

test("PL10 recognized alternative layouts resolve letters without pretending unsupported punctuation coverage", () => {
  for (const layout of ["azerty", "colemak", "dvorak"]) {
    assert.equal(getPracticeKeyboardLayoutGeometry(layout).status, "supported");
    assert.ok(getPracticeKeyGeometry(layout, "a"));
  }
});
