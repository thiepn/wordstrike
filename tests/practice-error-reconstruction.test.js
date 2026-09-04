import assert from "node:assert/strict";
import { test } from "node:test";
import { reconstructPracticeTypingAttempts } from "../js/practiceLab/practiceErrorAnalyzer.js";

const insert = (eventIndex, position, entered, expected = entered) => ({
  eventIndex,
  type: "character",
  entered,
  expected,
  textPosition: position,
  cursorBefore: position,
  cursorAfter: position + 1,
  correctness: entered === expected ? "correct" : "incorrect",
});

const backspace = (eventIndex, before, after) => ({
  eventIndex,
  type: "backspace",
  cursorBefore: before,
  cursorAfter: after,
  removedCount: before - after,
});

test("PL9 attempt reconstruction distinguishes repeated attempts at the same text position by event order", () => {
  const result = reconstructPracticeTypingAttempts([
    insert(1, 0, "a"),
    insert(2, 1, "x", "b"),
    backspace(3, 2, 1),
    insert(4, 1, "b"),
  ]);
  assert.equal(result.valid, true);
  assert.equal(result.stack.length, 2);
  assert.equal(result.stack[1].eventIndex, 4);
  assert.equal(result.stack[1].position, 1);
  assert.equal(result.removedAttempts.length, 1);
  assert.equal(result.removedAttempts[0].eventIndex, 2);
  assert.equal(result.removedAttempts[0].removedByEventIndex, 3);
});

test("PL9 cursor reconstruction rejects impossible correction direction without mutating input", () => {
  const events = [insert(1, 0, "a"), backspace(2, 1, 2)];
  const before = structuredClone(events);
  const result = reconstructPracticeTypingAttempts(events);
  assert.equal(result.valid, false);
  assert.equal(result.degraded, true);
  assert.equal(result.errors[0].code, "CORRECTION_CURSOR_MISMATCH");
  assert.deepEqual(events, before);
});

test("PL9 cursor reconstruction fails safely when a correction removes more retained attempts than exist", () => {
  const result = reconstructPracticeTypingAttempts([
    insert(1, 0, "a"),
    { ...backspace(2, 1, 0), removedCount: 2, cursorBefore: 2, cursorAfter: 0 },
  ]);
  assert.equal(result.valid, false);
  assert.equal(result.degraded, true);
  assert.equal(result.errors.length > 0, true);
});

test("PL9 historical insertion cursor fields can be inferred conservatively", () => {
  const result = reconstructPracticeTypingAttempts([
    { eventIndex: 1, type: "character", textPosition: 0, entered: "a", expected: "a", correctness: "correct" },
    { eventIndex: 2, type: "character", textPosition: 1, entered: "b", expected: "b", correctness: "correct" },
  ]);
  assert.equal(result.valid, true);
  assert.equal(result.degraded, true);
  assert.equal(result.stack.length, 2);
});
