import test from "node:test";
import assert from "node:assert/strict";
import {
  createPracticeSegmenter,
  derivePracticeWordUnits,
  normalizePracticeLexicalKey,
} from "../js/practiceLab/practiceTextSegmentation.js";
import { createPracticeContentPlan } from "../js/practiceLab/practiceSessionContract.js";

const segment = createPracticeSegmenter();

test("PL7 shared grapheme segmentation preserves current Unicode Practice semantics", () => {
  assert.deepEqual(segment("abc"), ["a", "b", "c"]);
  assert.equal(segment("é").length, 1);
  assert.equal(segment("e\u0301").length, 1);
  assert.equal(segment("ä").length, 1);
  assert.equal(segment("🙂").length, 1);
  assert.equal(segment("𝄞").length, 1);
  assert.deepEqual(segment("don't"), ["d", "o", "n", "'", "t"]);
  assert.deepEqual(segment("mother-in-law"), [..."mother-in-law"]);
  assert.deepEqual(segment("für"), ["f", "ü", "r"]);
  assert.deepEqual(segment("élève"), ["é", "l", "è", "v", "e"]);
});

test("canonical word tokenization remains aligned with Practice content-plan derived units", () => {
  const samples = [
    ["hello", ["hello"]],
    ["don't stop", ["don't", "stop"]],
    ["mother-in-law", ["mother-in-law"]],
    ["café naïve", ["café", "naïve"]],
    ["für élève", ["für", "élève"]],
    ["123 A/B", ["123", "A", "B"]],
    ["emoji🙂test", ["emoji", "test"]],
    ["e\u0301lan", ["e\u0301lan"]],
  ];
  for (const [text, expected] of samples) {
    const words = derivePracticeWordUnits(text).map((unit) => unit.surfaceText);
    assert.deepEqual(words, expected, text);
    const plan = createPracticeContentPlan({
      contentId: `practice-content_seg-${Math.abs([...text].reduce((sum, point) => sum + point.codePointAt(0), 0))}`,
      text,
      completion: { mode: "content", value: null },
    });
    assert.deepEqual(plan.units.map((unit) => ({ startIndex: unit.startIndex, endIndex: unit.endIndex, text: unit.text })), derivePracticeWordUnits(text).map((unit) => ({ startIndex: unit.startIndex, endIndex: unit.endIndex, text: unit.surfaceText })));
  }
});

test("lexical keys lowercase without ASCII-folding accents, apostrophes, or hyphens", () => {
  assert.equal(normalizePracticeLexicalKey("The", "en"), "the");
  assert.equal(normalizePracticeLexicalKey("CAFÉ", "fr"), "café");
  assert.equal(normalizePracticeLexicalKey("MOTHER-IN-LAW", "en"), "mother-in-law");
  assert.equal(normalizePracticeLexicalKey("L'ÉLÈVE", "fr"), "l'élève");
});
