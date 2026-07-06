import test from "node:test";
import assert from "node:assert/strict";
import { createPracticeFeatureGate } from "../js/practiceLab/practiceFeatureGate.js";
import { createPracticeExperimentRegistry } from "../js/practiceLab/practiceExperimentRegistry.js";
import { buildPracticeHomeViewModel, buildExperimentDetailViewModel, buildSkillMapEmptyViewModel, buildReviewQueueEmptyViewModel, buildProgressEmptyViewModel } from "../js/practiceLab/practiceLabViewModel.js";
import { renderPracticeLab } from "../js/practiceLab/practiceLabRenderer.js";
import { createPracticeLabRoute, PRACTICE_LAB_ROUTES } from "../js/practiceLab/practiceLabRoutes.js";

const root = () => ({ innerHTML: "", querySelector: () => null });
const gate = createPracticeFeatureGate({ developerMode: true });

test("home renderer exposes semantic sections, honest empty states, native controls, and all catalog cards", () => {
  const registry = createPracticeExperimentRegistry({ featureGate: gate });
  const target = root();
  renderPracticeLab(target, buildPracticeHomeViewModel({ registry, featureGate: gate }));
  assert.match(target.innerHTML, /<header class="practice-lab-header">/);
  assert.match(target.innerHTML, /<main>/);
  assert.match(target.innerHTML, /Today&#39;s Training/i);
  assert.match(target.innerHTML, /NO SKILL PROFILE YET/i);
  assert.match(target.innerHTML, /RECOMMENDATIONS NEED DATA/i);
  assert.match(target.innerHTML, /disabled aria-disabled="true"/);
  assert.equal((target.innerHTML.match(/data-experiment-id=/g) || []).length, 16);
  assert.doesNotMatch(target.innerHTML, /implementationPrompt|Prompt 6/);
});

test("generic detail and analysis renderers show controlled planned and empty states", () => {
  const registry = createPracticeExperimentRegistry({ featureGate: gate });
  const detail = root();
  renderPracticeLab(detail, buildExperimentDetailViewModel({ route: createPracticeLabRoute(PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL, { experimentId: "weak-keys" }), registry }));
  assert.match(detail.innerHTML, /This experiment is not available/);
  assert.match(detail.innerHTML, /BEGIN UNAVAILABLE/);
  for (const view of [buildSkillMapEmptyViewModel(), buildReviewQueueEmptyViewModel(), buildProgressEmptyViewModel()]) {
    const target = root();
    renderPracticeLab(target, view);
    assert.match(target.innerHTML, /practice-lab-empty-state/);
    assert.match(target.innerHTML, />BACK</);
  }
});

test("renderer escapes dynamic catalog text", () => {
  const target = root();
  renderPracticeLab(target, { kind: "not-found", title: "<img src=x>", description: "& unsafe", backLabel: "Back" });
  assert.doesNotMatch(target.innerHTML, /<img src=x>/);
  assert.match(target.innerHTML, /&lt;img src=x&gt;/);
  assert.match(target.innerHTML, /&amp; unsafe/);
});
