import test from "node:test";
import assert from "node:assert/strict";
import { buildPracticeResearchViewModel, renderPracticeResearchPage } from "../js/practiceLab/practiceResearchUi.js";
import { renderPracticeLabV38 } from "../js/practiceLab/practiceLabRendererV38.js";

const root = () => ({ innerHTML: "", querySelector: () => null });
const enrollment = Object.freeze({ status: "active", researchEnrollmentId: "research-enrollment:test" });
const baseAssignment = Object.freeze({
  researchAssignmentId: "research-assignment:test:000",
  assignedArm: "weakness-boss",
  status: "assigned",
  target: Object.freeze({ entityType: "key", entityKey: "k", statId: "stat:key:k" }),
  treatment: Object.freeze({ status: "pending" }),
  analysisEligibility: "followup-missing",
});

test("PL38 enrollment UI requires explicit consent and states the local randomized contract", () => {
  const target = root();
  renderPracticeResearchPage(target, buildPracticeResearchViewModel({ status: "not-enrolled" }));
  assert.match(target.innerHTML, /I CONSENT AND ENROLL/);
  assert.match(target.innerHTML, /randomized between Focused Practice and Weakness Boss/i);
  assert.match(target.innerHTML, /benefit is not guaranteed/i);
  assert.match(target.innerHTML, /stay on this device/i);
  assert.match(target.innerHTML, /not uploaded to Supabase or remote analytics/i);
  assert.match(target.innerHTML, /data-research-action="back"/);
});

test("PL38 normal UI conceals the arm before valid baseline and reveals it afterward", () => {
  const concealed = root();
  renderPracticeResearchPage(concealed, buildPracticeResearchViewModel({
    status: "ready",
    enrollment,
    assignments: [baseAssignment],
    activeAssignment: baseAssignment,
  }));
  assert.match(concealed.innerHTML, /Concealed until valid baseline/);
  assert.doesNotMatch(concealed.innerHTML, /Your randomized assignment is Weakness Boss/);
  assert.doesNotMatch(concealed.innerHTML, /primaryEffect|pValue|Mean_B|Median_B/);

  const revealedAssignment = Object.freeze({ ...baseAssignment, status: "treatment-revealed", baseline: Object.freeze({ status: "valid", quality: 60 }) });
  const revealed = root();
  renderPracticeResearchPage(revealed, buildPracticeResearchViewModel({
    status: "ready",
    enrollment,
    assignments: [revealedAssignment],
    activeAssignment: revealedAssignment,
  }));
  assert.match(revealed.innerHTML, /Your randomized assignment is Weakness Boss/);
  assert.match(revealed.innerHTML, /This reveal cannot be rerolled/);
  assert.match(revealed.innerHTML, /START ASSIGNED PRACTICE/);
});

test("PL38 renderer owns the Research view without changing older renderer contracts", () => {
  const target = root();
  renderPracticeLabV38(target, buildPracticeResearchViewModel({ status: "not-enrolled" }));
  assert.match(target.innerHTML, /data-practice-view="research"/);
  assert.match(target.innerHTML, /Practice Research · Experimental/);
});
