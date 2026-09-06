import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const selectionSource = fs.readFileSync(new URL("../js/practiceLab/practiceTransferSelection.js", import.meta.url), "utf8");
const loaderSource = fs.readFileSync(new URL("../js/practiceLab/practiceEvaluationContentLoader.js", import.meta.url), "utf8");

test("PL18 protected transfer selector has no skill/limiter/mastery repository reads or target reverse lookup", () => {
  for (const forbidden of ["listSkillStats", "listLearningStates", "limiterSnapshot", "masterySnapshot", "targetToContent", "findTransferPassageForTarget"]) {
    assert.equal(selectionSource.includes(forbidden), false, forbidden);
  }
});

test("PL18 protected content loader uses claimed binding and never target-to-content reverse lookup", () => {
  assert.match(loaderSource, /validatePracticeEvaluationBinding/);
  assert.equal(loaderSource.includes("targetToContent"), false);
  assert.equal(loaderSource.includes("findTransferPassageForTarget"), false);
});
