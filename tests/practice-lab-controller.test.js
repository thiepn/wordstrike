import test from "node:test";
import assert from "node:assert/strict";
import { createPracticeFeatureGate } from "../js/practiceLab/practiceFeatureGate.js";
import { createPracticeExperimentRegistry } from "../js/practiceLab/practiceExperimentRegistry.js";
import { createPracticeLabController } from "../js/practiceLab/practiceLabController.js";
import { createPracticeLabRoute, PRACTICE_LAB_ROUTES } from "../js/practiceLab/practiceLabRoutes.js";

function fakeRoot() {
  const listeners = new Map();
  return {
    innerHTML: "", listeners,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); },
    contains: () => true,
  };
}

test("controller mounts deterministically, navigates with bounded history, and unmounts its one listener", () => {
  const root = fakeRoot();
  const gate = createPracticeFeatureGate({ developerMode: true });
  const registry = createPracticeExperimentRegistry({ featureGate: gate });
  const rendered = [];
  let exits = 0;
  const controller = createPracticeLabController({ root, featureGate: gate, experimentRegistry: registry, appNavigation: { exit: () => { exits += 1; } }, renderer: (_root, view) => rendered.push(view.kind) });
  controller.mount();
  assert.equal(root.listeners.size, 1);
  assert.equal(controller.getSnapshot().route.name, "home");
  controller.navigate(createPracticeLabRoute(PRACTICE_LAB_ROUTES.SKILL_MAP));
  assert.equal(controller.getSnapshot().route.name, "skill-map");
  controller.back();
  assert.equal(controller.getSnapshot().route.name, "home");
  controller.back();
  assert.equal(exits, 1);
  assert.equal(controller.unmount(), true);
  assert.equal(controller.unmount(), false);
  assert.equal(root.listeners.size, 0);
  assert.equal(rendered.length, 3);
});

test("controller delegates native button clicks and registry emits one controlled rerender", () => {
  const root = fakeRoot();
  const gate = createPracticeFeatureGate({ developerMode: true });
  const registry = createPracticeExperimentRegistry({ featureGate: gate });
  let renders = 0;
  const controller = createPracticeLabController({ root, featureGate: gate, experimentRegistry: registry, renderer: () => { renders += 1; } });
  controller.mount();
  const target = { disabled: false, dataset: { practiceAction: "navigate", route: "progress" }, closest: () => target, getAttribute: () => null };
  root.listeners.get("click")({ button: 0, target });
  assert.equal(controller.getSnapshot().route.name, "progress");
  const descriptorFactory = () => ({ id: "weak-keys", version: 1, title: "Weak Keys", category: "precision", sessionSchemaVersion: 1, defaultCorrectionBehavior: "allow", supportedCompletionModes: ["content"], resumable: true });
  registry.register({ experimentId: "weak-keys", implementationVersion: 1, descriptorFactory });
  assert.equal(renders, 3);
});

test("controller cannot navigate through a closed feature gate", () => {
  const root = fakeRoot();
  const gate = createPracticeFeatureGate();
  const registry = createPracticeExperimentRegistry({ featureGate: gate });
  let kind = "";
  const controller = createPracticeLabController({ root, featureGate: gate, experimentRegistry: registry, renderer: (_root, view) => { kind = view.kind; } });
  controller.mount(createPracticeLabRoute(PRACTICE_LAB_ROUTES.SKILL_MAP));
  assert.equal(kind, "unavailable");
  assert.equal(controller.navigate(createPracticeLabRoute(PRACTICE_LAB_ROUTES.PROGRESS)), false);
});
