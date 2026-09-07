import test from "node:test";
import assert from "node:assert/strict";
import { createPracticeFeatureGate } from "../js/practiceLab/practiceFeatureGate.js";
import { createPracticeExperimentRegistry } from "../js/practiceLab/practiceExperimentRegistry.js";
import { registerPracticeCombinationRepairExperiment } from "../js/practiceLab/practiceCombinationRepairExperiment.js";
import { buildExperimentDetailViewModel } from "../js/practiceLab/practiceLabViewModel.js";
import { renderPracticeLabV20 } from "../js/practiceLab/practiceLabRendererV20.js";
import { createPracticeLabRoute, PRACTICE_LAB_ROUTES } from "../js/practiceLab/practiceLabRoutes.js";

const root = () => ({ innerHTML: "", querySelector: () => null });

function setup() {
  const gate = createPracticeFeatureGate({ developerMode: true });
  const registry = createPracticeExperimentRegistry({ featureGate: gate });
  registerPracticeCombinationRepairExperiment(registry, { runtime: { prepare() { throw new Error("not used"); } } });
  const route = createPracticeLabRoute(PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL, { experimentId: "combination-repair" });
  return { gate, registry, route };
}

test("Combination Repair developer preview exposes fixed dose, target selector, and all five phases", () => {
  const { registry, route } = setup();
  const view = buildExperimentDetailViewModel({ route, registry, combinationRepairState: { entityType: "bigram", targetValue: "th", status: "idle" } });
  assert.equal(view.kind, "combination-repair-detail");
  assert.equal(view.totalOpportunityCount, 50);
  assert.deepEqual(view.phases.map((phase) => phase.opportunityQuota), [5, 15, 12, 13, 5]);
  assert.equal(view.canPrepare, true);

  const target = root();
  renderPracticeLabV20(target, view);
  assert.match(target.innerHTML, /START COMBINATION REPAIR/);
  assert.match(target.innerHTML, /BIGRAM · 2/);
  assert.match(target.innerHTML, /Baseline/);
  assert.match(target.innerHTML, /Focus/);
  assert.match(target.innerHTML, /Context/);
  assert.match(target.innerHTML, /Mix/);
  assert.match(target.innerHTML, /Check/);
  assert.match(target.innerHTML, /does not establish mastery, retention, transfer, or causal improvement/i);
  assert.match(target.innerHTML, /training/);
});

test("Combination Repair trigram view switches to the 35-opportunity dose", () => {
  const { registry, route } = setup();
  const view = buildExperimentDetailViewModel({ route, registry, combinationRepairState: { entityType: "trigram", targetValue: "the", status: "idle" } });
  assert.equal(view.totalOpportunityCount, 35);
  assert.deepEqual(view.phases.map((phase) => phase.opportunityQuota), [4, 10, 9, 8, 4]);
});

test("Combination Repair shows fail-closed content limitations without substituting a weaker plan", () => {
  const { registry, route } = setup();
  const view = buildExperimentDetailViewModel({ route, registry, combinationRepairState: { entityType: "bigram", targetValue: "nt", status: "limited-content", reasonCode: "INSUFFICIENT_PROBE_MATCH" } });
  const target = root();
  renderPracticeLabV20(target, view);
  assert.match(target.innerHTML, /Limited training content/);
  assert.match(target.innerHTML, /family-disjoint matched Baseline and Check probes/);
  assert.match(target.innerHTML, /No weaker fallback plan will be substituted/);
});

test("Combination Repair remains hidden behind the existing public Practice gate", () => {
  const gate = createPracticeFeatureGate({ developerMode: false });
  const registry = createPracticeExperimentRegistry({ featureGate: gate });
  registerPracticeCombinationRepairExperiment(registry, { runtime: { prepare() { throw new Error("not used"); } } });
  const resolved = registry.getResolvedExperiment("combination-repair");
  assert.equal(resolved.featureAllowed, false);
  assert.equal(resolved.runnable, false);
  assert.equal(resolved.availability, "gated");
});
