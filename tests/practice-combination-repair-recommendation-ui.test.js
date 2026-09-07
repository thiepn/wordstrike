import test from "node:test";
import assert from "node:assert/strict";
import { createPracticeFeatureGate } from "../js/practiceLab/practiceFeatureGate.js";
import { createPracticeExperimentRegistry } from "../js/practiceLab/practiceExperimentRegistry.js";
import { createPracticeLabController } from "../js/practiceLab/practiceLabController.js";
import { createPracticeLabRoute, PRACTICE_LAB_ROUTES } from "../js/practiceLab/practiceLabRoutes.js";
import { registerPracticeCombinationRepairExperiment } from "../js/practiceLab/practiceCombinationRepairExperiment.js";

function fakeRoot() {
  const listeners = new Map();
  return {
    innerHTML: "",
    listeners,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); },
    contains: () => true,
    querySelector: () => null,
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

function setup(loader) {
  const root = fakeRoot();
  const gate = createPracticeFeatureGate({ developerMode: true });
  const registry = createPracticeExperimentRegistry({ featureGate: gate });
  registerPracticeCombinationRepairExperiment(registry, { runtime: { prepare() { throw new Error("not used"); } } });
  const rendered = [];
  const controller = createPracticeLabController({
    root,
    featureGate: gate,
    experimentRegistry: registry,
    combinationRepairRecommendationLoader: loader,
    renderer: (_root, view) => rendered.push(view),
  });
  return { root, gate, registry, rendered, controller };
}

test("PL20 recommendation storage/limiter/mastery runtime stays lazy until Combination Repair detail opens", async () => {
  let calls = 0;
  const { controller } = setup(async () => {
    calls += 1;
    return { status: "no-evidence", recommendations: [] };
  });
  controller.mount();
  await flush();
  assert.equal(calls, 0);

  controller.navigate(createPracticeLabRoute(PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL, { experimentId: "weak-keys" }));
  await flush();
  assert.equal(calls, 0);

  controller.navigate(createPracticeLabRoute(PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL, { experimentId: "combination-repair" }));
  await flush();
  assert.equal(calls, 1);
  assert.equal(controller.getSnapshot().combinationRepair.recommendationStatus, "no-evidence");
  controller.unmount();
});

test("PL20 recommendation loader exposes bounded canonical targets without forcing a recommendation", async () => {
  const recommendations = [
    { entityType: "bigram", entityKey: "th", evidenceConfidenceScore: 92, priorityScore: 88 },
    { entityType: "trigram", entityKey: "the", evidenceConfidenceScore: 81, priorityScore: 74 },
  ];
  const { controller, rendered } = setup(async () => ({ status: "ready", recommendations }));
  controller.mount(createPracticeLabRoute(PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL, { experimentId: "combination-repair" }));
  await flush();
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.combinationRepair.recommendationStatus, "ready");
  assert.equal(snapshot.combinationRepair.recommendationCount, 2);
  const latest = rendered.at(-1);
  assert.equal(latest.kind, "combination-repair-detail");
  assert.deepEqual(latest.recommendations.map(({ entityType, entityKey }) => ({ entityType, entityKey })), [
    { entityType: "bigram", entityKey: "th" },
    { entityType: "trigram", entityKey: "the" },
  ]);
  assert.equal(latest.canPrepare, true);
  assert.equal(latest.targetValue, "");
  assert.equal(latest.selectedSource, "manual");
  controller.unmount();
});

test("PL20 recommendation failure is non-gating and does not replace manual targeting", async () => {
  const { controller, rendered } = setup(async () => ({ status: "unavailable", errorCode: "STORAGE_UNAVAILABLE", recommendations: [] }));
  controller.mount(createPracticeLabRoute(PRACTICE_LAB_ROUTES.EXPERIMENT_DETAIL, { experimentId: "combination-repair" }));
  await flush();
  const latest = rendered.at(-1);
  assert.equal(latest.recommendationStatus, "unavailable");
  assert.equal(latest.recommendationErrorCode, "STORAGE_UNAVAILABLE");
  assert.equal(latest.canPrepare, true);
  assert.equal(latest.selectedSource, "manual");
  controller.unmount();
});
