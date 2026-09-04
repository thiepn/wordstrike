import assert from "node:assert/strict";
import { test } from "node:test";
import { alignPracticeErrorSequences } from "../js/practiceLab/practiceErrorAlignment.js";
import { classifyPracticeErrorContent } from "../js/practiceLab/practiceErrorAnalyzer.js";
import { PRACTICE_ERROR_POLICY_V1 } from "../js/practiceLab/practiceErrorPolicy.js";

function alignment(expected, observed) {
  return alignPracticeErrorSequences({ expected, observed });
}

test("PL9 classifies substitution, insertion, omission and adjacent transposition deterministically", () => {
  assert.equal(alignment("cat", "cst").classification, "substitution");
  assert.equal(alignment("cat", "caat").classification, "insertion");
  assert.equal(alignment("cart", "cat").classification, "omission");
  const transpose = alignment("the", "hte");
  assert.equal(transpose.distance, 1);
  assert.equal(transpose.classification, "transposition");
  assert.equal(transpose.confidence, "high");
  assert.equal(transpose.operations.filter((entry) => entry.type === "transposition").length, 1);
});

test("PL9 represents multiple independent edits as compound rather than forced simple certainty", () => {
  const result = alignment("abcd", "axyd");
  assert.equal(result.classification, "compound");
  assert.notEqual(result.confidence, "high");
});

test("PL9 bounded alignment degrades oversized episodes to unresolved unknown", () => {
  const expected = "a".repeat(PRACTICE_ERROR_POLICY_V1.maximumAlignmentGraphemes + 1);
  const result = alignment(expected, expected);
  assert.equal(result.bounded, true);
  assert.equal(result.classification, "unknown");
  assert.equal(result.confidence, "unresolved");
  assert.deepEqual(result.operations, []);
});

test("PL9 detects doubling as a secondary flag while preserving insertion structure", () => {
  const result = alignment("letter", "lettter");
  assert.equal(result.classification, "insertion");
  assert.equal(result.isDoubling, true);
});

test("PL9 content classification is orthogonal to structural edit class", () => {
  const capitalization = alignment("A", "a");
  assert.equal(capitalization.classification, "substitution");
  assert.equal(classifyPracticeErrorContent({ expected: "A", observed: "a", alignment: capitalization }), "capitalization");

  for (const [expected, observed, contentClass] of [
    [",", ".", "punctuation"],
    [" ", "x", "mixed"],
    ["7", "4", "numeric"],
    ["$", "€", "symbol"],
  ]) {
    const result = alignment(expected, observed);
    assert.equal(classifyPracticeErrorContent({ expected, observed, alignment: result }), contentClass);
  }

  const whitespaceOmission = alignment("a b", "ab");
  assert.equal(whitespaceOmission.classification, "omission");
  assert.equal(classifyPracticeErrorContent({ expected: "a b", observed: "ab", alignment: whitespaceOmission }), "whitespace-boundary");

  const mixed = alignment("7%", "4$");
  assert.equal(classifyPracticeErrorContent({ expected: "7%", observed: "4$", alignment: mixed }), "mixed");
});

test("PL9 alignment is pure and does not mutate supplied grapheme arrays", () => {
  const expected = ["t", "h", "e"];
  const observed = ["h", "t", "e"];
  const expectedBefore = [...expected];
  const observedBefore = [...observed];
  const a = alignPracticeErrorSequences({ expected, observed });
  const b = alignPracticeErrorSequences({ expected, observed });
  assert.deepEqual(a, b);
  assert.deepEqual(expected, expectedBefore);
  assert.deepEqual(observed, observedBefore);
  assert.equal(Object.isFrozen(a), true);
});
