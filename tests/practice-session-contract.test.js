import assert from "node:assert/strict";
import {
  appendPracticeContentPlan,
  createGenericPracticeExperimentDescriptor,
  createPracticeContentPlan,
  createPracticeSegmenter,
  validatePracticeContentPlan,
  validatePracticeExperimentDescriptor,
  validatePracticeNormalizedInput,
} from "../js/practiceLab/practiceSessionContract.js";

const experiment = createGenericPracticeExperimentDescriptor();
assert.equal(validatePracticeExperimentDescriptor(experiment).valid, true);
assert.equal(validatePracticeExperimentDescriptor({ ...experiment, version: 0 }).valid, false);

const plan = createPracticeContentPlan({
  contentId: "practice-content_contract",
  text: "café 😀 test",
  completion: { mode: "content", value: null },
  metadata: { sourceType: "generated" },
});
assert.equal(validatePracticeContentPlan(plan).valid, true);
assert.deepEqual(plan.units.map((unit) => unit.text), ["café", "test"]);
assert.equal(createPracticeSegmenter()("😀").length, 1);
assert.throws(() => { plan.text = "changed"; });

const appended = appendPracticeContentPlan(plan, {
  text: " more",
  units: [{ unitId: "word_3", type: "word", startIndex: 1, endIndex: 5, text: "more", metadata: {} }],
});
assert.equal(appended.text, "café 😀 test more");
assert.equal(appended.units.at(-1).startIndex, createPracticeSegmenter()(plan.text).length + 1);
assert.notEqual(appended.contentHash, plan.contentHash);
assert.equal(plan.text, "café 😀 test");

const input = {
  type: "character",
  value: "😀",
  source: "test",
  monotonicTimestampMs: 1,
  wallTimestampUtc: "2026-07-05T18:42:13.000Z",
  modifiers: { ctrl: false, meta: false, alt: false, shift: false },
};
assert.equal(validatePracticeNormalizedInput(input).valid, true);
assert.equal(validatePracticeNormalizedInput({ ...input, value: "ab" }).valid, false);
assert.equal(validatePracticeNormalizedInput({ ...input, type: "future" }).valid, false);
assert.equal(validatePracticeContentPlan({ ...plan, contentHash: "wrong" }).valid, false);

console.log("Practice experiment, content, append, Unicode segmentation, immutability, and normalized-input contracts passed.");

