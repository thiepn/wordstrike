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
  const viewModel = buildPracticeHomeViewModel({ registry, featureGate: gate });
  renderPracticeLab(target, viewModel);
  assert.match(target.innerHTML, /<header class="practice-lab-header">/);
  assert.match(target.innerHTML, /<main>/);
  assert.match(target.innerHTML, /Today&#39;s Training/i);
  assert.match(target.innerHTML, /NO SKILL PROFILE YET/i);
  assert.match(target.innerHTML, /RECOMMENDATIONS NEED DATA/i);
  assert.match(target.innerHTML, /disabled aria-disabled="true"/);
  assert.match(target.innerHTML, /data-practice-action="open-experiment" data-experiment-id="full-assessment"/);
  const visibleCatalogCardCount = viewModel.categories.reduce((count, category) => count + category.experiments.length, 0);
  const renderedCatalogCardCount = (target.innerHTML.match(/class="practice-lab-text-button" data-practice-action="open-experiment" data-experiment-id=/g) || []).length;
  assert.equal(renderedCatalogCardCount, visibleCatalogCardCount);
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

test("renderer deliberately focuses the route heading when prior focus cannot be restored", () => {
  let focused = 0;
  const heading = { focus: () => { focused += 1; } };
  const target = {
    innerHTML: "",
    querySelector: (selector) => selector === "[data-practice-heading]" ? heading : null,
  };
  renderPracticeLab(target, { kind: "not-found", title: "Missing", description: "Missing", backLabel: "Back" });
  assert.equal(focused, 1);
  assert.match(target.innerHTML, /tabindex="-1" data-practice-heading/);
});
